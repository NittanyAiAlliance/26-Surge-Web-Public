/**
 * Maps Google Places API categories to our industry template names.
 *
 * Google returns categories like "Italian restaurant", "General dentist",
 * "Hair salon", etc. We map these to the industry templates stored in
 * data/templates/.
 */

export type Industry =
  | 'restaurant'
  | 'dental'
  | 'salon'
  | 'plumber'
  | 'lawyer'
  | 'real-estate'
  | 'gym'
  | 'auto-repair'
  | 'cleaning-service'
  | 'generic'

interface IndustryRule {
  industry: Industry
  patterns: RegExp[]
}

const INDUSTRY_RULES: IndustryRule[] = [
  {
    industry: 'restaurant',
    patterns: [
      /restaurant/i,
      /\bcafe\b/i,
      /\bcafé\b/i,
      /\bdiner\b/i,
      /\bbistro\b/i,
      /\bpizzeria\b/i,
      /\bbakery\b/i,
      /\bbar\b/i,
      /\bgrill\b/i,
      /\bpub\b/i,
      /\btavern\b/i,
      /\bbrewery\b/i,
      /\bwinery\b/i,
      /\bcoffee\s*shop\b/i,
      /\btea\s*house\b/i,
      /\bfood\b/i,
      /\bcatering\b/i,
      /\bsushi\b/i,
      /\btaco\b/i,
      /\bburger\b/i,
      /\bice\s*cream\b/i,
      /\bjuice\s*bar\b/i,
      /\bsteakhouse\b/i,
      /\bfast\s*food\b/i,
    ],
  },
  {
    industry: 'dental',
    patterns: [
      /dentist/i,
      /dental/i,
      /orthodont/i,
      /endodont/i,
      /periodont/i,
      /oral\s*surg/i,
    ],
  },
  {
    industry: 'salon',
    patterns: [
      /salon/i,
      /barber/i,
      /\bhair\b/i,
      /\bnails?\b/i,
      /\bspa\b/i,
      /beauty/i,
      /\bwax/i,
      /\bmassage\b/i,
      /\bfacial\b/i,
      /cosmet/i,
    ],
  },
  {
    industry: 'plumber',
    patterns: [
      /plumb/i,
      /\bhvac\b/i,
      /heating/i,
      /air\s*condition/i,
      /\bpipe/i,
      /drain/i,
    ],
  },
  {
    industry: 'lawyer',
    patterns: [
      /attorney/i,
      /lawyer/i,
      /law\s*firm/i,
      /legal\s*service/i,
      /\blaw\s*office/i,
    ],
  },
  {
    industry: 'real-estate',
    patterns: [
      /real\s*estate/i,
      /\brealtor\b/i,
      /property\s*manage/i,
      /\brealty\b/i,
      /mortgage/i,
      /home\s*builder/i,
    ],
  },
  {
    industry: 'gym',
    patterns: [
      /\bgym\b/i,
      /fitness/i,
      /\byoga\b/i,
      /\bpilates\b/i,
      /crossfit/i,
      /martial\s*art/i,
      /personal\s*train/i,
      /boxing/i,
      /\bsport/i,
      /health\s*club/i,
    ],
  },
  {
    industry: 'auto-repair',
    patterns: [
      /auto\s*repair/i,
      /\bmechanic\b/i,
      /car\s*repair/i,
      /auto\s*body/i,
      /auto\s*shop/i,
      /tire\b/i,
      /oil\s*change/i,
      /car\s*wash/i,
      /auto\s*service/i,
      /car\s*dealer/i,
      /automotive/i,
    ],
  },
  {
    industry: 'cleaning-service',
    patterns: [
      /cleaning/i,
      /\bmaid\b/i,
      /janitorial/i,
      /housekeep/i,
      /carpet\s*clean/i,
      /pressure\s*wash/i,
      /window\s*clean/i,
    ],
  },
]

/**
 * Maps a Google Places category string to our industry template name.
 * Checks all categories if an array is provided.
 * Returns 'generic' if no match is found.
 */
export function mapCategoryToIndustry(categories: string | string[]): Industry {
  const cats = Array.isArray(categories) ? categories : [categories]
  const combined = cats.join(' ').toLowerCase()

  for (const rule of INDUSTRY_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(combined)) {
        return rule.industry
      }
    }
  }

  return 'generic'
}

/** Returns all supported industry names */
export function getSupportedIndustries(): Industry[] {
  return INDUSTRY_RULES.map((r) => r.industry)
}
