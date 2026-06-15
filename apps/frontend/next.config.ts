import type { NextConfig } from 'next';

const apiBaseUrl =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/contracts/:path*',
        destination: `${apiBaseUrl}/contracts/:path*`,
      },
      {
        source: '/feedback',
        destination: `${apiBaseUrl}/feedback`,
      },
    ];
  },
};

export default nextConfig;
