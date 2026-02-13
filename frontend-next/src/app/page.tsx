import { Suspense } from 'react';
import OverviewClient from './OverviewClient';
import {
  fetchAllIndices,
  fetchNews,
  fetchTopMovers,
  fetchForeignFlow,
  fetchPEChart,
  INDEX_MAP,
  MarketIndexData,
} from '@/lib/api';

export const revalidate = 30;

interface IndexData {
  id: string;
  name: string;
  value: number;
  change: number;
  percentChange: number;
  chartData: number[];
}

export default async function OverviewPage() {
  // 1. Fetch all data in parallel
  // using Promise.allSettled to ensure one failure doesn't break the whole page
  const [
    indicesResult,
    newsResult,
    gainersResult,
    losersResult,
    foreignBuysResult,
    foreignSellsResult,
    peResult
  ] = await Promise.allSettled([
    // Indices (requires logic processing afterwards)
    fetchAllIndices(),
    // News
    fetchNews(1, 30),
    // Top Movers
    fetchTopMovers('UP'),
    fetchTopMovers('DOWN'),
    // Foreign Flow
    fetchForeignFlow('buy'),
    fetchForeignFlow('sell'),
    // P/E Chart
    fetchPEChart()
  ]);

  // 2. Process Indices Data
  let initialIndices: IndexData[] = [];

  if (indicesResult.status === 'fulfilled') {
    const marketData = indicesResult.value;

    const chartPromises = Object.entries(INDEX_MAP).map(async ([indexId, info]) => {
      const data = marketData[indexId] as MarketIndexData | undefined;
      if (!data) return null;

      const currentIndex = data.CurrentIndex;
      const prevIndex = data.PrevIndex;
      const change = currentIndex - prevIndex;
      const percent = prevIndex > 0 ? (change / prevIndex) * 100 : 0;

      const chartData = [prevIndex, currentIndex].filter((v) => typeof v === 'number');

      return {
        id: info.id,
        name: info.name,
        value: currentIndex,
        change,
        percentChange: percent,
        chartData,
      };
    });

    const chartsResults = await Promise.all(chartPromises);
    initialIndices = chartsResults.filter((r): r is IndexData => r !== null);
  } else {
    console.error('Error fetching indices:', indicesResult.reason);
  }

  // 3. Extract other data safely
  const initialNews = newsResult.status === 'fulfilled' ? newsResult.value : [];
  const initialGainers = gainersResult.status === 'fulfilled' ? gainersResult.value : [];
  const initialLosers = losersResult.status === 'fulfilled' ? losersResult.value : [];
  const initialForeignBuys = foreignBuysResult.status === 'fulfilled' ? foreignBuysResult.value : [];
  const initialForeignSells = foreignSellsResult.status === 'fulfilled' ? foreignSellsResult.value : [];
  const initialGoldPrices = [];
  const initialGoldUpdated = undefined;
  const initialPEData = peResult.status === 'fulfilled' ? peResult.value : [];

  return (
    <Suspense fallback={<div className="p-8 text-center text-tremor-content">Loading market data...</div>}>
      <OverviewClient
        initialIndices={initialIndices}
        initialNews={initialNews}
        initialGainers={initialGainers}
        initialLosers={initialLosers}
        initialForeignBuys={initialForeignBuys}
        initialForeignSells={initialForeignSells}
        initialGoldPrices={initialGoldPrices}
        initialGoldUpdated={initialGoldUpdated}
        initialPEData={initialPEData}
      />
    </Suspense>
  );
}
