/**
 * Industry-specific prompt fragments.
 * Each fragment provides section requirements, design guidance, color palettes,
 * copy suggestions, and component recommendations for a specific industry.
 */

import { RESTAURANT_PROMPT } from './restaurant'
import { DENTAL_PROMPT } from './dental'
import { SALON_PROMPT } from './salon'
import { PLUMBER_PROMPT } from './plumber'
import { LAWYER_PROMPT } from './lawyer'
import { REAL_ESTATE_PROMPT } from './real-estate'
import { GYM_PROMPT } from './gym'
import { AUTO_REPAIR_PROMPT } from './auto-repair'
import { CLEANING_SERVICE_PROMPT } from './cleaning-service'
import { GENERIC_PROMPT } from './generic'

const INDUSTRY_PROMPTS: Record<string, string> = {
  restaurant: RESTAURANT_PROMPT,
  dental: DENTAL_PROMPT,
  salon: SALON_PROMPT,
  plumber: PLUMBER_PROMPT,
  lawyer: LAWYER_PROMPT,
  'real-estate': REAL_ESTATE_PROMPT,
  gym: GYM_PROMPT,
  'auto-repair': AUTO_REPAIR_PROMPT,
  'cleaning-service': CLEANING_SERVICE_PROMPT,
  generic: GENERIC_PROMPT,
}

/**
 * Returns the industry-specific prompt fragment for the given industry.
 * Falls back to the generic prompt if the industry is not recognized.
 */
export function getIndustryPrompt(industry: string): string {
  return INDUSTRY_PROMPTS[industry] ?? GENERIC_PROMPT
}

/** Returns all supported industry keys */
export function getSupportedIndustryPrompts(): string[] {
  return Object.keys(INDUSTRY_PROMPTS)
}

export {
  RESTAURANT_PROMPT,
  DENTAL_PROMPT,
  SALON_PROMPT,
  PLUMBER_PROMPT,
  LAWYER_PROMPT,
  REAL_ESTATE_PROMPT,
  GYM_PROMPT,
  AUTO_REPAIR_PROMPT,
  CLEANING_SERVICE_PROMPT,
  GENERIC_PROMPT,
}
