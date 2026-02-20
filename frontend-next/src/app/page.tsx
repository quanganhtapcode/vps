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
  // Defer all data fetching to the client side for a faster first paint.
  // The API_BASE uses /api leading to invalid URL errors on the server side build or request.
  const initialIndices: IndexData[] = [];
  const initialNews: any[] = [];
  const initialGainers: any[] = [];
  const initialLosers: any[] = [];
  const initialForeignBuys: any[] = [];
  const initialForeignSells: any[] = [];
  const initialGoldPrices: any[] = [];
  const initialGoldUpdated = undefined;
  const initialPEData: any[] = [];

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
