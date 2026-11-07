import { openai } from "@ai-sdk/openai"
import type { LanguageModel } from "ai"

import type { GameModelId } from "@/lib/games/model-catalog"

// Server code only, but no "server-only": that package throws in the
// Trigger.dev worker, which imports this through agent.ts
export const gameModels = {
  "gpt-6-astra": openai("gpt-6-astra"),
  "gpt-6-sol": openai("gpt-6-sol"),
  "gpt-6-luna": openai("gpt-6-luna"),
} satisfies Record<GameModelId, LanguageModel>
