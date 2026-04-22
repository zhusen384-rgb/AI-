import { getArkBaseUrl } from "@/lib/ai-models";

export type ArkMessageRole = "system" | "user" | "assistant";

export interface ArkImageUrlPart {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
}

export interface ArkTextPart {
  type: "text";
  text: string;
}

export type ArkMessageContent = string | Array<ArkTextPart | ArkImageUrlPart>;

export interface ArkMessage {
  role: ArkMessageRole;
  content: ArkMessageContent;
}

export interface ArkInvokeOptions {
  model: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  response_format?: Record<string, unknown>;
  presence_penalty?: number;
  frequency_penalty?: number;
}

export interface ArkInvokeResponse {
  content: string;
  raw: unknown;
}

function getArkApiKey(): string {
  const apiKey = process.env.ARK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ARK_API_KEY 未配置，无法调用方舟模型");
  }

  return apiKey;
}

function normalizeResponseContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (
          item &&
          typeof item === "object" &&
          "type" in item &&
          (item as { type?: unknown }).type === "text" &&
          "text" in item &&
          typeof (item as { text?: unknown }).text === "string"
        ) {
          return (item as { text: string }).text;
        }

        return "";
      })
      .join("")
      .trim();
  }

  return "";
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  if (
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof (payload.error as { message?: unknown }).message === "string"
  ) {
    return (payload.error as { message: string }).message;
  }

  if ("message" in payload && typeof (payload as { message?: unknown }).message === "string") {
    return (payload as { message: string }).message;
  }

  return undefined;
}

export async function invokeArk(messages: ArkMessage[], options: ArkInvokeOptions): Promise<ArkInvokeResponse> {
  const endpoint = `${getArkBaseUrl()}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getArkApiKey()}`,
    },
    body: JSON.stringify({
      model: options.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.max_tokens,
      top_p: options.top_p,
      response_format: options.response_format,
      presence_penalty: options.presence_penalty,
      frequency_penalty: options.frequency_penalty,
      stream: false,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        choices?: Array<{
          message?: {
            content?: unknown;
          };
        }>;
        error?: {
          message?: string;
        };
        message?: string;
      }
    | null;

  if (!response.ok) {
    const errorMessage = extractErrorMessage(payload) || `HTTP ${response.status}`;
    throw new Error(`ARK 模型调用失败: ${errorMessage}`);
  }

  const content = normalizeResponseContent(payload?.choices?.[0]?.message?.content);
  if (!content) {
    throw new Error("ARK 模型返回内容为空");
  }

  return {
    content,
    raw: payload,
  };
}

export function createCompatibleLlmClient() {
  return {
    invoke(messages: ArkMessage[], options: ArkInvokeOptions) {
      return invokeArk(messages, options);
    },
  };
}
