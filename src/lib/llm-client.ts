/**
 * LLM 客户端工具
 * 提供重试机制和并发监控功能
 */

import { ArkInvokeOptions, ArkMessage, invokeArk } from '@/lib/ark-llm';

// 并发监控统计
interface ConcurrentStats {
  activeRequests: number;
  totalRequests: number;
  rateLimitErrors: number;
  otherErrors: number;
}

const stats: ConcurrentStats = {
  activeRequests: 0,
  totalRequests: 0,
  rateLimitErrors: 0,
  otherErrors: 0,
};

export function isRateLimitErrorMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("429") ||
    normalized.includes("rate limit") ||
    normalized.includes("too many requests") ||
    normalized.includes("requests per minute") ||
    normalized.includes("requests per second") ||
    normalized.includes("rpm limit") ||
    (normalized.includes("rpm") && normalized.includes("exceeded")) ||
    (normalized.includes("retry later") && normalized.includes("request")) ||
    (normalized.includes("limit") && normalized.includes("exceeded") && normalized.includes("request"))
  );
}

/**
 * 增强的 LLM 调用，带重试机制
 */
export async function invokeWithRetry(
  messages: ArkMessage[],
  options: ArkInvokeOptions,
  maxRetries: number = 4
): Promise<{ content: string; raw: unknown }> {
  // 更新统计
  stats.totalRequests++;
  stats.activeRequests++;

  console.log(`[LLM客户端] 开始请求 - 活跃请求数: ${stats.activeRequests}, 总请求数: ${stats.totalRequests}`);

  try {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await invokeArk(messages, options);

        console.log(`[LLM客户端] 请求成功 - 活跃请求数: ${stats.activeRequests}`);
        return response;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isRateLimited = isRateLimitErrorMessage(errorMessage);

        if (isRateLimited) {
          stats.rateLimitErrors++;
          console.warn(`[LLM客户端] 速率限制错误 - 尝试 ${attempt + 1}/${maxRetries}`);

          if (attempt < maxRetries - 1) {
            const delay = Math.min(15000, Math.pow(2, attempt) * 2000 + attempt * 500);
            console.log(`[LLM客户端] 等待 ${delay}ms 后重试...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        } else {
          stats.otherErrors++;
          console.error(`[LLM客户端] 请求失败 - 尝试 ${attempt + 1}/${maxRetries}:`, error);

          if (attempt < maxRetries - 1) {
            const delay = 500 * (attempt + 1);
            console.log(`[LLM客户端] 等待 ${delay}ms 后重试...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }

        throw error;
      }
    }
  } finally {
    stats.activeRequests = Math.max(0, stats.activeRequests - 1);
  }

  throw new Error('LLM 调用失败：达到最大重试次数');
}

/**
 * 获取并发统计信息
 */
export function getConcurrentStats(): ConcurrentStats {
  return { ...stats };
}

/**
 * 重置统计信息
 */
export function resetConcurrentStats(): void {
  stats.activeRequests = 0;
  stats.totalRequests = 0;
  stats.rateLimitErrors = 0;
  stats.otherErrors = 0;
}

/**
 * 记录并发监控日志
 */
export function logConcurrentStats(context: string = ''): void {
  console.log(`[并发监控] ${context}`, {
    activeRequests: stats.activeRequests,
    totalRequests: stats.totalRequests,
    rateLimitErrors: stats.rateLimitErrors,
    otherErrors: stats.otherErrors,
    errorRate: stats.totalRequests > 0 
      ? ((stats.rateLimitErrors + stats.otherErrors) / stats.totalRequests * 100).toFixed(2) + '%'
      : '0%'
  });
}
