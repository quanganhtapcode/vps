import { Suspense } from 'react';
import OverviewClient from './OverviewClient';
import {
  fetchAllIndices,
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race<T | null>([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export default async function OverviewPage() {
  const [indicesResult, peResult] = await Promise.allSettled([
    withTimeout(fetchAllIndices(), 2000),
    withTimeout(fetchPEChart(), 2000),
  ]);

  // 2. Process Indices Data
  let initialIndices: IndexData[] = [];

  if (indicesResult.status === 'fulfilled' && indicesResult.value) {
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

  // Defer non-critical sections to client-side fetching for faster first paint
  const initialNews = [];
  const initialGainers = [];
  const initialLosers = [];
  const initialForeignBuys = [];
  const initialForeignSells = [];
  const initialGoldPrices = [];
  const initialGoldUpdated = undefined;
  const initialPEData = peResult.status === 'fulfilled' && peResult.value ? peResult.value : [];

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
