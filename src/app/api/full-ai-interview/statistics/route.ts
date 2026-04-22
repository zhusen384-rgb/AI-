import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { initInterviewStatisticsTable } from "@/lib/db/session-utils";
import { authenticateApi, isAdmin } from "@/lib/api-auth";
import { buildTenantFilter } from "@/lib/tenant-filter";
import { fullAiInterviewStatistics, fullAiInterviewResults } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { ensureFullAiInterviewResultsTable } from "@/lib/db/ensure-full-ai-interview-results-table";

export async function GET(request: NextRequest) {
  try {
    console.log('[统计API] 开始获取面试统计数据...');

    // 认证检查
    const payload = await authenticateApi(request);

    // 权限检查：只有管理员可以查看所有统计数据
    if (!isAdmin(payload)) {
      return NextResponse.json(
        { error: "权限不足" },
        { status: 403 }
      );
    }

    // 确保统计表已初始化
    await initInterviewStatisticsTable();
    await ensureFullAiInterviewResultsTable();

    const db = await getDb();

    // 构建租户过滤条件
    const tenantFilter = buildTenantFilter(payload, fullAiInterviewStatistics);

    // 获取统计数据，包含评估结果
    let query = db
      .select({
        id: fullAiInterviewStatistics.id,
        linkId: fullAiInterviewStatistics.linkId,
        interviewId: fullAiInterviewStatistics.interviewId,
        candidateName: fullAiInterviewStatistics.candidateName,
        position: fullAiInterviewStatistics.position,
        mode: fullAiInterviewStatistics.mode,
        interviewTime: fullAiInterviewStatistics.interviewTime,
        meetingLink: fullAiInterviewStatistics.meetingLink,
        meetingId: fullAiInterviewStatistics.meetingId,
        status: fullAiInterviewStatistics.status,
        createdAt: fullAiInterviewStatistics.createdAt,
        evaluation: fullAiInterviewResults.evaluation,
        completedAt: fullAiInterviewResults.completedAt,
      })
      .from(fullAiInterviewStatistics)
      .leftJoin(fullAiInterviewResults, eq(fullAiInterviewStatistics.interviewId, fullAiInterviewResults.interviewId))
      .orderBy(desc(fullAiInterviewStatistics.interviewTime));

    // 应用租户过滤
    if (tenantFilter) {
      query = query.where(tenantFilter) as typeof query;
    }

    const result = await query;

    console.log(`[统计API] 查询到 ${result.length} 条记录`);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[统计API] 获取统计数据失败:', error);

    // 认证错误
    if (error && typeof error === 'object' && 'statusCode' in error) {
      return NextResponse.json(
        { error: (error as any).message || '认证失败' },
        { status: (error as any).statusCode || 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "获取统计数据失败",
      },
      { status: 500 }
    );
  }
}
