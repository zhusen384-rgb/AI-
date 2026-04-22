import { NextRequest, NextResponse } from "next/server";
import { getInterviewSession, saveInterviewSession } from "@/lib/db/session-utils";

/**
 * 恢复面试 API
 * 根据 interviewId 加载之前的面试状态，用于面试恢复功能
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const interviewId = searchParams.get("interviewId");

    if (!interviewId) {
      return NextResponse.json(
        { success: false, error: "缺少面试ID" },
        { status: 400 }
      );
    }

    console.log(`[恢复面试] 加载面试会话: ${interviewId}`);

    const session = await getInterviewSession(interviewId);

    if (!session) {
      console.log(`[恢复面试] 面试会话不存在`);
      return NextResponse.json(
        { success: false, error: "面试会话不存在或已过期" },
        { status: 404 }
      );
    }

    // 检查面试是否过期（超过2小时未活动）
    // 使用 updatedAt（最后更新时间）而不是 startTime（开始时间）来判断是否过期
    const lastUpdateTime = session.updatedAt || session.startTime;
    const now = new Date();
    const hoursDiff = (now.getTime() - lastUpdateTime.getTime()) / (1000 * 60 * 60);

    if (hoursDiff > 2) {
      console.log(`[恢复面试] 面试已过期（距离最后活动 ${hoursDiff.toFixed(1)} 小时，超过2小时限制）`);
      return NextResponse.json(
        { success: false, error: "面试会话已过期，请重新开始面试" },
        { status: 410 }
      );
    }

    console.log(`[恢复面试] 面试恢复成功: stage=${session.interviewStage}, questions=${session.currentQuestionCount}, 最后活动时间=${lastUpdateTime.toISOString()}`);

    // 返回完整的面试状态
    return NextResponse.json({
      success: true,
      session: {
        interviewId: session.interviewId,
        linkId: session.linkId,
        candidateName: session.candidateName,
        mode: session.mode,
        position: session.position,
        positionId: session.positionId,
        resume: session.resume,
        messages: session.messages || [],
        interviewStage: session.interviewStage,
        followUpCount: session.followUpCount,
        currentQuestionCount: session.currentQuestionCount,
        startTime: session.startTime,
        // 技术题目相关字段
        technicalQuestionIds: session.technicalQuestionIds,
        technicalQuestionsAsked: session.technicalQuestionsAsked,
        isCurrentQuestionTechnical: session.isCurrentQuestionTechnical,
      }
    });

  } catch (error) {
    console.error("[恢复面试] 错误:", error);
    return NextResponse.json(
      { success: false, error: "恢复面试失败" },
      { status: 500 }
    );
  }
}
