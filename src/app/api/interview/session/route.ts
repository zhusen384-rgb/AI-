import { NextRequest, NextResponse } from "next/server";
import { getInterviewSession } from "@/lib/db/session-utils";

export async function GET(request: NextRequest) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const interviewId = searchParams.get("interviewId") || searchParams.get("id");

    console.log("[获取会话] 收到请求，interviewId:", interviewId);

    if (!interviewId) {
      return NextResponse.json(
        { success: false, error: "请提供面试ID" },
        { status: 400 }
      );
    }

    // 从数据库获取会话
    const session = await getInterviewSession(interviewId);

    if (!session) {
      console.log("[获取会话] 会话不存在:", interviewId);
      return NextResponse.json(
        { success: false, error: "面试会话不存在" },
        { status: 404 }
      );
    }

    console.log("[获取会话] 成功获取会话，消息数量:", session.messages?.length || 0);
    
    // 输出消息详情（仅前3条）
    if (session.messages && session.messages.length > 0) {
      console.log("[获取会话] 消息预览:");
      session.messages.slice(0, 3).forEach((msg: any, i: number) => {
        console.log(`  [${i}] ${msg.role}: ${msg.content?.substring(0, 50)}...`);
      });
    }

    return NextResponse.json({
      success: true,
      session: session
    });
  } catch (error) {
    console.error("[获取会话] 获取会话失败:", error);
    return NextResponse.json(
      { success: false, error: "获取会话失败" },
      { status: 500 }
    );
  }
}
