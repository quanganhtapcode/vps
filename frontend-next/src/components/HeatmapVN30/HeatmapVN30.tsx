'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { API_BASE } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────────
interface Stock { ticker: string; cap: number; change: number; price: number }
interface Sector { name: string; shortName: string; totalCap: number; avgChange: number; stocks: Stock[] }
interface HeatmapData { sectors: Sector[] }

interface Rect { x: number; y: number; w: number; h: number }
interface LayoutItem<T> { data: T; rect: Rect }

// ── Squarify layout ────────────────────────────────────────────────────────
function worstRatio(row: number[], rowSum: number, area: number, shortSide: number): number {
  if (!row.length) return Infinity;
  const stripThick = (rowSum / area) * shortSide * shortSide; // approx
  const w = (rowSum / area); // fraction
  let worst = 0;
  for (const v of row) {
    const cellFrac = v / rowSum;
    // cell dims: thickness = strip thickness; long = cellFrac * (area/stripThick)
    const thick = (rowSum / area) * shortSide;
    const longSide = cellFrac * (area / shortSide > 0 ? area / shortSide : 1);
    const r = thick > 0 && longSide > 0 ? Math.max(thick / longSide, longSide / thick) : Infinity;
    if (r > worst) worst = r;
  }
  return worst;
}

function squarify<T extends { value: number }>(items: T[], rect: Rect): LayoutItem<T>[] {
  if (!items.length) return [];
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const results: LayoutItem<T>[] = [];
  _layout(sorted, rect, results);
  return results;
}

function _layout<T extends { value: number }>(items: T[], rect: Rect, out: LayoutItem<T>[]): void {
  if (!items.length) return;
  if (items.length === 1) { out.push({ data: items[0], rect }); return; }
  const { x, y, w, h } = rect;
  const total = items.reduce((s, i) => s + i.value, 0);
  const isH = w >= h;
  const shortSide = isH ? h : w;
  const area = w * h;

  let row: number[] = [];
  let rowSum = 0;
  let i = 0;
  while (i < items.length) {
    const v = items[i].value;
    const newRow = [...row, v];
    const newRowSum = rowSum + v;
    if (!row.length || worstRatio(newRow, newRowSum, area, shortSide) <= worstRatio(row, rowSum, area, shortSide)) {
      row.push(v); rowSum += v; i++;
    } else break;
  }

  const stripThick = (rowSum / total) * (isH ? h : w);
  let off = isH ? x : y;
  for (let j = 0; j < row.length; j++) {
    const cellLong = (row[j] / rowSum) * (isH ? w : h);
    const r: Rect = isH
      ? { x: off, y, w: cellLong, h: stripThick }
      : { x, y: off, w: stripThick, h: cellLong };
    out.push({ data: items[j], rect: r });
    off += cellLong;
  }

  const remaining = items.slice(i);
  if (remaining.length) {
    const newRect: Rect = isH
      ? { x, y: y + stripThick, w, h: h - stripThick }
      : { x: x + stripThick, y, w: w - stripThick, h };
    _layout(remaining, newRect, out);
  }
}

// ── Color helpers ─────────────────────────────────────────────────────────
function changeColor(pct: number): string {
  if (pct >= 6.5)  return '#7c3aed'; // trần
  if (pct >= 4.0)  return '#15803d';
  if (pct >= 2.0)  return '#16a34a';
  if (pct >= 0.5)  return '#4ade80';
  if (pct > -0.5)  return '#b45309'; // tham chiếu
  if (pct > -2.0)  return '#f87171';
  if (pct > -4.0)  return '#dc2626';
  if (pct <= -6.5) return '#0e7490'; // sàn
  return '#991b1b';
}
function textColor(pct: number): string {
  if (pct >= 0.5 && pct < 2.0) return '#052e16';
  if (pct < 0 && pct > -2.0)   return '#450a0a';
  return '#ffffff';
}

// ── Component ─────────────────────────────────────────────────────────────
const H = 460;
const SECTOR_GAP = 3;
const STOCK_GAP = 1;

const LEGEND: [string, string][] = [
  ['#7c3aed','Trần'],['#15803d','+4%'],['#16a34a','+2%'],['#4ade80','+0.5%'],
  ['#b45309','TC'],
  ['#f87171','-0.5%'],['#dc2626','-2%'],['#991b1b','-4%'],['#0e7490','Sàn'],
];

export default function HeatmapVN30() {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [containerW, setContainerW] = useState(800);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<{ ticker: string; change: number; price: number; x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Responsive width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w > 0) setContainerW(Math.floor(w));
    });
    ro.observe(el);
    setContainerW(el.clientWidth || 800);
    return () => ro.disconnect();
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/market/heatmap?exchange=HSX&limit=150`);
      if (!r.ok) return;
      const d: HeatmapData = await r.json();
      setData(d);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const W = containerW;
  const sectorItems = (data?.sectors ?? []).map(s => ({ ...s, value: s.totalCap }));
  const sectorLayout = squarify(sectorItems, { x: 0, y: 0, w: W, h: H });

  return (
    <div className="rounded-xl border border-tremor-border dark:border-dark-tremor-border bg-white dark:bg-[#1a1c23] p-3 md:p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong flex items-center gap-1.5">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500">
            <rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/>
            <rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>
          </svg>
          Heatmap HOSE
          <span className="text-[9px] font-normal text-tremor-content dark:text-dark-tremor-content ml-1">size = vốn hoá • click để xem chi tiết</span>
        </h2>
        <div className="hidden sm:flex items-center gap-0.5 flex-wrap justify-end max-w-xs">
          {LEGEND.map(([c, l]) => (
            <span key={l} className="px-1 py-0.5 rounded text-[9px] font-bold text-white"
              style={{ background: c }}>
              {l}
            </span>
          ))}
        </div>
      </div>

      {/* Treemap SVG */}
      <div ref={containerRef} className="relative w-full select-none" style={{ height: H }}>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <svg width={W} height={H} style={{ display: 'block', overflow: 'hidden' }}>
            {sectorLayout.map(({ data: sector, rect: sRect }) => {
              const sr: Rect = {
                x: sRect.x + SECTOR_GAP / 2,
                y: sRect.y + SECTOR_GAP / 2,
                w: Math.max(0, sRect.w - SECTOR_GAP),
                h: Math.max(0, sRect.h - SECTOR_GAP),
              };
              const stockItems = sector.stocks.map(s => ({ ...s, value: s.cap }));
              const stockLayout = squarify(stockItems, { x: sr.x, y: sr.y, w: sr.w, h: sr.h });
              const showLabel = sr.w > 55 && sr.h > 22;

              return (
                <g key={sector.name}>
                  {/* Stock cells */}
                  {stockLayout.map(({ data: stock, rect: r }) => {
                    const bg = changeColor(stock.change);
                    const fg = textColor(stock.change);
                    const ir: Rect = {
                      x: r.x + STOCK_GAP,
                      y: r.y + STOCK_GAP,
                      w: Math.max(0, r.w - STOCK_GAP * 2),
                      h: Math.max(0, r.h - STOCK_GAP * 2),
                    };
                    const showTicker = ir.w > 20 && ir.h > 14;
                    const showPct    = ir.w > 26 && ir.h > 28;
                    const fs = Math.min(12, Math.max(7, ir.w / 5));
                    const cx = ir.x + ir.w / 2;
                    const cy = ir.y + ir.h / 2;

                    return (
                      <g key={stock.ticker}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setHover({ ticker: stock.ticker, change: stock.change, price: stock.price, x: r.x + r.w / 2, y: r.y })}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => window.open(`/stock/${stock.ticker}`, '_blank')}>
                        <rect x={ir.x} y={ir.y} width={ir.w} height={ir.h} fill={bg} rx={2} />
                        {showTicker && (
                          <text x={cx} y={cy - (showPct ? fs * 0.65 : 0)}
                            fill={fg} fontSize={fs} fontWeight="700"
                            textAnchor="middle" dominantBaseline="middle"
                            style={{ pointerEvents: 'none' }}>
                            {stock.ticker}
                          </text>
                        )}
                        {showPct && (
                          <text x={cx} y={cy + fs * 1.1}
                            fill={fg} fontSize={fs * 0.82} fontWeight="500"
                            textAnchor="middle" dominantBaseline="middle"
                            style={{ pointerEvents: 'none' }}>
                            {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Sector border */}
                  <rect x={sr.x} y={sr.y} width={sr.w} height={sr.h}
                    fill="none" stroke="#0f172a" strokeWidth={1.5}
                    style={{ pointerEvents: 'none' }} rx={3} />

                  {/* Sector label (drawn last = on top) */}
                  {showLabel && (() => {
                    const sign = sector.avgChange >= 0 ? '+' : '';
                    const pct = `${sign}${sector.avgChange.toFixed(2)}%`;
                    const lw = Math.min(sr.w - 6, sector.shortName.length * 6.5 + pct.length * 5.5 + 12);
                    return (
                      <g style={{ pointerEvents: 'none' }}>
                        <rect x={sr.x + 3} y={sr.y + 2} width={lw} height={13} fill="rgba(0,0,0,0.6)" rx={2.5} />
                        <text x={sr.x + 7} y={sr.y + 11.5} fontSize={8.5} fontWeight="700" fill="#f1f5f9">
                          {sector.shortName}
                          <tspan fill={sector.avgChange >= 0 ? '#6ee7b7' : '#fca5a5'} fontWeight="500">
                            {' '}{pct}
                          </tspan>
                        </text>
                      </g>
                    );
                  })()}
                </g>
              );
            })}

            {/* Hover tooltip */}
            {hover && (() => {
              const tx = Math.min(hover.x - 4, W - 120);
              const ty = Math.max(hover.y - 38, 4);
              const sign = hover.change >= 0 ? '+' : '';
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <rect x={tx} y={ty} width={116} height={30} fill="rgba(10,10,20,0.88)" rx={5} />
                  <text x={tx + 8} y={ty + 11} fill="#f9fafb" fontSize={11} fontWeight="700">{hover.ticker}</text>
                  <text x={tx + 8} y={ty + 24} fill="#d1d5db" fontSize={9}>
                    {hover.price.toLocaleString('vi-VN')} ·
                    <tspan fill={hover.change >= 0 ? '#6ee7b7' : '#fca5a5'} fontWeight="600">
                      {' '}{sign}{hover.change.toFixed(2)}%
                    </tspan>
                  </text>
                </g>
              );
            })()}
          </svg>
        )}
      </div>
    </div>
  );
}
