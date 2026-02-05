/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['shared'],
  experimental: {
    serverActions: true,
  },
};

module.exports = nextConfig;
