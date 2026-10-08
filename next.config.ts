import type { NextConfig } from "next";

// Décision 0002 : Next.js standard, image autonome pour rester portable hors de Vercel.
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Décision 0005 : le build vérifie les types sans les tests (absents de l'image Docker).
  // `pnpm typecheck` garde le tsconfig.json complet.
  typescript: { tsconfigPath: "tsconfig.build.json" },
};

export default nextConfig;
