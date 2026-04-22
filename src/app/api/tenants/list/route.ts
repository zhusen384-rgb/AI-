import { NextRequest, NextResponse } from 'next/server';
import { tenantManager } from '@/storage/database';
import { authenticateApi, isAdmin, isAuthError, isSuperAdmin } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  try {
    // JWT认证
    const payload = await authenticateApi(req);

    // 验证当前用户权限
    if (!isAdmin(payload)) {
      return NextResponse.json(
        { error: '权限不足，仅管理员可以查看租户列表' },
        { status: 403 }
      );
    }

    // 获取查询参数
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '10');
    const status = searchParams.get('status') as 'active' | 'inactive' | undefined;

    const filters = status ? { status } : undefined;

    if (!isSuperAdmin(payload)) {
      const currentTenant = await tenantManager.getTenantById(payload.tenantId);

      if (!currentTenant) {
        return NextResponse.json(
          { error: '当前租户不存在' },
          { status: 404 }
        );
      }

      if (status && currentTenant.status !== status) {
        return NextResponse.json({
          success: true,
          data: {
            tenants: [],
            pagination: {
              page,
              pageSize,
              total: 0,
              totalPages: 0,
            },
          },
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          tenants: [currentTenant],
          pagination: {
            page: 1,
            pageSize: 1,
            total: 1,
            totalPages: 1,
          },
        },
      });
    }

    const [tenants, total] = await Promise.all([
      tenantManager.getTenants({
        filters,
        limit: pageSize,
        skip: (page - 1) * pageSize,
      }),
      tenantManager.countTenants(filters),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        tenants,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    console.error('获取租户列表失败:', error);

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
        error: error instanceof Error ? error.message : '获取租户列表失败',
      },
      { status: 500 }
    );
  }
}
