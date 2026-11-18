import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/{admin,game,lobby,api/game/state,api/segment/floor/advance,api/segment/floor/image}": ["./public/floor/**/*"],
  },
};

export default nextConfig;
