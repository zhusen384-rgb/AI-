import { NextRequest, NextResponse } from 'next/server';
import { userManager } from '@/storage/database';
import { authenticateApi, getManageableUser, isAdmin, isAuthError } from '@/lib/api-auth';

export async function POST(
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
        { error: '权限不足，仅管理员可以重置密码' },
        { status: 403 }
      );
    }

    await getManageableUser(payload, id);

    // 获取新密码
    const body = await req.json();
    const { password } = body;

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: '密码长度至少6位' },
        { status: 400 }
      );
    }

    // 更新密码
    await userManager.updatePassword(id, password);

    return NextResponse.json({
      success: true,
      message: '密码已重置',
    });
  } catch (error) {
    console.error('重置密码失败:', error);

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
        error: error instanceof Error ? error.message : '重置密码失败',
      },
      { status: 500 }
    );
  }
}
