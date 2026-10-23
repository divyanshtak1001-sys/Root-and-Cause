import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: ["@amazon-devices/amazon-devices-buildertools-mcp"],
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/@amazon-devices/amazon-devices-buildertools-mcp/**/*",
      "./.gemini/**/*",
    ],
  },
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
