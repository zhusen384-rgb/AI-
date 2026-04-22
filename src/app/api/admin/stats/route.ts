import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import * as sharedSchema from '@/storage/database/shared/schema';
import * as localSchema from '@/lib/db/schema';
import { sql, gte } from 'drizzle-orm';
import { authenticateApi } from '@/lib/api-auth';

async function safeCount(queryFactory: () => Promise<Array<{ count: number | string | null }>>) {
  try {
    const result = await queryFactory();
    return Number(result[0]?.count || 0);
  } catch (error) {
    console.warn('[管理员统计API] 统计查询失败，已回退为 0:', error);
    return 0;
  }
}

/**
 * 获取系统整体统计数据
 * 仅超级管理员可访问
 */
export async function GET(request: NextRequest) {
  try {
    const payload = await authenticateApi(request);

    // 权限检查：只有超级管理员和管理员可以访问
    if (payload.role !== 'super_admin' && payload.role !== 'admin') {
      return NextResponse.json(
        { error: '权限不足，仅管理员可访问' },
        { status: 403 }
      );
    }

    const db = await getDb();

    const [
      totalUsers,
      activeUsers,
      totalPositions,
      totalCandidates,
      totalInterviews,
      totalResumes,
      todayLogins,
      todayInterviews,
      weeklyActiveUsers,
    ] = await Promise.all([
      safeCount(() => db.select({ count: sql<number>`count(*)` }).from(sharedSchema.users)),
      safeCount(() =>
        db
          .select({ count: sql<number>`count(*)` })
          .from(sharedSchema.users)
          .where(sql`${sharedSchema.users.status} = 'active'`)
      ),
      safeCount(() => db.select({ count: sql<number>`count(*)` }).from(sharedSchema.positions)),
      safeCount(() => db.select({ count: sql<number>`count(*)` }).from(localSchema.candidates)),
      safeCount(() => db.select({ count: sql<number>`count(*)` }).from(localSchema.fullAiInterviewResults)),
      safeCount(() => db.select({ count: sql<number>`count(*)` }).from(localSchema.resumes)),
      safeCount(() =>
        db
          .select({ count: sql<number>`count(*)` })
          .from(sharedSchema.loginLogs)
          .where(sql`date(${sharedSchema.loginLogs.loginTime}) = current_date`)
      ),
      safeCount(() =>
        db
          .select({ count: sql<number>`count(*)` })
          .from(localSchema.fullAiInterviewResults)
          .where(sql`date(${localSchema.fullAiInterviewResults.completedAt}) = current_date`)
      ),
      safeCount(() =>
        db
          .select({ count: sql<number>`count(distinct ${sharedSchema.loginLogs.userId})` })
          .from(sharedSchema.loginLogs)
          .where(gte(sharedSchema.loginLogs.loginTime, sql`current_date - interval '7 days'`))
      ),
    ]);

    const stats = {
      totalUsers,
      activeUsers,
      totalPositions,
      totalCandidates,
      totalInterviews,
      totalResumes,
      todayLogins,
      todayInterviews,
      weeklyActiveUsers,
    };

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[管理员统计API] 错误:', error);

    if (error && typeof error === 'object' && 'statusCode' in error) {
      return NextResponse.json(
        { error: (error as any).message || '认证失败' },
        { status: (error as any).statusCode || 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: '获取统计数据失败' },
      { status: 500 }
    );
  }
}
