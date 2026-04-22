import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, extractTokenFromHeader, type JWTPayload } from './jwt';
import { matchesAnyRoute } from '@/lib/route-matcher';

// 扩展 NextRequest 类型，添加 user 属性
declare module 'next/server' {
  interface NextRequest {
    user?: JWTPayload;
  }
}

// 公开路由列表（不需要认证）
const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/register',
  '/api/auth/refresh-token',
  '/api/init',
  '/api/full-ai-interview/evaluate',
  '/api/full-ai-interview/save-result',
  '/api/full-ai-interview/recording-url',
  '/api/full-ai-interview/download-recording',
  '/api/full-ai-interview/upload-chunk',
  '/api/full-ai-interview/merge-chunks',
  '/api/interview/session',
];

// 检查是否为公开路由
function isPublicRoute(pathname: string): boolean {
  return matchesAnyRoute(pathname, PUBLIC_ROUTES);
}

// API 认证中间件
export async function apiAuthMiddleware(req: NextRequest): Promise<NextResponse | null> {
  const pathname = new URL(req.url).pathname;

  // 如果是公开路由，放行
  if (isPublicRoute(pathname)) {
    return null; // 返回 null 表示继续处理
  }

  // 提取 token
  const authHeader = req.headers.get('authorization');
  const token = extractTokenFromHeader(authHeader);

  // 如果没有 token，返回 401
  if (!token) {
    return NextResponse.json(
      { error: '未提供认证令牌', code: 'NO_TOKEN' },
      { status: 401 }
    );
  }

  // 验证 token
  const payload = verifyToken(token);
  
  // 如果 token 无效，返回 401
  if (!payload) {
    return NextResponse.json(
      { error: '认证令牌无效或已过期', code: 'INVALID_TOKEN' },
      { status: 401 }
    );
  }

  // 将用户信息附加到请求对象
  req.user = payload;

  // 继续处理请求
  return null;
}

// 从请求中获取用户信息（在 API 路由中使用）
export function getUserFromRequest(req: NextRequest): JWTPayload | null {
  return req.user || null;
}

// 检查用户角色
export function hasRole(user: JWTPayload, roles: string[]): boolean {
  return roles.includes(user.role);
}

// 检查是否为管理员
export function isAdmin(user: JWTPayload): boolean {
  return user.role === 'admin' || user.role === 'super_admin';
}
