/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['shared'],
  output: 'standalone',
  experimental: {
    serverActions: true,
  },
};

module.exports = nextConfig;
