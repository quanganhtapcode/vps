import type { Metadata } from 'next';
import Hero from "@/components/Hero"
import Analytics from "@/components/Analytics"
import MarketIntelligence from "@/components/MarketIntelligence"
import OverviewGlobeSection from "@/components/OverviewGlobeSection"

export const metadata: Metadata = {
  title: 'Tổng quan',
  description: 'Khám phá nền tảng Quang Anh — phân tích cổ phiếu, theo dõi thị trường, định giá DCF và tin tức chứng khoán Việt Nam.',
  alternates: { canonical: '/overview' },
  openGraph: {
    title: 'Tổng quan | Quang Anh',
    description: 'Nền tảng phân tích và định giá cổ phiếu Việt Nam.',
    url: '/overview',
  },
};

export default function OverviewPage() {
    return (
        <main className="flex flex-col gap-24 overflow-hidden pb-24">
            <Hero />
            <div className="relative">
                <Analytics />
            </div>
            <MarketIntelligence />
            <OverviewGlobeSection />
        </main>
    )
}
