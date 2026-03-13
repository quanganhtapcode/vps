'use client';

import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '@/lib/api';

type HolderView = 'institutional' | 'insiders';

interface InstitutionalHolder {
    manager: string;
    shares: number;
    ownership_percent?: number;
    value: number;
    change_percent?: number | null;
    update_date?: string;
}

interface InsiderHolder {
    name: string;
    position?: string;
    shares: number;
    ownership_percent?: number;
    value: number;
    change_percent?: number | null;
    update_date?: string;
}

interface HoldersPayload {
    success: boolean;
    symbol: string;
    current_price: number;
    as_of_shareholders?: string;
    as_of_officers?: string;
    as_of_shareholders_latest_raw?: string;
    as_of_officers_latest_raw?: string;
    shareholders_snapshot_rows?: number;
    shareholders_latest_rows?: number;
    officers_snapshot_rows?: number;
    officers_latest_rows?: number;
    sources?: {
        shareholders?: string;
        officers?: string;
    };
    summary?: {
        institutional_count?: number;
        insider_count?: number;
        institutional_total_shares?: number;
        institutional_total_value?: number;
    };
    institutional?: InstitutionalHolder[];
    insiders?: InsiderHolder[];
}

interface HoldersTabProps {
    symbol: string;
}

function formatCompactShares(value: number): string {
    const n = Number(value || 0);
    const abs = Math.abs(n);
    if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toFixed(0);
}

function formatCompactCurrencyVnd(value: number): string {
    const n = Number(value || 0);
    const abs = Math.abs(n);
    if (abs >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(1)}T`;
    if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
    if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    return n.toFixed(0);
}

function formatChangePct(value?: number | null): string {
    if (value == null || !Number.isFinite(value)) return '-';
    const n = Number(value);
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toFixed(1)}%`;
}

export default function HoldersTab({ symbol }: HoldersTabProps) {
    const [activeView, setActiveView] = useState<HolderView>('institutional');
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<HoldersPayload | null>(null);

    useEffect(() => {
        if (!symbol) return;

        const controller = new AbortController();
        setLoading(true);
        setError(null);

        fetch(`${API_BASE}/stock/holders/${symbol}`, {
            cache: 'no-store',
            signal: controller.signal,
        })
            .then(async (res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then((payload: HoldersPayload) => {
                if (!payload?.success) throw new Error(payload ? 'holders data unavailable' : 'empty response');
                setData(payload);
            })
            .catch((err) => {
                if (controller.signal.aborted) return;
                console.error('holders fetch error', err);
                setError('Unable to load holders data');
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [symbol]);

    const institutional = data?.institutional || [];
    const insiders = data?.insiders || [];

    useEffect(() => {
        const iCount = institutional.length;
        const inCount = insiders.length;

        if (inCount > iCount && inCount > 0) {
            setActiveView('insiders');
            return;
        }
        if (iCount > 0) {
            setActiveView('institutional');
            return;
        }
        if (inCount > 0) {
            setActiveView('insiders');
        }
    }, [institutional.length, insiders.length]);

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        let base: Array<InstitutionalHolder | InsiderHolder> = [];

        if (activeView === 'institutional') base = institutional;
        if (activeView === 'insiders') base = insiders;

        if (!q) return base;

        return base.filter((item: any) => {
            const name = String(item?.manager || item?.name || '').toLowerCase();
            const pos = String(item?.position || '').toLowerCase();
            return name.includes(q) || pos.includes(q);
        });
    }, [activeView, institutional, insiders, query]);

    const filings = activeView === 'institutional'
        ? (data?.summary?.institutional_count ?? institutional.length)
        : (data?.summary?.insider_count ?? insiders.length);

    const totalValue = activeView === 'institutional'
        ? (data?.summary?.institutional_total_value ?? institutional.reduce((s, x) => s + Number(x.value || 0), 0))
        : rows.reduce((s: number, x: any) => s + Number(x.value || 0), 0);

    const asOf = activeView === 'insiders' ? data?.as_of_officers : data?.as_of_shareholders;
    const latestRawAsOf = activeView === 'insiders' ? data?.as_of_officers_latest_raw : data?.as_of_shareholders_latest_raw;
    const selectedRows = activeView === 'insiders' ? Number(data?.officers_snapshot_rows || 0) : Number(data?.shareholders_snapshot_rows || 0);
    const latestRows = activeView === 'insiders' ? Number(data?.officers_latest_rows || 0) : Number(data?.shareholders_latest_rows || 0);
    const sourceLabel = activeView === 'insiders'
        ? (data?.sources?.officers || 'sqlite')
        : (data?.sources?.shareholders || 'sqlite');

    const downloadCsv = () => {
        if (!rows.length) return;

        const headers = ['Name', 'Position', 'Shares', 'ValueVND', 'ChangePercent', 'OwnershipPercent', 'UpdateDate'];
        const body = rows.map((r: any) => [
            JSON.stringify(r.manager || r.name || ''),
            JSON.stringify(r.position || ''),
            String(Number(r.shares || 0)),
            String(Number(r.value || 0)),
            r.change_percent == null ? '' : String(Number(r.change_percent)),
            r.ownership_percent == null ? '' : String(Number(r.ownership_percent)),
            r.update_date || '',
        ].join(','));

        const csv = [headers.join(','), ...body].join('\n');
        const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${symbol}_holders_${activeView}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-4">
            <div className="rounded-tremor-default border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setActiveView('institutional')}
                            className={`rounded-full px-3 py-1 text-sm ${activeView === 'institutional' ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}
                        >
                            Institutional ({institutional.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveView('insiders')}
                            className={`rounded-full px-3 py-1 text-sm ${activeView === 'insiders' ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}
                        >
                            Insiders ({insiders.length})
                        </button>
                    </div>

                    <div className="mt-3">
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={activeView === 'insiders' ? 'Find insiders by name or position' : 'Find institutional holders'}
                            className="w-full rounded-tremor-default border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-950"
                        />
                    </div>

                    {!loading && !error && activeView === 'institutional' && institutional.length > 0 && institutional.length < 5 ? (
                        <div className="mt-3 rounded-tremor-default border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
                            Institutional disclosure is currently limited for this symbol. Check Insiders tab for more coverage.
                        </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                            <span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-800">Filings: {filings}</span>
                            <span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-800">Total Reported Value: {formatCompactCurrencyVnd(totalValue)} VND</span>
                            {asOf ? <span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-800">As of: {asOf}</span> : null}
                            <span className="rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-800">Source: {sourceLabel}</span>
                        </div>

                        <button
                            type="button"
                            onClick={downloadCsv}
                            disabled={rows.length === 0}
                            className="rounded-tremor-default border border-gray-200 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:hover:bg-gray-800"
                        >
                            Download
                        </button>
                    </div>

                    {!loading && !error && asOf && latestRawAsOf && asOf !== latestRawAsOf ? (
                        <div className="mt-3 rounded-tremor-default border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-300">
                            Showing fuller snapshot ({selectedRows} rows) at {asOf} because latest raw snapshot ({latestRawAsOf}) has only {latestRows} rows.
                        </div>
                    ) : null}
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 text-left text-gray-600 dark:border-gray-800 dark:text-gray-300">
                                <th className="px-4 py-3 font-medium">Manager</th>
                                <th className="px-4 py-3 text-right font-medium">Shares</th>
                                <th className="px-4 py-3 text-right font-medium">Value</th>
                                <th className="px-4 py-3 text-right font-medium">Change</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">Loading holders...</td>
                                </tr>
                            ) : error ? (
                                <tr>
                                    <td colSpan={4} className="px-4 py-8 text-center text-red-500">{error}</td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">No data for this section.</td>
                                </tr>
                            ) : rows.map((row: any, idx) => (
                                <tr key={`${row.manager || row.name || 'row'}-${idx}`} className="border-b border-gray-100 last:border-b-0 dark:border-gray-800">
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-gray-900 dark:text-gray-100">{row.manager || row.name || '-'}</div>
                                        {row.position ? <div className="text-xs text-gray-500">{row.position}</div> : null}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200">{formatCompactShares(Number(row.shares || 0))}</td>
                                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-200">{formatCompactCurrencyVnd(Number(row.value || 0))}</td>
                                    <td className={`px-4 py-3 text-right font-medium ${Number(row.change_percent || 0) > 0 ? 'text-emerald-600' : Number(row.change_percent || 0) < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                                        {formatChangePct(row.change_percent)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
