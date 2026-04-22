import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fullAiInterviewResults } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ensureFullAiInterviewResultsTable } from "@/lib/db/ensure-full-ai-interview-results-table";
import { getInterviewSession } from "@/lib/db/session-utils";

/**
 * 确认录屏上传成功
 *
 * 前端使用预签名 URL 直接上传到 S3 后，调用此 API 通知后端保存 fileKey。
 * 这个 API 会更新 fullAiInterviewResults 表中的 recordingKey 字段。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { interviewId, fileKey, fileSize, fileName } = body;

    // 验证参数
    if (!interviewId || !fileKey) {
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

    console.log("[确认上传] 开始保存 fileKey:", {
      interviewId,
      fileKey,
      fileSize,
      fileName,
      timestamp: new Date().toISOString(),
    });

    await ensureFullAiInterviewResultsTable();

    // 获取数据库实例
    const db = await getDb();

    // 更新 fullAiInterviewResults 表中的 recordingKey
    // 注意：使用 interviewId 作为查询条件
    const result = await db
      .update(fullAiInterviewResults)
      .set({
        recordingKey: fileKey,
      })
      .where(eq(fullAiInterviewResults.interviewId, interviewId))
      .returning();

    if (!result || result.length === 0) {
      console.error("[确认上传] 面试不存在:", interviewId);
      return NextResponse.json(
        { success: false, error: "面试不存在" },
        { status: 404 }
      );
    }

    console.log("[确认上传] fileKey 保存成功:", {
      interviewId,
      recordingKey: fileKey,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      data: {
        interviewId,
        recordingKey: fileKey,
      },
    });
  } catch (error) {
    console.error("[确认上传] 保存失败:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "保存失败",
      },
      { status: 500 }
    );
  }
}
