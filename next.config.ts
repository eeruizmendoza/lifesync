import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    tsconfigPath: './tsconfig.json',
  },
  turbopack: {
    resolveAlias: {
      // Turbopack alias configuration if needed
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Mark native modules as externals on server-side
      config.externals = config.externals || [];
      config.externals.push(
        'bcrypt',
        'jsonwebtoken',
        '@neondatabase/serverless',
        'crypto-js'
      );
    }
    return config;
  },
};

export default nextConfig;
