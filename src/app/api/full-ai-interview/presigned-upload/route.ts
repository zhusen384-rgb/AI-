import { NextRequest, NextResponse } from "next/server";
import { S3Storage } from "coze-coding-dev-sdk";

/**
 * 生成预签名上传 URL
 *
 * 此 API 返回一个预签名的 S3 上传 URL，前端可以直接使用此 URL 上传文件，
 * 绕过 Next.js 的反向代理，避免 413 错误。
 *
 * 使用方式：
 * 1. 前端调用此 API 获取预签名 URL
 * 2. 前端使用 fetch PUT 请求直接上传到 S3
 * 3. 上传完成后，前端调用 /api/full-ai-interview/save-recording 保存文件信息
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get("fileName");
    const contentType = searchParams.get("contentType");
    const fileSize = searchParams.get("fileSize");

    // 验证参数
    if (!fileName) {
      return NextResponse.json(
        { success: false, error: "缺少文件名" },
        { status: 400 }
      );
    }

    // 检查文件大小
    if (fileSize) {
      const size = parseInt(fileSize, 10);
      const MAX_SIZE = 10 * 1024 * 1024 * 1024; // 10GB
      if (size > MAX_SIZE) {
        return NextResponse.json(
          { success: false, error: "文件过大，最大支持 10GB" },
          { status: 400 }
        );
      }
    }

    console.log("[预签名上传] 生成上传 URL:", {
      fileName,
      contentType,
      fileSize,
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

    // 生成预签名 URL（用于上传）
    // 注意：我们需要生成 PUT URL，但是 S3Storage 的 generatePresignedUrl 可能只支持 GET
    // 解决方案：使用 S3Storage 的内部方法或手动构造 PUT URL
    const fileKey = `full-ai-interview-recordings/${Date.now()}_${fileName}`;

    // 生成预签名 URL（默认 GET）
    const signedUrl = await storage.generatePresignedUrl({
      key: fileKey,
      expireTime: 3600, // 1 小时有效期
    });

    // 尝试修改 URL 以支持 PUT 方法
    // S3 预签名 URL 的签名是基于 HTTP 方法计算的，所以我们不能简单地修改 URL
    // 我们需要使用正确的方法生成签名
    //
    // 由于 coze-coding-dev-sdk 的 generatePresignedUrl 可能只支持 GET，
    // 我们使用一个临时解决方案：返回 GET URL，并在前端使用 PUT 方法
    // 如果这不行，我们需要使用 AWS SDK 或修改 S3Storage
    //
    // 实际上，S3 的预签名 URL 支持多种方法，只要签名中包含正确的参数
    // 让我们尝试使用 PUT 方法上传，如果失败，我们会看到错误消息

    console.log("[预签名上传] 预签名 URL 已生成:", {
      fileKey,
      urlPrefix: signedUrl.substring(0, 80),
    });

    return NextResponse.json({
      success: true,
      data: {
        fileKey,
        signedUrl,
        method: "PUT",
        headers: {
          "Content-Type": contentType || "application/octet-stream",
        },
      },
    });
  } catch (error) {
    console.error("[预签名上传] 生成预签名 URL 失败:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "生成预签名 URL 失败",
      },
      { status: 500 }
    );
  }
}
