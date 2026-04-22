import { NextRequest, NextResponse } from "next/server";
import { authenticateApi, isAuthError } from "@/lib/api-auth";
import {
  INTERVIEWER_VOICE_OPTIONS,
  getInterviewerVoiceOption,
} from "@/lib/interviewer-voice";
import {
  getGlobalInterviewerVoiceSettings,
  updateGlobalInterviewerVoiceSettings,
} from "@/lib/interviewer-voice-settings";

export async function GET(request: NextRequest) {
  try {
    const payload = await authenticateApi(request);

    const settings = await getGlobalInterviewerVoiceSettings();

    return NextResponse.json({
      success: true,
      data: {
        voiceId: settings.voiceId,
        voice: getInterviewerVoiceOption(settings.voiceId),
        options: INTERVIEWER_VOICE_OPTIONS,
        ...(payload.role === "super_admin"
          ? { ttsSettings: settings.ttsSettings }
          : {}),
      },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    console.error("[interviewer-voice GET] 获取全局音色失败:", error);
    return NextResponse.json(
      { success: false, error: "获取全局音色失败" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const payload = await authenticateApi(request);

    if (payload.role !== "super_admin") {
      return NextResponse.json(
        { success: false, error: "仅超级管理员可以修改 AI 面试官音色" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const savedSettings = await updateGlobalInterviewerVoiceSettings(
      {
        voiceId: body?.voiceId,
        ttsSettings: body?.ttsSettings,
      },
      payload.userId
    );

    return NextResponse.json({
      success: true,
      data: {
        voiceId: savedSettings.voiceId,
        voice: getInterviewerVoiceOption(savedSettings.voiceId),
        ttsSettings: savedSettings.ttsSettings,
      },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    console.error("[interviewer-voice PUT] 更新全局音色失败:", error);
    return NextResponse.json(
      { success: false, error: "更新全局音色失败" },
      { status: 500 }
    );
  }
}
