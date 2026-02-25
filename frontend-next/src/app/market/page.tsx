import { Suspense } from 'react';
import OverviewClient from './OverviewClient';
import {
  INDEX_MAP,
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
  // WS-first mode: do not prefetch indices via HTTP on SSR.
  let initialIndices: IndexData[] = [];
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
