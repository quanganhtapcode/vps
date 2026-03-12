import { NextResponse } from 'next/server';

// ── API proxy target ────────────────────────────────────────────────────────
// Browser calls  : GET/POST /api/*  →  this file  →  BACKEND_API/*
// Domain mapping : stock.quanganh.org (Vercel) → api.quanganh.org (VPS nginx)
//
// Env vars to set:
//   BACKEND_API_URL       — production VPS URL  (set in Vercel dashboard)
//   BACKEND_API_URL_LOCAL — local Flask URL     (set in .env.local)
//
// See .env.production / .env.example for canonical values.
const BACKEND_API =
    process.env.NODE_ENV === 'development'
        ? (process.env.BACKEND_API_URL_LOCAL || 'http://127.0.0.1:8000/api')
        : (process.env.BACKEND_API_URL || 'https://api.quanganh.org/v1/valuation');

export async function GET(
    request: Request,
    { params }: { params: Promise<{ path: string[] }> }
) {
    try {
        const { path } = await params;
        const apiPath = path.join('/');

        // Get query string from the request URL
        const { searchParams } = new URL(request.url);
        const queryString = searchParams.toString();

        const fullUrl = `${BACKEND_API}/${apiPath}${queryString ? `?${queryString}` : ''}`;

        const response = await fetch(fullUrl, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Next.js API Proxy',
            },
            // Always bypass Next.js/CDN cache — the Flask backend manages its own
            // per-endpoint TTLs, so double-caching here only causes stale data.
            cache: 'no-store',
        });

        if (!response.ok) {
            let backendError: any = null;
            try {
                backendError = await response.json();
            } catch {
                backendError = null;
            }

            return NextResponse.json(
                {
                    error: `Backend Error: ${response.status}`,
                    backend: backendError,
                },
                { status: response.status }
            );
        }

        const data = await response.json();

        const backendSource = response.headers.get('x-source');
        const backendTiming = response.headers.get('server-timing');
        const backendDb = response.headers.get('x-db');
        const backendCache = response.headers.get('x-cache');

        return NextResponse.json(data, {
            headers: {
                // No CDN caching: the VPS backend already caches per-endpoint.
                // stale-while-revalidate was causing Vercel edge nodes to serve
                // up to 90 s of stale data (requiring multiple reloads to refresh).
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'X-Proxy-Backend': BACKEND_API,
                ...(backendSource ? { 'X-Source': backendSource } : {}),
                ...(backendTiming ? { 'Server-Timing': backendTiming } : {}),
                ...(backendDb ? { 'X-DB': backendDb } : {}),
                ...(backendCache ? { 'X-Cache': backendCache } : {}),
            },
        });
    } catch (error) {
        console.error('API Proxy Error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch data from backend' },
            { status: 500 }
        );
    }
}
export async function POST(
    request: Request,
    { params }: { params: Promise<{ path: string[] }> }
) {
    try {
        const { path } = await params;
        const apiPath = path.join('/');
        const body = await request.json();

        const fullUrl = `${BACKEND_API}/${apiPath}`;

        const response = await fetch(fullUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Next.js API Proxy',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            let backendError: any = null;
            try {
                backendError = await response.json();
            } catch {
                backendError = null;
            }

            return NextResponse.json(
                {
                    error: `Backend Error: ${response.status}`,
                    backend: backendError,
                },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('API Proxy POST Error:', error);
        return NextResponse.json(
            { error: 'Failed to post data to backend' },
            { status: 500 }
        );
    }
}
