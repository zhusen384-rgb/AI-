import { NextRequest, NextResponse } from "next/server";
import {
  storeResumeFile,
} from "@/lib/resume-storage";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "请选择要上传的文件" },
        { status: 400 }
      );
    }

    // 验证文件类型（支持文档和图片格式）
    const allowedTypes = [
      // 文档格式
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/rtf",
      "text/plain",
      "text/xml",
      "application/xml",
      // 图片格式
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/bmp",
      "image/webp",
      "image/svg+xml",
      "image/tiff",
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "只支持文档（PDF、Word、RTF、TXT、XML）和图片（JPEG、PNG、GIF、BMP、WebP、SVG、TIFF）格式" },
        { status: 400 }
      );
    }

    // 验证文件大小（文档最大 10MB，图片最大 20MB）
    const imageTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/bmp",
      "image/webp",
      "image/svg+xml",
      "image/tiff",
    ];
    const maxSize = imageTypes.includes(file.type) ? 20 * 1024 * 1024 : 10 * 1024 * 1024; // 图片20MB，文档10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: imageTypes.includes(file.type) ? "图片文件大小不能超过 20MB" : "文档文件大小不能超过 10MB" },
        { status: 400 }
      );
    }

    // 转换文件为 Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { fileKey, downloadUrl } = await storeResumeFile(file.name, file.type, buffer);

    return NextResponse.json({
      success: true,
      fileKey: fileKey,
      fileName: file.name,
      downloadUrl: downloadUrl,
    });
  } catch (error) {
    console.error("简历上传失败:", error);
    return NextResponse.json(
      { error: "文件上传失败，请重试" },
      { status: 500 }
    );
  }
}
