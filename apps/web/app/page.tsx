import { EditorialNav } from "@/components/landing/editorial-nav"
import { Hero } from "@/components/landing/hero"
import { Process } from "@/components/landing/process"
import { Gallery } from "@/components/landing/gallery"
import { PullQuote } from "@/components/landing/pull-quote"
import { Numbers } from "@/components/landing/numbers"
import { IndustryMarquee } from "@/components/landing/marquee"
import { Pricing } from "@/components/landing/pricing"
import { FinalCTA } from "@/components/landing/final-cta"
import { EditorialFooter } from "@/components/landing/editorial-footer"

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--editorial-bg)] text-[var(--editorial-ink)] font-body">
      <EditorialNav />

      <main>
        <Hero />
        <Process />
        <Gallery />
        <PullQuote />
        <Numbers />
        <IndustryMarquee />
        <Pricing />
        <FinalCTA />
      </main>

      <EditorialFooter />
    </div>
  )
}
