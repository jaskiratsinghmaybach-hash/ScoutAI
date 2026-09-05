import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server to accept HMR WebSocket connections from
  // phones and other devices on the local network (e.g. when testing
  // via `npm run dev -- -H 0.0.0.0` and opening on a real device).
  allowedDevOrigins: ["192.168.1.*", "10.0.*.*", "172.16.*.*"],
};

export default nextConfig;
