import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { S3Storage } from "coze-coding-dev-sdk";
import { getDb } from "@/lib/db";
import { fullAiInterviewResults } from "@/lib/db/schema";
import { ensureFullAiInterviewResultsTable } from "@/lib/db/ensure-full-ai-interview-results-table";

/**
 * 下载录屏文件
 *
 * 通过后端代理下载，添加正确的 Content-Type 和 Content-Disposition 头部。
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

    console.log("[下载录屏] 开始下载:", {
      interviewId,
      key,
      timestamp: new Date().toISOString(),
    });

    const storage = new S3Storage();

    const downloadUrl = await storage.generatePresignedUrl({
      key,
      expireTime: 3600, // 1 小时
    });

    console.log("[下载录屏] 预签名 URL 生成成功:", {
      interviewId,
      key,
      urlPrefix: downloadUrl.substring(0, 80) + "...",
      timestamp: new Date().toISOString(),
    });

    const response = await fetch(downloadUrl);

    if (!response.ok) {
      console.error("[下载录屏] 下载失败:", response.status, response.statusText);
      return NextResponse.json(
        { error: "下载文件失败" },
        { status: response.status }
      );
    }

    const buffer = await response.arrayBuffer();

    console.log("[下载录屏] 文件下载成功:", {
      interviewId,
      key,
      fileSize: buffer.byteLength,
      timestamp: new Date().toISOString(),
    });

    const originalFileName = key.split('/').pop() || 'recording.webm';
    const fileExtension = originalFileName.split('.').pop()?.toLowerCase() || 'webm';

    const getContentType = (ext: string) => {
      if (ext === 'mp4') return 'video/mp4';
      if (ext === 'webm') return 'video/webm';
      return 'video/webm';
    };
    const contentType = getContentType(fileExtension);

    const uint8Array = new Uint8Array(buffer);
    const headerBytes = uint8Array.slice(0, 12);
    const header = Array.from(headerBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    console.log("[下载录屏] 文件头部（前12字节）:", header);

    if (fileExtension === 'webm' && !header.startsWith('1a45dfa3')) {
      console.error("[下载录屏] ⚠️ 警告：WebM 文件头部不正确，文件可能损坏");
    } else if (fileExtension === 'mp4' && !header.startsWith('000000')) {
      console.error("[下载录屏] ⚠️ 警告：MP4 文件头部不正确，文件可能损坏");
    } else {
      console.log("[下载录屏] ✅ 文件头部验证通过");
    }

    console.log("[下载录屏] 文件信息:", {
      originalFileName,
      fileExtension,
      contentType,
      fileSize: buffer.byteLength,
    });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(originalFileName)}"`,
        'Content-Length': buffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error("[下载录屏] 下载失败:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "下载失败",
      },
      { status: 500 }
    );
  }
}
