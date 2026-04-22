import { NextRequest } from 'next/server';
import { verifyToken, extractTokenFromHeader } from './auth/jwt';

function extractToken(req: NextRequest): string | null {
  const cookieToken = req.cookies.get('auth-token')?.value;
  if (cookieToken) {
    return cookieToken;
  }

  return extractTokenFromHeader(req.headers.get('authorization'));
}

function extractForwardedAuth(req: NextRequest): {
  success: boolean;
  userId?: string;
  tenantId?: string;
  role?: string;
  username?: string;
  name?: string;
} | null {
  const userId = req.headers.get('x-user-id')?.trim();
  const tenantId = req.headers.get('x-tenant-id')?.trim();
  const role = req.headers.get('x-user-role')?.trim();

  if (!userId || !tenantId || !role) {
    return null;
  }

  return {
    success: true,
    userId,
    tenantId,
    role,
    username: req.headers.get('x-username')?.trim() || undefined,
    name: req.headers.get('x-user-name')?.trim() || undefined,
  };
}

/**
 * API 认证辅助函数
 * 从请求中提取并验证 JWT token
 * 优先读取 Cookie，会话恢复场景下再回退到 Authorization header
 */
export async function authenticateApi(req: NextRequest): Promise<{
  success: boolean;
  userId?: string;
  tenantId?: string;
  role?: string;
  username?: string;
  name?: string;
  error?: string;
}> {
  try {
    // 提取 token
    const token = extractToken(req);

    if (token) {
      const payload = verifyToken(token);

      if (payload) {
        return {
          success: true,
          userId: payload.userId,
          tenantId: payload.tenantId,
          role: payload.role,
          username: payload.username,
          name: payload.name,
        };
      }
    }

    const forwardedAuth = extractForwardedAuth(req);
    if (forwardedAuth) {
      return forwardedAuth;
    }

    if (!token) {
      return {
        success: false,
        error: '未提供认证token',
      };
    }

    return {
      success: false,
      error: 'token无效或已过期',
    };
  } catch (error) {
    console.error('认证失败:', error);
    return {
      success: false,
      error: '认证失败',
    };
  }
}
