import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel deploy — keep API routes server-side only
  serverExternalPackages: [],
  env: {
    // EASYSTORE_API_KEY is read from Vercel env vars / .env.local
  },
};

export default nextConfig;
