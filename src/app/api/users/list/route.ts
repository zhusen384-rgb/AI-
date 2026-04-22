import { NextRequest, NextResponse } from 'next/server';
import { userManager } from '@/storage/database';
import { authenticateApi, isAdmin, isAuthError } from '@/lib/api-auth';
import { sanitizeUsers, type UserFilters } from '@/storage/database/userManager';

export async function GET(req: NextRequest) {
  try {
    // JWT认证
    const payload = await authenticateApi(req);

    // 验证当前用户权限
    if (!isAdmin(payload)) {
      return NextResponse.json(
        { error: '权限不足，仅管理员可以查看用户列表' },
        { status: 403 }
      );
    }

    // 获取查询参数
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '10');
    const tenantId = searchParams.get('tenantId');
    const role = searchParams.get('role') || undefined;
    const status = searchParams.get('status') || undefined;

    // 构建 filters 对象，只包含非空的值
    const filters: UserFilters = {};

    if (payload.role !== 'super_admin') {
      if (tenantId && tenantId !== payload.tenantId) {
        return NextResponse.json(
          { error: '无权查看其他租户的用户列表' },
          { status: 403 }
        );
      }
      filters.tenantId = payload.tenantId;
    } else if (tenantId) {
      filters.tenantId = tenantId;
    }

    if (role) filters.role = role;
    if (status) filters.status = status;

    // 查询用户列表
    const effectiveFilters = Object.keys(filters).length > 0 ? filters : undefined;
    const [users, total] = await Promise.all([
      userManager.getUsers({
        filters: effectiveFilters,
        limit: pageSize,
        skip: (page - 1) * pageSize,
      }),
      userManager.countUsers(effectiveFilters),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        users: sanitizeUsers(users),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);

    // 认证错误
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: error.message || '认证失败' },
        { status: error.statusCode || 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取用户列表失败',
      },
      { status: 500 }
    );
  }
}
