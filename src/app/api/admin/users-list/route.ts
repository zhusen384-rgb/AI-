import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import * as schema from '@/storage/database/shared/schema';
import { authenticateApi, isAuthError } from '@/lib/api-auth';
import { eq } from 'drizzle-orm';

/**
 * 获取用户列表（用于筛选下拉框）
 * 仅超级管理员可访问
 */
export async function GET(request: NextRequest) {
  try {
    const payload = await authenticateApi(request);

    // 权限检查：只有管理员可以获取用户列表
    if (payload.role !== 'super_admin' && payload.role !== 'admin') {
      return NextResponse.json(
        { error: '权限不足，仅管理员可访问' },
        { status: 403 }
      );
    }

    const db = await getDb();

    const selection = {
      id: schema.users.id,
      username: schema.users.username,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
    };

    const users = payload.role === 'super_admin'
      ? await db.select(selection).from(schema.users).orderBy(schema.users.name)
      : await db
          .select(selection)
          .from(schema.users)
          .where(eq(schema.users.tenantId, payload.tenantId))
          .orderBy(schema.users.name);

    return NextResponse.json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error('[用户列表API] 错误:', error);

    if (isAuthError(error)) {
      return NextResponse.json(
        { error: error.message || '认证失败' },
        { status: error.statusCode || 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: '获取用户列表失败' },
      { status: 500 }
    );
  }
}
