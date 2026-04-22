import { NextRequest, NextResponse } from "next/server";
import { and, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fullAiInterviewResults, fullAiInterviewStatistics } from "@/lib/db/schema";
import { authenticateApi, isAdmin } from "@/lib/api-auth";
import { buildTenantUserFilter } from "@/lib/tenant-filter";

export async function POST(request: NextRequest) {
  try {
    const payload = await authenticateApi(request);
    if (!isAdmin(payload)) {
      return NextResponse.json(
        { success: false, error: "权限不足" },
        { status: 403 }
      );
    }

    const { ids } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "请提供要删除的记录ID列表" },
        { status: 400 }
      );
    }

    console.log(`[batch-delete] 收到批量删除请求: ${ids.length} 个记录`);
    console.log(`[batch-delete] 记录ID列表:`, ids);

    const db = await getDb();
    const normalizedIds = ids.map((item) => String(item)).filter(Boolean);
    if (normalizedIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "请提供要删除的记录ID列表" },
        { status: 400 }
      );
    }
    const numericIds = normalizedIds
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));

    try {
      await db.$client.query("BEGIN");

      try {
        const statsFilter = buildTenantUserFilter(payload, fullAiInterviewStatistics);
        const statsConditions = [inArray(fullAiInterviewStatistics.id, numericIds)];
        if (statsFilter) {
          statsConditions.push(statsFilter);
        }

        const statsRecords = await db
          .select({
            id: fullAiInterviewStatistics.id,
            interviewId: fullAiInterviewStatistics.interviewId,
          })
          .from(fullAiInterviewStatistics)
          .where(and(...statsConditions));
        const interviewIds = statsRecords.map((row) => row.interviewId);

        console.log(`[batch-delete] 找到 ${interviewIds.length} 个对应的 interviewId:`, interviewIds);

        let resultDeleteCount = 0;
        if (interviewIds.length > 0) {
          const resultsFilter = buildTenantUserFilter(payload, fullAiInterviewResults);
          const resultConditions = [inArray(fullAiInterviewResults.interviewId, interviewIds)];
          if (resultsFilter) {
            resultConditions.push(resultsFilter);
          }

          const resultDelete = await db
            .delete(fullAiInterviewResults)
            .where(and(...resultConditions))
            .returning();
          resultDeleteCount = resultDelete.length;
          console.log(`[batch-delete] 删除 results 表记录: ${resultDeleteCount} 条`);
        }

        const statsDelete = await db
          .delete(fullAiInterviewStatistics)
          .where(inArray(fullAiInterviewStatistics.id, statsRecords.map((row) => row.id)))
          .returning();

        console.log(`[batch-delete] 删除 statistics 表记录: ${statsDelete.length} 条`);

        await db.$client.query("COMMIT");

        console.log(`[batch-delete] 批量删除成功: 共删除 ${resultDeleteCount} 条结果记录和 ${statsDelete.length} 条统计记录`);

        return NextResponse.json({
          success: true,
          message: `成功删除 ${statsDelete.length} 条面试记录`,
          deletedResults: resultDeleteCount,
          deletedStatistics: statsDelete.length,
        });
      } catch (error) {
        await db.$client.query("ROLLBACK");
        throw error;
      }
    } catch (error) {
      console.error("[batch-delete] 事务执行失败:", error);
      throw error;
    }
  } catch (error) {
    console.error("[batch-delete] 批量删除失败:", error);

    if (error && typeof error === "object" && "statusCode" in error) {
      return NextResponse.json(
        { success: false, error: (error as { message?: string }).message || "认证失败" },
        { status: (error as { statusCode?: number }).statusCode || 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: "批量删除失败" },
      { status: 500 }
    );
  }
}
