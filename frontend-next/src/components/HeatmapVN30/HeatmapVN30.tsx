'use client';

import { useEffect, useState, useRef } from 'react';
import { API_BASE } from '@/lib/api';
import { Card, Title, Icon } from '@tremor/react';
import { RiBarChartLine } from '@remixicon/react';

// VN30 constituents (official list)
const VN30_SYMBOLS = [
  'ACB', 'BCM', 'BID', 'BVH', 'CTG',
  'FPT', 'GAS', 'GVR', 'HDB', 'HPG',
  'MBB', 'MSN', 'MWG', 'NVL', 'PDR',
  'PLX', 'PNJ', 'POW', 'SAB', 'SHB',
  'SSB', 'SSI', 'STB', 'TCB', 'TPB',
  'VCB', 'VHM', 'VIC', 'VJC', 'VPB',
];

interface StockCell {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
}

function getColor(pct: number): { bg: string; text: string } {
  if (pct >= 6.5)  return { bg: 'bg-purple-600 dark:bg-purple-700',         text: 'text-white' }; // trần
  if (pct >= 3)    return { bg: 'bg-emerald-700 dark:bg-emerald-800',        text: 'text-white' };
  if (pct >= 1.5)  return { bg: 'bg-emerald-500 dark:bg-emerald-600',        text: 'text-white' };
  if (pct >= 0.3)  return { bg: 'bg-emerald-400 dark:bg-emerald-500',        text: 'text-white' };
  if (pct > -0.3)  return { bg: 'bg-yellow-400 dark:bg-yellow-600',          text: 'text-gray-900 dark:text-white' }; // tham chiếu
  if (pct > -1.5)  return { bg: 'bg-rose-400 dark:bg-rose-500',              text: 'text-white' };
  if (pct > -3)    return { bg: 'bg-rose-600 dark:bg-rose-700',              text: 'text-white' };
  if (pct <= -6.5) return { bg: 'bg-cyan-600 dark:bg-cyan-700',              text: 'text-white' }; // sàn
  return             { bg: 'bg-rose-700 dark:bg-rose-800',                   text: 'text-white' };
}

export default function HeatmapVN30() {
  const [cells, setCells] = useState<StockCell[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    try {
      const syms = VN30_SYMBOLS.join(',');
      const r = await fetch(`${API_BASE}/market/prices?symbols=${syms}`);
      if (!r.ok) return;
      const data: Record<string, { price: number; change: number; changePercent: number }> = await r.json();
      const result: StockCell[] = VN30_SYMBOLS.map(sym => ({
        symbol: sym,
        price: data[sym]?.price ?? 0,
        change: data[sym]?.change ?? 0,
        changePercent: data[sym]?.changePercent ?? 0,
      }));
      setCells(result);
    } catch { /* silently fail */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return (
    <Card className="p-3 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <Title className="text-sm md:text-base font-semibold flex items-center text-tremor-content-strong dark:text-dark-tremor-content-strong">
          <Icon icon={RiBarChartLine} className="mr-1.5 text-indigo-500" size="sm" />
          Heatmap VN30
        </Title>
        <div className="flex items-center gap-1.5 text-[10px] font-medium">
          <span className="px-1.5 py-0.5 rounded bg-purple-600 text-white">Trần</span>
          <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white">Tăng</span>
          <span className="px-1.5 py-0.5 rounded bg-yellow-400 text-gray-900 dark:bg-yellow-600 dark:text-white">TC</span>
          <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white">Giảm</span>
          <span className="px-1.5 py-0.5 rounded bg-cyan-600 text-white">Sàn</span>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-6 gap-1.5">
          {VN30_SYMBOLS.map(sym => (
            <div key={sym} className="h-14 rounded-lg animate-pulse bg-gray-200 dark:bg-gray-800" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-5 sm:grid-cols-6 gap-1 md:gap-1.5">
          {cells.map(cell => {
            const { bg, text } = getColor(cell.changePercent);
            const pct = cell.changePercent;
            const sign = pct > 0 ? '+' : '';
            return (
              <a
                key={cell.symbol}
                href={`/stock/${cell.symbol}`}
                className={`${bg} ${text} rounded-lg p-2 flex flex-col items-center justify-center h-14 md:h-16 transition-transform hover:scale-105 hover:z-10 relative cursor-pointer select-none`}
              >
                <span className="font-bold text-[11px] md:text-xs leading-tight tracking-wide">{cell.symbol}</span>
                <span className="text-[10px] md:text-[11px] font-semibold leading-tight mt-0.5 tabular-nums">
                  {sign}{pct.toFixed(2)}%
                </span>
              </a>
            );
          })}
        </div>
      )}
    </Card>
  );
}
