import { NextRequest, NextResponse } from "next/server";
import { storeResumeFile } from "@/lib/resume-storage";
import { extractResumeFromBuffer } from "@/lib/resume-extract";
import { parseResumeContent } from "@/lib/resume-parse";

interface ResumeParseResponse {
  success: boolean;
  data?: {
    basicInfo?: {
      name?: string;
      phone?: string;
      email?: string;
    };
    [key: string]: unknown;
  };
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const candidateId = formData.get("candidateId") as string;
    const position = formData.get("position") as string;

    if (!file) {
      return NextResponse.json(
        { error: "请选择要上传的文件" },
        { status: 400 }
      );
    }

    if (!candidateId) {
      return NextResponse.json(
        { error: "缺少候选人 ID" },
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

    console.log(`[Reparse Resume] 开始处理候选人 ${candidateId} 的简历重新解析`);

    // 步骤 1: 上传文件到对象存储
    console.log(`[Reparse Resume] 步骤 1: 上传文件到对象存储...`);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const { fileKey, downloadUrl } = await storeResumeFile(file.name, file.type, buffer);

    console.log(`[Reparse Resume] 文件上传成功: ${fileKey}`);

    // 步骤 2: 统一走现有简历提取链路
    console.log(`[Reparse Resume] 步骤 2: 调用统一简历提取链路...`);
    const extractResult = await extractResumeFromBuffer({
      buffer,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      fileKey,
    });

    console.log(`[Reparse Resume] 简历文本提取成功，内容长度: ${extractResult.content.length}`);

    // 步骤 3: 统一走现有结构化解析链路
    console.log(`[Reparse Resume] 步骤 3: 调用统一简历结构化解析链路...`);
    const parseResult = (await parseResumeContent({
      resumeContent: extractResult.content,
      position,
    })) as ResumeParseResponse;
    if (!parseResult.success || !parseResult.data) {
      throw new Error((parseResult as { error?: string }).error || "简历结构化解析失败");
    }

    const parsedData = {
      ...parseResult.data,
      basicInfo: {
        ...parseResult.data.basicInfo,
        name: parseResult.data.basicInfo?.name || extractResult.detectedInfo?.name || "",
        phone: parseResult.data.basicInfo?.phone || extractResult.detectedInfo?.phone || "",
        email: parseResult.data.basicInfo?.email || extractResult.detectedInfo?.email || "",
      },
    };

    // 返回结果
    return NextResponse.json({
      success: true,
      fileKey: fileKey,
      fileName: file.name,
      downloadUrl,
      parsedData: {
        content: extractResult.content,
        parsedData: parsedData,
        parsedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error(`[Reparse Resume] 简历重新解析失败:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "简历重新解析失败",
      },
      { status: 500 }
    );
  }
}
