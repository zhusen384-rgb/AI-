import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { S3Storage } from "coze-coding-dev-sdk";
import { getDb } from "@/lib/db";
import { fullAiInterviewResults } from "@/lib/db/schema";
import { ensureFullAiInterviewResultsTable } from "@/lib/db/ensure-full-ai-interview-results-table";

/**
 * 获取录屏文件的签名 URL
 *
 * 用于在面试报告中预览和下载录屏文件。
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");
    const interviewId = searchParams.get("interviewId");

    if (!key || !interviewId) {
      return NextResponse.json(
        { error: "请提供 interviewId 和文件 key" },
        { status: 400 }
      );
    }

    await ensureFullAiInterviewResultsTable();
    const db = await getDb();
    const [result] = await db
      .select()
      .from(fullAiInterviewResults)
      .where(and(
        eq(fullAiInterviewResults.interviewId, interviewId),
        eq(fullAiInterviewResults.recordingKey, key)
      ))
      .limit(1);

    if (!result) {
      return NextResponse.json(
        { error: "录屏不存在或无权访问" },
        { status: 404 }
      );
    }

    console.log("[获取录屏URL] 开始生成签名 URL:", {
      interviewId,
      key,
      timestamp: new Date().toISOString(),
    });

    const storage = new S3Storage();

    const downloadUrl = await storage.generatePresignedUrl({
      key,
      expireTime: 604800, // 7 天
    });

    console.log("[获取录屏URL] 签名 URL 生成成功:", {
      interviewId,
      key,
      urlPrefix: downloadUrl.substring(0, 80) + "...",
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      data: {
        url: downloadUrl,
        key,
      },
    });
  } catch (error) {
    console.error("[获取录屏URL] 生成签名 URL 失败:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "生成签名 URL 失败",
      },
      { status: 500 }
    );
  }
}
