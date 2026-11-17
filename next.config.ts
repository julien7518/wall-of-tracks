import type { NextConfig } from 'next';

const basePath = '/wall-of-tracks';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
