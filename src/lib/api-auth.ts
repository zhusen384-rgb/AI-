import { NextRequest } from 'next/server';
import { verifyToken, JWTPayload } from './auth/jwt';
import { userManager, type User } from '@/storage/database';

/**
 * API认证错误类型
 */
export class AuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

/**
 * 从请求中提取认证token
 * 优先从Cookie中获取，其次从Authorization header中获取
 */
function extractToken(request: NextRequest): string | null {
  // 优先从 Cookie 中获取
  const token = request.cookies.get('auth-token')?.value;
  if (token) {
    return token;
  }

  // 从 Authorization header 中获取
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}

function extractForwardedPayload(request: NextRequest): JWTPayload | null {
  const userId = request.headers.get('x-user-id')?.trim();
  const tenantId = request.headers.get('x-tenant-id')?.trim();
  const role = request.headers.get('x-user-role')?.trim();

  if (!userId || !tenantId || !role) {
    return null;
  }

  const username = request.headers.get('x-username')?.trim() || undefined;
  const name = request.headers.get('x-user-name')?.trim() || undefined;

  return {
    userId,
    tenantId,
    role,
    username,
    name,
  };
}

/**
 * 验证API请求的认证信息
 * @param request NextRequest对象
 * @returns 认证payload
 * @throws AuthError 如果认证失败
 */
export async function authenticateApi(request: NextRequest): Promise<JWTPayload> {
  const token = extractToken(request);

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      return payload;
    }
  }

  const forwardedPayload = extractForwardedPayload(request);
  if (forwardedPayload) {
    return forwardedPayload;
  }

  if (!token) {
    throw new AuthError('未提供认证token', 401);
  }

  throw new AuthError('认证token无效或已过期', 401);
}

/**
 * 检查用户是否有指定的角色
 */
export function checkRole(payload: JWTPayload, allowedRoles: string[]): boolean {
  return allowedRoles.includes(payload.role);
}

/**
 * 检查用户是否是管理员
 */
export function isAdmin(payload: JWTPayload): boolean {
  return ['super_admin', 'tenant_admin', 'admin'].includes(payload.role);
}

/**
 * 检查用户是否是超级管理员
 */
export function isSuperAdmin(payload: JWTPayload): boolean {
  return payload.role === 'super_admin';
}

/**
 * 检查当前用户是否可以访问指定租户
 */
export function canAccessTenant(payload: JWTPayload, tenantId: string): boolean {
  return isSuperAdmin(payload) || payload.tenantId === tenantId;
}

/**
 * 检查当前用户是否可以分配指定角色
 */
export function assertCanAssignRole(payload: JWTPayload, role: string): void {
  if (role === 'super_admin' && !isSuperAdmin(payload)) {
    throw new AuthError('仅超级管理员可以分配超级管理员角色', 403);
  }
}

/**
 * 获取当前管理员可操作的用户
 */
export async function getManageableUser(payload: JWTPayload, userId: string): Promise<User> {
  const user = await userManager.getUserById(userId);

  if (!user) {
    throw new AuthError('用户不存在', 404);
  }

  if (!canAccessTenant(payload, user.tenantId)) {
    throw new AuthError('无权操作其他租户的用户', 403);
  }

  if (user.role === 'super_admin' && !isSuperAdmin(payload)) {
    throw new AuthError('仅超级管理员可以操作超级管理员账号', 403);
  }

  return user;
}

/**
 * 创建带有认证检查的API包装器
 */
export function withAuth<T extends unknown[]>(
  handler: (request: NextRequest, payload: JWTPayload, ...args: T) => Promise<Response>,
  options?: {
    allowedRoles?: string[];
  }
) {
  return async (request: NextRequest, ...args: T): Promise<Response> => {
    try {
      const payload = await authenticateApi(request);

      // 检查角色权限
      if (options?.allowedRoles) {
        if (!checkRole(payload, options.allowedRoles)) {
          return new Response(
            JSON.stringify({ error: '权限不足' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }

      return await handler(request, payload, ...args);
    } catch (error) {
      if (isAuthError(error)) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: error.statusCode, headers: { 'Content-Type': 'application/json' } }
        );
      }

      console.error('API认证错误:', error);
      return new Response(
        JSON.stringify({ error: '服务器内部错误' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  };
}
