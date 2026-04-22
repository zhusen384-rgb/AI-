import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fullAiInterviewConfigs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { authenticateApi, isAuthError } from "@/lib/api-auth";
import { ensureFullAiInterviewConfigsTable } from "@/lib/db/ensure-full-ai-interview-configs-table";
import { buildTenantUserFilter } from "@/lib/tenant-filter";
import {
  getGlobalInterviewerVoiceSetting,
  updateGlobalInterviewerVoiceSetting,
} from "@/lib/interviewer-voice-settings";
import {
  DEFAULT_INTERVIEWER_VOICE_ID,
  normalizeInterviewerVoiceId,
} from "@/lib/interviewer-voice";

interface MemoryInterviewConfig {
  candidateName: string;
  mode: string;
  position: string;
  resume?: string;
  interviewTime?: string;
  interviewerVoice?: string;
  tenantId?: string | null;
  userId?: string | null;
  createdAt: Date;
}

type SaveConfigListItem = {
  linkId: string;
  candidateName: string;
  mode: string;
  position: string;
  resumeLength: number;
  interviewTime?: string;
  interviewerVoice?: string;
  createdAt: Date;
};

type InterviewConfigGlobal = typeof globalThis & {
  interviewConfigs?: Map<string, MemoryInterviewConfig>;
};

const interviewConfigGlobal = global as InterviewConfigGlobal;

// 保留内存存储作为备用（用于向后兼容）
if (!interviewConfigGlobal.interviewConfigs) {
  interviewConfigGlobal.interviewConfigs = new Map();
}

function getInterviewConfigStore(): Map<string, MemoryInterviewConfig> {
  if (!interviewConfigGlobal.interviewConfigs) {
    interviewConfigGlobal.interviewConfigs = new Map();
  }

  return interviewConfigGlobal.interviewConfigs;
}

interface SaveInterviewConfigRequest {
  interviewId: string;
  candidateName: string;
  mode: string;
  position: string;
  resume?: string;
  interviewTime?: string;
  interviewerVoice?: string;
}

export async function POST(request: NextRequest) {
  // 在 try 块外解析 body，避免 catch 中重复读取
  let requestBody: SaveInterviewConfigRequest | null = null;
  let authPayload: Awaited<ReturnType<typeof authenticateApi>> | null = null;
  
  try {
    authPayload = await authenticateApi(request);
    console.log(`[save-config POST] 用户已认证: userId=${authPayload.userId}`);

    const parsedBody = (await request.json()) as SaveInterviewConfigRequest;
    requestBody = parsedBody;
    const { interviewId, candidateName, mode, position, resume, interviewTime, interviewerVoice } = parsedBody;
    const normalizedInterviewId = interviewId?.trim();
    const normalizedCandidateName = candidateName?.trim();
    const normalizedMode = mode?.trim();
    const normalizedPosition = position?.trim();
    const normalizedResume = resume ?? "";
    const requestedVoice = typeof interviewerVoice === "string" ? interviewerVoice.trim() : "";

    console.log(`[save-config POST] 收到保存请求: interviewId=${normalizedInterviewId}, candidateName=${normalizedCandidateName}, mode=${normalizedMode}, position=${normalizedPosition}`);
    console.log(`[save-config POST] 简历长度: ${normalizedResume.length || 0}, 面试时间: ${interviewTime || '未设置'}`);

    if (!normalizedInterviewId || !normalizedCandidateName || !normalizedMode || !normalizedPosition) {
      return NextResponse.json(
        { error: "请提供完整的面试配置信息" },
        { status: 400 }
      );
    }

    await ensureFullAiInterviewConfigsTable();

    let effectiveInterviewerVoice = DEFAULT_INTERVIEWER_VOICE_ID;
    try {
      effectiveInterviewerVoice = await getGlobalInterviewerVoiceSetting();
      if (authPayload.role === "super_admin" && requestedVoice) {
        effectiveInterviewerVoice = await updateGlobalInterviewerVoiceSetting(
          normalizeInterviewerVoiceId(requestedVoice),
          authPayload.userId
        );
      }
    } catch (voiceError) {
      console.error("[save-config POST] 获取全局音色失败，回退默认配置:", voiceError);
      if (authPayload.role === "super_admin" && requestedVoice) {
        effectiveInterviewerVoice = normalizeInterviewerVoiceId(requestedVoice);
      }
    }

    // 获取数据库实例
    const db = await getDb();

    // 检查配置是否已存在
    const existingConfig = await db
      .select()
      .from(fullAiInterviewConfigs)
      .where(eq(fullAiInterviewConfigs.linkId, normalizedInterviewId))
      .limit(1);

    const now = new Date();

    if (existingConfig && existingConfig.length > 0) {
      // 更新现有配置
      await db
        .update(fullAiInterviewConfigs)
        .set({
          candidateName: normalizedCandidateName,
          mode: normalizedMode,
          position: normalizedPosition,
          resume: normalizedResume,
          interviewTime: interviewTime ? new Date(interviewTime) : null,
          interviewerVoice: effectiveInterviewerVoice,
          tenantId: authPayload.tenantId,
          userId: authPayload.userId,
          updatedAt: now,
        })
        .where(eq(fullAiInterviewConfigs.linkId, normalizedInterviewId));

      console.log(`[save-config POST] 配置已更新: linkId=${normalizedInterviewId}`);
    } else {
      // 创建新配置
      await db.insert(fullAiInterviewConfigs).values({
        linkId: normalizedInterviewId,
        candidateName: normalizedCandidateName,
        mode: normalizedMode,
        position: normalizedPosition,
        resume: normalizedResume,
        interviewTime: interviewTime ? new Date(interviewTime) : null,
        interviewerVoice: effectiveInterviewerVoice,
        tenantId: authPayload.tenantId,
        userId: authPayload.userId,
        createdAt: now,
        updatedAt: now,
      });

      console.log(`[save-config POST] 新配置已创建: linkId=${normalizedInterviewId}`);
    }

    // 同时保存到内存中（向后兼容）
    getInterviewConfigStore().set(normalizedInterviewId, {
      candidateName: normalizedCandidateName,
      mode: normalizedMode,
      position: normalizedPosition,
      resume: normalizedResume,
      interviewTime,
      interviewerVoice: effectiveInterviewerVoice,
      tenantId: authPayload.tenantId,
      userId: authPayload.userId,
      createdAt: now,
    });

    return NextResponse.json({
      success: true,
      interviewId: normalizedInterviewId,
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    console.error("[save-config POST] 保存面试配置失败:", error);

    // 数据库失败时，至少保存到内存
    if (requestBody) {
      const { interviewId, candidateName, mode, position, resume, interviewTime, interviewerVoice } = requestBody;
      let fallbackVoice = DEFAULT_INTERVIEWER_VOICE_ID;
      try {
        fallbackVoice =
          typeof interviewerVoice === "string" && interviewerVoice.trim()
            ? normalizeInterviewerVoiceId(interviewerVoice)
            : await getGlobalInterviewerVoiceSetting();
      } catch (voiceError) {
        console.error("[save-config POST] 回退读取全局音色失败，使用默认音色:", voiceError);
        if (typeof interviewerVoice === "string" && interviewerVoice.trim()) {
          fallbackVoice = normalizeInterviewerVoiceId(interviewerVoice);
        }
      }
      getInterviewConfigStore().set(interviewId, {
        candidateName,
        mode,
        position,
        resume,
        interviewTime,
        interviewerVoice: fallbackVoice,
        tenantId: authPayload?.tenantId,
        userId: authPayload?.userId,
        createdAt: new Date(),
      });

      console.log("[save-config POST] 已回退到内存存储");

      return NextResponse.json(
        { success: true, interviewId, warning: "已保存到内存（数据库不可用）" },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { success: false, error: "保存失败" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const interviewId = searchParams.get("id");
    const listAll = searchParams.get("list") === "true";

    // 如果请求列出所有配置（用于调试）
      if (listAll) {
      const payload = await authenticateApi(request);
      console.log(`[save-config GET] 用户已认证: userId=${payload.userId}`);

      try {
        await ensureFullAiInterviewConfigsTable();
        const db = await getDb();
        const tenantUserFilter = buildTenantUserFilter(payload, fullAiInterviewConfigs);
        let query = db
          .select({
            linkId: fullAiInterviewConfigs.linkId,
            candidateName: fullAiInterviewConfigs.candidateName,
            mode: fullAiInterviewConfigs.mode,
            position: fullAiInterviewConfigs.position,
            resumeLength: fullAiInterviewConfigs.resume,
            interviewTime: fullAiInterviewConfigs.interviewTime,
            interviewerVoice: fullAiInterviewConfigs.interviewerVoice,
            createdAt: fullAiInterviewConfigs.createdAt,
          })
          .from(fullAiInterviewConfigs);

        if (tenantUserFilter) {
          query = query.where(tenantUserFilter) as typeof query;
        }

        const configs = await query.orderBy(fullAiInterviewConfigs.createdAt);

        const formattedConfigs = configs.map(c => ({
          ...c,
          resumeLength: c.resumeLength?.length || 0,
        }));

        console.log(`[save-config GET] 从数据库获取所有配置，共 ${formattedConfigs.length} 条`);

        return NextResponse.json({
          success: true,
          total: formattedConfigs.length,
          configs: formattedConfigs,
        });
      } catch (dbError) {
        console.error("[save-config GET] 数据库查询失败，回退到内存:", dbError);

        // 回退到内存
        const configs: SaveConfigListItem[] = [];
        interviewConfigGlobal.interviewConfigs?.forEach((config, id) => {
          configs.push({
            linkId: id,
            candidateName: config.candidateName,
            mode: config.mode,
            position: config.position,
            resumeLength: config.resume?.length || 0,
            interviewTime: config.interviewTime,
            interviewerVoice: config.interviewerVoice,
            createdAt: config.createdAt,
          });
        });

        return NextResponse.json({
          success: true,
          total: configs.length,
          configs,
          warning: "使用内存数据（数据库不可用）",
        });
      }
    }

    if (!interviewId) {
      return NextResponse.json(
        { error: "请提供面试ID" },
        { status: 400 }
      );
    }

    console.log(`[save-config GET] 公开读取配置: interviewId=${interviewId}`);

    // 先尝试从数据库获取
    try {
      await ensureFullAiInterviewConfigsTable();
      const db = await getDb();
      const configs = await db
        .select()
        .from(fullAiInterviewConfigs)
        .where(eq(fullAiInterviewConfigs.linkId, interviewId))
        .limit(1);

      if (configs && configs.length > 0) {
        const globalVoice = await getGlobalInterviewerVoiceSetting().catch(() => DEFAULT_INTERVIEWER_VOICE_ID);
        console.log(`[save-config GET] 从数据库获取配置成功: interviewId=${interviewId}`);
        return NextResponse.json({
          success: true,
          config: {
            ...configs[0],
            interviewerVoice: configs[0].interviewerVoice || globalVoice,
          },
        });
      }
    } catch (dbError) {
      console.error("[save-config GET] 数据库查询失败，回退到内存:", dbError);
    }

    // 回退到内存中获取（向后兼容）
    const memoryConfig = interviewConfigGlobal.interviewConfigs?.get(interviewId);
    if (memoryConfig) {
      const globalVoice = await getGlobalInterviewerVoiceSetting().catch(() => DEFAULT_INTERVIEWER_VOICE_ID);
      console.log(`[save-config GET] 从内存中找到配置: interviewId=${interviewId}`);
      return NextResponse.json({
        success: true,
        config: {
          ...memoryConfig,
          interviewerVoice: memoryConfig.interviewerVoice || globalVoice,
        },
        warning: "使用内存数据（数据库不可用）",
      });
    }

    console.log(`[save-config GET] 配置不存在: interviewId=${interviewId}`);
    return NextResponse.json(
      { error: "面试配置不存在" },
      { status: 404 }
    );
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    console.error("[save-config GET] 获取面试配置失败:", error);
    return NextResponse.json(
      { error: "获取面试配置失败" },
      { status: 500 }
    );
  }
}
