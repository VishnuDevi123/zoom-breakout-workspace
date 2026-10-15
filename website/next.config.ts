import type { NextConfig } from "next";

// Static site: no server, no API routes. Vercel serves the exported files.
const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
