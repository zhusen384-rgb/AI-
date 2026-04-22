import { NextRequest, NextResponse } from 'next/server';
import { tenantManager } from '@/storage/database';
import { authenticateApi, isAuthError, isSuperAdmin } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  try {
    // JWT认证
    const payload = await authenticateApi(req);

    // 仅超级管理员可以创建租户
    if (!isSuperAdmin(payload)) {
      return NextResponse.json(
        { error: '权限不足，仅超级管理员可以创建租户' },
        { status: 403 }
      );
    }

    // 获取租户信息
    const { name, code, contactEmail, contactPhone } = await req.json();

    if (!name || !code) {
      return NextResponse.json(
        { error: '租户名称和代码不能为空' },
        { status: 400 }
      );
    }

    // 创建租户
    const newTenant = await tenantManager.createTenant({
      name,
      code,
      phone: contactPhone,
      email: contactEmail,
    });

    return NextResponse.json({
      success: true,
      data: newTenant,
    });
  } catch (error) {
    console.error('创建租户失败:', error);

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
        error: error instanceof Error ? error.message : '创建租户失败',
      },
      { status: 500 }
    );
  }
}
