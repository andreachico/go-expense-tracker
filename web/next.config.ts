import type { NextConfig } from "next";

// The browser calls same-origin "/api/*" and Next.js proxies those requests to
// the Go backend. This avoids CORS entirely (no cross-origin requests from the
// browser) and mirrors a common production setup. Override the target with the
// BACKEND_URL env var when deploying.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
