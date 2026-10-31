import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // CLAUDE.md is the single source of agent instructions; a generated AGENTS.md would compete with it.
  agentRules: false,
  // Bundled into server components, PGlite's wasm loader hands fs a URL from another realm.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
