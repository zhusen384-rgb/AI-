import { NextRequest, NextResponse } from "next/server";
import {
  createResumeStorageClient,
  getResumeContentType,
  isCloudResumeStorageConfigured,
  isLocalResumeFileKey,
  readLocalResumeFile,
} from "@/lib/resume-storage";
const storage = createResumeStorageClient();

/**
 * 下载简历文件 API
 * 通过后端代理下载，解决跨域问题
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileKey = searchParams.get("fileKey");
    const fileName = searchParams.get("fileName");

    if (!fileKey) {
      return NextResponse.json(
        { error: "缺少文件标识" },
        { status: 400 }
      );
    }

    console.log(`[下载简历] 开始下载: fileKey=${fileKey}, fileName=${fileName}`);

    if (isLocalResumeFileKey(fileKey)) {
      const buffer = await readLocalResumeFile(fileKey);
      const downloadFileName = fileName || fileKey.split("/").pop() || "resume";
      const contentType = getResumeContentType(downloadFileName);
      const body = new Uint8Array(buffer);

      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(downloadFileName)}`,
          "Content-Length": buffer.length.toString(),
        },
      });
    }

    if (!isCloudResumeStorageConfigured()) {
      return NextResponse.json(
        { error: "对象存储未配置，无法下载该简历文件" },
        { status: 500 }
      );
    }

    // 生成预签名 URL
    const presignedUrl = await storage.generatePresignedUrl({
      key: fileKey,
      expireTime: 300, // 5 分钟有效
    });

    // 通过后端代理下载文件
    const response = await fetch(presignedUrl);

    if (!response.ok) {
      console.error(`[下载简历] 下载失败: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: "文件下载失败" },
        { status: 500 }
      );
    }

    // 获取文件内容
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 获取 Content-Type
    const contentType = response.headers.get("content-type") || "application/octet-stream";

    // 确定下载文件名
    const downloadFileName = fileName || fileKey.split("/").pop() || "resume";

    console.log(`[下载简历] 下载成功: ${downloadFileName}, size=${buffer.length}bytes`);

    // 返回文件
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(downloadFileName)}`,
        "Content-Length": buffer.length.toString(),
      },
    });

  } catch (error) {
    console.error("[下载简历] 错误:", error);
    return NextResponse.json(
      { error: "下载文件失败，请重试" },
      { status: 500 }
    );
  }
}
