import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import * as sharedSchema from '@/storage/database/shared/schema';
import { candidates } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { authenticateApi } from '@/lib/api-auth';

async function hasColumn(
  db: Awaited<ReturnType<typeof getDb>>,
  tableName: string,
  columnName: string
) {
  try {
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = ${tableName}
          AND column_name = ${columnName}
      ) AS exists
    `);

    return Boolean((result.rows[0] as { exists?: boolean } | undefined)?.exists);
  } catch (error) {
    console.warn('[用户统计API] 读取表结构失败:', error);
    return false;
  }
}

async function safeRows<T>(queryFactory: () => Promise<T[]>, fallback: T[] = []) {
  try {
    return await queryFactory();
  } catch (error) {
    console.warn('[用户统计API] 查询失败，已回退为空结果:', error);
    return fallback;
  }
}

/**
 * 获取各用户数据量统计
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

    const db = await getDb();

    // 获取所有用户
    const users = await db
      .select({
        userId: sharedSchema.users.id,
        username: sharedSchema.users.username,
        name: sharedSchema.users.name,
        email: sharedSchema.users.email,
        role: sharedSchema.users.role,
        loginCount: sharedSchema.users.loginCount,
        lastLoginAt: sharedSchema.users.lastLoginAt,
        lastLoginIp: sharedSchema.users.lastLoginIp,
      })
      .from(sharedSchema.users);

    // 获取各用户的数据统计
    // 注意：candidates 和 resumes 表没有 userId 字段，通过 createdById 关联
    const [
      positionsStats,
      candidatesStats,
      interviewsStats,
      resumesStats,
    ] = await Promise.all([
      // 各用户岗位数
      safeRows(() =>
        db.select({
          userId: sharedSchema.positions.userId,
          count: sql<number>`count(*)`,
        })
          .from(sharedSchema.positions)
          .groupBy(sharedSchema.positions.userId)
      ),
      
      // 各用户候选人数（通过 createdById 关联）
      safeRows(() =>
        db.select({
          createdById: candidates.createdById,
          count: sql<number>`count(*)`,
        })
          .from(candidates)
          .where(sql`${candidates.createdById} IS NOT NULL`)
          .groupBy(candidates.createdById)
      ),
      
      // 各用户面试数
      (async () => {
        const canReadInterviewUserId = await hasColumn(db, 'full_ai_interview_results', 'user_id');
        if (!canReadInterviewUserId) {
          return [];
        }

        return safeRows(() =>
          db.select({
            userId: sharedSchema.fullAiInterviewResults.userId,
            count: sql<number>`count(*)`,
          })
            .from(sharedSchema.fullAiInterviewResults)
            .where(sql`${sharedSchema.fullAiInterviewResults.userId} IS NOT NULL`)
            .groupBy(sharedSchema.fullAiInterviewResults.userId)
        );
      })(),
      
      // 各用户简历数（通过 candidates 关联）
      (async () => {
        try {
          return await db.execute(sql`
            SELECT c.created_by_id, count(r.id) as count
            FROM candidates c
            LEFT JOIN resumes r ON r.candidate_id = c.id
            WHERE c.created_by_id IS NOT NULL
            GROUP BY c.created_by_id
          `);
        } catch (error) {
          console.warn('[用户统计API] 统计简历数量失败，已回退为空结果:', error);
          return { rows: [] } as unknown as Awaited<ReturnType<typeof db.execute>>;
        }
      })(),
    ]);

    // 转换为 Map 便于查找
    const positionsMap = new Map(
      positionsStats.map(p => [p.userId, Number(p.count)])
    );
    const candidatesMap = new Map(
      candidatesStats.map(c => [c.createdById, Number(c.count)])
    );
    const interviewsMap = new Map(
      interviewsStats.filter(i => i.userId).map(i => [i.userId, Number(i.count)])
    );
    const resumesMap = new Map(
      (resumesStats.rows as any[]).map(r => [r.created_by_id, Number(r.count)])
    );

    // 组装用户统计数据
    const userStats = users.map(user => ({
      userId: user.userId,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      positionsCount: positionsMap.get(user.userId) || 0,
      candidatesCount: candidatesMap.get(user.userId) || 0,
      interviewsCount: interviewsMap.get(user.userId) || 0,
      resumesCount: resumesMap.get(user.userId) || 0,
      loginCount: user.loginCount,
      lastActiveAt: user.lastLoginAt,
      lastLoginIp: user.lastLoginIp,
    }));

    // 按总数据量排序
    userStats.sort((a, b) => {
      const totalA = a.positionsCount + a.candidatesCount + a.interviewsCount + a.resumesCount;
      const totalB = b.positionsCount + b.candidatesCount + b.interviewsCount + b.resumesCount;
      return totalB - totalA;
    });

    return NextResponse.json({
      success: true,
      data: userStats,
    });
  } catch (error) {
    console.error('[用户统计API] 错误:', error);

    if (error && typeof error === 'object' && 'statusCode' in error) {
      return NextResponse.json(
        { error: (error as any).message || '认证失败' },
        { status: (error as any).statusCode || 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: '获取用户统计失败' },
      { status: 500 }
    );
  }
}
