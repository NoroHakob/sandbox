// Safe to import from client code. The provider instances live in models.ts

export const gameModelIds = ["gpt-6-astra", "gpt-6-sol", "gpt-6-luna"] as const

export type GameModelId = (typeof gameModelIds)[number]

export const defaultGameModelId: GameModelId = "gpt-6-luna"

export const gameModelCatalog = {
  "gpt-6-astra": {
    name: "GPT-6 Astra",
    tagline: "Most capable, best for a game from scratch",
  },
  "gpt-6-sol": {
    name: "GPT-6 Sol",
    tagline: "Strong and faster, good for iterating",
  },
  "gpt-6-luna": {
    name: "GPT-6 Luna",
    tagline: "Quickest and cheapest, for small tweaks",
  },
} satisfies Record<GameModelId, { name: string; tagline: string }>

export function resolveGameModelId(modelId?: GameModelId) {
  return modelId ?? defaultGameModelId
}
