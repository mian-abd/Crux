import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NEXT_DIST_DIR lets a second build (for example a production check) sit beside a running
  // dev server without sharing its output folder. Unset, Next.js uses .next as usual.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  agentRules: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
