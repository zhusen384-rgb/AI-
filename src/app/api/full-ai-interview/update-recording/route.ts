import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fullAiInterviewResults } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ensureFullAiInterviewResultsTable } from "@/lib/db/ensure-full-ai-interview-results-table";
import { getInterviewSession } from "@/lib/db/session-utils";

export async function POST(request: NextRequest) {
  try {
    const { interviewId, recordingKey, recordingUrl } = await request.json();

    if (!interviewId || !recordingKey || !recordingUrl) {
      return NextResponse.json(
        { success: false, error: "缺少必要参数" },
        { status: 400 }
      );
    }

    const session = await getInterviewSession(interviewId);
    if (!session) {
      return NextResponse.json(
        { success: false, error: "面试会话不存在" },
        { status: 404 }
      );
    }

    console.log("[更新录屏] 开始更新录屏信息:", { interviewId, recordingKey });

    await ensureFullAiInterviewResultsTable();

    // 获取数据库实例
    const db = await getDb();

    // 更新数据库中的录屏信息
    const result = await db
      .update(fullAiInterviewResults)
      .set({
        recordingKey: recordingKey,
        recordingUrl: recordingUrl,
      })
      .where(eq(fullAiInterviewResults.interviewId, interviewId))
      .returning();

    console.log("[更新录屏] 更新成功，影响行数:", result.length);

    return NextResponse.json({
      success: true,
      result: result[0],
    });
  } catch (error) {
    console.error("[更新录屏] 更新失败:", error);
    return NextResponse.json(
      { success: false, error: "更新录屏信息失败" },
      { status: 500 }
    );
  }
}
