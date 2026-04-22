import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fullAiInterviewResults } from "@/storage/database/shared/schema";
import { desc, eq, and, gte, lte, sql, or, like } from "drizzle-orm";
import { authenticateApi, isAdmin } from "@/lib/api-auth";
import { buildTenantUserFilter } from "@/lib/tenant-filter";
import { ensureFullAiInterviewResultsTable } from "@/lib/db/ensure-full-ai-interview-results-table";

export async function GET(request: NextRequest) {
  try {
    // JWT认证
    const payload = await authenticateApi(request);

    // 获取查询参数
    const searchParams = request.nextUrl.searchParams;
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const day = searchParams.get('day'); // 新增日筛选参数
    const recommendation = searchParams.get('recommendation');
    const search = searchParams.get('search'); // 新增搜索参数
    const userId = searchParams.get('userId'); // 用户筛选参数（仅管理员可用）

    console.log('[获取面试记录] 请求参数:', { year, month, day, recommendation, search, userId });

    await ensureFullAiInterviewResultsTable();
    const db = await getDb();

    // 构建查询条件
    const conditions = [];

    // 年月日筛选
    if (year && month) {
      // 使用日期字符串格式进行筛选，避免时区问题
      // 格式：YYYY-MM-DD
      const yearNum = parseInt(year);
      const monthNum = parseInt(month);

      // 根据是否指定日来确定筛选范围
      let startDateStr: string;
      let endDateStr: string;

      if (day && day !== 'all') {
        // 指定日筛选
        const dayNum = parseInt(day);
        startDateStr = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
        endDateStr = startDateStr;
      } else {
        // 按月筛选
        startDateStr = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;
        endDateStr = `${yearNum}-${String(monthNum).padStart(2, '0')}-31`;
      }

      console.log('[获取面试记录] 日期筛选:', {
        year,
        month,
        day,
        startDateStr,
        endDateStr,
      });

      // 使用SQL的date_trunc函数或者字符串比较
      conditions.push(
        sql`${fullAiInterviewResults.completedAt} >= ${new Date(startDateStr + 'T00:00:00')}`,
        sql`${fullAiInterviewResults.completedAt} <= ${new Date(endDateStr + 'T23:59:59')}`
      );
    }

    // 添加租户和用户过滤条件
    // 如果指定了 userId 且当前用户是管理员，则按指定用户筛选
    if (userId && userId !== 'all' && (payload.role === 'super_admin' || payload.role === 'admin')) {
      conditions.push(eq(fullAiInterviewResults.userId, userId));
    } else {
      // 否则使用默认的租户和用户过滤
      const tenantUserFilter = buildTenantUserFilter(payload, fullAiInterviewResults);
      if (tenantUserFilter) {
        conditions.push(tenantUserFilter);
      }
    }

    // 构建基础查询
    let query = db
      .select({
        id: fullAiInterviewResults.id,
        linkId: fullAiInterviewResults.linkId,
        interviewId: fullAiInterviewResults.interviewId,
        candidateName: fullAiInterviewResults.candidateName,
        position: fullAiInterviewResults.position,
        evaluation: fullAiInterviewResults.evaluation,
        recordingKey: fullAiInterviewResults.recordingKey,
        recordingUrl: fullAiInterviewResults.recordingUrl,
        completedAt: fullAiInterviewResults.completedAt,
        createdAt: fullAiInterviewResults.createdAt,
      })
      .from(fullAiInterviewResults);

    // 应用筛选条件
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    // 排序并执行查询
    const records = await query.orderBy(desc(fullAiInterviewResults.completedAt));

    console.log('[获取面试记录] 数据库查询返回记录数:', records.length);

    // 按 interviewId 去重，只保留最新的记录
    const seenInterviewIds = new Set<string>();
    let uniqueRecords = records.filter((r) => {
      if (seenInterviewIds.has(r.interviewId)) {
        return false;
      }
      seenInterviewIds.add(r.interviewId);
      return true;
    });

    console.log('[获取面试记录] 去重后记录数:', uniqueRecords.length);

    // 在应用层过滤 recommendation（因为 evaluation 是 JSON 字段）
    let filteredRecords = uniqueRecords;

    // 按推荐状态过滤
    if (recommendation && recommendation !== 'all') {
      console.log('[获取面试记录] 过滤推荐状态:', recommendation);
      filteredRecords = filteredRecords.filter((record: any) => {
        const evalRec = record.evaluation as any;
        return evalRec?.recommendation === recommendation;
      });
      console.log('[获取面试记录] 过滤后记录数:', filteredRecords.length);
    }

    // 搜索过滤（候选人姓名、面试ID、会议ID/linkId）
    if (search && search.trim()) {
      const searchLower = search.trim().toLowerCase();
      console.log('[获取面试记录] 搜索关键词:', searchLower);
      filteredRecords = filteredRecords.filter((record: any) => {
        const nameMatch = record.candidateName?.toLowerCase().includes(searchLower);
        const interviewIdMatch = record.interviewId?.toLowerCase().includes(searchLower);
        const linkIdMatch = record.linkId?.toLowerCase().includes(searchLower);
        return nameMatch || interviewIdMatch || linkIdMatch;
      });
      console.log('[获取面试记录] 搜索后记录数:', filteredRecords.length);
    }

    return NextResponse.json({
      success: true,
      data: filteredRecords,
      total: filteredRecords.length,
    });
  } catch (error) {
    console.error('[获取面试记录] 错误:', error);

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
        error: '获取面试记录失败',
      },
      { status: 500 }
    );
  }
}
