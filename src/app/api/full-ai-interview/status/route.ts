import { NextRequest, NextResponse } from "next/server";
import { getInterviewSession, getInterviewSessionByLinkId, initInterviewSessionsTable, initInterviewStatisticsTable } from "@/lib/db/session-utils";

/**
 * 获取面试状态 API
 * 用于轮询获取当前面试会话的状态，支持页面刷新后恢复状态
 * 
 * 支持两种查询方式：
 * 1. interviewId - 通过面试会话ID查询
 * 2. linkId - 通过面试链接ID查询（会查找该链接下进行中的面试）
 */
export async function GET(request: NextRequest) {
  try {
    await initInterviewSessionsTable();
    await initInterviewStatisticsTable();

    const { searchParams } = new URL(request.url);
    const interviewId = searchParams.get("interviewId");
    const linkId = searchParams.get("linkId");

    if (!interviewId && !linkId) {
      return NextResponse.json(
        { success: false, error: "缺少面试ID或链接ID" },
        { status: 400 }
      );
    }

    let session = null;

    if (interviewId) {
      console.log(`[获取面试状态] 通过 interviewId 查询面试: ${interviewId}`);
      session = await getInterviewSession(interviewId);
    } else if (linkId) {
      console.log(`[获取面试状态] 通过 linkId 查询面试: ${linkId}`);
      session = await getInterviewSessionByLinkId(linkId);
    }

    if (!session) {
      return NextResponse.json(
        { success: false, error: "面试会话不存在" },
        { status: 404 }
      );
    }

    // 返回面试状态信息
    const status = {
      interviewId: session.interviewId,
      linkId: session.linkId,
      candidateName: session.candidateName,
      mode: session.mode,
      positionId: session.positionId,
      position: session.position,
      interviewStage: session.interviewStage,
      followUpCount: session.followUpCount,
      currentQuestionCount: session.currentQuestionCount,
      messages: session.messages || [],
      startTime: session.startTime,
      // 技术题目相关字段
      technicalQuestionIds: session.technicalQuestionIds,
      technicalQuestionsAsked: session.technicalQuestionsAsked,
      isCurrentQuestionTechnical: session.isCurrentQuestionTechnical,
    };

    console.log(`[获取面试状态] 返回状态: stage=${status.interviewStage}, questions=${status.currentQuestionCount}, messages=${status.messages.length}`);

    return NextResponse.json({
      success: true,
      status,
    });
  } catch (error) {
    console.error("[获取面试状态] 错误:", error);
    return NextResponse.json(
      { success: false, error: "获取面试状态失败" },
      { status: 500 }
    );
  }
}
