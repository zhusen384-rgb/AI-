import { NextRequest, NextResponse } from 'next/server';
import { userManager } from '@/storage/database';
import { authenticateApi, assertCanAssignRole, getManageableUser, isAdmin, isAuthError } from '@/lib/api-auth';
import type { UpdateUser } from '@/storage/database/shared/schema';
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
        { error: '权限不足，仅管理员可以更新用户' },
        { status: 403 }
      );
    }

    await getManageableUser(payload, id);

    // 获取更新数据
    const body = await req.json();
    const updateData: UpdateUser = {};

    if (body.username !== undefined) updateData.username = body.username;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.name !== undefined) updateData.name = body.name;
    if (body.role !== undefined) {
      assertCanAssignRole(payload, body.role);
      updateData.role = body.role;
    }
    if (body.status !== undefined) updateData.status = body.status;
    if (body.phone !== undefined) updateData.phone = body.phone;

    // 更新用户
    const updatedUser = await userManager.updateUser(id, updateData);

    if (!updatedUser) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    // 返回用户信息（不包含密码）
    return NextResponse.json({
      success: true,
      data: sanitizeUser(updatedUser),
      message: '用户已更新',
    });
  } catch (error) {
    console.error('更新用户失败:', error);

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
        error: error instanceof Error ? error.message : '更新用户失败',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
        { error: '权限不足，仅管理员可以删除用户' },
        { status: 403 }
      );
    }

    // 不能删除自己
    if (id === payload.userId) {
      return NextResponse.json(
        { error: '不能删除自己的账号' },
        { status: 400 }
      );
    }

    await getManageableUser(payload, id);

    // 删除用户
    await userManager.deleteUser(id);

    return NextResponse.json({
      success: true,
      message: '用户已删除',
    });
  } catch (error) {
    console.error('删除用户失败:', error);

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
        error: error instanceof Error ? error.message : '删除用户失败',
      },
      { status: 500 }
    );
  }
}
