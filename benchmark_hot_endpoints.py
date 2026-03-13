#!/usr/bin/env python3
"""
Benchmark hot API endpoints and report latency percentiles (p50/p95/p99).

Usage examples:
  python benchmark_hot_endpoints.py
  python benchmark_hot_endpoints.py --base-url https://api.quanganh.org/v1/valuation --runs 30 --warmup 5
  python benchmark_hot_endpoints.py --runs 10 --workers 4 --symbols VCB,FPT,MBB --include-health

Outputs:
  - Console table summary
  - JSON report in logs/perf/benchmark_*.json
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = os.getenv("BENCH_BASE_URL", "http://127.0.0.1:8000")
DEFAULT_RUNS = 20
DEFAULT_WARMUP = 3
DEFAULT_TIMEOUT_SECONDS = 8.0
DEFAULT_WORKERS = 1
DEFAULT_SYMBOLS = ["VCB", "FPT", "MBB"]
SLO_P95_MS = 250.0
SLO_P99_MS = 500.0


@dataclass(frozen=True)
class EndpointCase:
    name: str
    path: str


def percentile(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return values[0]
    sorted_values = sorted(values)
    rank = (len(sorted_values) - 1) * q
    low = int(rank)
    high = min(low + 1, len(sorted_values) - 1)
    frac = rank - low
    return sorted_values[low] * (1.0 - frac) + sorted_values[high] * frac


def normalize_base_url(base_url: str) -> str:
    out = (base_url or "").strip()
    if not out:
        return DEFAULT_BASE_URL
    return out.rstrip("/")


def resolve_api_prefix(base_url: str, raw_prefix: str) -> str:
    value = (raw_prefix or "auto").strip().lower()
    if value in ("", "none", "no", "off"):
        return ""

    if value == "auto":
        # Production base often already includes /v1/valuation, while local base needs /api.
        lowered = base_url.lower().rstrip("/")
        if lowered.endswith("/v1/valuation"):
            return ""
        return "/api"

    prefix = raw_prefix.strip()
    if not prefix.startswith("/"):
        prefix = f"/{prefix}"
    return prefix.rstrip("/")


def _with_prefix(prefix: str, path: str) -> str:
    normalized_path = path if path.startswith("/") else f"/{path}"
    if not prefix:
        return normalized_path
    return f"{prefix}{normalized_path}"


def build_endpoint_cases(symbols: list[str], api_prefix: str) -> list[EndpointCase]:
    ref_symbol = symbols[0] if symbols else "VCB"
    cases = [
        EndpointCase("health", _with_prefix(api_prefix, "/health")),
        EndpointCase("market.vci_indices", _with_prefix(api_prefix, "/market/vci-indices")),
        EndpointCase("market.news", _with_prefix(api_prefix, "/market/news?limit=20")),
        EndpointCase(f"stock.current_price.{ref_symbol}", _with_prefix(api_prefix, f"/current-price/{ref_symbol}")),
        EndpointCase(f"stock.snapshot.{ref_symbol}", _with_prefix(api_prefix, f"/stock/{ref_symbol}")),
        EndpointCase(f"stock.app_data.{ref_symbol}", _with_prefix(api_prefix, f"/app-data/{ref_symbol}")),
        EndpointCase(
            f"stock.historical_chart.{ref_symbol}",
            _with_prefix(api_prefix, f"/historical-chart-data/{ref_symbol}?period=quarter"),
        ),
        EndpointCase(f"stock.holders.{ref_symbol}", _with_prefix(api_prefix, f"/holders/{ref_symbol}")),
        EndpointCase(f"stock.valuation.{ref_symbol}", _with_prefix(api_prefix, f"/valuation/{ref_symbol}")),
    ]

    for sym in symbols[:3]:
        cases.append(EndpointCase(f"stock.batch_price.{sym}", _with_prefix(api_prefix, f"/current-price/{sym}")))

    return cases


def fetch_once(url: str, timeout_seconds: float) -> tuple[bool, float, int, str | None]:
    start = time.perf_counter()
    req = Request(url=url, method="GET", headers={"User-Agent": "hot-endpoint-benchmark/1.0"})

    try:
        with urlopen(req, timeout=timeout_seconds) as response:
            _ = response.read(64)
            elapsed_ms = (time.perf_counter() - start) * 1000.0
            return True, elapsed_ms, int(response.status), None
    except HTTPError as e:
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        return False, elapsed_ms, int(e.code or 0), f"HTTPError: {e}"
    except URLError as e:
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        return False, elapsed_ms, 0, f"URLError: {e.reason}"
    except Exception as e:
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        return False, elapsed_ms, 0, f"Exception: {e}"


def benchmark_endpoint(
    base_url: str,
    case: EndpointCase,
    runs: int,
    warmup: int,
    timeout_seconds: float,
    workers: int,
    dry_run: bool,
) -> dict[str, Any]:
    full_url = f"{base_url}{case.path}"

    if dry_run:
        return {
            "name": case.name,
            "url": full_url,
            "runs": runs,
            "warmup": warmup,
            "ok": True,
            "dry_run": True,
        }

    for _ in range(max(0, warmup)):
        fetch_once(full_url, timeout_seconds)

    latencies: list[float] = []
    failures: list[str] = []
    statuses: dict[int, int] = {}
    lock = threading.Lock()

    def _task() -> None:
        ok, elapsed_ms, status_code, err = fetch_once(full_url, timeout_seconds)
        with lock:
            statuses[status_code] = statuses.get(status_code, 0) + 1
            if ok:
                latencies.append(elapsed_ms)
            else:
                failures.append(err or "unknown error")

    worker_count = max(1, int(workers or 1))
    if worker_count == 1:
        for _ in range(max(1, runs)):
            _task()
    else:
        with ThreadPoolExecutor(max_workers=worker_count) as executor:
            futures = [executor.submit(_task) for _ in range(max(1, runs))]
            for future in as_completed(futures):
                future.result()

    success = len(latencies)
    total = max(1, runs)
    error_rate = max(0.0, ((total - success) / total) * 100.0)

    if latencies:
        p50 = percentile(latencies, 0.50)
        p95 = percentile(latencies, 0.95)
        p99 = percentile(latencies, 0.99)
        avg = statistics.mean(latencies)
        min_v = min(latencies)
        max_v = max(latencies)
    else:
        p50 = p95 = p99 = avg = min_v = max_v = 0.0

    status = "pass" if (p95 <= SLO_P95_MS and p99 <= SLO_P99_MS and error_rate == 0.0) else "warn"

    return {
        "name": case.name,
        "url": full_url,
        "runs": runs,
        "warmup": warmup,
        "success": success,
        "failures": total - success,
        "error_rate_pct": round(error_rate, 2),
        "latency_ms": {
            "avg": round(avg, 2),
            "min": round(min_v, 2),
            "max": round(max_v, 2),
            "p50": round(p50, 2),
            "p95": round(p95, 2),
            "p99": round(p99, 2),
        },
        "slo": {
            "p95_target_ms": SLO_P95_MS,
            "p99_target_ms": SLO_P99_MS,
            "status": status,
        },
        "http_status_counts": statuses,
        "sample_failures": failures[:3],
    }


def fetch_health_snapshot(base_url: str, timeout_seconds: float, api_prefix: str) -> dict[str, Any] | None:
    url = f"{base_url}{_with_prefix(api_prefix, '/health')}"
    ok, _, status_code, err = fetch_once(url, timeout_seconds)
    if not ok:
        return {"status": status_code, "error": err}

    try:
        req = Request(url=url, method="GET", headers={"User-Agent": "hot-endpoint-benchmark/1.0"})
        with urlopen(req, timeout=timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8", errors="replace"))
        checks = payload.get("checks", {}) if isinstance(payload, dict) else {}
        return {
            "status": payload.get("status") if isinstance(payload, dict) else None,
            "cache": checks.get("cache") if isinstance(checks, dict) else None,
            "latency": checks.get("latency") if isinstance(checks, dict) else None,
        }
    except Exception as exc:
        return {"status": status_code, "error": str(exc)}


def save_report(report: dict[str, Any], output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
    output_path = output_dir / f"benchmark_hot_endpoints_{ts}.json"
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return output_path


def print_summary(report: dict[str, Any]) -> None:
    print("\n=== HOT ENDPOINT BENCHMARK SUMMARY ===")
    print(f"Base URL: {report['base_url']}")
    print(f"API prefix: {report['api_prefix'] or '(none)'}")
    print(f"Runs/Warmup: {report['runs']} / {report['warmup']}")
    print(f"Workers: {report['workers']}")
    print("SLO targets: p95 <= 250ms, p99 <= 500ms")
    print("-")

    for item in report.get("results", []):
        if item.get("dry_run"):
            print(f"[DRY-RUN] {item['name']}: {item['url']}")
            continue

        latency = item.get("latency_ms", {})
        status = item.get("slo", {}).get("status", "warn").upper()
        print(
            f"[{status}] {item['name']}: "
            f"p50={latency.get('p50', 0):.2f}ms "
            f"p95={latency.get('p95', 0):.2f}ms "
            f"p99={latency.get('p99', 0):.2f}ms "
            f"err={item.get('error_rate_pct', 0):.2f}%"
        )

    overall = report.get("overall", {})
    print("-")
    print(
        "Overall: "
        f"p50={overall.get('p50_ms', 0):.2f}ms "
        f"p95={overall.get('p95_ms', 0):.2f}ms "
        f"p99={overall.get('p99_ms', 0):.2f}ms "
        f"error_rate={overall.get('error_rate_pct', 0):.2f}% "
        f"status={overall.get('status', 'warn').upper()}"
    )

    if report.get("report_path"):
        print(f"Report: {report['report_path']}")


def parse_symbols(text: str) -> list[str]:
    tokens = [s.strip().upper() for s in (text or "").split(",") if s.strip()]
    deduped = []
    seen = set()
    for token in tokens:
        if token not in seen:
            seen.add(token)
            deduped.append(token)
    return deduped or DEFAULT_SYMBOLS


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Benchmark hot API endpoints with p50/p95/p99 metrics")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="API base URL, e.g. http://127.0.0.1:8000")
    parser.add_argument("--runs", type=int, default=DEFAULT_RUNS, help="Number of benchmark requests per endpoint")
    parser.add_argument("--warmup", type=int, default=DEFAULT_WARMUP, help="Warmup requests per endpoint")
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS, help="HTTP timeout in seconds")
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS, help="Concurrent workers per endpoint")
    parser.add_argument("--symbols", default=",".join(DEFAULT_SYMBOLS), help="Comma-separated symbols to benchmark")
    parser.add_argument(
        "--api-prefix",
        default="auto",
        help="API prefix: auto, /api, empty string. Use auto for local/prod flexibility.",
    )
    parser.add_argument("--include-health", action="store_true", help="Include health snapshot in report")
    parser.add_argument("--dry-run", action="store_true", help="Print test plan without sending requests")
    parser.add_argument("--output-dir", default="logs/perf", help="Directory for JSON report output")
    return parser


def main() -> int:
    args = build_parser().parse_args()

    base_url = normalize_base_url(args.base_url)
    runs = max(1, int(args.runs))
    warmup = max(0, int(args.warmup))
    timeout_seconds = max(1.0, float(args.timeout))
    workers = max(1, int(args.workers))
    symbols = parse_symbols(args.symbols)
    api_prefix = resolve_api_prefix(base_url, args.api_prefix)

    started_at = datetime.now(tz=timezone.utc)
    cases = build_endpoint_cases(symbols, api_prefix=api_prefix)

    results = []
    all_latencies: list[float] = []
    total_runs = 0
    total_failures = 0

    for case in cases:
        result = benchmark_endpoint(
            base_url=base_url,
            case=case,
            runs=runs,
            warmup=warmup,
            timeout_seconds=timeout_seconds,
            workers=workers,
            dry_run=bool(args.dry_run),
        )
        results.append(result)

        if not args.dry_run:
            include_in_overall = not str(result.get("name", "")).startswith("health")
            result["included_in_overall"] = include_in_overall

            latency = result.get("latency_ms", {})
            if include_in_overall and result.get("success", 0) > 0:
                # Keep representative samples for overall percentile estimate.
                all_latencies.extend([
                    float(latency.get("p50", 0.0)),
                    float(latency.get("p95", 0.0)),
                    float(latency.get("p99", 0.0)),
                ])
            if include_in_overall:
                total_runs += int(result.get("runs", 0))
                total_failures += int(result.get("failures", 0))

    overall_error_rate = ((total_failures / total_runs) * 100.0) if total_runs > 0 else 0.0
    overall = {
        "p50_ms": round(percentile(all_latencies, 0.50), 2) if all_latencies else 0.0,
        "p95_ms": round(percentile(all_latencies, 0.95), 2) if all_latencies else 0.0,
        "p99_ms": round(percentile(all_latencies, 0.99), 2) if all_latencies else 0.0,
        "error_rate_pct": round(overall_error_rate, 2),
    }
    overall["status"] = "pass" if (
        overall["p95_ms"] <= SLO_P95_MS and overall["p99_ms"] <= SLO_P99_MS and overall["error_rate_pct"] == 0.0
    ) else "warn"

    report: dict[str, Any] = {
        "started_at_utc": started_at.isoformat(),
        "finished_at_utc": datetime.now(tz=timezone.utc).isoformat(),
        "base_url": base_url,
        "runs": runs,
        "warmup": warmup,
        "workers": workers,
        "api_prefix": api_prefix,
        "timeout_seconds": timeout_seconds,
        "symbols": symbols,
        "results": results,
        "overall": overall,
    }

    if args.include_health and not args.dry_run:
        report["health_snapshot"] = fetch_health_snapshot(base_url, timeout_seconds, api_prefix=api_prefix)

    output_dir = Path(args.output_dir)
    output_path = save_report(report, output_dir)
    report["report_path"] = str(output_path)

    print_summary(report)

    # Overwrite report once with report_path included for convenience.
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
