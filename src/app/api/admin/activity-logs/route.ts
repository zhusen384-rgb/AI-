import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import * as schema from '@/storage/database/shared/schema';
import { desc, eq, and } from 'drizzle-orm';
import { authenticateApi } from '@/lib/api-auth';

/**
 * 获取用户活动日志
 * 仅超级管理员可访问
 */
export async function GET(request: NextRequest) {
  try {
    const payload = await authenticateApi(request);

    // 权限检查
    if (payload.role !== 'super_admin' && payload.role !== 'admin') {
      return NextResponse.json(
        { error: '权限不足，仅管理员可访问' },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '100');
    const action = searchParams.get('action');
    const resource = searchParams.get('resource');
    const userId = searchParams.get('userId');

    const db = await getDb();

    // 检查活动日志表是否存在
    const tableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'user_activity_logs'
      );
    `);

    if (!tableExists.rows[0]?.exists) {
      // 表不存在，返回登录日志作为活动日志
      const loginLogs = await db
        .select({
          id: schema.loginLogs.id,
          userId: schema.loginLogs.userId,
          userName: schema.users.name,
          action: sql<string>`'login'`,
          resource: sql<string>`'user'`,
          resourceName: sql<string>`NULL`,
          detail: sql<any>`json_build_object('ip', ${schema.loginLogs.ip})`,
          createdAt: schema.loginLogs.loginTime,
        })
        .from(schema.loginLogs)
        .leftJoin(schema.users, eq(schema.loginLogs.userId, schema.users.id))
        .orderBy(desc(schema.loginLogs.loginTime))
        .limit(limit);

      return NextResponse.json({
        success: true,
        data: loginLogs,
        note: '活动日志表尚未创建，显示登录日志',
      });
    }

    // 构建查询条件
    const conditions = [];
    if (action) {
      conditions.push(eq(schema.userActivityLogs.action, action));
    }
    if (resource) {
      conditions.push(eq(schema.userActivityLogs.resource, resource));
    }
    if (userId) {
      conditions.push(eq(schema.userActivityLogs.userId, userId));
    }

    // 查询活动日志
    let query = db
      .select({
        id: schema.userActivityLogs.id,
        userId: schema.userActivityLogs.userId,
        userName: schema.users.name,
        action: schema.userActivityLogs.action,
        resource: schema.userActivityLogs.resource,
        resourceName: schema.userActivityLogs.resourceName,
        detail: schema.userActivityLogs.detail,
        createdAt: schema.userActivityLogs.createdAt,
      })
      .from(schema.userActivityLogs)
      .leftJoin(schema.users, eq(schema.userActivityLogs.userId, schema.users.id))
      .orderBy(desc(schema.userActivityLogs.createdAt))
      .limit(limit);

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const logs = await query;

    return NextResponse.json({
      success: true,
      data: logs,
    });
  } catch (error) {
    console.error('[活动日志API] 错误:', error);

    if (error && typeof error === 'object' && 'statusCode' in error) {
      return NextResponse.json(
        { error: (error as any).message || '认证失败' },
        { status: (error as any).statusCode || 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: '获取活动日志失败' },
      { status: 500 }
    );
  }
}

// 导入 sql
import { sql } from 'drizzle-orm';
