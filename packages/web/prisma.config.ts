try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dotenv/config");
} catch {}

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
