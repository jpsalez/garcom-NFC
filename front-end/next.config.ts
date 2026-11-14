import type { NextConfig } from "next";

const nextConfig: NextConfig = {

  async rewrites() {
        return [
            {
                source: '/api-backend/:path*',
                destination: `${process.env.API_URL}/:path*`,
            },
        ]
    },
  
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;