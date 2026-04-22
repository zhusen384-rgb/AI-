import { NextRequest, NextResponse } from "next/server";
import { getInterviewSessionByLinkId, initInterviewSessionsTable, initInterviewStatisticsTable } from "@/lib/db/session-utils";

/**
 * 检查未完成的面试 API
 * 根据 linkId 查找是否有进行中的面试，用于面试恢复功能
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get("linkId");

    if (!linkId) {
      return NextResponse.json(
        { success: false, error: "缺少面试链接ID" },
        { status: 400 }
      );
    }

    console.log(`[检查未完成面试] 查询 linkId: ${linkId}`);
    await initInterviewSessionsTable();
    await initInterviewStatisticsTable();

    const session = await getInterviewSessionByLinkId(linkId);

    if (!session) {
      console.log(`[检查未完成面试] 没有找到进行中的面试`);
      return NextResponse.json({
        success: true,
        hasUnfinishedInterview: false,
        message: "没有未完成的面试"
      });
    }

    // 3. 检查面试是否过期（超过2小时未活动）
    const lastUpdateTime = new Date(session.updatedAt);
    const now = new Date();
    const hoursDiff = (now.getTime() - lastUpdateTime.getTime()) / (1000 * 60 * 60);

    if (hoursDiff > 2) {
      console.log(`[检查未完成面试] 面试已过期（${hoursDiff.toFixed(1)}小时未活动）`);

      return NextResponse.json({
        success: true,
        hasUnfinishedInterview: false,
        message: "面试会话已过期"
      });
    }

    // 4. 返回可恢复的面试信息
    const stageNames: Record<number, string> = {
      1: "自我介绍阶段",
      2: "核心问题阶段",
      3: "结束阶段"
    };

    // 计算面试时长
    const startTime = new Date(session.startTime);
    const durationMinutes = Math.floor((now.getTime() - startTime.getTime()) / (1000 * 60));

    return NextResponse.json({
      success: true,
      hasUnfinishedInterview: true,
      interviewInfo: {
        interviewId: session.interviewId,
        candidateName: session.candidateName,
        position: session.position,
        positionId: session.positionId,
        mode: session.mode,
        stage: session.interviewStage,
        stageName: stageNames[session.interviewStage] || "未知阶段",
        questionCount: session.currentQuestionCount,
        messageCount: (session.messages as any[])?.length || 0,
        startTime: session.startTime,
        durationMinutes,
        lastUpdateTime: session.updatedAt
      }
    });

  } catch (error) {
    console.error("[检查未完成面试] 错误:", error);

    return NextResponse.json(
      { success: false, error: "检查面试状态失败" },
      { status: 500 }
    );
  }
}
