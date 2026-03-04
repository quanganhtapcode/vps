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
  const totalArea = (x1 - x0) * (y1 - y0);
  const nodes = sorted.map(d => ({ item: d, area: (getValue(d) / totalValue) * totalArea }));
  const result: TileItem<T>[] = [];
  function place(ns: typeof nodes, rx0: number, ry0: number, rx1: number, ry1: number) {
    const rw = rx1 - rx0, rh = ry1 - ry0;
    if (!ns.length || rw <= 0 || rh <= 0) return;
    if (ns.length === 1) { result.push({ item: ns[0].item, rect: { x: rx0, y: ry0, w: rw, h: rh } }); return; }
    const horiz = rw >= rh;
    const longSide = horiz ? rw : rh;
    let row = [ns[0]], i = 1;
    while (i < ns.length) {
      const cand = [...row, ns[i]].map(n => n.area);
      if (worstAspect(cand, longSide) <= worstAspect(row.map(n => n.area), longSide)) { row.push(ns[i++]); } else break;
    }
    const rowArea = row.reduce((s, n) => s + n.area, 0);
    const stripThick = rowArea / longSide;
    let offset = horiz ? rx0 : ry0;
    for (const n of row) {
      const cellLen = (n.area / rowArea) * longSide;
      result.push({
        item: n.item, rect: horiz
          ? { x: offset, y: ry0, w: cellLen, h: stripThick }
          : { x: rx0, y: offset, w: stripThick, h: cellLen }
      });
      offset += cellLen;
    }
    const rem = ns.slice(row.length);
    if (rem.length) {
      if (horiz) place(rem, rx0, ry0 + stripThick, rx1, ry1);
      else place(rem, rx0 + stripThick, ry0, rx1, ry1);
    }
  }
  place(nodes, x0, y0, x1, y1);
  return result;
}

//  Pastel Color Scale (Perplexity/Generic style as requested)
function changeColor(pct: number): string {
  if (pct === undefined || pct === null) return '#ffffff';
  if (pct <= -5) return '#f4889a'; // Red Strong
  if (pct <= -2) return '#f8a9b4'; // Red Medium
  if (pct < 0) return '#fce0e3'; // Red Light
  if (pct === 0) return '#f3f4f6'; // Gray (Neutral)
  if (pct < 2) return '#e0f3d8'; // Green Light
  if (pct < 5) return '#bceaa8'; // Green Medium
  return '#8bd071';               // Green Strong
}

function textColor(pct: number): string {
  // Use dark text for better visibility on pastel backgrounds
  return '#0f172a';
}

function sectorTextColor(pct: number): string {
  if (pct > 0) return '#065f46';
  if (pct < 0) return '#991b1b';
  return '#64748b';
}

const H = 600;
const SECTOR_PAD = 6;   // larger gap between sectors
const STOCK_GAP = 1.5; // gap between stocks
const LABEL_H = 24;  // height for sector label header

//  Component 
export default function HeatmapVN30() {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [cw, setCw] = useState(800);
  const [ch, setCh] = useState(600); // Responsive height
  const [loading, setLoading] = useState(true);
  const [isDark, setIsDark] = useState(false);
  const [hover, setHover] = useState<{
    ticker: string; change: number; price: number; cap: number;
    mx: number; my: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Responsive sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const w = el.clientWidth || 800;
      setCw(w);
      // Dynamic height: taller on desktop, shorter on mobile
      setCh(w < 640 ? 450 : 600);
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
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

  const svgBg = isDark ? '#0f1117' : '#ffffff';
  const labelBg = isDark ? '#0f1117' : '#ffffff';
  const labelText = isDark ? '#94a3b8' : '#64748b';

  const sectorTiles = squarifyTile(data?.sectors ?? [], s => s.totalCap, 0, 0, cw, ch);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f1117] p-4 md:p-6 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            HOSE Heatmap
          </h2>
          <p className="text-xs text-slate-500 font-medium">VN-Index stocks grouped by sector</p>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
          Expand
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      </div>

      {/* Treemap */}
      <div ref={containerRef} className="relative w-full" style={{ height: ch }}>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <svg
            width={cw} height={ch}
            style={{
              display: 'block',
              fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
              userSelect: 'none'
            }}
            onMouseLeave={() => setHover(null)}
          >
            {/* SVG background */}
            <rect x={0} y={0} width={cw} height={ch} fill={svgBg} />

            {sectorTiles.map(({ item: sector, rect: sRaw }) => {
              // Inset sector
              const sx = sRaw.x + SECTOR_PAD;
              const sy = sRaw.y + SECTOR_PAD;
              const sw = Math.max(0, sRaw.w - SECTOR_PAD * 2);
              const sh = Math.max(0, sRaw.h - SECTOR_PAD * 2);
              if (sw < 4 || sh < 4) return null;

              const hasLabel = sw >= 50 && sh >= LABEL_H + 4;
              const labelH = hasLabel ? LABEL_H : 0;

              // Stocks fill the area below the label
              const stockTiles = squarifyTile(
                sector.stocks, s => s.cap,
                sx, sy + labelH, sx + sw, sy + sh,
              );

              const sign = sector.avgChange >= 0 ? '+' : '';
              const pct = `${sign}${sector.avgChange.toFixed(2)}%`;

              return (
                <g key={sector.name}>
                  {/* Sector background (white/dark card bg) */}
                  <rect x={sx} y={sy} width={sw} height={sh} fill={labelBg} rx={4} />

                  {/* Sector label row */}
                  {hasLabel && (
                    <g transform={`translate(${sx}, ${sy})`} style={{ pointerEvents: 'none' }}>
                      <text
                        x={0} y={15}
                        fontSize={11} fontWeight="700" fill={labelText}
                      >
                        {sector.shortName}
                        <tspan
                          dx={6}
                          fill={sectorTextColor(sector.avgChange)}
                          fontSize={10}
                          fontWeight="600"
                        >{pct}</tspan>
                      </text>
                    </g>
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

                    // Adaptive font sizes
                    const fs = Math.min(14, Math.max(8, Math.min(iw / 4.2, ih / 3.0)));
                    const showTicker = iw >= 20 && ih >= 15;
                    const showPct = iw >= 25 && ih >= 30;

                    return (
                      <g
                        key={stock.ticker}
                        className="transition-all duration-200"
                        style={{ cursor: 'pointer' }}
                        onClick={() => window.open(`/stock/${stock.ticker}`, '_blank')}
                        onMouseMove={e => {
                          const svg = (e.currentTarget as SVGGElement).closest('svg');
                          const br = svg?.getBoundingClientRect();
                          if (!br) return;
                          setHover({
                            ticker: stock.ticker, change: stock.change, price: stock.price, cap: stock.cap,
                            mx: e.clientX - br.left, my: e.clientY - br.top
                          });
                        }}
                        onTouchStart={e => {
                          const svg = (e.currentTarget as SVGGElement).closest('svg');
                          const br = svg?.getBoundingClientRect();
                          if (!br) return;
                          const touch = e.touches[0];
                          setHover({
                            ticker: stock.ticker, change: stock.change, price: stock.price, cap: stock.cap,
                            mx: touch.clientX - br.left, my: touch.clientY - br.top
                          });
                        }}
                      >
                        <rect
                          x={ix} y={iy} width={iw} height={ih}
                          fill={bg} rx={4}
                          className="hover:brightness-110 transition-all shadow-sm"
                        />
                        {showTicker && (
                          <text
                            x={cx} y={cy - (showPct ? fs * 0.75 : 0)}
                            fill={fg} fontSize={fs} fontWeight="800"
                            textAnchor="middle" dominantBaseline="middle"
                            style={{ pointerEvents: 'none', letterSpacing: '-0.02em' }}
                          >{stock.ticker}</text>
                        )}
                        {showPct && (
                          <text
                            x={cx} y={cy + fs * 1.15}
                            fill={fg} fontSize={Math.max(7, fs * 0.85)} fontWeight="600"
                            textAnchor="middle" dominantBaseline="middle"
                            opacity={0.9}
                            style={{ pointerEvents: 'none' }}
                          >{stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%</text>
                        )}
                      </g>
                    );
                  })}

                  {/* Sector border -- thin, subtle */}
                  <rect x={sx} y={sy} width={sw} height={sh}
                    fill="none" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'} strokeWidth={1} rx={6}
                    style={{ pointerEvents: 'none' }}
                  />
                </g>
              );
            })}

            {/* Tooltip */}
            {hover && (() => {
              const TW = cw < 400 ? 140 : 180;
              const TH = cw < 400 ? 80 : 96;
              // Tooltip positioning logic to keep it within bounds
              let tx = hover.mx + 15;
              let ty = hover.my + 15;
              if (tx + TW > cw) tx = hover.mx - TW - 15;
              if (ty + TH > ch) ty = hover.my - TH - 15;
              if (tx < 5) tx = 5;
              if (ty < 5) ty = 5;

              const sign = hover.change >= 0 ? '+' : '';
              const capStr = hover.cap >= 1000 ? `${(hover.cap / 1000).toFixed(1)}N tỷ` : `${hover.cap.toFixed(0)} tỷ`;
              const tBg = isDark ? '#1e2230' : '#ffffff';
              const tStroke = isDark ? '#334155' : '#e2e8f0';
              const tText = isDark ? '#f8fafc' : '#0f172a';
              const tMuted = isDark ? '#94a3b8' : '#64748b';

              return (
                <g style={{ pointerEvents: 'none' }}>
                  {/* Shadow filter defined once or just use a style */}
                  <rect x={tx} y={ty} width={TW} height={TH} fill={tBg} rx={12} stroke={tStroke} strokeWidth={1.5} filter="drop-shadow(0 10px 15px rgba(0,0,0,0.1))" />

                  {/* Ticker & Change */}
                  <text x={tx + 12} y={ty + 26} fill={tText} fontSize={16} fontWeight="800">{hover.ticker}</text>
                  <g transform={`translate(${tx + TW - 12}, ${ty + 23})`}>
                    <rect x={-45} y={-12} width={45} height={18} rx={6} fill={hover.change >= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'} />
                    <text x={-2} y={1} fill={hover.change >= 0 ? '#10b981' : '#ef4444'} fontSize={12} fontWeight="800" textAnchor="end">
                      {sign}{hover.change.toFixed(2)}%
                    </text>
                  </g>

                  {/* Details */}
                  <line x1={tx + 12} y1={ty + 40} x2={tx + TW - 12} y2={ty + 40} stroke={tStroke} strokeWidth={1} strokeDasharray="2 2" />

                  <text x={tx + 12} y={ty + 58} fill={tMuted} fontSize={11} fontWeight="500">Giá hiện tại</text>
                  <text x={tx + TW - 12} y={ty + 58} fill={tText} fontSize={12} fontWeight="700" textAnchor="end">{hover.price.toLocaleString('vi-VN')} đ</text>

                  <text x={tx + 12} y={ty + 76} fill={tMuted} fontSize={11} fontWeight="500">Vốn hóa</text>
                  <text x={tx + TW - 12} y={ty + 76} fill={tText} fontSize={12} fontWeight="700" textAnchor="end">{capStr}</text>

                  {cw >= 400 && (
                    <text x={tx + TW / 2} y={ty + 88} fill={tMuted} fontSize={8} fontWeight="500" textAnchor="middle" opacity={0.6}>Click để xem chi tiết</text>
                  )}
                </g>
              );
            })()}
          </svg>
        )}
      </div>

      {/* Modern Legend Footer */}
      <div className="mt-6 flex flex-wrap items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-5 gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-bold text-slate-400 mr-2">-5%</span>
            {['#f4889a', '#f8a9b4', '#fce0e3', '#f3f4f6', '#e0f3d8', '#bceaa8', '#8bd071'].map((c, i) => (
              <div key={i} className="w-5 h-4 first:rounded-l-md last:rounded-r-md shadow-sm" style={{ backgroundColor: c }} />
            ))}
            <span className="text-[11px] font-bold text-slate-400 ml-2">+5%</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-[11px] text-slate-400 font-medium">
            {new Date().toLocaleString('vi-VN', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            })}
          </div>
          <div className="flex items-center gap-1.5 grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all cursor-default">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Live Data</span>
          </div>
        </div>
      </div>
    </div>
  );
}
