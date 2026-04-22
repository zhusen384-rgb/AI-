import { NextRequest, NextResponse } from 'next/server';
import { userManager } from '@/storage/database';
import { authenticateApi, getManageableUser, isAdmin, isAuthError } from '@/lib/api-auth';
import { sanitizeUser } from '@/storage/database/userManager';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // JWT认证
    const payload = await authenticateApi(req);

    // 验证当前用户权限
    if (!isAdmin(payload)) {
      return NextResponse.json(
        { error: '权限不足，仅管理员可以更新用户状态' },
        { status: 403 }
      );
    }

    // 不能禁用自己
    if (id === payload.userId) {
      return NextResponse.json(
        { error: '不能禁用自己的账号' },
        { status: 400 }
      );
    }

    await getManageableUser(payload, id);

    // 获取新状态
    const body = await req.json();
    const { status } = body;

    if (!status || !['active', 'inactive'].includes(status)) {
      return NextResponse.json(
        { error: '无效的状态值' },
        { status: 400 }
      );
    }

    // 更新用户状态
    const updatedUser = await userManager.updateUser(id, { status });

    if (!updatedUser) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: sanitizeUser(updatedUser),
      message: `用户已${status === 'active' ? '启用' : '禁用'}`,
    });
  } catch (error) {
    console.error('更新用户状态失败:', error);

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
        error: error instanceof Error ? error.message : '更新用户状态失败',
      },
      { status: 500 }
    );
  }
}
