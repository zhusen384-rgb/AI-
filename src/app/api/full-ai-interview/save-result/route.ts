import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fullAiInterviewResults } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { getInterviewSession, updateInterviewStatisticsStatus } from "@/lib/db/session-utils";
import { ensureFullAiInterviewResultsTable } from "@/lib/db/ensure-full-ai-interview-results-table";
import { authenticateApi } from "@/lib/api-auth";
import { buildTenantUserFilter } from "@/lib/tenant-filter";

function hasAuthCredentials(request: NextRequest): boolean {
  return Boolean(request.cookies.get("auth-token")?.value || request.headers.get("authorization"));
}

export async function POST(request: NextRequest) {
  try {
    const {
      interviewId, // 实际面试会话ID
      linkId, // 分享链接的 linkId
      candidateName,
      position,
      evaluation,
      recordingKey,
      recordingUrl,
      qaHistory, // 面试问答记录
      candidateStatus, // 候选人状态监控信息
      completedAt,
    } = await request.json();

    console.log(`[save-result POST] 收到保存请求:`);
    console.log(`  - interviewId: ${interviewId}`);
    console.log(`  - linkId: ${linkId}`);
    console.log(`  - candidateName: ${candidateName}`);
    console.log(`  - position: ${position}`);
    console.log(`  - evaluation: isEliminated=${evaluation?.isEliminated}, score=${evaluation?.overallScore100}`);
    console.log(`  - recordingKey: ${recordingKey}`);
    console.log(`  - recordingUrl: ${!!recordingUrl}`);
    console.log(`  - qaHistory: ${qaHistory ? `${qaHistory.length} 条记录` : '无'}`);
    console.log(`  - candidateStatus: ${candidateStatus ? `整体状态=${candidateStatus.overallStatus}, 事件数=${candidateStatus.events?.length || 0}, 截图数=${candidateStatus.screenshots?.length || 0}` : '无'}`);
    console.log(`  - completedAt: ${completedAt}`);

    if (!interviewId) {
      return NextResponse.json(
        { success: false, error: "请提供面试ID" },
        { status: 400 }
      );
    }

    const session = await getInterviewSession(interviewId).catch(() => null);
    const completedTime = completedAt ? new Date(completedAt) : new Date();

    // 如果 evaluation 为 null 或 undefined，提供一个默认值，避免数据库 NOT NULL 约束错误
    const defaultEvaluation = {
      isEliminated: false,
      eliminationReason: null,
      overallScore5: 0,
      overallScore100: 0,
      categoryScores: {},
      categoryLabels: {},
      summary: "评估数据不可用",
      strengths: [],
      improvements: [],
      recommendation: "consider",
      error: "评估数据缺失"
    };

    const finalEvaluation = evaluation || defaultEvaluation;

    console.log(`[save-result POST] 最终使用的 evaluation:`, {
      hasEvaluation: !!finalEvaluation,
      type: typeof finalEvaluation,
      isError: !!finalEvaluation.error
    });

    await ensureFullAiInterviewResultsTable();

    // 获取数据库连接
    const db = await getDb();

    // 检查是否已存在相同 interviewId 的记录
    const existingResults = await db
      .select()
      .from(fullAiInterviewResults)
      .where(eq(fullAiInterviewResults.interviewId, interviewId))
      .limit(1);

    if (existingResults && existingResults.length > 0) {
      // 已存在，更新记录
      const existingRecord = existingResults[0];
      console.log(`[save-result POST] 面试结果已存在，更新记录: id=${existingRecord.id}, interviewId=${interviewId}`);
      
      await db
        .update(fullAiInterviewResults)
        .set({
          candidateName,
          position,
          evaluation: finalEvaluation,
          recordingKey,
          recordingUrl,
          qaHistory: qaHistory || null,
          candidateStatus: candidateStatus || existingRecord.candidateStatus,
          tenantId: existingRecord.tenantId || session?.tenantId || null,
          userId: existingRecord.userId || session?.userId || null,
          completedAt: completedTime,
        })
        .where(eq(fullAiInterviewResults.id, existingRecord.id));

      console.log(`[save-result POST] 面试结果已更新`);

      // 更新面试统计状态为已完成
      await updateInterviewStatisticsStatus(interviewId, 'completed');

      return NextResponse.json({
        success: true,
        result: {
          id: existingRecord.id,
          linkId,
          interviewId,
          candidateName,
          position,
          evaluation: finalEvaluation,
          recordingKey,
          recordingUrl,
          qaHistory: qaHistory || null,
          completedAt: completedTime.toISOString(),
          createdAt: existingRecord.createdAt?.toISOString() || new Date().toISOString(),
        },
      });
    }

    // 不存在，插入新记录
    await db.insert(fullAiInterviewResults).values({
      linkId: linkId || interviewId, // 如果没有 linkId，使用 interviewId
      interviewId,
      candidateName,
      position,
      evaluation: finalEvaluation,  // 使用 finalEvaluation，确保不会是 null
      recordingKey,
      recordingUrl,
      qaHistory: qaHistory || null, // 保存问答记录
      candidateStatus: candidateStatus || {
        overallStatus: 'normal',
        summary: '状态监控未启用',
        events: [],
        statistics: {
          totalDuration: 0,
          normalDuration: 0,
          abnormalDuration: 0,
          cheatingDuration: 0,
          faceDetectionRate: 0,
          faceLostCount: 0,
          multipleFaceCount: 0,
          suspiciousActions: 0,
        },
      }, // 保存候选人状态监控信息
      tenantId: session?.tenantId || null,
      userId: session?.userId || null,
      completedAt: completedTime,
      createdAt: new Date(),
    });

    console.log(`[save-result POST] 面试结果已保存到数据库`);

    // 更新面试统计状态为已完成
    await updateInterviewStatisticsStatus(interviewId, 'completed');

    const result = {
      id: interviewId,
      linkId,
      candidateName,
      position,
      evaluation: finalEvaluation,
      recordingKey,
      recordingUrl,
      qaHistory: qaHistory || null, // 包含问答记录
      completedAt: completedTime.toISOString(),
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("[save-result POST] 保存面试结果失败:", error);
    return NextResponse.json(
      { success: false, error: "保存面试结果失败" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    console.log("[save-result GET] 开始获取面试结果...");
    const { searchParams } = new URL(request.url);
    const interviewId = searchParams.get("id");
    const hasAuth = hasAuthCredentials(request);
    const payload = hasAuth ? await authenticateApi(request) : null;

    console.log("[save-result GET] 参数:", { interviewId });

    await ensureFullAiInterviewResultsTable();
    const db = await getDb();

    if (interviewId) {
      const conditions = [eq(fullAiInterviewResults.interviewId, interviewId)];
      if (payload) {
        const accessFilter = buildTenantUserFilter(payload, fullAiInterviewResults);
        if (accessFilter) {
          conditions.push(accessFilter);
        }
      }

      const results = await db
        .select()
        .from(fullAiInterviewResults)
        .where(and(...conditions))
        .limit(1);

      if (results && results.length > 0) {
        console.log(`[save-result GET] 从数据库获取指定面试结果: interviewId=${interviewId}`);
        const candidateStatus = results[0].candidateStatus as any;
        console.log(`[save-result GET] candidateStatus截图数: ${candidateStatus?.screenshots?.length || 0}`);
        return NextResponse.json({
          success: true,
          result: results[0],
        });
      }

      if (payload) {
        return NextResponse.json(
          { success: false, error: "面试结果不存在或无权访问" },
          { status: 404 }
        );
      }

      console.log(`[save-result GET] 面试结果不存在: interviewId=${interviewId}`);
      return NextResponse.json(
        { success: false, error: "面试结果不存在" },
        { status: 404 }
      );
    }

    if (!payload) {
      return NextResponse.json(
        { success: false, error: "未提供认证token" },
        { status: 401 }
      );
    }

    // 获取所有可访问的面试结果（按完成时间倒序，并对 interviewId 去重）
    console.log("[save-result GET] 获取所有面试结果...");
    const accessFilter = buildTenantUserFilter(payload, fullAiInterviewResults);
    let query = db.select().from(fullAiInterviewResults);
    if (accessFilter) {
      query = query.where(accessFilter) as typeof query;
    }

    const dbResults = await query.orderBy(desc(fullAiInterviewResults.completedAt));

    // 按 interviewId 去重，只保留最新的记录
    const seenInterviewIds = new Set<string>();
    const uniqueResults = dbResults.filter((r) => {
      if (seenInterviewIds.has(r.interviewId)) {
        return false;
      }
      seenInterviewIds.add(r.interviewId);
      return true;
    });

    console.log(`[save-result GET] 从数据库获取所有面试结果，原始 ${dbResults.length} 条，去重后 ${uniqueResults.length} 条`);
    uniqueResults.forEach((r) => {
      console.log(`  - ${r.interviewId}: ${r.candidateName} (${r.position}) at ${r.completedAt}`);
    });

    return NextResponse.json({
      success: true,
      results: uniqueResults,
    });
  } catch (error) {
    console.error("[save-result GET] 获取面试结果失败:", error);
    if (error && typeof error === "object" && "statusCode" in error) {
      return NextResponse.json(
        { success: false, error: (error as { message?: string }).message || "认证失败" },
        { status: (error as { statusCode?: number }).statusCode || 401 }
      );
    }
    console.error("[save-result GET] 错误详情:", {
      message: (error as Error).message,
      stack: (error as Error).stack
    });
    return NextResponse.json(
      { success: false, error: "获取面试结果失败: " + (error as Error).message },
      { status: 500 }
    );
  }
}
