import type { NextConfig } from "next";

// Décision 0002 : Next.js standard, image autonome pour rester portable hors de Vercel.
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
