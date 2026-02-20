import { Suspense } from 'react';
import OverviewClient from './OverviewClient';
import {
  fetchVciIndices,
  fetchPEChart,
  INDEX_MAP,
} from '@/lib/api';

export const revalidate = 30;

interface IndexData {
  id: string;
  name: string;
  value: number;
  change: number;
  percentChange: number;
  chartData: number[];
  advances: number;
  declines: number;
  noChanges: number;
  ceilings: number;
  floors: number;
  totalShares: number;
  totalValue: number;
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
    withTimeout(fetchVciIndices(), 2000),
    withTimeout(fetchPEChart(), 2000),
  ]);

  // 2. Process Indices Data
  let initialIndices: IndexData[] = [];

  if (indicesResult.status === 'fulfilled' && indicesResult.value) {
    const vciDataArray = indicesResult.value;

    const chartPromises = Object.entries(INDEX_MAP).map(async ([indexId, info]) => {
      const vciData = vciDataArray.find((item) => item.symbol === info.vciSymbol);
      if (!vciData) return null;

      const currentIndex = vciData.price;
      const prevIndex = vciData.refPrice;
      const change = vciData.change;
      const percent = vciData.changePercent;

      const advances = vciData.totalStockIncrease;
      const declines = vciData.totalStockDecline;
      const noChanges = vciData.totalStockNoChange;
      const ceilings = vciData.totalStockCeiling;
      const floors = vciData.totalStockFloor;

      const totalShares = vciData.totalShares;
      const totalValue = vciData.totalValue;

      const chartData = [prevIndex, currentIndex].filter((v) => typeof v === 'number');

      return {
        id: info.id,
        name: info.name,
        value: currentIndex,
        change,
        percentChange: percent,
        chartData,
        advances,
        declines,
        noChanges,
        ceilings,
        floors,
        totalShares,
        totalValue,
      };
    });

    const chartsResults = await Promise.all(chartPromises);
    initialIndices = chartsResults.filter((r): r is IndexData => r !== null);
  } else {
    // Extract reason if the promise was rejected
    const reason = indicesResult.status === 'rejected' ? indicesResult.reason : 'Unknown error';
    console.error('Error fetching indices:', reason);
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
