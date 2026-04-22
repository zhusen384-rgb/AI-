import type { RawData } from "ws";
import { gzipSync, gunzipSync } from "zlib";
import { randomUUID } from "crypto";
import { getInterviewerVoiceOption } from "@/lib/interviewer-voice";

const DEFAULT_ASR_ENDPOINT = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream";
const DEFAULT_ASR_RESOURCE_ID = "volc.seedasr.sauc.duration";
const DEFAULT_TTS_ENDPOINT = "wss://openspeech.bytedance.com/api/v3/tts/bidirection";
const DEFAULT_TTS_RESOURCE_ID = "seed-tts-2.0";
const DEFAULT_TTS_AUDIO_FORMAT = "mp3";
const DEFAULT_TTS_SAMPLE_RATE = 24000;
const DEFAULT_TTS_BIT_RATE = 64000;
const DEFAULT_TIMEOUT_MS = 45000;

type VoiceRuntimeKind = "asr" | "tts";

type AsrAudioSpec = {
  format: "wav" | "mp3" | "ogg";
  codec: "raw" | "opus";
};

type WebSocketClient = {
  on(event: "message", listener: (data: RawData, isBinary: boolean) => void): void;
  on(event: "close", listener: () => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  once(event: "open", listener: () => void): void;
  once(event: "error", listener: (error: Error) => void): void;
  once(event: "unexpected-response", listener: (request: unknown, response: { statusCode?: number; statusMessage?: string }) => void): void;
  off(event: "message", listener: (data: RawData, isBinary: boolean) => void): void;
  off(event: "close", listener: () => void): void;
  off(event: "error", listener: (error: Error) => void): void;
  off(event: "open", listener: () => void): void;
  off(event: "unexpected-response", listener: (request: unknown, response: { statusCode?: number; statusMessage?: string }) => void): void;
  send(data: Buffer, cb: (error?: Error) => void): void;
  close(): void;
  terminate(): void;
};

export type DoubaoVoiceRuntimeConfig = {
  appId: string;
  accessToken: string;
  secretKey?: string;
  endpoint: string;
  resourceId: string;
};

export type DoubaoAsrResult = {
  text: string;
  duration?: number;
  utterances?: unknown[];
  rawResponse?: unknown;
  provider: "doubao_asr";
  connectId: string;
};

export type DoubaoTtsResult = {
  audioBase64: string;
  audioFormat: string;
  audioSize: number;
  provider: "doubao_tts";
  voiceId: string;
  connectId: string;
};

type TtsEventFrame = {
  event: number;
  connectionId?: string;
  sessionId?: string;
  payload: Buffer;
  serialization: number;
  compression: number;
  flags: number;
  isFinal: boolean;
};

function isUsableEnvValue(value?: string | null): value is string {
  if (!value) {
    return false;
  }

  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  return !normalized.startsWith("replace_with_") && !normalized.startsWith("your_");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deriveAsrAudioSpec(mimeType?: string): AsrAudioSpec {
  const normalizedMimeType = mimeType?.trim().toLowerCase() || "audio/wav";

  if (
    normalizedMimeType.includes("audio/wav") ||
    normalizedMimeType.includes("audio/x-wav") ||
    normalizedMimeType.includes("audio/wave")
  ) {
    return { format: "wav", codec: "raw" };
  }

  if (normalizedMimeType.includes("audio/mpeg") || normalizedMimeType.includes("audio/mp3")) {
    return { format: "mp3", codec: "raw" };
  }

  if (normalizedMimeType.includes("audio/ogg")) {
    return { format: "ogg", codec: "opus" };
  }

  throw new Error(`不支持的 ASR 音频格式: ${mimeType || "unknown"}，请先转换为 WAV/MP3/OGG OPUS`);
}

function readEnvValue(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (isUsableEnvValue(value)) {
      return value;
    }
  }

  return undefined;
}

function normalizeWebSocketUrl(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return normalized;
  }

  if (normalized.startsWith("https://")) {
    return `wss://${normalized.slice("https://".length)}`;
  }

  if (normalized.startsWith("http://")) {
    return `ws://${normalized.slice("http://".length)}`;
  }

  return normalized;
}

function resolveVoiceRuntimeConfig(kind: VoiceRuntimeKind): DoubaoVoiceRuntimeConfig | null {
  const sharedAppId = readEnvValue("DOUBAO_VOICE_APP_ID");
  const sharedAccessToken = readEnvValue("DOUBAO_VOICE_ACCESS_TOKEN");
  const sharedSecretKey = readEnvValue("DOUBAO_VOICE_SECRET_KEY");

  const appId =
    readEnvValue(kind === "asr" ? "DOUBAO_ASR_APP_ID" : "DOUBAO_TTS_APP_ID") ||
    sharedAppId;

  const accessToken =
    readEnvValue(kind === "asr" ? "DOUBAO_ASR_ACCESS_TOKEN" : "DOUBAO_TTS_ACCESS_TOKEN") ||
    sharedAccessToken;

  const secretKey =
    readEnvValue(kind === "asr" ? "DOUBAO_ASR_SECRET_KEY" : "DOUBAO_TTS_SECRET_KEY") ||
    sharedSecretKey;

  const endpoint =
    readEnvValue(kind === "asr" ? "DOUBAO_ASR_ENDPOINT" : "DOUBAO_TTS_ENDPOINT") ||
    (kind === "asr" ? DEFAULT_ASR_ENDPOINT : DEFAULT_TTS_ENDPOINT);

  const resourceId =
    readEnvValue(kind === "asr" ? "DOUBAO_ASR_RESOURCE_ID" : "DOUBAO_TTS_RESOURCE_ID") ||
    (kind === "asr" ? DEFAULT_ASR_RESOURCE_ID : DEFAULT_TTS_RESOURCE_ID);

  if (!appId || !accessToken) {
    return null;
  }

  return {
    appId,
    accessToken,
    secretKey,
    endpoint: normalizeWebSocketUrl(endpoint),
    resourceId,
  };
}

function buildHeaders(config: DoubaoVoiceRuntimeConfig, connectId: string): Record<string, string> {
  return {
    "X-Api-App-Key": config.appId,
    "X-Api-Access-Key": config.accessToken,
    "X-Api-Resource-Id": config.resourceId,
    "X-Api-Connect-Id": connectId,
  };
}

function buildAsrFlashHeaders(config: DoubaoVoiceRuntimeConfig, requestId: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Api-App-Key": config.appId,
    "X-Api-Access-Key": config.accessToken,
    "X-Api-Resource-Id": "volc.bigasr.auc_turbo",
    "X-Api-Request-Id": requestId,
    "X-Api-Sequence": "-1",
  };
}

function createConnectId(): string {
  return randomUUID();
}

function createSessionId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (typeof data === "string") {
    return Buffer.from(data, "utf8");
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data.map((chunk) => toBuffer(chunk as RawData)));
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }

  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
  }

  return Buffer.from([]);
}

function maybeGunzip(payload: Buffer, compression: number): Buffer {
  if (compression !== 1) {
    return payload;
  }

  try {
    return gunzipSync(payload);
  } catch {
    return payload;
  }
}

function decodeJsonPayload(payload: Buffer, compression: number): unknown {
  const decoded = maybeGunzip(payload, compression);
  return JSON.parse(decoded.toString("utf8"));
}

function encodeJsonPayload(payload: unknown): Buffer {
  return Buffer.from(JSON.stringify(payload), "utf8");
}

function buildAsrHeader(messageType: number, flags: number, serialization: number, compression: number): Buffer {
  const header = Buffer.alloc(4);
  header[0] = (1 << 4) | 1;
  header[1] = ((messageType & 0x0f) << 4) | (flags & 0x0f);
  header[2] = ((serialization & 0x0f) << 4) | (compression & 0x0f);
  header[3] = 0;
  return header;
}

function buildAsrFrame(params: {
  messageType: number;
  flags: number;
  serialization: number;
  compression: number;
  payload: Buffer;
  sequence?: number;
}): Buffer {
  const payload = params.compression === 1 ? gzipSync(params.payload) : params.payload;
  const lengthPrefixSize = 4;
  const sequenceSize = params.sequence === undefined ? 0 : 4;
  const frame = Buffer.alloc(4 + sequenceSize + lengthPrefixSize + payload.length);

  buildAsrHeader(params.messageType, params.flags, params.serialization, params.compression).copy(frame, 0);

  let offset = 4;
  if (params.sequence !== undefined) {
    frame.writeInt32BE(params.sequence, offset);
    offset += 4;
  }

  frame.writeUInt32BE(payload.length, offset);
  offset += 4;
  payload.copy(frame, offset);

  return frame;
}

function parseAsrFrame(data: Buffer): {
  messageType: number;
  flags: number;
  serialization: number;
  compression: number;
  sequence?: number;
  errorCode?: number;
  payload: Buffer;
} {
  if (data.length < 8) {
    throw new Error("ASR 响应帧长度过短");
  }

  const messageType = data[1] >> 4;
  const flags = data[1] & 0x0f;
  const serialization = data[2] >> 4;
  const compression = data[2] & 0x0f;

  let offset = 4;
  let sequence: number | undefined;

  if (messageType === 9) {
    if (data.length < offset + 8) {
      throw new Error("ASR 响应帧缺少序列号或长度字段");
    }

    sequence = data.readInt32BE(offset);
    offset += 4;
  }

  if (messageType === 15) {
    if (data.length < offset + 8) {
      throw new Error("ASR 错误帧格式不完整");
    }

    const errorCode = data.readUInt32BE(offset);
    offset += 4;
    const payloadSize = data.readUInt32BE(offset);
    offset += 4;
    const payload = data.subarray(offset, offset + payloadSize);

    return {
      messageType,
      flags,
      serialization,
      compression,
      sequence,
      errorCode,
      payload,
    };
  }

  if (data.length < offset + 4) {
    throw new Error("ASR 响应帧缺少 payload size");
  }

  const payloadSize = data.readUInt32BE(offset);
  offset += 4;
  const payload = data.subarray(offset, offset + payloadSize);

  return {
    messageType,
    flags,
    serialization,
    compression,
    sequence,
    payload,
  };
}

function extractAsrResult(payload: unknown): {
  text: string;
  duration?: number;
  utterances?: unknown[];
} {
  const payloadRecord = isRecord(payload) ? payload : {};
  const resultValue = payloadRecord.result;
  const result = Array.isArray(resultValue)
    ? resultValue[0]
    : isRecord(resultValue)
      ? resultValue
      : undefined;

  const text =
    (isRecord(result) && typeof result.text === "string" && result.text.trim()) ||
    (typeof payloadRecord.text === "string" && payloadRecord.text.trim()) ||
    "";

  const duration =
    isRecord(payloadRecord.audio_info) && typeof payloadRecord.audio_info.duration === "number"
      ? payloadRecord.audio_info.duration
      : isRecord(result) && typeof result.duration === "number"
        ? result.duration
        : undefined;

  const utterances =
    isRecord(result) && Array.isArray(result.utterances) ? result.utterances :
    Array.isArray(payloadRecord.utterances) ? payloadRecord.utterances :
    undefined;

  return { text, duration, utterances };
}

function isAsrFinalFrame(frame: { flags: number; messageType: number }): boolean {
  return frame.messageType === 9 && (frame.flags & 0b0010) === 0b0010;
}

function buildTtsHeader(messageType: number, flags: number, serialization: number, compression: number): Buffer {
  const header = Buffer.alloc(4);
  header[0] = (1 << 4) | 1;
  header[1] = ((messageType & 0x0f) << 4) | (flags & 0x0f);
  header[2] = ((serialization & 0x0f) << 4) | (compression & 0x0f);
  header[3] = 0;
  return header;
}

function buildTtsRequestFrame(params: {
  event: number;
  payload: unknown;
  sessionId?: string;
}): Buffer {
  const payloadBuffer = encodeJsonPayload(params.payload);
  const sessionIdBuffer = params.sessionId ? Buffer.from(params.sessionId, "utf8") : null;
  const totalSize = 4 + 4 + (sessionIdBuffer ? 4 + sessionIdBuffer.length : 0) + 4 + payloadBuffer.length;
  const frame = Buffer.alloc(totalSize);

  buildTtsHeader(1, 4, 1, 0).copy(frame, 0);

  let offset = 4;
  frame.writeInt32BE(params.event, offset);
  offset += 4;

  if (sessionIdBuffer) {
    frame.writeUInt32BE(sessionIdBuffer.length, offset);
    offset += 4;
    sessionIdBuffer.copy(frame, offset);
    offset += sessionIdBuffer.length;
  }

  frame.writeUInt32BE(payloadBuffer.length, offset);
  offset += 4;
  payloadBuffer.copy(frame, offset);

  return frame;
}

function parseTtsFrame(data: Buffer): TtsEventFrame {
  if (data.length < 12) {
    throw new Error("TTS 响应帧长度过短");
  }

  const flags = data[1] & 0x0f;
  const serialization = data[2] >> 4;
  const compression = data[2] & 0x0f;

  let offset = 4;
  const event = data.readInt32BE(offset);
  offset += 4;

  let connectionId: string | undefined;
  let sessionId: string | undefined;

  if (data.length >= offset + 4) {
    const idLength = data.readUInt32BE(offset);
    offset += 4;

    if (idLength > 0 && data.length >= offset + idLength + 4) {
      const idBuffer = data.subarray(offset, offset + idLength);
      const idValue = idBuffer.toString("utf8");
      offset += idLength;

      if ([50, 51, 52].includes(event)) {
        connectionId = idValue;
      } else {
        sessionId = idValue;
      }

      const payloadLength = data.readUInt32BE(offset);
      offset += 4;
      const payload = data.subarray(offset, offset + payloadLength);

      return {
        event,
        connectionId,
        sessionId,
        payload,
        serialization,
        compression,
        flags,
        isFinal: event === 152 || event === 151 || event === 153,
      };
    }

    offset -= 4;
  }

  if (data.length < offset + 4) {
    throw new Error("TTS 响应帧缺少 payload length");
  }

  const payloadLength = data.readUInt32BE(offset);
  offset += 4;
  const payload = data.subarray(offset, offset + payloadLength);

  return {
    event,
    payload,
    serialization,
    compression,
    flags,
    isFinal: event === 152 || event === 151 || event === 153,
  };
}

function readTtsPayloadObject(frame: TtsEventFrame): unknown {
  const decodedPayload = maybeGunzip(frame.payload, frame.compression);

  if (frame.serialization === 0) {
    return decodedPayload;
  }

  try {
    return JSON.parse(decodedPayload.toString("utf8"));
  } catch {
    return decodedPayload.toString("utf8");
  }
}

function getTimeoutMs(value?: number): number {
  if (!value || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.floor(value);
}

async function openWebSocket(
  endpoint: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<WebSocketClient> {
  process.env.WS_NO_BUFFER_UTIL = "1";
  process.env.WS_NO_UTF_8_VALIDATE = "1";
  const { default: WebSocket } = await import("ws");

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(endpoint, {
      headers,
      handshakeTimeout: timeoutMs,
      perMessageDeflate: false,
    }) as unknown as WebSocketClient;

    let settled = false;

    const cleanup = () => {
      ws.off("open", handleOpen);
      ws.off("error", handleError);
      ws.off("unexpected-response", handleUnexpectedResponse);
      if (timer) {
        clearTimeout(timer);
      }
    };

    const fail = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();

      try {
        ws.terminate();
      } catch {
        // ignore
      }

      reject(error);
    };

    const handleOpen = () => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(ws);
    };

    const handleError = (error: Error) => fail(error);

    const handleUnexpectedResponse = (_request: unknown, response: { statusCode?: number; statusMessage?: string }) => {
      fail(
        new Error(
          `WebSocket ${endpoint} 建连失败: HTTP ${response.statusCode || "unknown"} ${response.statusMessage || ""}`.trim()
        )
      );
    };

    const timer = setTimeout(() => {
      fail(new Error(`WebSocket ${endpoint} 建连超时`));
    }, timeoutMs);

    ws.once("open", handleOpen);
    ws.once("error", handleError);
    ws.once("unexpected-response", handleUnexpectedResponse);
  });
}

async function recognizeWithDoubaoAsrFlash(params: {
  audio: Buffer;
  uid?: string;
  timeoutMs?: number;
}): Promise<DoubaoAsrResult> {
  const runtimeConfig = resolveVoiceRuntimeConfig("asr");
  if (!runtimeConfig) {
    throw new Error("豆包语音识别未配置，请先设置 DOUBAO_ASR_* 或 DOUBAO_VOICE_* 环境变量");
  }

  const requestId = createConnectId();
  const response = await fetch("https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash", {
    method: "POST",
    headers: buildAsrFlashHeaders(runtimeConfig, requestId),
    body: JSON.stringify({
      user: {
        uid: params.uid || `interview_${Date.now()}`,
      },
      audio: {
        data: params.audio.toString("base64"),
      },
      request: {
        model_name: "bigmodel",
        enable_itn: true,
        enable_punc: true,
      },
    }),
    signal: AbortSignal.timeout(getTimeoutMs(params.timeoutMs)),
  });

  const statusCode = response.headers.get("X-Api-Status-Code") || "";
  const statusMessage = response.headers.get("X-Api-Message") || "";
  const logId = response.headers.get("X-Tt-Logid") || "";
  const payload = (await response.json().catch(() => null)) as
    | {
        audio_info?: { duration?: number };
        result?: {
          text?: string;
          utterances?: unknown[];
          additions?: { duration?: string };
        };
        text?: string;
        utterances?: unknown[];
      }
    | null;

  const normalizedStatusCode = statusCode || (response.ok ? "20000000" : "");

  if (normalizedStatusCode !== "20000000") {
    throw new Error(
      `豆包录音文件极速识别失败: ${statusCode || response.status} ${statusMessage || response.statusText || ""} ${logId ? `(logid=${logId})` : ""}`.trim()
    );
  }

  const text =
    payload?.result?.text?.trim() ||
    payload?.text?.trim() ||
    "";
  const duration =
    payload?.audio_info?.duration ??
    (payload?.result?.additions?.duration ? Number(payload.result.additions.duration) : undefined);
  const utterances = payload?.result?.utterances || payload?.utterances;

  if (!text) {
    throw new Error("豆包录音文件极速识别未返回有效文本");
  }

  return {
    text,
    duration: Number.isFinite(duration as number) ? duration : undefined,
    utterances,
    rawResponse: payload,
    provider: "doubao_asr",
    connectId: requestId,
  };
}

function sendWsMessage(ws: WebSocketClient, payload: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.send(payload, (error: Error | undefined) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function getAsrRequestPayload(uid?: string, mimeType?: string): Buffer {
  const audioSpec = deriveAsrAudioSpec(mimeType);
  const payload = {
    user: uid ? { uid } : {},
    audio: {
      format: audioSpec.format,
      codec: audioSpec.codec,
      rate: 16000,
      bits: 16,
      channel: 1,
    },
    request: {
      model_name: "bigmodel",
      enable_itn: true,
      enable_punc: true,
      result_type: "full",
      show_utterances: false,
    },
  };

  return encodeJsonPayload(payload);
}

export async function recognizeWithDoubaoAsr(params: {
  audio: Buffer;
  uid?: string;
  mimeType?: string;
  timeoutMs?: number;
}): Promise<DoubaoAsrResult> {
  try {
    return await recognizeWithDoubaoAsrFlash({
      audio: params.audio,
      uid: params.uid,
      timeoutMs: params.timeoutMs,
    });
  } catch (flashError) {
    console.warn("[豆包 ASR] 极速版识别失败，回退到流式识别:", flashError);
  }

  const runtimeConfig = resolveVoiceRuntimeConfig("asr");
  if (!runtimeConfig) {
    throw new Error("豆包语音识别未配置，请先设置 DOUBAO_ASR_* 或 DOUBAO_VOICE_* 环境变量");
  }

  const connectId = createConnectId();
  const ws = await openWebSocket(
    runtimeConfig.endpoint,
    buildHeaders(runtimeConfig, connectId),
    getTimeoutMs(params.timeoutMs)
  );

  return await new Promise<DoubaoAsrResult>((resolve, reject) => {
    let settled = false;
    let latestText = "";
    let latestDuration: number | undefined;
    let latestUtterances: unknown[] | undefined;
    let latestResponse: unknown;
    const timeoutMs = getTimeoutMs(params.timeoutMs);
    const timeout = setTimeout(() => {
      fail(new Error("豆包语音识别超时"));
    }, timeoutMs);

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      ws.off("message", handleMessage);
      ws.off("close", handleClose);
      ws.off("error", handleError);
    };

    const finish = () => {
      if (settled) {
        return;
      }

      if (!latestText) {
        fail(new Error("豆包语音识别未返回有效文本"));
        return;
      }

      settled = true;
      cleanup();

      try {
        ws.close();
      } catch {
        // ignore
      }

      resolve({
        text: latestText,
        duration: latestDuration,
        utterances: latestUtterances,
        rawResponse: latestResponse,
        provider: "doubao_asr",
        connectId,
      });
    };

    const fail = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();

      try {
        ws.terminate();
      } catch {
        // ignore
      }

      reject(error);
    };

    const handleMessage = (data: RawData, isBinary: boolean) => {
      try {
        if (!isBinary) {
          const text = toBuffer(data).toString("utf8").trim();
          if (text) {
            try {
              const message = JSON.parse(text);
              if (message?.message || message?.error) {
                fail(new Error(message.message || message.error || "豆包语音识别返回文本错误"));
                return;
              }
            } catch {
              fail(new Error(text));
              return;
            }
          }

          return;
        }

        const buffer = toBuffer(data);
        const frame = parseAsrFrame(buffer);

        if (frame.messageType === 15) {
          const errorPayload = frame.payload.toString("utf8").trim();
          fail(new Error(errorPayload || `豆包语音识别错误码: ${frame.errorCode || "unknown"}`));
          return;
        }

        if (frame.messageType !== 9) {
          return;
        }

        const payload = decodeJsonPayload(frame.payload, frame.compression);
        latestResponse = payload;

        const extracted = extractAsrResult(payload);
        if (extracted.text) {
          latestText = extracted.text;
        }

        if (typeof extracted.duration === "number") {
          latestDuration = extracted.duration;
        }

        if (extracted.utterances) {
          latestUtterances = extracted.utterances;
        }

        if (isAsrFinalFrame(frame)) {
          finish();
        }
      } catch (error) {
        fail(error instanceof Error ? error : new Error("豆包语音识别响应解析失败"));
      }
    };

    const handleClose = () => {
      if (!settled) {
        finish();
      }
    };

    const handleError = (error: Error) => {
      fail(error);
    };

    ws.on("message", handleMessage);
    ws.on("close", handleClose);
    ws.on("error", handleError);

    (async () => {
      try {
        const fullRequest = buildAsrFrame({
          messageType: 1,
          flags: 0,
          serialization: 1,
          compression: 1,
          payload: getAsrRequestPayload(params.uid, params.mimeType),
        });

        const audioFrame = buildAsrFrame({
          messageType: 2,
          flags: 0b0010,
          serialization: 0,
          compression: 1,
          payload: params.audio,
        });

        await sendWsMessage(ws, fullRequest);
        await sendWsMessage(ws, audioFrame);
      } catch (error) {
        fail(error instanceof Error ? error : new Error("豆包语音识别发送失败"));
      }
    })();
  });
}

function getTtsAudioParams() {
  return {
    format: DEFAULT_TTS_AUDIO_FORMAT,
    sample_rate: DEFAULT_TTS_SAMPLE_RATE,
    bit_rate: DEFAULT_TTS_BIT_RATE,
  };
}

function buildTtsStartSessionPayload(params: {
  uid: string;
  speaker: string;
}): Record<string, unknown> {
  return {
    user: {
      uid: params.uid,
    },
    event: 100,
    req_params: {
      speaker: params.speaker,
      audio_params: getTtsAudioParams(),
    },
  };
}

function buildTtsTaskPayload(text: string): Record<string, unknown> {
  return {
    event: 200,
    req_params: {
      text,
    },
  };
}

function getTtsAudioBytes(frame: TtsEventFrame): Buffer | null {
  if (frame.event !== 352) {
    return null;
  }

  if (frame.serialization === 0) {
    return maybeGunzip(frame.payload, frame.compression);
  }

  try {
    const payload = readTtsPayloadObject(frame);
    if (Buffer.isBuffer(payload)) {
      return payload;
    }

    if (payload && typeof payload === "object") {
      const typedPayload = payload as Record<string, unknown>;
      const base64Audio =
        typeof typedPayload.data === "string"
          ? typedPayload.data
          : typeof typedPayload.audio === "string"
            ? typedPayload.audio
            : undefined;

      if (base64Audio) {
        return Buffer.from(base64Audio, "base64");
      }
    }
  } catch {
    return frame.payload;
  }

  return null;
}

export async function synthesizeWithDoubaoTts(params: {
  text: string;
  voiceId?: string | null;
  interviewId?: string;
  timeoutMs?: number;
}): Promise<DoubaoTtsResult> {
  const runtimeConfig = resolveVoiceRuntimeConfig("tts");
  if (!runtimeConfig) {
    throw new Error("豆包语音合成未配置，请先设置 DOUBAO_TTS_* 或 DOUBAO_VOICE_* 环境变量");
  }

  const connectId = createConnectId();
  const ws = await openWebSocket(
    runtimeConfig.endpoint,
    buildHeaders(runtimeConfig, connectId),
    getTimeoutMs(params.timeoutMs)
  );
  const voiceOption = getInterviewerVoiceOption(params.voiceId);
  const sessionId = createSessionId();

  return await new Promise<DoubaoTtsResult>((resolve, reject) => {
    let settled = false;
    let connectionStarted = false;
    let sessionFinished = false;
    let latestConnectionId: string | undefined;
    const audioChunks: Buffer[] = [];
    const timeoutMs = getTimeoutMs(params.timeoutMs);
    const timeout = setTimeout(() => {
      fail(new Error("豆包语音合成超时"));
    }, timeoutMs);

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      ws.off("message", handleMessage);
      ws.off("close", handleClose);
      ws.off("error", handleError);
    };

    const finalize = () => {
      if (settled) {
        return;
      }

      if (!sessionFinished) {
        return;
      }

      const audioBuffer = Buffer.concat(audioChunks);
      if (audioBuffer.length === 0) {
        fail(new Error("豆包语音合成未返回音频数据"));
        return;
      }

      settled = true;
      cleanup();

      try {
        ws.close();
      } catch {
        // ignore
      }

      resolve({
        audioBase64: audioBuffer.toString("base64"),
        audioFormat: "audio/mpeg",
        audioSize: audioBuffer.length,
        provider: "doubao_tts",
        voiceId: voiceOption.id,
        connectId: latestConnectionId || connectId,
      });
    };

    const fail = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();

      try {
        ws.terminate();
      } catch {
        // ignore
      }

      reject(error);
    };

    const handleMessage = (data: RawData, isBinary: boolean) => {
      try {
        if (!isBinary) {
          const text = toBuffer(data).toString("utf8").trim();
          if (!text) {
            return;
          }

          try {
            const message = JSON.parse(text);
            if (message?.message || message?.error) {
              fail(new Error(message.message || message.error || "豆包语音合成文本错误"));
            }
          } catch {
            fail(new Error(text));
          }

          return;
        }

        const frame = parseTtsFrame(toBuffer(data));
        const payload = readTtsPayloadObject(frame);

        if (frame.event === 50) {
          connectionStarted = true;
          if (frame.connectionId) {
            latestConnectionId = frame.connectionId;
          }
          return;
        }

        if (frame.event === 51) {
          const message = isRecord(payload)
            ? payload.message || payload.status_code
            : "连接失败";
          fail(new Error(`豆包语音合成连接失败: ${String(message)}`));
          return;
        }

        if (frame.event === 150) {
          if (!connectionStarted) {
            return;
          }

          const taskFrame = buildTtsRequestFrame({
            event: 200,
            sessionId,
            payload: buildTtsTaskPayload(params.text),
          });

          const finishSessionFrame = buildTtsRequestFrame({
            event: 102,
            sessionId,
            payload: {},
          });

          void sendWsMessage(ws, taskFrame)
            .then(() => sendWsMessage(ws, finishSessionFrame))
            .catch((error) => fail(error instanceof Error ? error : new Error("豆包语音合成请求发送失败")));

          return;
        }

        if (frame.event === 151 || frame.event === 153) {
          const message = isRecord(payload)
            ? payload.message || payload.status_code
            : "会话失败";
          fail(new Error(`豆包语音合成会话失败: ${String(message)}`));
          return;
        }

        if (frame.event === 352) {
          const audioBytes = getTtsAudioBytes(frame);
          if (audioBytes && audioBytes.length > 0) {
            audioChunks.push(audioBytes);
          }
          return;
        }

        if (frame.event === 152) {
          const statusCode = isRecord(payload)
            ? Number(payload.status_code || 0)
            : 0;

          if (statusCode && statusCode !== 20000000) {
            const message = isRecord(payload)
              ? payload.message || statusCode
              : statusCode;
            fail(new Error(`豆包语音合成结束失败: ${String(message)}`));
            return;
          }

          sessionFinished = true;

          const finishConnectionFrame = buildTtsRequestFrame({
            event: 2,
            payload: {},
          });

          void sendWsMessage(ws, finishConnectionFrame).catch(() => {
            // ignore, we'll still finalize on close
          });

          if (frame.sessionId) {
            latestConnectionId = frame.sessionId;
          }

          return;
        }

        if (frame.event === 52) {
          if (frame.connectionId) {
            latestConnectionId = frame.connectionId;
          }

          if (sessionFinished) {
            finalize();
          }
          return;
        }
      } catch (error) {
        fail(error instanceof Error ? error : new Error("豆包语音合成响应解析失败"));
      }
    };

    const handleClose = () => {
      if (!settled && sessionFinished) {
        finalize();
        return;
      }

      if (!settled) {
        fail(new Error("豆包语音合成连接已关闭"));
      }
    };

    const handleError = (error: Error) => {
      fail(error);
    };

    ws.on("message", handleMessage);
    ws.on("close", handleClose);
    ws.on("error", handleError);

    (async () => {
      try {
        const startConnectionFrame = buildTtsRequestFrame({
          event: 1,
          payload: {},
        });

        const startSessionFrame = buildTtsRequestFrame({
          event: 100,
          sessionId,
          payload: buildTtsStartSessionPayload({
            uid: params.interviewId || `interview_${Date.now()}`,
            speaker: voiceOption.speaker,
          }),
        });

        await sendWsMessage(ws, startConnectionFrame);
        await sendWsMessage(ws, startSessionFrame);
      } catch (error) {
        fail(error instanceof Error ? error : new Error("豆包语音合成连接初始化失败"));
      }
    })();
  });
}
