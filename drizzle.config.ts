import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./app/db/schema.ts",
  out: "./drizzle/migrations",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? "./data/spotter.db",
  },
  verbose: true,
  strict: true,
});
