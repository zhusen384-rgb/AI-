import jwt from 'jsonwebtoken';

function getRequiredSecret(envName: 'JWT_SECRET' | 'REFRESH_TOKEN_SECRET', fallback?: string): string {
  const secret = process.env[envName]?.trim();
  if (secret) {
    return secret;
  }

  if (fallback) {
    return fallback;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${envName} 未配置，生产环境禁止使用默认密钥`);
  }

  return `development-only-${envName.toLowerCase()}-change-me`;
}

// JWT 配置
const JWT_SECRET = getRequiredSecret('JWT_SECRET');
const REFRESH_TOKEN_SECRET = getRequiredSecret('REFRESH_TOKEN_SECRET', JWT_SECRET);
const JWT_EXPIRES_IN = '7d'; // 7天过期
const REFRESH_TOKEN_EXPIRES_IN = '30d'; // 30天过期

// Token Payload 类型
export interface JWTPayload {
  userId: string;
  tenantId: string;
  role: string;
  username?: string; // 用户名
  name?: string; // 用户姓名
  iat?: number;
  exp?: number;
}

// 生成 JWT Token
export function generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

// 生成 Refresh Token
export function generateRefreshToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, REFRESH_TOKEN_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });
}

// 验证 JWT Token
export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    if (!decoded.userId || !decoded.tenantId || !decoded.role) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

// 从 Authorization header 中提取 token
export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader) return null;
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.substring(7);
}

// 检查 token 是否即将过期（剩余时间少于 1 天）
export function isTokenExpiringSoon(decoded: JWTPayload): boolean {
  if (!decoded.exp) return false;
  const now = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = decoded.exp - now;
  return timeUntilExpiry < 24 * 60 * 60; // 1 天
}
