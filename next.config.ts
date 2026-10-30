import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // CLAUDE.md is the single source of agent instructions; a generated AGENTS.md would compete with it.
  agentRules: false,
};

export default nextConfig;
