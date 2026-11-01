import { parseEnv } from "@neon/env"
import { config } from "dotenv"
import { defineConfig } from "drizzle-kit"

import neonConfig from "./neon"

config({ path: ".env.local" })

const { postgres } = parseEnv(neonConfig, ["DATABASE_URL_UNPOOLED"])

export default defineConfig({
  schema: "./lib/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: postgres.databaseUrlUnpooled,
  },
})
