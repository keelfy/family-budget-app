const fs = require('fs');
const path = require('path');

// pdf.js worker is served as a plain static file: bundling it as an asset runs it
// through SWC, which rewrites it to CommonJS and breaks it inside a Worker.
// Copying on every config load keeps it in step with the installed pdfjs-dist.
fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
fs.copyFileSync(
  require.resolve('pdfjs-dist/build/pdf.worker.min.js'),
  path.join(__dirname, 'public', 'pdf.worker.min.js')
);
// zxing's wasm binary is served from /public instead of its default CDN.
fs.copyFileSync(
  path.join(path.dirname(require.resolve('zxing-wasm/reader')), '..', '..', 'reader', 'zxing_reader.wasm'),
  path.join(__dirname, 'public', 'zxing_reader.wasm')
);

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
