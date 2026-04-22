import { NextRequest, NextResponse } from "next/server";
import { recognizeWithDoubaoAsr } from "@/lib/doubao-voice";

export const runtime = "nodejs";

type SpeechRecognitionRequestBody = {
  audioBase64?: string;
  mimeType?: string;
  uid?: string;
  fallbackTranscript?: string;
};

function stripDataUrlPrefix(value: string): string {
  const commaIndex = value.indexOf(",");
  if (value.startsWith("data:") && commaIndex >= 0) {
    return value.slice(commaIndex + 1);
  }

  return value;
}

function base64ToBuffer(base64Value: string): Buffer {
  return Buffer.from(stripDataUrlPrefix(base64Value), "base64");
}

function buildBrowserFallbackResponse(text: string, warning?: string) {
  return NextResponse.json({
    success: true,
    text,
    duration: undefined,
    provider: "browser_fallback",
    warning: warning || "语音识别服务未配置，已使用浏览器识别结果",
  });
}

export async function POST(request: NextRequest) {
  let body: SpeechRecognitionRequestBody | null = null;

  try {
    body = (await request.json()) as SpeechRecognitionRequestBody;
  } catch {
    body = null;
  }

  const audioBase64 = typeof body?.audioBase64 === "string" ? body.audioBase64.trim() : "";
  const uid = typeof body?.uid === "string" ? body.uid.trim() : "";
  const fallbackTranscript =
    typeof body?.fallbackTranscript === "string" ? body.fallbackTranscript.trim() : "";

  if (!audioBase64) {
    return NextResponse.json(
      {
        success: false,
        error: "必须提供 audioBase64 参数",
      },
      { status: 400 }
    );
  }

  try {
    let audioBuffer: Buffer | null = null;

    audioBuffer = base64ToBuffer(audioBase64);

    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error("音频数据为空");
    }

    const result = await recognizeWithDoubaoAsr({
      audio: audioBuffer,
      uid: uid || undefined,
      mimeType: typeof body?.mimeType === "string" ? body.mimeType.trim() : undefined,
    });

    return NextResponse.json({
      success: true,
      text: result.text,
      duration: result.duration,
      utterances: result.utterances,
      provider: result.provider,
      connectId: result.connectId,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "语音识别失败";

    if (fallbackTranscript) {
      return buildBrowserFallbackResponse(
        fallbackTranscript,
        errorMessage || "语音识别服务暂不可用，已使用浏览器识别结果"
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        fallbackToBrowserSpeech: true,
      },
      { status: 500 }
    );
  }
}
