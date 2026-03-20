// apps/web/components/landing/marquee.tsx
import { RevealSection } from "./animations"

const INDUSTRIES = [
  { name: "Restaurants", color: "var(--editorial-vermillion)" },
  { name: "Dental", color: "var(--editorial-sapphire)" },
  { name: "Salons", color: "#C05D8A" },
  { name: "Law Firms", color: "var(--editorial-ink)" },
  { name: "Auto Shops", color: "var(--editorial-teal)" },
  { name: "Plumbers", color: "var(--editorial-sapphire)" },
  { name: "Fitness", color: "var(--editorial-vermillion)" },
  { name: "Real Estate", color: "var(--editorial-teal)" },
]

export function IndustryMarquee() {
  // Duplicate for seamless loop
  const items = [...INDUSTRIES, ...INDUSTRIES]

  return (
    <RevealSection className="py-[120px] md:py-[200px] overflow-hidden">
      <p className="px-6 md:px-12 font-body text-center text-lg text-[var(--editorial-muted)] mb-16">
        One platform, every industry.
      </p>

      <div className="relative">
        <div className="flex animate-marquee gap-12 md:gap-20 whitespace-nowrap">
          {items.map((industry, i) => (
            <span
              key={`${industry.name}-${i}`}
              className="font-display text-5xl md:text-7xl font-bold tracking-tight shrink-0"
              style={{ color: industry.color }}
            >
              {industry.name}
            </span>
          ))}
        </div>
      </div>
    </RevealSection>
  )
}
