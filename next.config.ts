import os from 'node:os';
import type { NextConfig } from 'next';
function buildPostgresUrlFromEnv(): string | null {
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT || '5432';
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;

  if (!host || !user || password === undefined || !database) {
    return null;
  }

  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  const encodedDatabase = encodeURIComponent(database);

  return `postgresql://${encodedUser}:${encodedPassword}@${host}:${port}/${encodedDatabase}`;
}

function extractHostname(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).hostname;
  } catch {
    const withoutScheme = trimmed.replace(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//, '');
    return withoutScheme.split('/')[0]?.split(':')[0] || null;
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4) {
    return false;
  }

  const octets = parts.map((part) => Number(part));
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = octets;
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    hostname === '127.0.0.1'
  );
}

function collectLocalIpv4Origins(): string[] {
  const origins = new Set<string>();
  const interfaces = os.networkInterfaces();

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (!address || address.family !== 'IPv4') {
        continue;
      }

      if (isPrivateIpv4(address.address)) {
        origins.add(address.address);
      }
    }
  }

  return Array.from(origins);
}

function buildAllowedDevOrigins(): string[] {
  // 局域网直连时，HMR websocket 也要允许私网 origin，否则页面会反复重载。
  const origins = new Set<string>([
    'localhost',
    '127.0.0.1',
    '*.dev.coze.site',
    '10.*.*.*',
    '172.16.*.*',
    '172.17.*.*',
    '172.18.*.*',
    '172.19.*.*',
    '172.20.*.*',
    '172.21.*.*',
    '172.22.*.*',
    '172.23.*.*',
    '172.24.*.*',
    '172.25.*.*',
    '172.26.*.*',
    '172.27.*.*',
    '172.28.*.*',
    '172.29.*.*',
    '172.30.*.*',
    '172.31.*.*',
    '192.168.*.*',
  ]);

  for (const value of [
    process.env.APP_BASE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.COZE_PROJECT_DOMAIN_DEFAULT,
  ]) {
    const hostname = extractHostname(value);
    if (hostname) {
      origins.add(hostname);
    }
  }

  for (const hostname of collectLocalIpv4Origins()) {
    origins.add(hostname);
  }

  return Array.from(origins);
}

function ensureDatabaseUrlEnv() {
  const derivedUrl = buildPostgresUrlFromEnv();

  if (!process.env.PGDATABASE_URL && derivedUrl) {
    process.env.PGDATABASE_URL = derivedUrl;
  }

  if (!process.env.DATABASE_URL && process.env.PGDATABASE_URL) {
    process.env.DATABASE_URL = process.env.PGDATABASE_URL;
  }
}

ensureDatabaseUrlEnv();

const nextConfig: NextConfig = {
  // outputFileTracingRoot: path.resolve(__dirname, '../../'),
  /* config options here */
  basePath: '/agent-ms',
  allowedDevOrigins: buildAllowedDevOrigins(),
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lf-coze-web-cdn.coze.cn',
        pathname: '/**',
      },
    ],
  },
  experimental: {
    // 增加请求体大小限制，避免大表单误伤正常请求
    serverActions: {
      bodySizeLimit: '50mb',
    },
    // 优化构建性能
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },
  // 构建优化
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
};

export default nextConfig;
