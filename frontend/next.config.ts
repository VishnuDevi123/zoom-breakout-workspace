import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["zebra-grout-condone.ngrok-free.dev"],

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8080/api/:path*", // Proxy to Backend
      },
    ];
  },
};

export default nextConfig;
