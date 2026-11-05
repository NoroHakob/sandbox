import type { Instructions } from "ai"

import { engine } from "@/lib/games/instructions/engine"
import { runtime } from "@/lib/games/instructions/runtime"
import { workflow } from "@/lib/games/instructions/workflow"

export const gameInstructions = [
  { role: "system", content: workflow },
  { role: "system", content: runtime },
  { role: "system", content: engine },
] satisfies Instructions
