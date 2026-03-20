export type Provider = "anthropic" | "zai"

export type PipelineStep =
  | "designDirector"
  | "scaffold"
  | "homepage"
  | "additionalPages"
  | "sectionEdit"
  | "editRouter"

export interface StepModelConfig {
  provider: Provider
  model: string
  maxTokens: number
  temperature: number
  timeoutMs: number
}

export const MODEL_CONFIG: Record<PipelineStep, StepModelConfig> = {
  designDirector: {
    provider: "zai",
    model: "glm-5",
    maxTokens: 4000,
    temperature: 0.7,
    timeoutMs: 120_000,
  },
  scaffold: {
    provider: "zai",
    model: "glm-5",
    maxTokens: 32000,
    temperature: 0.6,
    timeoutMs: 600_000,
  },
  homepage: {
    provider: "zai",
    model: "glm-5",
    maxTokens: 32000,
    temperature: 0.6,
    timeoutMs: 600_000,
  },
  additionalPages: {
    provider: "zai",
    model: "glm-5",
    maxTokens: 32000,
    temperature: 0.6,
    timeoutMs: 600_000,
  },
  sectionEdit: {
    provider: "zai",
    model: "glm-5",
    maxTokens: 16000,
    temperature: 0.5,
    timeoutMs: 300_000,
  },
  editRouter: {
    provider: "zai",
    model: "glm-5",
    maxTokens: 1000,
    temperature: 0.2,
    timeoutMs: 30_000,
  },
}

/**
 * Validate that required API keys are set for all configured providers.
 * Call before generation begins to fail fast.
 */
export function validateProviderKeys(): void {
  const requiredProviders = new Set(
    Object.values(MODEL_CONFIG).map((c) => c.provider)
  )
  if (requiredProviders.has("anthropic") && !process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required for configured Anthropic steps")
  }
  if (requiredProviders.has("zai") && !process.env.ZAI_API_KEY) {
    throw new Error("ZAI_API_KEY is required for configured z.ai steps")
  }
}
