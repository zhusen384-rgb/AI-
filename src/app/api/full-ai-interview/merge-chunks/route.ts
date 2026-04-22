import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { S3Storage } from "coze-coding-dev-sdk";
import { getInterviewSession } from "@/lib/db/session-utils";

/**
 * 合并录屏分块并上传到对象存储
 *
 * 前端上传完所有分块后，调用此 API 合并分块并上传到 S3。
 */

// 临时文件存储目录
const TEMP_DIR = "/tmp/interview-recordings";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { interviewId, totalChunks, fileName, contentType } = body;

    // 验证参数
    if (!interviewId || !totalChunks || !fileName) {
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

    console.log("[合并分块] 开始合并:", {
      interviewId,
      totalChunks,
      fileName,
      contentType,
      timestamp: new Date().toISOString(),
    });

    // 合并所有分块
    const mergedFilePath = path.join(TEMP_DIR, `${interviewId}_merged.webm`);

    // 使用更可靠的方式合并：先读取所有分块，再一次性写入
    console.log("[合并分块] 开始读取所有分块...");
    const chunks: Buffer[] = [];
    let totalReadSize = 0;

    for (let i = 0; i < totalChunks; i++) {
      // 使用 padded chunkIndex，确保按字典序排序正确
      const chunkIndexPadded = i.toString().padStart(6, '0');
      const chunkFilePath = path.join(TEMP_DIR, `${interviewId}_${chunkIndexPadded}.chunk`);

      try {
        const chunkBuffer = await fs.readFile(chunkFilePath);
        if (chunkBuffer.length === 0) {
          console.error(`[合并分块] ⚠️ 警告：分块 ${i} 的大小为 0，跳过`);
          continue;
        }
        chunks.push(chunkBuffer);
        totalReadSize += chunkBuffer.length;
        console.log(`[合并分块] 已读取分块 ${i + 1}/${totalChunks} (${chunkIndexPadded}), 大小: ${chunkBuffer.length} bytes, 累计: ${totalReadSize} bytes`);

        // 删除分块文件
        await fs.unlink(chunkFilePath);
      } catch (error) {
        console.error(`[合并分块] 读取分块 ${i} 失败:`, error);
        throw new Error(`合并分块失败: 分块 ${i} 不存在`);
      }
    }

    console.log(`[合并分块] 所有分块已读取，总大小: ${totalReadSize} bytes，分块数: ${chunks.length}/${totalChunks}`);

    // 合并所有分块
    const mergedBuffer = Buffer.concat(chunks);
    console.log("[合并分块] 合并完成，总大小:", mergedBuffer.length, "bytes");

    // 验证合并后的文件头部（WebM 文件以 1a45dfa3 开头）
    const header = mergedBuffer.slice(0, 4).toString('hex');
    console.log("[合并分块] 文件头部（前 4 字节）:", header);

    // 验证文件尾部（WebM 文件应该有结束标记）
    const tail = mergedBuffer.slice(-4).toString('hex');
    console.log("[合并分块] 文件尾部（后 4 字节）:", tail);

    if (header !== '1a45dfa3') {
      console.error("[合并分块] ❌ 错误：文件头部不正确，WebM 文件应该以 1a45dfa3 开头");
      console.error("[合并分块] 实际文件内容（前 32 字节）:", mergedBuffer.slice(0, 32).toString('hex'));
      throw new Error("合并后的文件头部不正确，文件可能已损坏");
    }

    // 写入合并后的文件
    await fs.writeFile(mergedFilePath, mergedBuffer);
    console.log("[合并分块] 已写入文件:", mergedFilePath);

    // 获取合并后文件的大小
    const stats = await fs.stat(mergedFilePath);
    console.log("[合并分块] 合并后文件大小:", stats.size, "bytes");

    // 初始化 S3Storage
    const storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: "",
      secretKey: "",
      bucketName: process.env.COZE_BUCKET_NAME,
      region: "cn-beijing",
    });

    // 生成文件名
    const s3FileName = `full-ai-interview-recordings/${Date.now()}_${fileName}`;

    // 分块上传到 S3（5MB 分块）
    const CHUNK_SIZE = 5 * 1024 * 1024;

    async function* chunkGenerator() {
      const totalChunks = Math.ceil(mergedBuffer.length / CHUNK_SIZE);
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, mergedBuffer.length);
        const chunk = mergedBuffer.slice(start, end);
        console.log(`[上传S3] 上传分块 ${i + 1}/${totalChunks}, 大小: ${chunk.length} bytes, 起始位置: ${start}, 结束位置: ${end}`);
        yield chunk;
      }
      console.log(`[上传S3] 所有分块已生成，总大小: ${mergedBuffer.length} bytes, 总分块数: ${totalChunks}`);
    }

    // 使用分块上传到对象存储
    // 使用前端传递的 Content-Type，确保文件格式正确
    const uploadContentType = contentType || "video/webm";
    const fileKey = await storage.chunkUploadFile({
      chunks: chunkGenerator(),
      fileName: s3FileName,
      contentType: uploadContentType,
    });
    console.log("[合并分块] 使用的 Content-Type:", uploadContentType);
    console.log("[合并分块] 文件名:", s3FileName);

    console.log("[合并分块] 上传到 S3 成功:", {
      fileKey,
      fileSize: stats.size,
      timestamp: new Date().toISOString(),
    });

    // 删除合并后的临时文件
    await fs.unlink(mergedFilePath);
    console.log("[合并分块] 已删除临时文件:", mergedFilePath);

    return NextResponse.json({
      success: true,
      data: {
        fileKey,
        fileSize: stats.size,
        fileName: fileName,
      },
    });
  } catch (error) {
    console.error("[合并分块] 合并失败:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "合并失败",
      },
      { status: 500 }
    );
  }
}
