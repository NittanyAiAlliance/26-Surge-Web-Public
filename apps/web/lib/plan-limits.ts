import { PLAN_CONFIG, type PlanKey } from "./stripe"
import { countUserProjects, countUserGenerationsThisMonth } from "@radiant/db/queries"

export interface PlanLimitCheck {
  allowed: boolean
  reason?: string
  current?: number
  limit?: number
}

export async function checkProjectLimit(userId: string, plan: PlanKey): Promise<PlanLimitCheck> {
  const config = PLAN_CONFIG[plan]
  const current = await countUserProjects(userId)

  if (current >= config.sites) {
    return {
      allowed: false,
      reason: `You've reached the ${config.name} plan limit of ${config.sites} site${(config.sites as number) === 1 ? "" : "s"}. Upgrade to create more.`,
      current,
      limit: config.sites,
    }
  }

  return { allowed: true, current, limit: config.sites }
}

export async function checkGenerationLimit(userId: string, plan: PlanKey): Promise<PlanLimitCheck> {
  const config = PLAN_CONFIG[plan]
  const current = await countUserGenerationsThisMonth(userId)

  if (current >= config.generations) {
    return {
      allowed: false,
      reason: `You've reached the ${config.name} plan limit of ${config.generations} generations this month. Upgrade for more.`,
      current,
      limit: config.generations,
    }
  }

  return { allowed: true, current, limit: config.generations }
}
