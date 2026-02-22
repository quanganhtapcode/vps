import { Suspense } from 'react';
import OverviewClient from './OverviewClient';
import {
  fetchAllIndices,
  INDEX_MAP,
  MarketIndexData,
  NewsItem,
  TopMoverItem,
  GoldPriceItem,
  PEChartData,
} from '@/lib/api';

// Disable caching to ensure fresh data on every request
export const dynamic = 'force-dynamic';

interface IndexData {
  id: string;
  name: string;
  value: number;
  change: number;
  percentChange: number;
  chartData: number[];
  advances?: number;
  declines?: number;
  noChanges?: number;
  ceilings?: number;
  floors?: number;
  totalShares?: number;
  totalValue?: number;
}

export default async function OverviewPage() {
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
      if (timer) clearTimeout(timer);
    }
  }

  let initialIndices: IndexData[] = [];
  try {
    const indicesData = await withTimeout(fetchAllIndices(), 1200);
    if (indicesData) {
      const cardPromises = Object.entries(INDEX_MAP).map(async ([indexId, info]) => {
        const data = indicesData[indexId] as MarketIndexData | undefined;
        if (!data) return null;

        const currentIndex = data.CurrentIndex;
        const prevIndex = data.PrevIndex;
        const change = currentIndex - prevIndex;
        const percent = prevIndex > 0 ? (change / prevIndex) * 100 : 0;

        return {
          id: info.id,
          name: info.name,
          value: currentIndex,
          change,
          percentChange: percent,
          chartData: [],
          advances: data.Advances,
          declines: data.Declines,
          noChanges: data.NoChanges,
          ceilings: data.Ceilings,
          floors: data.Floors,
          totalShares: data.Volume,
          totalValue: data.Value,
        };
      });
      const results = await Promise.all(cardPromises);
      initialIndices = results.filter((r): r is IndexData => r !== null);
    }
  } catch {
    // Fail-open: keep placeholders; client will refresh.
  }
  const initialNews: NewsItem[] = [];
  const initialGainers: TopMoverItem[] = [];
  const initialLosers: TopMoverItem[] = [];
  const initialForeignBuys: TopMoverItem[] = [];
  const initialForeignSells: TopMoverItem[] = [];
  const initialGoldPrices: GoldPriceItem[] = [];
  const initialGoldUpdated: string | undefined = undefined;
  const initialPEData: PEChartData[] = [];

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
