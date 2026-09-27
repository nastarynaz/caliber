import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Runtime demo sessions/uploads must never be bundled into a deployment.
  outputFileTracingExcludes: {
    "/*": ["./.local-data/**/*", "./artifacts/**/*", "./test-results/**/*", "./playwright-report/**/*"],
  },
};

export default nextConfig;
