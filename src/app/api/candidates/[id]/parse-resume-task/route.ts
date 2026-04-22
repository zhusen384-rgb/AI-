import { NextRequest, NextResponse } from "next/server";
import { getDb } from "coze-coding-dev-sdk";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { authenticateApi } from "@/lib/api-auth";
import { ensureCandidatesTable } from "@/lib/db/ensure-candidates-table";
import { storeResumeFile } from "@/lib/resume-storage";
import { extractResumeFromBuffer } from "@/lib/resume-extract";
import { parseResumeContent } from "@/lib/resume-parse";
import {
  extractContactInfoFromText,
  extractNameFromResumeFileName,
  normalizeResumeEmail,
  normalizeResumeName,
  normalizeResumePhone,
} from "@/lib/resume-contact-info";

interface ResumeParseResponse {
  success: boolean;
  data?: {
    basicInfo?: {
      name?: string;
      phone?: string;
      email?: string;
      gender?: string;
    };
    education?: {
      school?: string;
      major?: string;
      degree?: string;
    };
    [key: string]: unknown;
  };
  error?: string;
}

function canEditCandidate(user: { userId: string; role: string }, candidate: { createdById?: string | null }): boolean {
  if (user.role === "super_admin" || user.role === "admin") {
    return true;
  }

  return candidate.createdById === user.userId;
}

function normalizeEducationLevel(value?: string): string {
  const normalized = (value || "").trim().toLowerCase().replace(/\s+/g, "");

  if (!normalized) {
    return "";
  }
  if (normalized.includes("博士")) {
    return "博士";
  }
  if (normalized.includes("硕士") || normalized.includes("研究生")) {
    return "硕士";
  }
  if (normalized.includes("本科") || normalized.includes("学士")) {
    return "本科";
  }
  if (normalized.includes("大专") || normalized.includes("专科")) {
    return "大专";
  }
  if (normalized.includes("高中")) {
    return "高中";
  }
  if (normalized.includes("中专") || normalized.includes("中技") || normalized.includes("技校")) {
    return "中专 / 中技";
  }
  if (normalized.includes("初中") || normalized.includes("小学")) {
    return "初中及以下";
  }

  return value?.trim() || "";
}

function normalizeGender(value?: string): string {
  if (value === "男") {
    return "男";
  }
  if (value === "女") {
    return "女";
  }
  return "";
}

function mergeExtractedInfo(fileName: string, text: string, parsedData?: ResumeParseResponse["data"]) {
  const textContactInfo = extractContactInfoFromText(text, { fileName });
  const basicInfo = parsedData?.basicInfo;
  const education = parsedData?.education;

  return {
    name: normalizeResumeName(basicInfo?.name) || textContactInfo.name || extractNameFromResumeFileName(fileName),
    phone: normalizeResumePhone(basicInfo?.phone) || textContactInfo.phone,
    email: normalizeResumeEmail(basicInfo?.email) || textContactInfo.email,
    gender: normalizeGender(basicInfo?.gender),
    school: typeof education?.school === "string" ? education.school.trim() : "",
    major: typeof education?.major === "string" ? education.major.trim() : "",
    education: normalizeEducationLevel(education?.degree),
  };
}

async function processCandidateResumeInBackground(params: {
  candidateId: number;
  fileKey: string;
  fileName: string;
  downloadUrl: string;
  buffer: Buffer;
  fileType: string;
  fileSize: number;
  positionInfo: Record<string, unknown> | null;
  candidatePosition: string | null;
}) {
  const db = await getDb(schema);
  const { candidateId, fileKey, fileName, downloadUrl, buffer, fileType, fileSize, positionInfo, candidatePosition } = params;

  try {
    const extractResult = await extractResumeFromBuffer({
      buffer,
      fileName,
      fileType,
      fileSize,
      fileKey,
    });

    let parsedData: ResumeParseResponse["data"] | undefined;
    try {
      const parseResult = (await parseResumeContent({
        resumeContent: extractResult.content,
        position: positionInfo || (candidatePosition ? { title: candidatePosition } : null),
      })) as ResumeParseResponse;

      if (parseResult.success && parseResult.data) {
        parsedData = parseResult.data;
      }
    } catch (error) {
      console.error(`[Candidate Parse Task] 候选人 ${candidateId} 结构化解析失败，保留文本结果:`, error);
    }

    const mergedInfo = mergeExtractedInfo(fileName, extractResult.content, parsedData);
    const parsedAt = new Date().toISOString();

    await db
      .update(schema.candidates)
      .set({
        name: mergedInfo.name || undefined,
        gender: mergedInfo.gender || null,
        school: mergedInfo.school || null,
        major: mergedInfo.major || null,
        education: mergedInfo.education || null,
        phone: mergedInfo.phone || null,
        email: mergedInfo.email || null,
        resumeUploaded: true,
        resumeFileName: fileName,
        resumeFileKey: fileKey,
        resumeDownloadUrl: downloadUrl,
        resumeParsedData: {
          content: extractResult.content,
          parsedData: parsedData || null,
          parsedAt,
          parseStatus: "completed",
        },
        resumeUploadedAt: parsedAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.candidates.id, candidateId));
  } catch (error) {
    console.error(`[Candidate Parse Task] 候选人 ${candidateId} 后台解析失败:`, error);
    await db
      .update(schema.candidates)
      .set({
        resumeUploaded: true,
        resumeFileName: fileName,
        resumeFileKey: fileKey,
        resumeDownloadUrl: downloadUrl,
        resumeParsedData: {
          error: error instanceof Error ? error.message : "简历解析失败",
          errorAt: new Date().toISOString(),
          parseStatus: "failed",
        },
        updatedAt: new Date(),
      })
      .where(eq(schema.candidates.id, candidateId));
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateApi(request);
    if (!auth.userId || !auth.role) {
      return NextResponse.json({ error: "认证失败" }, { status: 401 });
    }

    await ensureCandidatesTable();
    const { id } = await params;
    const candidateId = parseInt(id, 10);

    if (Number.isNaN(candidateId)) {
      return NextResponse.json({ error: "候选人 ID 无效" }, { status: 400 });
    }

    const db = await getDb(schema);
    const [candidate] = await db
      .select()
      .from(schema.candidates)
      .where(eq(schema.candidates.id, candidateId));

    if (!candidate) {
      return NextResponse.json({ error: "候选人不存在" }, { status: 404 });
    }

    if (!canEditCandidate({ userId: auth.userId, role: auth.role }, candidate)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const positionInfoRaw = formData.get("positionInfo");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "缺少简历文件" }, { status: 400 });
    }

    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/rtf",
      "text/plain",
      "text/xml",
      "application/xml",
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
      return NextResponse.json({ error: "不支持的文件格式" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const { fileKey, downloadUrl } = await storeResumeFile(file.name, file.type, buffer);

    const processingAt = new Date().toISOString();
    const existingResumeParsedData =
      candidate.resumeParsedData && typeof candidate.resumeParsedData === "object"
        ? (candidate.resumeParsedData as Record<string, unknown>)
        : {};

    await db
      .update(schema.candidates)
      .set({
        resumeUploaded: true,
        resumeFileName: file.name,
        resumeFileKey: fileKey,
        resumeDownloadUrl: downloadUrl,
        resumeParsedData: {
          ...existingResumeParsedData,
          parseStatus: "processing",
          processingAt,
        },
        resumeUploadedAt: processingAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.candidates.id, candidateId));

    const positionInfo =
      typeof positionInfoRaw === "string" && positionInfoRaw.trim().length > 0
        ? (JSON.parse(positionInfoRaw) as Record<string, unknown>)
        : null;

    processCandidateResumeInBackground({
      candidateId,
      fileKey,
      fileName: file.name,
      downloadUrl,
      buffer,
      fileType: file.type,
      fileSize: file.size,
      positionInfo,
      candidatePosition: candidate.position || null,
    }).catch((error) => {
      console.error("[Candidate Parse Task] 启动后台任务失败:", error);
    });

    return NextResponse.json({
      success: true,
      data: {
        candidateId,
        fileKey,
        fileName: file.name,
        downloadUrl,
        processingAt,
      },
      message: "已启动后台简历解析",
    });
  } catch (error) {
    console.error("[Candidate Parse Task] 创建后台解析任务失败:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "创建后台解析任务失败",
      },
      { status: 500 }
    );
  }
}
