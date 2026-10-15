/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['shared'],
  output: 'standalone',
  webpack: (config) => {
    // pdf.js optionally requires node-canvas; the browser build never uses it.
    config.resolve.alias.canvas = false;
    return config;
  },
  experimental: {
    serverActions: true,
  },
};

module.exports = nextConfig;
