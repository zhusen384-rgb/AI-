import { NextRequest, NextResponse } from "next/server";
import { S3Storage } from "coze-coding-dev-sdk";
import { Readable } from "stream";
import { getInterviewSession } from "@/lib/db/session-utils";

/**
 * 上传录屏文件到对象存储（分块上传）
 *
 * 此 API 接收前端上传的录屏文件，并使用 S3Storage.chunkUploadFile 分块上传到对象存储。
 * 分块上传可以减少内存占用，避免大文件一次性加载到内存。
 *
 * 使用方式：
 * 1. 前端使用 FormData 上传文件
 * 2. 后端接收文件并切分为多个 chunk
 * 3. 使用 S3Storage.chunkUploadFile 分块上传到对象存储
 * 4. 返回上传后的 fileKey
 */
export async function POST(request: NextRequest) {
  try {
    // 解析 FormData
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const interviewId = formData.get('interviewId') as string;
    const contentType = formData.get('contentType') as string;

    // 验证参数
    if (!file) {
      return NextResponse.json(
        { success: false, error: "缺少文件" },
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

    console.log("[录屏上传] 开始分块上传:", {
      fileName: file.name,
      fileSize: file.size,
      contentType: contentType,
      interviewId,
      timestamp: new Date().toISOString(),
    });

    // 初始化 S3Storage
    const storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: "",
      secretKey: "",
      bucketName: process.env.COZE_BUCKET_NAME,
      region: "cn-beijing",
    });

    // 生成文件名
    const fileName = `full-ai-interview-recordings/${Date.now()}_${file.name}`;

    // 转换 File 为 Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 分块大小：5MB
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

    // 创建分块生成器
    async function* chunkGenerator() {
      let offset = 0;
      while (offset < buffer.length) {
        const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
        console.log(`[录屏上传] 生成 chunk ${offset / CHUNK_SIZE + 1}, 大小: ${chunk.length} bytes`);
        yield chunk;
        offset += CHUNK_SIZE;
      }
    }

    // 使用分块上传到对象存储
    const fileKey = await storage.chunkUploadFile({
      chunks: chunkGenerator(),
      fileName: fileName,
      contentType: contentType || file.type,
    });

    console.log("[录屏上传] 分块上传成功:", {
      fileKey,
      fileSize: file.size,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      data: {
        fileKey,
        fileSize: file.size,
        fileName: file.name,
      },
    });
  } catch (error) {
    console.error("[录屏上传] 上传失败:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "上传失败",
      },
      { status: 500 }
    );
  }
}
