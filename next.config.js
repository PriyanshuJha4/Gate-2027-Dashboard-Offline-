/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dev and production use separate folders, so editing (dev) never breaks the
  // fast study build (production), and vice versa.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",

  // Native SQLite driver must not be bundled by webpack
  experimental: {
    serverComponentsExternalPackages: ["@libsql/client", "libsql"],
  },

  // pdf.js tries to load the optional Node "canvas" package; we never need it in the browser
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};

module.exports = nextConfig;