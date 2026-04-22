import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getInterviewSession } from "@/lib/db/session-utils";

/**
 * 上传录屏文件的分块
 *
 * 前端将大文件切分为多个块，依次上传到这里。
 * 后端将每个块保存到临时目录。
 */

// 临时文件存储目录
const TEMP_DIR = "/tmp/interview-recordings";

export async function POST(request: NextRequest) {
  try {
    // 确保临时目录存在
    await fs.mkdir(TEMP_DIR, { recursive: true });

    // 解析 FormData
    const formData = await request.formData();
    const chunk = formData.get('chunk') as File;
    const chunkIndex = parseInt(formData.get('chunkIndex') as string);
    const totalChunks = parseInt(formData.get('totalChunks') as string);
    const interviewId = formData.get('interviewId') as string;

    // 验证参数
    if (!chunk) {
      return NextResponse.json(
        { success: false, error: "缺少分块数据" },
        { status: 400 }
      );
    }

    if (!interviewId) {
      return NextResponse.json(
        { success: false, error: "缺少 interviewId" },
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

    console.log("[上传分块] 收到分块:", {
      interviewId,
      chunkIndex,
      totalChunks,
      chunkSize: chunk.size,
      chunkType: chunk.type,
      chunkName: chunk.name,
      timestamp: new Date().toISOString(),
    });

    // 保存分块到临时文件（使用 padded chunkIndex，确保按字典序排序正确）
    const chunkIndexPadded = chunkIndex.toString().padStart(6, '0');
    const chunkFileName = `${interviewId}_${chunkIndexPadded}.chunk`;
    const chunkFilePath = path.join(TEMP_DIR, chunkFileName);

    // 将 File 转换为 Buffer
    const arrayBuffer = await chunk.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 打印分块的前 8 字节（用于调试）
    const first8Bytes = buffer.slice(0, 8).toString('hex');
    const last8Bytes = buffer.slice(-8).toString('hex');
    console.log(`[上传分块] 分块 ${chunkIndex} 头部（前 8 字节）: ${first8Bytes}`);
    console.log(`[上传分块] 分块 ${chunkIndex} 尾部（后 8 字节）: ${last8Bytes}`);

    // 写入文件
    await fs.writeFile(chunkFilePath, buffer);

    // 验证写入的文件大小
    const stats = await fs.stat(chunkFilePath);
    console.log("[上传分块] 分块已保存:", {
      chunkFilePath,
      originalSize: chunk.size,
      writtenSize: stats.size,
      match: chunk.size === stats.size,
    });

    return NextResponse.json({
      success: true,
      chunkIndex,
      message: `分块 ${chunkIndex}/${totalChunks} 上传成功`,
    });
  } catch (error) {
    console.error("[上传分块] 上传失败:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "上传失败",
      },
      { status: 500 }
    );
  }
}
