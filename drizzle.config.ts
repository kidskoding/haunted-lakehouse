import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Only db:migrate connects; db:generate works offline from the schema.
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
});
