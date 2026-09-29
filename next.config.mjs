import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Resume PDFs are uploaded through a server action.
    serverActions: { bodySizeLimit: "10mb" },
  },
  webpack(config) {
    config.resolve.alias["@"] = root;
    return config;
  },
};
export default nextConfig;
