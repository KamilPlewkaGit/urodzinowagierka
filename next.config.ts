import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/{admin,game,lobby,api/game/state,api/segment/floor/start,api/segment/floor/configure,api/segment/floor/start-duel,api/segment/floor/advance,api/segment/floor/image,api/segment/floor/preload}": ["./public/the floor/**/*"],
  },
};

export default nextConfig;
