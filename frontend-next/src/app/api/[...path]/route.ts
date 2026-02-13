import { NextResponse } from 'next/server';

const BACKEND_API =
    process.env.NODE_ENV === 'development'
        ? (process.env.BACKEND_API_URL_LOCAL || 'http://127.0.0.1:5000/api')
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
            ...(process.env.NODE_ENV === 'development'
                ? { cache: 'no-store' as const }
                : { next: { revalidate: 30 } }),
        });

        if (!response.ok) {
            return NextResponse.json(
                { error: `Backend Error: ${response.status}` },
                { status: response.status }
            );
        }

        const data = await response.json();

        return NextResponse.json(data, {
            headers: {
                'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
                'X-Proxy-Backend': BACKEND_API,
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
            return NextResponse.json(
                { error: `Backend Error: ${response.status}` },
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
