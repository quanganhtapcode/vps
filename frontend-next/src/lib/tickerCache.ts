let cachedTickers: any = null;

export async function getTickerData() {
    if (cachedTickers) return cachedTickers;

    try {
        const response = await fetch('/api/tickers');
        if (response.ok) {
            cachedTickers = await response.json();
            return cachedTickers;
        }
    } catch (e) {
        console.error('Error loading ticker cache:', e);
    }
    return null;
}
