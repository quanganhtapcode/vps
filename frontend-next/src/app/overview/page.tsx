import Hero from "@/components/Hero"
import Analytics from "@/components/Analytics"
import MarketIntelligence from "@/components/MarketIntelligence"
import OverviewGlobeSection from "@/components/OverviewGlobeSection"

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
