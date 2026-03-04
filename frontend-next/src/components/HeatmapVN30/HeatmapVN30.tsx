'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { API_BASE } from '@/lib/api';

//  Types 
interface Stock { ticker: string; cap: number; change: number; price: number }
interface Sector { name: string; shortName: string; totalCap: number; avgChange: number; stocks: Stock[] }
interface HeatmapData { sectors: Sector[] }
interface TileRect { x: number; y: number; w: number; h: number }
interface TileItem<T> { item: T; rect: TileRect }

//  Squarify Treemap 
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
  const totalArea  = (x1 - x0) * (y1 - y0);
  const nodes = sorted.map(d => ({ item: d, area: (getValue(d) / totalValue) * totalArea }));
  const result: TileItem<T>[] = [];
  function place(ns: typeof nodes, rx0: number, ry0: number, rx1: number, ry1: number) {
    const rw = rx1 - rx0, rh = ry1 - ry0;
    if (!ns.length || rw <= 0 || rh <= 0) return;
    if (ns.length === 1) { result.push({ item: ns[0].item, rect: { x: rx0, y: ry0, w: rw, h: rh } }); return; }
    const horiz    = rw >= rh;
    const longSide = horiz ? rw : rh;
    let row = [ns[0]], i = 1;
    while (i < ns.length) {
      const cand = [...row, ns[i]].map(n => n.area);
      if (worstAspect(cand, longSide) <= worstAspect(row.map(n => n.area), longSide)) { row.push(ns[i++]); } else break;
    }
    const rowArea   = row.reduce((s, n) => s + n.area, 0);
    const stripThick = rowArea / longSide;
    let offset = horiz ? rx0 : ry0;
    for (const n of row) {
      const cellLen = (n.area / rowArea) * longSide;
      result.push({ item: n.item, rect: horiz
        ? { x: offset, y: ry0, w: cellLen, h: stripThick }
        : { x: rx0, y: offset, w: stripThick, h: cellLen } });
      offset += cellLen;
    }
    const rem = ns.slice(row.length);
    if (rem.length) {
      if (horiz) place(rem, rx0, ry0 + stripThick, rx1, ry1);
      else       place(rem, rx0 + stripThick, ry0, rx1, ry1);
    }
  }
  place(nodes, x0, y0, x1, y1);
  return result;
}

//  Perplexity-style pastel color scale 
// Vietnamese market: ceiling ~+6.7% (purple), floor ~-6.7% (cyan)
function changeColor(pct: number): string {
  if (pct >= 6.5)  return '#6d28d9'; // tran - purple
  if (pct >= 4.0)  return '#14532d'; // deep green
  if (pct >= 2.5)  return '#16a34a'; // medium green
  if (pct >= 1.5)  return '#4ade80'; // light green
  if (pct >= 0.5)  return '#bbf7d0'; // very light green
  if (pct > -0.5)  return '#fef9c3'; // reference - cream
  if (pct > -1.5)  return '#fee2e2'; // very light red
  if (pct > -2.5)  return '#fca5a5'; // light pink
  if (pct > -4.0)  return '#f87171'; // salmon
  if (pct <= -6.5) return '#155e75'; // san - deep cyan
  return '#dc2626'; // medium-dark red
}

// Dark text on pale cells, white on saturated cells
function textColor(pct: number): string {
  if (pct >= 6.5 || pct <= -6.5) return '#ffffff';
  if (pct >= 2.5 || pct <= -4.0) return '#ffffff';
  if (pct >= 0.5)  return '#14532d'; // dark green text on pale green
  if (pct > -1.5)  return '#7f1d1d'; // dark red text on cream/light-pink
  return '#7f1d1d';
}

// Sector label text color
function sectorTextColor(pct: number): string {
  return pct >= 0 ? '#15803d' : '#dc2626';
}

const LEGEND: [string, string][] = [
  ['#6d28d9','Tran'], ['#14532d','+4%'], ['#16a34a','+2%'], ['#4ade80','+1%'], ['#bbf7d0','+0.5%'],
  ['#fef9c3','TC'],
  ['#fee2e2','-0.5%'], ['#fca5a5','-1%'], ['#f87171','-2%'], ['#dc2626','-4%'], ['#155e75','San'],
];

const H          = 500;
const SECTOR_PAD = 3;   // gap between sectors
const STOCK_GAP  = 1;   // gap between stocks within a sector
const LABEL_H    = 17;  // reserved height for sector label header row

//  Component 
export default function HeatmapVN30() {
  const [data,    setData]    = useState<HeatmapData | null>(null);
  const [cw,      setCw]      = useState(800);
  const [loading, setLoading] = useState(true);
  const [isDark,  setIsDark]  = useState(false);
  const [hover,   setHover]   = useState<{
    ticker: string; change: number; price: number; cap: number;
    mx: number; my: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Responsive width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setCw(el.clientWidth || 800);
    const ro = new ResizeObserver(e => { const w = e[0]?.contentRect.width; if (w > 0) setCw(Math.floor(w)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Dark mode detection
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const check = () => setIsDark(document.documentElement.classList.contains('dark') || mq.matches);
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/market/heatmap?exchange=HSX&limit=200`);
      if (!r.ok) return;
      const d: HeatmapData = await r.json();
      setData(d);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const svgBg     = isDark ? '#1a1c23' : '#ffffff';
  const labelBg   = isDark ? '#1a1c23' : '#ffffff';
  const labelText = isDark ? '#e2e8f0' : '#111827';

  const sectorTiles = squarifyTile(data?.sectors ?? [], s => s.totalCap, 0, 0, cw, H);

  return (
    <div className="rounded-xl border border-tremor-border dark:border-dark-tremor-border bg-white dark:bg-[#1a1c23] p-3 md:p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-indigo-500">
            <rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/>
            <rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>
          </svg>
          Heatmap HOSE
        </h2>
        {/* Perplexity-style gradient legend */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-gray-400 dark:text-gray-500 mr-0.5">-4%</span>
          {['#dc2626','#f87171','#fca5a5','#fee2e2','#fef9c3','#bbf7d0','#4ade80','#16a34a','#14532d'].map((c,i) => (
            <span key={i} className="inline-block w-4 h-3.5 rounded-sm" style={{ background: c }} />
          ))}
          <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-0.5">+4%</span>
          <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold text-white leading-none" style={{ background: '#6d28d9' }}>Tran</span>
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold text-white leading-none" style={{ background: '#155e75' }}>San</span>
        </div>
      </div>

      {/* Treemap */}
      <div ref={containerRef} className="relative w-full" style={{ height: H }}>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <svg
            width={cw} height={H}
            style={{ display: 'block', fontFamily: 'Inter, system-ui, sans-serif', userSelect: 'none' }}
            onMouseLeave={() => setHover(null)}
          >
            {/* SVG background */}
            <rect x={0} y={0} width={cw} height={H} fill={svgBg} />

            {sectorTiles.map(({ item: sector, rect: sRaw }) => {
              // Inset sector
              const sx = sRaw.x + SECTOR_PAD;
              const sy = sRaw.y + SECTOR_PAD;
              const sw = Math.max(0, sRaw.w - SECTOR_PAD * 2);
              const sh = Math.max(0, sRaw.h - SECTOR_PAD * 2);
              if (sw < 4 || sh < 4) return null;

              const hasLabel = sw >= 50 && sh >= LABEL_H + 4;
              const labelH   = hasLabel ? LABEL_H : 0;

              // Stocks fill the area below the label
              const stockTiles = squarifyTile(
                sector.stocks, s => s.cap,
                sx, sy + labelH, sx + sw, sy + sh,
              );

              const sign = sector.avgChange >= 0 ? '+' : '';
              const pct  = `${sign}${sector.avgChange.toFixed(2)}%`;

              return (
                <g key={sector.name}>
                  {/* Sector background (white/dark card bg) */}
                  <rect x={sx} y={sy} width={sw} height={sh} fill={labelBg} rx={4} />

                  {/* Sector label row */}
                  {hasLabel && (
                    <text
                      x={sx + 5} y={sy + 12}
                      fontSize={9.5} fontWeight="700" fill={labelText}
                      style={{ pointerEvents: 'none' }}
                    >
                      {sector.shortName}
                      <tspan
                        fill={sectorTextColor(sector.avgChange)}
                        fontWeight="600"
                      >{' '}{pct}</tspan>
                    </text>
                  )}

                  {/* Stock cells */}
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
                    const fs         = Math.min(13, Math.max(7, Math.min(iw / 4.5, ih / 3.2)));
                    const showTicker = iw >= 18 && ih >= 13;
                    const showPct    = iw >= 22 && ih >= 27;

                    return (
                      <g
                        key={stock.ticker}
                        style={{ cursor: 'pointer' }}
                        onClick={() => window.open(`/stock/${stock.ticker}`, '_blank')}
                        onMouseMove={e => {
                          const svg = (e.currentTarget as SVGGElement).closest('svg');
                          const br  = svg?.getBoundingClientRect();
                          setHover({ ticker: stock.ticker, change: stock.change, price: stock.price, cap: stock.cap,
                            mx: e.clientX - (br?.left ?? 0), my: e.clientY - (br?.top ?? 0) });
                        }}
                      >
                        <rect x={ix} y={iy} width={iw} height={ih} fill={bg} rx={3} />
                        {showTicker && (
                          <text
                            x={cx} y={cy - (showPct ? fs * 0.68 : 0)}
                            fill={fg} fontSize={fs} fontWeight="700"
                            textAnchor="middle" dominantBaseline="middle"
                            style={{ pointerEvents: 'none' }}
                          >{stock.ticker}</text>
                        )}
                        {showPct && (
                          <text
                            x={cx} y={cy + fs * 1.12}
                            fill={fg} fontSize={Math.max(6.5, fs * 0.8)} fontWeight="500"
                            textAnchor="middle" dominantBaseline="middle"
                            style={{ pointerEvents: 'none' }}
                          >{stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%</text>
                        )}
                      </g>
                    );
                  })}

                  {/* Sector border -- thin, subtle */}
                  <rect x={sx} y={sy} width={sw} height={sh}
                    fill="none" stroke={isDark ? '#334155' : '#e2e8f0'} strokeWidth={1} rx={4}
                    style={{ pointerEvents: 'none' }}
                  />
                </g>
              );
            })}

            {/* Tooltip */}
            {hover && (() => {
              const TW = 148, TH = 56;
              const tx = Math.min(hover.mx + 14, cw - TW - 4);
              const ty = Math.max(hover.my - TH - 10, 4);
              const sign   = hover.change >= 0 ? '+' : '';
              const capStr = hover.cap >= 1000 ? `${(hover.cap / 1000).toFixed(1)}N` : `${hover.cap.toFixed(0)}T`;
              const tBg    = isDark ? 'rgba(15,20,30,0.95)' : 'rgba(15,20,30,0.90)';
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <rect x={tx} y={ty} width={TW} height={TH} fill={tBg}
                    stroke="rgba(255,255,255,0.1)" strokeWidth={1} rx={7} />
                  <text x={tx + 10} y={ty + 19} fill="#f9fafb" fontSize={13} fontWeight="800">{hover.ticker}</text>
                  <text x={tx + 10} y={ty + 33} fill="#cbd5e1" fontSize={9.5}>
                    {hover.price.toLocaleString('vi-VN')} VND
                  </text>
                  <text x={tx + 10} y={ty + 47} fill="#94a3b8" fontSize={9}>
                    VH: {capStr} {'  '}
                    <tspan fill={hover.change >= 0 ? '#4ade80' : '#f87171'} fontWeight="700">
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
