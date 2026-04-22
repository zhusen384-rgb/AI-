import { NextRequest, NextResponse } from 'next/server';
import { getDb } from 'coze-coding-dev-sdk';
import * as schema from '@/storage/database/shared/schema';
import { isNull } from 'drizzle-orm';
import { validateMigrationAccess } from '@/lib/migration-access';

/**
 * 检查数据的 tenantId 和 userId
 * 
 * 使用方法：
 * GET /api/migrate-check-data
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

    // 检查 fullAiInterviewConfigs 表
    const configs = await db
      .select()
      .from(schema.fullAiInterviewConfigs)
      .limit(5);

    // 检查 fullAiInterviewResults 表
    const results = await db
      .select()
      .from(schema.fullAiInterviewResults)
      .limit(5);

    // 统计 tenantId 或 userId 为 NULL 的记录数
    const configsNull = await db
      .select()
      .from(schema.fullAiInterviewConfigs)
      .where(isNull(schema.fullAiInterviewConfigs.tenantId));

    const resultsNull = await db
      .select()
      .from(schema.fullAiInterviewResults)
      .where(isNull(schema.fullAiInterviewResults.tenantId));

    const sessionsNull = await db
      .select()
      .from(schema.interviewSessions)
      .where(isNull(schema.interviewSessions.tenantId));

    return NextResponse.json({
      success: true,
      data: {
        sampleConfigs: configs.map(c => ({
          id: c.id,
          candidateName: c.candidateName,
          tenantId: c.tenantId,
          userId: c.userId,
        })),
        sampleResults: results.map(r => ({
          id: r.id,
          candidateName: r.candidateName,
          tenantId: r.tenantId,
          userId: r.userId,
        })),
        nullCount: {
          configsNullTenantId: configsNull.length,
          resultsNullTenantId: resultsNull.length,
          sessionsNullTenantId: sessionsNull.length,
        },
      }
    });
  } catch (error) {
    console.error('检查数据失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '检查数据失败',
      },
      { status: 500 }
    );
  }
}
