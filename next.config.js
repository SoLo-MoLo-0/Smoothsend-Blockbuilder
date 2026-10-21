/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['node:sqlite'],
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@farcaster/mini-app-solana': false,
      '@stripe/stripe-js': false,
      '@stripe/crypto': false,
    };
    config.resolve.alias = {
      ...config.resolve.alias,
      '@farcaster/mini-app-solana': false,
    };
    return config;
  },
};

module.exports = nextConfig;
