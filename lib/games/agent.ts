import type { OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai"

import type { GameModelId } from "@/lib/games/model-catalog"
import { gameModels } from "@/lib/games/models"

export function getGameModelSettings(modelId: GameModelId) {
  return {
    model: gameModels[modelId],
    providerOptions: {
      openai: {
        reasoningEffort: "low",
      } satisfies OpenAILanguageModelResponsesOptions,
    },
  }
}
