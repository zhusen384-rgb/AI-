import { NextRequest, NextResponse } from 'next/server';
import { tenantManager } from '@/storage/database';
import { authenticateApi, canAccessTenant, isAdmin, isAuthError } from '@/lib/api-auth';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const payload = await authenticateApi(req);

    if (!isAdmin(payload)) {
      return NextResponse.json(
        { error: '权限不足，仅管理员可以更新租户' },
        { status: 403 }
      );
    }

    if (!canAccessTenant(payload, id)) {
      return NextResponse.json(
        { error: '无权更新其他租户' },
        { status: 403 }
      );
    }

    // 获取更新信息
    const { name, contactEmail, contactPhone } = await req.json();

    // 更新租户
    const updatedTenant = await tenantManager.updateTenant(id, {
      name,
      phone: contactPhone,
      email: contactEmail,
    });

    return NextResponse.json({
      success: true,
      data: updatedTenant,
    });
  } catch (error) {
    console.error('更新租户失败:', error);

    if (isAuthError(error)) {
      return NextResponse.json(
        { error: error.message || '认证失败' },
        { status: error.statusCode || 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '更新租户失败',
      },
      { status: 500 }
    );
  }
}
