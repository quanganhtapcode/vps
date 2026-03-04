'use client';

import { useEffect, useState, useRef } from 'react';
import { API_BASE } from '@/lib/api';

interface WorldIndex {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

function formatPrice(price: number): string {
  if (price >= 10000) return price.toLocaleString('en', { maximumFractionDigits: 0 });
  if (price >= 1000) return price.toLocaleString('en', { maximumFractionDigits: 2 });
  return price.toLocaleString('en', { maximumFractionDigits: 2 });
}

export default function TickerTape() {
  const [indices, setIndices] = useState<WorldIndex[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    try {
      const r = await fetch(`${API_BASE}/market/world-indices`);
      if (!r.ok) return;
      const data: WorldIndex[] = await r.json();
      if (Array.isArray(data) && data.length > 0) setIndices(data);
    } catch { /* silently fail */ }
  };

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 90_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  if (indices.length === 0) return null;

  // Duplicate items for seamless loop
  const items = [...indices, ...indices];

  const duration = Math.max(30, indices.length * 8);

  return (
    <div className="fixed inset-x-4 z-40 h-8 overflow-hidden rounded-full border border-gray-200/50 bg-white/80 backdrop-blur-md dark:border-gray-800/50 dark:bg-gray-950/80 top-[72px] md:top-[88px] max-w-5xl mx-auto shadow-sm">
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes ticker-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .ticker-track { animation: ticker-scroll linear infinite; width: max-content; }
        .ticker-track:hover { animation-play-state: paused; }
      `}} />
      <div className="ticker-track flex items-center h-full whitespace-nowrap" style={{ animationDuration: `${duration}s` }}>
        {items.map((idx, i) => {
          const up = idx.changePercent > 0;
          const down = idx.changePercent < 0;
          const colorCls = up
            ? 'text-emerald-600 dark:text-emerald-400'
            : down
              ? 'text-rose-500 dark:text-rose-400'
              : 'text-yellow-600 dark:text-yellow-400';
          return (
            <span key={i} className="inline-flex items-center gap-1.5 px-4 text-[11px] font-medium">
              <span className="text-gray-500 dark:text-gray-400 font-semibold">{idx.name}</span>
              <span className="text-gray-900 dark:text-gray-100 font-semibold tabular-nums">
                {formatPrice(idx.price)}
              </span>
              <span className={`tabular-nums font-bold ${colorCls}`}>
                {idx.changePercent > 0 ? '+' : ''}{idx.changePercent.toFixed(2)}%
              </span>
              <span className="text-gray-200 dark:text-gray-700 select-none">|</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
