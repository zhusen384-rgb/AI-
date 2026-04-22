import { NextRequest, NextResponse } from 'next/server';
import { getDb } from 'coze-coding-dev-sdk';
import * as schema from '@/storage/database/shared/schema';
import { validateMigrationAccess } from '@/lib/migration-access';

/**
 * 检查系统中的用户
 * 
 * 使用方法：
 * GET /api/migrate-check-users
 */
export async function GET(request: NextRequest) {
  try {
    const accessError = validateMigrationAccess(request);
    if (accessError) {
      return NextResponse.json(
        { error: accessError.message },
        { status: accessError.status }
      );
    }

    const db = await getDb(schema);

    // 获取所有用户
    const users = await db
      .select()
      .from(schema.users);

    return NextResponse.json({
      success: true,
      data: {
        totalUsers: users.length,
        users: users.map(u => ({
          id: u.id,
          username: u.username,
          email: u.email,
          name: u.name,
          role: u.role,
          tenantId: u.tenantId,
          status: u.status,
        }))
      }
    });
  } catch (error) {
    console.error('检查用户失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '检查用户失败',
      },
      { status: 500 }
    );
  }
}
