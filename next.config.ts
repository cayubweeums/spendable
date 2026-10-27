import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["node:sqlite"],
  agentRules: false,
};

export default nextConfig;
