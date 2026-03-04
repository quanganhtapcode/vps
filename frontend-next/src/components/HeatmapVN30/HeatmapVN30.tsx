'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { API_BASE } from '@/lib/api';

//  Types 
interface Stock { ticker: string; cap: number; change: number; price: number }
interface Sector { name: string; shortName: string; totalCap: number; avgChange: number; stocks: Stock[] }
interface HeatmapData { sectors: Sector[] }
interface TileRect { x: number; y: number; w: number; h: number }
interface TileItem<T> { item: T; rect: TileRect }

//  Correct Squarify Treemap 
// worst(rowAreas, longSide): max aspect ratio of cells in a strip along longSide
// formula: max(rmax * l / s, s / (rmin * l))
function worstAspect(rowAreas: number[], longSide: number): number {
  if (!rowAreas.length || longSide === 0) return Infinity;
  const s = rowAreas.reduce((a, b) => a + b, 0);
  const rmax = Math.max(...rowAreas);
  const rmin = Math.min(...rowAreas);
  const l2 = longSide * longSide;
  const s2 = s * s;
  return Math.max((rmax * l2) / s2, s2 / (rmin * l2));
}

function squarifyTile<T>(
  items: T[],
  getValue: (d: T) => number,
  x0: number, y0: number, x1: number, y1: number,
): TileItem<T>[] {
  const filtered = items.filter(d => getValue(d) > 0);
  if (!filtered.length) return [];

  const sorted = [...filtered].sort((a, b) => getValue(b) - getValue(a));
  const totalValue = sorted.reduce((s, d) => s + getValue(d), 0);
  const totalArea = (x1 - x0) * (y1 - y0);
  const nodes = sorted.map(d => ({
    item: d,
    area: (getValue(d) / totalValue) * totalArea,
  }));

  const result: TileItem<T>[] = [];

  function place(
    ns: typeof nodes,
    rx0: number, ry0: number, rx1: number, ry1: number,
  ) {
    const rw = rx1 - rx0;
    const rh = ry1 - ry0;
    if (!ns.length || rw <= 0 || rh <= 0) return;

    if (ns.length === 1) {
      result.push({ item: ns[0].item, rect: { x: rx0, y: ry0, w: rw, h: rh } });
      return;
    }

    const horizontal = rw >= rh;
    const longSide = horizontal ? rw : rh;

    // Greedily build the optimal strip row
    let row = [ns[0]];
    let i = 1;
    while (i < ns.length) {
      const candidate = [...row, ns[i]].map(n => n.area);
      const prev = row.map(n => n.area);
      if (worstAspect(candidate, longSide) <= worstAspect(prev, longSide)) {
        row.push(ns[i]);
        i++;
      } else {
        break;
      }
    }

    // Place the strip
    const rowArea = row.reduce((s, n) => s + n.area, 0);
    const stripThick = rowArea / longSide;

    let offset = horizontal ? rx0 : ry0;
    for (const n of row) {
      const cellLen = (n.area / rowArea) * longSide;
      result.push({
        item: n.item,
        rect: horizontal
          ? { x: offset, y: ry0, w: cellLen, h: stripThick }
          : { x: rx0, y: offset, w: stripThick, h: cellLen },
      });
      offset += cellLen;
    }

    // Recurse remaining
    const remaining = ns.slice(row.length);
    if (remaining.length) {
      if (horizontal) {
        place(remaining, rx0, ry0 + stripThick, rx1, ry1);
      } else {
        place(remaining, rx0 + stripThick, ry0, rx1, ry1);
      }
    }
  }

  place(nodes, x0, y0, x1, y1);
  return result;
}

//  Color scale 
function changeColor(pct: number): string {
  if (pct >= 6.5)  return '#6d28d9'; // ceiling
  if (pct >= 4.0)  return '#15803d';
  if (pct >= 2.0)  return '#16a34a';
  if (pct >= 0.5)  return '#22c55e';
  if (pct > -0.5)  return '#92400e'; // reference price
  if (pct > -2.0)  return '#f87171';
  if (pct > -4.0)  return '#dc2626';
  if (pct <= -6.5) return '#0e7490'; // floor
  return '#991b1b';
}
function textColor(pct: number): string {
  if (pct >= 0.5 && pct < 2.0) return '#dcfce7';
  if (pct <  0   && pct > -2.0) return '#fee2e2';
  return '#ffffff';
}

const LEGEND: [string, string][] = [
  ['#6d28d9', 'Tran'], ['#15803d', '+4%'], ['#16a34a', '+2%'], ['#22c55e', '+0.5%'],
  ['#92400e', 'TC'],
  ['#f87171', '-0.5%'], ['#dc2626', '-2%'], ['#991b1b', '-4%'], ['#0e7490', 'San'],
];

const H          = 500;
const SECTOR_PAD = 2;
const STOCK_GAP  = 1;

//  Component 
export default function HeatmapVN30() {
  const [data,       setData]    = useState<HeatmapData | null>(null);
  const [containerW, setW]       = useState(800);
  const [loading,    setLoading] = useState(true);
  const [hover, setHover]        = useState<{
    ticker: string; change: number; price: number; cap: number;
    mx: number; my: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setW(el.clientWidth || 800);
    const ro = new ResizeObserver(e => {
      const w = e[0]?.contentRect.width;
      if (w > 0) setW(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/market/heatmap?exchange=HSX&limit=200`);
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

  const sectorTiles = squarifyTile(
    data?.sectors ?? [],
    s => s.totalCap,
    0, 0, containerW, H,
  );

  return (
    <div className="rounded-xl border border-tremor-border dark:border-dark-tremor-border bg-white dark:bg-[#1a1c23] p-3 md:p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="text-sm font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong flex items-center gap-1.5 shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-indigo-500">
            <rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/>
            <rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>
          </svg>
          Heatmap HOSE
          <span className="hidden sm:inline text-[9px] font-normal text-tremor-content dark:text-dark-tremor-content">
            size = von hoa &middot; hover de xem &middot; click de mo
          </span>
        </h2>
        <div className="flex items-center gap-0.5 flex-wrap justify-end">
          {LEGEND.map(([c, l]) => (
            <span key={l} className="px-1.5 py-0.5 rounded text-[9px] font-bold text-white leading-none"
              style={{ background: c }}>{l}</span>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="relative w-full" style={{ height: H }}>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <svg
            width={containerW} height={H}
            style={{ display: 'block', userSelect: 'none' }}
            onMouseLeave={() => setHover(null)}
          >
            {sectorTiles.map(({ item: sector, rect: sRaw }) => {
              const sx = sRaw.x + SECTOR_PAD;
              const sy = sRaw.y + SECTOR_PAD;
              const sw = Math.max(0, sRaw.w - SECTOR_PAD * 2);
              const sh = Math.max(0, sRaw.h - SECTOR_PAD * 2);

              const stockTiles = squarifyTile(
                sector.stocks,
                s => s.cap,
                sx, sy, sx + sw, sy + sh,
              );

              const showSectorLabel = sw > 40 && sh > 16;

              return (
                <g key={sector.name}>
                  {stockTiles.map(({ item: stock, rect: r }) => {
                    const ix = r.x + STOCK_GAP;
                    const iy = r.y + STOCK_GAP;
                    const iw = Math.max(0, r.w - STOCK_GAP * 2);
                    const ih = Math.max(0, r.h - STOCK_GAP * 2);
                    if (iw < 2 || ih < 2) return null;

                    const bg = changeColor(stock.change);
                    const fg = textColor(stock.change);
                    const cx = ix + iw / 2;
                    const cy = iy + ih / 2;
                    const fs        = Math.min(13, Math.max(7, Math.min(iw / 4.5, ih / 3)));
                    const showTicker = iw >= 18 && ih >= 13;
                    const showPct    = iw >= 24 && ih >= 28;

                    return (
                      <g
                        key={stock.ticker}
                        style={{ cursor: 'pointer' }}
                        onClick={() => window.open(`/stock/${stock.ticker}`, '_blank')}
                        onMouseMove={e => {
                          const svg = (e.currentTarget as SVGGElement).closest('svg');
                          const br  = svg?.getBoundingClientRect();
                          setHover({
                            ticker: stock.ticker,
                            change: stock.change,
                            price:  stock.price,
                            cap:    stock.cap,
                            mx: e.clientX - (br?.left ?? 0),
                            my: e.clientY - (br?.top  ?? 0),
                          });
                        }}
                      >
                        <rect x={ix} y={iy} width={iw} height={ih} fill={bg} rx={2} />
                        {showTicker && (
                          <text
                            x={cx} y={cy - (showPct ? fs * 0.7 : 0)}
                            fill={fg} fontSize={fs} fontWeight="700"
                            textAnchor="middle" dominantBaseline="middle"
                            style={{ pointerEvents: 'none' }}
                          >
                            {stock.ticker}
                          </text>
                        )}
                        {showPct && (
                          <text
                            x={cx} y={cy + fs * 1.15}
                            fill={fg} fontSize={Math.max(6, fs * 0.8)} fontWeight="500"
                            textAnchor="middle" dominantBaseline="middle"
                            style={{ pointerEvents: 'none' }}
                          >
                            {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%
                          </text>
                        )}
                      </g>
                    );
                  })}

                  <rect x={sx} y={sy} width={sw} height={sh}
                    fill="none" stroke="#0f172a" strokeWidth={1.5} rx={3}
                    style={{ pointerEvents: 'none' }}
                  />

                  {showSectorLabel && (() => {
                    const sign  = sector.avgChange >= 0 ? '+' : '';
                    const pct   = `${sign}${sector.avgChange.toFixed(2)}%`;
                    const label = `${sector.shortName} ${pct}`;
                    const lw    = Math.min(sw - 4, label.length * 6 + 10);
                    return (
                      <g style={{ pointerEvents: 'none' }}>
                        <rect x={sx + 3} y={sy + 2} width={lw} height={14}
                          fill="rgba(0,0,0,0.65)" rx={3} />
                        <text x={sx + 8} y={sy + 12} fontSize={8.5} fontWeight="700" fill="#f1f5f9">
                          {sector.shortName}
                          <tspan fill={sector.avgChange >= 0 ? '#86efac' : '#fca5a5'} fontWeight="500">
                            {' '}{pct}
                          </tspan>
                        </text>
                      </g>
                    );
                  })()}
                </g>
              );
            })}

            {hover && (() => {
              const TW = 144, TH = 54;
              const tx = Math.min(hover.mx + 14, containerW - TW - 4);
              const ty = Math.max(hover.my - TH - 10, 4);
              const sign   = hover.change >= 0 ? '+' : '';
              const capStr = hover.cap >= 1000
                ? `${(hover.cap / 1000).toFixed(1)}N`
                : `${hover.cap.toFixed(0)}T`;
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <rect x={tx} y={ty} width={TW} height={TH}
                    fill="rgba(8,10,20,0.92)" stroke="rgba(255,255,255,0.09)"
                    strokeWidth={1} rx={6} />
                  <text x={tx + 10} y={ty + 18} fill="#f9fafb" fontSize={13} fontWeight="800">
                    {hover.ticker}
                  </text>
                  <text x={tx + 10} y={ty + 32} fill="#cbd5e1" fontSize={9.5}>
                    {hover.price.toLocaleString('vi-VN')} VND
                  </text>
                  <text x={tx + 10} y={ty + 46} fill="#94a3b8" fontSize={9}>
                    VH: {capStr} {' '}
                    <tspan fill={hover.change >= 0 ? '#86efac' : '#fca5a5'} fontWeight="700">
                      {sign}{hover.change.toFixed(2)}%
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
