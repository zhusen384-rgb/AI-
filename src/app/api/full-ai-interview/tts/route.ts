import { NextRequest, NextResponse } from "next/server";
import { synthesizeWithDoubaoTts } from "@/lib/doubao-voice";

export const runtime = "nodejs";

type TtsSuccessResponse = {
  success: true;
  audioBase64: string;
  audioSize: number;
  audioFormat: string;
  voiceId?: string;
  provider?: string;
  connectId?: string;
};

type TtsCacheEntry = {
  expiresAt: number;
  value: TtsSuccessResponse;
};

const TTS_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_TTS_CACHE_ENTRIES = 24;
const ttsResponseCache = new Map<string, TtsCacheEntry>();
const ttsInFlightCache = new Map<string, Promise<TtsSuccessResponse>>();

function buildTtsCacheKey(text: string, voiceId?: string) {
  return `${voiceId || ""}::${text}`;
}

function getCachedTtsResponse(cacheKey: string): TtsSuccessResponse | null {
  const cachedEntry = ttsResponseCache.get(cacheKey);
  if (!cachedEntry) {
    return null;
  }

  if (cachedEntry.expiresAt <= Date.now()) {
    ttsResponseCache.delete(cacheKey);
    return null;
  }

  ttsResponseCache.delete(cacheKey);
  ttsResponseCache.set(cacheKey, cachedEntry);
  return cachedEntry.value;
}

function setCachedTtsResponse(cacheKey: string, value: TtsSuccessResponse) {
  if (ttsResponseCache.has(cacheKey)) {
    ttsResponseCache.delete(cacheKey);
  }

  ttsResponseCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + TTS_CACHE_TTL_MS,
  });

  while (ttsResponseCache.size > MAX_TTS_CACHE_ENTRIES) {
    const oldestKey = ttsResponseCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    ttsResponseCache.delete(oldestKey);
  }
}

export async function POST(request: NextRequest) {
  let text = "";
  let interviewId: string | undefined;
  let voiceId: string | undefined;

  try {
    const body = await request.json();
    text = typeof body?.text === "string" ? body.text.trim() : "";
    interviewId = typeof body?.interviewId === "string" ? body.interviewId.trim() : undefined;
    voiceId = typeof body?.voiceId === "string" ? body.voiceId.trim() : undefined;
  } catch {
    text = "";
  }

  if (!text) {
    return NextResponse.json(
      { success: false, error: "文本内容不能为空" },
      { status: 400 }
    );
  }

  try {
    const cacheKey = buildTtsCacheKey(text, voiceId);
    const cachedResponse = getCachedTtsResponse(cacheKey);
    if (cachedResponse) {
      return NextResponse.json(cachedResponse);
    }

    let inFlightRequest = ttsInFlightCache.get(cacheKey);
    if (!inFlightRequest) {
      inFlightRequest = synthesizeWithDoubaoTts({
        text,
        interviewId,
        voiceId,
      }).then((result) => {
        const payload: TtsSuccessResponse = {
          success: true,
          audioBase64: result.audioBase64,
          audioSize: result.audioSize,
          audioFormat: result.audioFormat,
          voiceId: result.voiceId,
          provider: result.provider,
          connectId: result.connectId,
        };
        setCachedTtsResponse(cacheKey, payload);
        return payload;
      });

      ttsInFlightCache.set(cacheKey, inFlightRequest);
    }

    const payload = await inFlightRequest;
    return NextResponse.json(payload);
  } catch (error) {
    const doubaoErrorMessage = error instanceof Error ? error.message : "未知错误";
    console.warn("[TTS API] 豆包 TTS 失败，直接切换浏览器朗读:", doubaoErrorMessage);

    return NextResponse.json({
      success: false,
      error: doubaoErrorMessage,
      details: {
        doubaoError: doubaoErrorMessage,
      },
      fallbackToBrowser: true,
    });
  } finally {
    if (text) {
      ttsInFlightCache.delete(buildTtsCacheKey(text, voiceId));
    }
  }
}
