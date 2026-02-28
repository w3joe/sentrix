import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  async rewrites() {
    return [
      {
        source: '/api/db/:path*',
        destination: 'http://127.0.0.1:3001/api/db/:path*' // Bridge DB
      },
      {
        source: '/api/swarm/:path*',
        destination: 'http://127.0.0.1:8001/api/swarm/:path*' // Patrol Swarm
      },
      {
        source: '/api/investigation/:path*',
        destination: 'http://127.0.0.1:8002/api/investigation/:path*' // Investigation
      }
    ];
  },
};

export default nextConfig;
