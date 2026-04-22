"use client";

// 版本：v1.0.32 - 面试链路性能优化
// 更新时间：2026-04-17
console.log('[全AI面试] 页面加载，版本：v1.0.32 - 面试链路性能优化');

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Bot, User, Play, FileText, Upload, ArrowRight, Star, CheckCircle, TrendingUp, AlertCircle, Loader2, Video, VideoOff, Download, Mic, MicOff, Clock, MessageSquare, X, Shield, ShieldAlert, Activity, Send } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { InterviewSpeechRecognizer, SpeechResult } from "@/lib/speechRecognizer";
import { uploadFileInChunks } from "@/lib/upload-chunk";
import { CandidateMonitor, CandidateStatus } from "@/lib/candidate-monitor";
import {
  DEFAULT_INTERVIEWER_VOICE_ID,
  getInterviewerVoiceOption,
} from "@/lib/interviewer-voice";
import { prepareRecordingBlobForAsr } from "@/lib/audio-conversion";
import { getMediaCapabilityProblem, type MediaCapability } from "@/lib/media-environment";

// 安全的 JSON 解析函数，用于处理非 JSON 响应
async function safeParseResponse(response: Response): Promise<any> {
  try {
    // 先检查响应的状态码
    console.log('[safeParseResponse] 响应状态:', response.status);
    console.log('[safeParseResponse] 响应状态文本:', response.statusText);

    // 特殊处理 502 错误（网关错误）
    if (response.status === 502) {
      console.error('[safeParseResponse] 服务器返回 502 Bad Gateway 错误');
      return {
        success: false,
        error: "服务器暂时不可用（502 Bad Gateway）。可能是服务器负载过高或网络问题，请稍后重试。如果问题持续，请联系管理员。",
        status: 502
      };
    }

    // 特殊处理 503 错误（服务不可用）
    if (response.status === 503) {
      console.error('[safeParseResponse] 服务器返回 503 Service Unavailable 错误');
      return {
        success: false,
        error: "服务暂时不可用（503 Service Unavailable）。可能是服务器正在维护或过载，请稍后重试。",
        status: 503
      };
    }

    // 特殊处理 504 错误（网关超时）
    if (response.status === 504) {
      console.error('[safeParseResponse] 服务器返回 504 Gateway Timeout 错误');
      return {
        success: false,
        error: "请求超时（504 Gateway Timeout）。服务器处理时间过长，请稍后重试。",
        status: 504
      };
    }

    // 特殊处理 413 错误（文件过大）
    if (response.status === 413) {
      const text = await response.text();
      console.error('[safeParseResponse] 文件过大错误:', text);
      return {
        success: false,
        error: "录屏文件过大（超过500MB），请缩短面试时间到 20 分钟以内，或降低录屏质量",
        status: 413
      };
    }

    // 检查响应的内容类型
    const contentType = response.headers.get('content-type');
    console.log('[safeParseResponse] Content-Type:', contentType);

    // 如果响应不是 JSON，先获取文本内容
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('[safeParseResponse] 响应不是 JSON 格式，内容:', text.substring(0, 200));

      // 如果是 HTML 响应，可能是错误页面
      if (text.includes('<html>') || text.includes('<!DOCTYPE')) {
        console.error('[safeParseResponse] 收到 HTML 响应，可能是错误页面');
        return {
          success: false,
          error: `服务器返回了错误页面（${response.status} ${response.statusText}）。可能是服务器内部错误，请稍后重试。`,
          status: response.status
        };
      }

      throw new Error(`服务器返回了非 JSON 响应: ${response.status} ${response.statusText}`);
    }

    // 尝试解析 JSON
    const result = await response.json();
    if (result && typeof result === "object" && "audioBase64" in result) {
      const typedResult = result as { audioBase64?: string; audioFormat?: string; audioSize?: number; success?: boolean; provider?: string };
      console.log('[safeParseResponse] JSON 解析成功:', {
        success: typedResult.success,
        provider: typedResult.provider,
        audioFormat: typedResult.audioFormat,
        audioSize: typedResult.audioSize,
        audioBase64Length: typedResult.audioBase64?.length || 0,
      });
    } else {
      console.log('[safeParseResponse] JSON 解析成功:', result);
    }
    return result;
  } catch (error) {
    console.error('[safeParseResponse] JSON 解析失败:', error);

    // 尝试获取原始响应文本
    try {
      const text = await response.text();
      console.error('[safeParseResponse] 原始响应内容:', text.substring(0, 500));
      throw new Error(`解析响应失败: ${error instanceof Error ? error.message : '未知错误'}。响应内容: ${text.substring(0, 100)}`);
    } catch {
      throw error;
    }
  }
}

// 分块上传函数 - 用于解决大文件上传时的连接重置问题
async function uploadBlobWithChunks(
  signedUrl: string,
  blob: Blob,
  contentType: string,
  onProgress?: (loaded: number, total: number) => void,
  maxRetries: number = 3
): Promise<Response> {
  console.log(`[分块上传] ========== 开始分块上传 ==========`);
  console.log(`[分块上传] 文件大小: ${blob.size} bytes`);
  console.log(`[分块上传] Content-Type: ${contentType}`);

  const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB 每块
  const totalChunks = Math.ceil(blob.size / CHUNK_SIZE);
  console.log(`[分块上传] 分块大小: ${CHUNK_SIZE} bytes`);
  console.log(`[分块上传] 总块数: ${totalChunks}`);

  // 对于 S3/TOS，预签名 URL 是针对整个文件的，不能直接分块上传
  // 所以我们需要使用 XMLHttpRequest 并启用更可靠的上传方式
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded, event.total);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        console.log(`[分块上传] 上传成功，状态码: ${xhr.status}`);
        resolve({
          ok: true,
          status: xhr.status,
          statusText: xhr.statusText,
          text: async () => xhr.responseText,
          json: async () => JSON.parse(xhr.responseText),
        } as Response);
      } else {
        console.error(`[分块上传] 上传失败，状态码: ${xhr.status}`);
        reject(new Error(`上传失败: ${xhr.status} ${xhr.statusText} - ${xhr.responseText}`));
      }
    });

    xhr.addEventListener('error', () => {
      console.error(`[分块上传] 网络错误`);
      reject(new Error('网络错误：连接中断或失败'));
    });

    xhr.addEventListener('timeout', () => {
      console.error(`[分块上传] 请求超时`);
      reject(new Error('上传超时'));
    });

    xhr.addEventListener('abort', () => {
      console.error(`[分块上传] 请求被取消`);
      reject(new Error('上传被取消'));
    });

    // 设置更长的超时时间（15分钟）
    xhr.timeout = 15 * 60 * 1000; // 15 minutes

    console.log(`[分块上传] 开始 PUT 请求...`);
    console.log(`[分块上传] URL: ${signedUrl.substring(0, 80)}...`);
    
    xhr.open('PUT', signedUrl, true);
    xhr.setRequestHeader('Content-Type', contentType);
    
    // 发送 blob
    xhr.send(blob);
  });
}

// 带重试机制的 fetch 函数（用于处理 502/503/504 错误）
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries: number = 3,
  retryDelay: number = 2000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[fetchWithRetry] 尝试 ${attempt}/${maxRetries}:`, url);
      const response = await fetch(url, options);

      console.log(`[fetchWithRetry] 收到响应，状态码: ${response.status}`, response.statusText);

      // 如果是服务器错误（5xx），可能需要重试
      if (response.status >= 500 && response.status < 600 && attempt < maxRetries) {
        console.warn(`[fetchWithRetry] 服务器错误 ${response.status}，准备重试...`);
        console.warn(`[fetchWithRetry] 等待 ${retryDelay * attempt}ms 后重试...`);

        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));

        continue;
      }

      console.log(`[fetchWithRetry] 请求成功（非 5xx 错误），状态码: ${response.status}`);
      return response;
    } catch (error) {
      lastError = error as Error;
      console.error(`[fetchWithRetry] 请求失败 (尝试 ${attempt}/${maxRetries}):`, error);

      // 如果是网络错误，可以重试
      if (attempt < maxRetries) {
        console.log(`[fetchWithRetry] 等待 ${retryDelay * attempt}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
    }
  }

  // 所有重试都失败，抛出最后一个错误
  throw lastError || new Error("请求失败，已达到最大重试次数");
}

// 带重试机制和上传进度的函数（用于上传文件）
async function uploadWithRetry(
  url: string,
  options: RequestInit & { onProgress?: (loaded: number, total: number) => void },
  maxRetries: number = 3,
  retryDelay: number = 2000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[uploadWithRetry] 尝试 ${attempt}/${maxRetries}:`, url);

      const response = await fetch(url, options);

      console.log(`[uploadWithRetry] 收到响应，状态码: ${response.status}`, response.statusText);

      // 如果是服务器错误（5xx），可能需要重试
      if (response.status >= 500 && response.status < 600 && attempt < maxRetries) {
        console.warn(`[uploadWithRetry] 服务器错误 ${response.status}，准备重试...`);
        console.warn(`[uploadWithRetry] 等待 ${retryDelay * attempt}ms 后重试...`);

        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));

        continue;
      }

      console.log(`[uploadWithRetry] 请求成功（非 5xx 错误），状态码: ${response.status}`);
      return response;
    } catch (error) {
      lastError = error as Error;
      console.error(`[uploadWithRetry] 请求失败 (尝试 ${attempt}/${maxRetries}):`, error);

      // 如果是网络错误，可以重试
      if (attempt < maxRetries) {
        console.log(`[uploadWithRetry] 等待 ${retryDelay * attempt}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
    }
  }

  // 所有重试都失败，抛出最后一个错误
  throw lastError || new Error("上传失败，已达到最大重试次数");
}

// 岗位定义
const positions = [
  { id: "hr", title: "人事", description: "人力资源相关岗位" },
  { id: "ai_management", title: "智能体管培生", description: "智能体方向管理培训生" },
];

// 连续性关键词列表（表示候选人还有话要说）
// 注意：只保留真正的"还要继续说话"的指示词，避免常见连接词导致的误判
const CONTINUITY_KEYWORDS = [
  // 连接词（表示还有话要说）
  "和", "跟", "与", "同", "及", "以及", "除了", "同时", "况且", "而且", "何况", "还有", "并且", "再加上", "此外", "不仅如此", "除此之外", "不只", "另外", "再说", "特别是", "尤其", "甚至", "另一方面", "相对地", "以后", "以前",
  
  // 举例说明词（表示继续展开）
  "好比", "如同", "似乎", "像", "具体来说", "例如", "如", "一般", "比方", "比如", "比如说",
  
  // 解释说明词（表示进一步说明）
  "也就是说", "其实", "原本", "换句话说", "讲白了", "换言之", "总而言之", "总的说来", "综合而言", "简言之",
  
  // 假设条件词（表示继续论证）
  "如果", "如果不是", "假设", "若是", "假使", "倘若", "要是", "譬如", "或", "或者", "原来",
  
  // 因果关系词（表示继续阐述原因或结果）
  "因为", "由于", "理由是", "原因是", "基于", "因此", "所以", "以致", "以便", "致使",
  
  // 转折词（表示还有反驳或补充）
  "却", "但是", "然而", "而", "偏偏", "只是", "不过", "至于", "不料", "可是", "虽", "虽然", "那么",
  
  // 顺序词（表示继续）
  "接下来", "然后",
  
  // 明确的"还要说"指示词
  "还", "还有", "还有呢", "还有个事儿", "对了", "再补充下", "再补充一下", "补充一点", "另", "另有", "更有", "再则", "且"
];

// 检查文本是否包含连续性关键词（表示还有话要说）
const containsContinuityKeyword = (text: string): boolean => {
  if (!text || text.trim().length === 0) {
    return false;
  }

  // 获取文本的最后 8 个字（用于检测是否还有话要说）
  // 只检测最后几个字，而不是整句话
  const CHECK_LENGTH = 8;
  const lastChars = text.slice(-CHECK_LENGTH);
  
  console.log(`[连续性检测] 检测最后 ${CHECK_LENGTH} 个字: "${lastChars}"`);

  // 检查最后几个字是否包含连续性关键词
  for (const keyword of CONTINUITY_KEYWORDS) {
    if (lastChars.includes(keyword)) {
      console.log(`[连续性检测] 发现连续性关键词 "${keyword}"，最后 ${CHECK_LENGTH} 个字: "${lastChars}"`);
      return true;
    }
  }

  console.log(`[连续性检测] 未发现连续性关键词，最后 ${CHECK_LENGTH} 个字: "${lastChars}"`);
  return false;
};

// 音频设备配置 - 启用回音消除和噪声抑制
const AUDIO_CONSTRAINTS = {
  audio: {
    echoCancellation: true,      // 启用回音消除
    noiseSuppression: true,      // 启用噪声抑制
    autoGainControl: true,       // 启用自动增益控制
    channelCount: 1,             // 单声道（减少数据传输量）
    sampleRate: 48000,           // 48kHz 采样率（高质量）
    sampleSize: 16,              // 16位采样深度
  },
  video: {
    width: { ideal: 1280 },      // 720p
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
    facingMode: 'user',          // 前置摄像头（用户侧）
    aspectRatio: { ideal: 16/9 }, // 16:9 宽高比
  },
};

// 降级视频约束（当高质量配置失败时使用）
const FALLBACK_VIDEO_CONSTRAINTS = {
  video: {
    width: { ideal: 640 },       // 480p（更低质量）
    height: { ideal: 480 },
    frameRate: { ideal: 15, max: 15 },
    facingMode: 'user',
  },
};

const PREFER_RECORDING_MODE = true;
const TTS_REQUEST_TIMEOUT_MS = 60000;
const BROWSER_SPEECH_START_TIMEOUT_MS = 5000;
const MAX_TTS_AUDIO_CACHE_ENTRIES = 12;

function splitTextForSpeechSynthesis(text: string): string[] {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return [];
  }

  const segments = normalizedText
    .split(/(?<=[。！？!?；;，,])/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let currentChunk = "";

  for (const segment of segments) {
    if (!currentChunk) {
      currentChunk = segment;
      continue;
    }

    if ((currentChunk + segment).length <= 70) {
      currentChunk += segment;
      continue;
    }

    chunks.push(currentChunk);
    currentChunk = segment;
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks.length > 0 ? chunks : [normalizedText];
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveLinkIdFromLocation(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const queryId = searchParams.get("id");
  if (queryId) {
    return queryId;
  }

  const pathname = window.location.pathname.replace(/\/+$/, "");
  const shortLinkMatch = pathname.match(/(?:^|\/)i\/([^/]+)$/);
  if (shortLinkMatch?.[1]) {
    return decodeURIComponent(shortLinkMatch[1]);
  }

  return null;
}

function shouldForceRecordingFallback(userAgent: string): boolean {
  if (PREFER_RECORDING_MODE) {
    return true;
  }

  const normalized = userAgent || "";
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(normalized);
  const isWechatBrowser = /MicroMessenger/i.test(normalized);
  const isQuarkBrowser = /Quark/i.test(normalized);
  const isUCBrowser = /UCBrowser|UCWEB/i.test(normalized);
  const is360Browser = /360SE|360EE|QihooBrowser/i.test(normalized);
  const isSogouBrowser = /MetaSr|SogouMobileBrowser/i.test(normalized);
  const isQQBrowser = /QQBrowser/i.test(normalized);
  const isBaiduBrowser = /Baidu|BIDUBrowser|baiduboxapp/i.test(normalized);
  const isHuaweiBrowser = /HuaweiBrowser/i.test(normalized);
  const isXiaomiBrowser = /MiuiBrowser/i.test(normalized);
  const isVivoBrowser = /VivoBrowser/i.test(normalized);
  const isOppoBrowser = /HeyTapBrowser|OppoBrowser/i.test(normalized);

  return (
    isMobileDevice ||
    isWechatBrowser ||
    isQuarkBrowser ||
    isUCBrowser ||
    is360Browser ||
    isSogouBrowser ||
    isQQBrowser ||
    isBaiduBrowser ||
    isHuaweiBrowser ||
    isXiaomiBrowser ||
    isVivoBrowser ||
    isOppoBrowser
  );
}

interface Message {
  id: string;
  role: "interviewer" | "candidate";
  content: string;
  timestamp: Date;
  roundNumber?: number; // 轮次编号（用于分页显示）
}

type TtsAudioResponse = {
  success: boolean;
  audioBase64?: string;
  audioFormat?: string;
  audioSize?: number;
  voiceId?: string;
  provider?: string;
  error?: string;
  fallbackToBrowser?: boolean;
  fallbackToBrowserSpeech?: boolean;
};

interface Evaluation {
  isEliminated: boolean;
  eliminationReason: string | null;
  overallScore5: number;
  overallScore100: number;
  categoryScores: Record<string, { score: number; basis: string }>;
  categoryLabels: Record<string, string>;
  summary: string;
  strengths: string[];
  improvements: string[];
  recommendation: "hire" | "consider" | "reject";
  error?: string;  // 可选的错误信息
}

export default function FullAiInterviewSharePage() {
  const router = useRouter();

  // 版本检查：强制刷新页面以加载最新代码
  useEffect(() => {
    const CURRENT_VERSION = "v1.0.32";
    const VERSION_KEY = "full-ai-interview-version";

    const savedVersion = localStorage.getItem(VERSION_KEY);
    console.log(`[版本检查] 当前版本: ${CURRENT_VERSION}, 本地版本: ${savedVersion}`);

    if (savedVersion && savedVersion !== CURRENT_VERSION) {
      console.log(`[版本检查] 检测到版本更新 (${savedVersion} → ${CURRENT_VERSION})，强制刷新页面`);
      localStorage.setItem(VERSION_KEY, CURRENT_VERSION);

      // 强制刷新页面，绕过所有缓存
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        // 如果有 Service Worker，先注销
        navigator.serviceWorker.getRegistrations().then(registrations => {
          registrations.forEach(registration => registration.unregister());
          setTimeout(() => {
            // 添加版本查询参数来强制绕过缓存
            const url = new URL(window.location.href);
            url.searchParams.set('v', CURRENT_VERSION);
            window.location.href = url.toString();
          }, 500);
        });
      } else {
        // 直接刷新，添加版本查询参数
        setTimeout(() => {
          const url = new URL(window.location.href);
          url.searchParams.set('v', CURRENT_VERSION);
          window.location.href = url.toString();
        }, 100);
      }
    } else if (!savedVersion) {
      // 首次访问，保存版本并添加查询参数
      localStorage.setItem(VERSION_KEY, CURRENT_VERSION);
      const url = new URL(window.location.href);
      if (!url.searchParams.has('v')) {
        url.searchParams.set('v', CURRENT_VERSION);
        window.location.href = url.toString();
      }
    }
  }, []);

  const [isConfigLoading, setIsConfigLoading] = useState(true);
  const [configError, setConfigError] = useState("");

  // 调试日志状态
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  // 添加日志的函数
  const addDebugLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    setDebugLogs(prev => [...prev.slice(-9), logMessage]); // 只保留最后 10 条
    console.log(message); // 同时输出到控制台
  };

  // 检测候选人问题是否涉及公司相关信息（用于区分回答和提问）
  const isCompanyRelatedQuestion = (text: string): boolean => {
    const companyKeywords = [
      "公司", "企业", "集团", "发展史", "企业文化", "公司架构",
      "员工风采", "品牌", "合作", "未来规划", "历史", "荣誉",
      "介绍", "概况", "怎么样", "做什麽", "主营业务", "业务范围",
      "规模", "人数", "成立时间", "创始人", "总部", "分店",
      "员工", "团队", "福利", "培训", "晋升", "发展", "前景",
      "我想问", "请问", "我想了解", "能不能介绍一下", "关于"
    ];

    const lowerText = text.toLowerCase();
    return companyKeywords.some(keyword => lowerText.includes(keyword));
  };

  // 保存候选人问题记录到文件（只记录第三阶段）
  const saveCandidateQuestionRecord = async (
    question: string,
    answer?: string,
    type: "candidate_question" | "interviewer_answer" = "candidate_question"
  ) => {
    try {
      const currentInterviewId = interviewIdRef.current || interviewId;
      if (!currentInterviewId) {
        console.warn("[候选人问题记录] 没有面试ID，跳过保存");
        return;
      }

      // 只记录第三阶段的问答
      const currentStage = interviewStageRef.current;
      if (currentStage !== 3) {
        console.log(`[候选人问题记录] 当前阶段为${currentStage}（非第三阶段），跳过保存`);
        return;
      }

      console.log(`[候选人问题记录] 保存记录: stage=${currentStage}, type=${type}, question=${question.substring(0, 50)}...`);
      
      const response = await fetch("/api/full-ai-interview/candidate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interviewId: currentInterviewId,
          candidateName: fixedCandidateNameRef.current || candidateName,
          position: fixedPositionRef.current || selectedPosition,
          question,
          answer,
          type,
          timestamp: new Date().toISOString(),
          stage: currentStage, // 传递面试阶段
        }),
      });

      const result = await response.json();
      if (result.success) {
        if (result.skipped) {
          console.log(`[候选人问题记录] 服务端跳过保存（非第三阶段）`);
        } else {
          console.log(`[候选人问题记录] 保存成功，当前汇总文件共 ${result.data?.totalRecords || 0} 条记录`);
        }
      } else {
        console.error("[候选人问题记录] 保存失败:", result.error);
      }
    } catch (error) {
      console.error("[候选人问题记录] 保存异常:", error);
    }
  };

  const [candidateName, setCandidateName] = useState("");
  const [selectedMode, setSelectedMode] = useState("");
  const [selectedPosition, setSelectedPosition] = useState("");
  const [selectedPositionLabel, setSelectedPositionLabel] = useState("");
  const [interviewerVoice, setInterviewerVoice] = useState(DEFAULT_INTERVIEWER_VOICE_ID);
  const [interviewId, setInterviewId] = useState("");
  const interviewIdRef = useRef(""); // 使用 ref 存储最新的 interviewId，避免状态更新延迟问题
  const hasUploadedRecordingRef = useRef(false); // 防止重复上传录屏
  const lastCandidateQuestionRef = useRef<string | null>(null); // 存储最后一条候选人问题，用于AI回复时关联
  const interviewStageRef = useRef<number>(1); // 当前面试阶段（1=自我介绍, 2=核心问题, 3=问答）
  const [expectedCandidateName, setExpectedCandidateName] = useState(""); // 面试官端设置的候选人姓名（用于验证）

  // 语义检测：判断候选人是否已经回答完成
  const checkAnswerCompletionWithSemantic = async (answerText: string): Promise<boolean> => {
    console.log("[语义检测] 开始检测回答是否完整...");
    console.log("[语义检测] 回答文本:", answerText.substring(0, 100) + "...");
    
    try {
      const interviewId = interviewIdRef.current;
      if (!interviewId) {
        console.error("[语义检测] 未找到面试ID");
        return false;
      }
      
      const response = await fetch('/api/full-ai-interview/detect-answer-end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          interviewId: interviewId,
          answer: answerText,
        }),
      });
      
      if (!response.ok) {
        console.error("[语义检测] API 请求失败:", response.status);
        return false; // 默认认为未完成，继续监听
      }
      
      const result = await response.json();
      console.log("[语义检测] API 返回结果:", result);
      
      // 兼容两种返回格式：
      // 1. { hasEnded: true/false }
      // 2. { isComplete: true/false }
      const isComplete = result.hasEnded === true || result.isComplete === true;
      console.log(`[语义检测] 语义判断结果: ${isComplete ? '回答完成' : '回答未完成'}`);
      
      return isComplete;
    } catch (error) {
      console.error("[语义检测] 语义检测失败:", error);
      return false; // 默认认为未完成，继续监听
    }
  };

  const [showPreparationInfo, setShowPreparationInfo] = useState(false);

  // 恢复面试相关状态
  const [showResumeDialog, setShowResumeDialog] = useState(false); // 是否显示恢复面试对话框
  const [unfinishedInterview, setUnfinishedInterview] = useState<any>(null); // 未完成的面试信息
  const [isCheckingSession, setIsCheckingSession] = useState(false); // 是否正在检查会话

  const [isStarted, setIsStarted] = useState(false);
  const [isInterviewEnded, setIsInterviewEnded] = useState(false); // 面试是否已结束
  const isInterviewEndedRef = useRef(false); // 使用 ref 跟踪面试是否结束，确保在闭包中获取到最新值
  const isEndingInterviewRef = useRef(false); // 结束流程是否已触发，避免结束后仍继续提问/播放
  const playbackGenerationRef = useRef(0); // 用于让晚到的语音请求/浏览器朗读失效
  const ttsAbortControllerRef = useRef<AbortController | null>(null);
  const activeTtsRequestKeyRef = useRef<string | null>(null);
  const ttsAudioCacheRef = useRef<Map<string, TtsAudioResponse>>(new Map());
  const ttsPendingRequestCacheRef = useRef<Map<string, Promise<TtsAudioResponse>>>(new Map());
  const [messages, setMessages] = useState<Message[]>([]);
  const chatContainerRef = useRef<HTMLDivElement>(null);  // 聊天容器ref，用于自动滚动
  const [isLoading, setIsLoading] = useState(false);
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [currentRound, setCurrentRound] = useState(0);
  const [currentRoundView, setCurrentRoundView] = useState(0); // 当前查看的轮次（用于分页显示）
  const [totalRounds, setTotalRounds] = useState(5);
  const [isRecording, setIsRecording] = useState(false);
  const [isScreenRecording, setIsScreenRecording] = useState(false);  // 区分录屏和录音状态
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);
  const isPlayingAudioRef = useRef(false); // 跟踪是否正在播放音频
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string>("");
  const [recordedSignedUrl, setRecordedSignedUrl] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null); // 新增：存储上传错误信息
  const [userAnswer, setUserAnswer] = useState("");
  const [interviewTime, setInterviewTime] = useState<string>("");
  const [showReminder, setShowReminder] = useState(false);
  const [showVoiceDiagnosis, setShowVoiceDiagnosis] = useState(false);
  const [voiceDiagnosisResult, setVoiceDiagnosisResult] = useState<any>(null);
  const [showRecordingConsent, setShowRecordingConsent] = useState(false);
  const [recordingConsented, setRecordingConsented] = useState(false);
  const [showRecordingRequiredAlert, setShowRecordingRequiredAlert] = useState(false); // 录屏必需提示对话框
  const [showEndInterviewConfirm, setShowEndInterviewConfirm] = useState(false); // 结束面试确认对话框
  const [showDevicePermissionAlert, setShowDevicePermissionAlert] = useState(false);
  const [devicePermissionMessage, setDevicePermissionMessage] = useState("");
  const [permissionRetryAction, setPermissionRetryAction] = useState<"restartInterview" | "startRecording">("restartInterview");
  const [isRecheckingPermissions, setIsRecheckingPermissions] = useState(false);

  // 网络状态监听
  useEffect(() => {
    const handleOnline = () => {
      console.log('[网络状态] 网络已连接');
      toast.success("网络已连接", { duration: 3000 });
    };

    const handleOffline = () => {
      console.log('[网络状态] 网络已断开');
      toast.error("网络已断开，请检查网络连接", { duration: 5000 });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 初始检查
    console.log('[网络状态] 初始网络状态:', navigator.onLine ? '在线' : '离线');

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 语音识别相关状态 - 使用新的封装类
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const speechRecognizerRef = useRef<InterviewSpeechRecognizer | null>(null);
  const isListeningRef = useRef(false);  // 使用 ref 存储最新的监听状态
  const accumulatedTranscriptRef = useRef("");  // 使用 ref 存储累积的最终文本
  const recordingAssistTranscriptRef = useRef("");  // 录音模式下保留最终文本 + 中间文本，用于本地兜底转写
  const lastTranscriptLengthRef = useRef(0);  // 记录上一次的文本长度，用于检测停顿
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);  // 停顿检测超时
  const isDetectingSilenceRef = useRef(false);  // 是否正在检测停顿
  const silenceDetectionCountRef = useRef(0);  // 连续停顿检测次数（防止死循环）
  const isSemanticCheckingRef = useRef(false);  // 是否正在进行语义检测
  const shouldRestartRef = useRef(false);  // 是否应该重启识别器
  const hasNetworkErrorRef = useRef(false);  // 是否发生过网络错误（用于避免强制切换回浏览器方案）
  const isPreheatingRef = useRef(false);  // 是否处于预热状态（音频播放完成后预热识别器）
  const isManualRecordingReadyRef = useRef(false);  // 手动录音是否已准备好（预热完成后设为true）
  const isManualRecordingRef = useRef(false);  // 手动录音状态（用于回调中获取最新值）
  const isStoppingManualRecordingRef = useRef(false);  // 停止录音时保留最后一段浏览器识别结果
  const isSubmittingAnswerRef = useRef(false);  // 防止同一题重复提交，导致后端短时间内被多次调用

  // 录音 + 服务端识别相关状态（降级方案）
  const [useFallbackRecording, setUseFallbackRecording] = useState(PREFER_RECORDING_MODE);  // 默认优先使用录音方案
  const useFallbackRecordingRef = useRef(false);  // ref 存储 useFallbackRecording 的最新值
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);  // MediaRecorder 实例
  const recordingAudioStreamRef = useRef<MediaStream | null>(null); // 录音专用音频流，提前预热避免点击后丢字
  const screenMediaRecorderRef = useRef<MediaRecorder | null>(null);  // 录屏 MediaRecorder 实例
  const recordedChunksRef = useRef<Blob[]>([]);  // 录制的音频块
  const [recordingDuration, setRecordingDuration] = useState(0);  // 录音时长
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);  // 录音计时器
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);  // 录音超时定时器（60秒后自动停止）

  // 回答结束检测相关状态 - 已禁用自动检测，改为手动提交
  const [isDetectingAnswerEnd, setIsDetectingAnswerEnd] = useState(false);
  const [lastDetectedTranscript, setLastDetectedTranscript] = useState("");
  const [silenceDuration, setSilenceDuration] = useState(0);
  
  // 手动控制录音状态
  const [isManualRecording, setIsManualRecording] = useState(false);  // 是否正在手动录音
  const [hasRecordedContent, setHasRecordedContent] = useState(false);  // 是否有录制内容待提交

  // 视频通话相关状态
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isVideoStreamStartedRef = useRef(false);  // 追踪视频流是否已启动

  // 录屏完成 Promise
  const recordingCompletePromiseRef = useRef<Promise<Blob> | null>(null);

  // 录屏数据块和 resolve 函数（使用 ref 避免闭包问题）
  const screenRecordedChunksRef = useRef<Blob[]>([]);
  const stopRecordingResolveRef = useRef<((blob: Blob) => void) | null>(null);

  // 设备类型检测
  const [isMobile, setIsMobile] = useState(false);
  const [isRecordingSkipped, setIsRecordingSkipped] = useState(false); // 标记是否跳过了录屏（移动端不支持）

  // 候选人状态监控
  const candidateMonitorRef = useRef<CandidateMonitor | null>(null);
  const monitorInitializedRef = useRef(false); // 跟踪监控器是否已成功初始化
  const fixedCandidateNameRef = useRef(""); // 保存面试开始时的候选人姓名
  const fixedPositionRef = useRef(""); // 保存面试开始时的岗位
  const [candidateStatus, setCandidateStatus] = useState<CandidateStatus | null>(null);
  const [showCandidateStatus, setShowCandidateStatus] = useState(false); // 是否显示状态面板

  // 检测设备类型和浏览器兼容性
  useEffect(() => {
    const checkDeviceType = () => {
      const userAgent = navigator.userAgent || '';
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent) ||
                            (userAgent.includes('Mac') && 'ontouchend' in document);
      setIsMobile(isMobileDevice);
      
      // 检测是否是微信浏览器
      const isWechatBrowser = /MicroMessenger/i.test(userAgent);
      
      // 检测是否是 Chrome 浏览器（非 Edge）
      // Chrome 的 UA 包含 "Chrome" 但不包含 "Edg/"
      // 注意：Edge 的 UA 也包含 "Chrome"，但会额外包含 "Edg/"
      const isChromeBrowser = /Chrome/.test(userAgent) && !/Edg/.test(userAgent) && !/OPR/.test(userAgent) && !/Brave/.test(userAgent);
      
      // 检测是否是 Edge 浏览器
      const isEdgeBrowser = /Edg/.test(userAgent);
      
      // 检测是否是夸克浏览器
      const isQuarkBrowser = /Quark/.test(userAgent);
      
      // 检测是否是 UC 浏览器
      const isUCBrowser = /UCBrowser|UCWEB/.test(userAgent);
      
      // 检测是否是 360 浏览器
      const is360Browser = /360SE|360EE/.test(userAgent);
      
      // 检测是否是搜狗浏览器
      const isSogouBrowser = /Sogou/.test(userAgent);
      
      // 检测是否是 QQ 浏览器
      const isQQBrowser = /QQBrowser/.test(userAgent);
      
      // 检测是否是百度浏览器
      const isBaiduBrowser = /Baidu|BIDUBrowser|baiduboxapp/i.test(userAgent);
      
      // 检测是否是华为浏览器
      const isHuaweiBrowser = /HuaweiBrowser/i.test(userAgent);
      
      // 检测是否是小米浏览器
      const isXiaomiBrowser = /MiuiBrowser/i.test(userAgent);
      
      // 检测是否是 Vivo 浏览器
      const isVivoBrowser = /VivoBrowser/i.test(userAgent);
      
      // 检测是否是 Oppo 浏览器
      const isOppoBrowser = /HeyTapBrowser|OppoBrowser/i.test(userAgent);
      
      console.log('[设备检测] 设备类型:', isMobileDevice ? '移动端' : '电脑端', 'UserAgent:', userAgent.substring(0, 100));
      console.log('[设备检测] 浏览器检测:', {
        isWechatBrowser,
        isChromeBrowser,
        isEdgeBrowser,
        isQuarkBrowser,
        isUCBrowser,
        is360Browser,
        isSogouBrowser,
        isQQBrowser,
        isBaiduBrowser,
        isHuaweiBrowser,
        isXiaomiBrowser,
        isVivoBrowser,
        isOppoBrowser
      });
      
      // 判断是否需要使用录音方案
      // 1. 移动端（移动端浏览器对 Web Speech API 支持普遍不好）
      // 2. 微信浏览器
      // 3. Chrome 浏览器（使用 Google 语音服务，中国大陆不可用）
      // 4. Edge 浏览器（统一使用录音方案）
      // 5. 夸克浏览器（基于 Chromium，使用 Google 语音服务）
      // 6. UC 浏览器
      // 7. 360 浏览器
      // 8. 搜狗浏览器
      // 9. QQ 浏览器
      // 10. 百度浏览器
      // 11. 华为浏览器
      // 12. 小米浏览器
      // 13. Vivo 浏览器
      // 14. Oppo 浏览器
      const needsFallback = shouldForceRecordingFallback(userAgent);
      
      if (needsFallback) {
        console.log('[设备检测] 检测到需要使用录音方案的浏览器，自动切换到录音方案');
        setUseFallbackRecording(true);
        useFallbackRecordingRef.current = true;
        
        // 延迟显示提示，避免与其他提示冲突
        setTimeout(() => {
          if (isWechatBrowser) {
            toast.info("已为您启用录音识别方案", {
              duration: 6000,
              description: "微信浏览器正在使用录音识别模式，请在安静环境下清晰回答问题。",
            });
          } else if (isEdgeBrowser) {
            toast.info("已为您启用录音识别方案", {
              duration: 6000,
              description: "请点击录音按钮开始回答问题，录音完成后点击提交。",
            });
          } else if (isChromeBrowser) {
            toast.info("已为您启用录音识别方案", {
              duration: 6000,
              description: "请点击录音按钮开始回答问题，录音完成后点击提交。",
            });
          } else if (isQuarkBrowser) {
            toast.info("已为您启用录音识别方案", {
              duration: 6000,
              description: "夸克浏览器的实时语音识别服务可能不稳定，请点击录音按钮开始回答问题。",
            });
          } else if (isMobileDevice) {
            toast.info("已为您启用录音识别方案，请在安静环境下清晰回答问题", {
              duration: 5000,
              description: "移动端浏览器对实时语音识别支持有限，录音识别同样可以完成面试"
            });
          } else {
            toast.info("已为您启用录音识别方案，请在安静环境下清晰回答问题", {
              duration: 5000,
            });
          }
        }, 2000);
      } else {
        // 其他支持良好的浏览器，使用实时语音识别
        console.log('[设备检测] 使用实时语音识别方案（浏览器支持良好）');
      }
    };

    checkDeviceType();
  }, []);

  // 从URL参数加载面试配置
  useEffect(() => {
    const loadConfig = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const id = resolveLinkIdFromLocation();
      const name = searchParams.get("name");
      const mode = searchParams.get("mode");
      const position = searchParams.get("position");
      const positionLabel = searchParams.get("positionLabel");

      if (!id) {
        setConfigError("无效的面试链接");
        setIsConfigLoading(false);
        return;
      }

      // 只设置状态，不设置 ref（避免使用错误的 linkId）
      // ref 会在面试开始时设置为正确的 interviewId
      setInterviewId(id);
      setSelectedMode(mode || "");
      setSelectedPosition(position || "");
      setSelectedPositionLabel(positionLabel || position || "");

      // 从URL参数设置候选人姓名
      if (name) {
        setCandidateName(name);
        console.log(`[候选人端] 从URL参数设置候选人姓名: ${name}`);
      }

      // 获取完整配置
      try {
        const response = await fetch(`/api/full-ai-interview/save-config?id=${id}`);
        const result = await safeParseResponse(response);

        if (result.success && result.config) {
          console.log(`[候选人端] 获取配置成功: id=${id}, resume长度=${result.config.resume?.length || 0}, 配置中的候选人姓名: ${result.config.candidateName}`);
          setSelectedMode(mode || result.config.mode || "");
          setSelectedPosition(position || result.config.position || "");
          setSelectedPositionLabel(positionLabel || result.config.position || position || "");
          setInterviewTime(result.config.interviewTime || "");
          setExpectedCandidateName(result.config.candidateName || ""); // 获取面试官端设置的候选人姓名
          if (typeof result.config.interviewerVoice === "string" && result.config.interviewerVoice.trim()) {
            setInterviewerVoice(result.config.interviewerVoice);
          }

          // 如果URL中的姓名为空或与配置中的姓名不匹配，使用配置中的姓名
          if (!name || (result.config.candidateName && name !== result.config.candidateName)) {
            if (!name) {
              console.warn(`[候选人端] URL中未提供姓名，使用配置中的姓名: ${result.config.candidateName}`);
            } else {
              console.warn(`[候选人端] URL中的姓名"${name}"与配置中的姓名"${result.config.candidateName}"不匹配，使用配置中的姓名`);
            }
            setCandidateName(result.config.candidateName || "");
          }

          if (!result.config.resume || result.config.resume.trim().length === 0) {
            setConfigError("面试官未上传简历，请联系面试官重新生成链接");
          }
        } else {
          console.error(`[候选人端] 获取配置失败:`, result.error);
          setConfigError("面试配置不存在");
        }
      } catch (error) {
        console.error("获取面试配置失败:", error);
        setConfigError("获取面试配置失败");
      }

      setIsConfigLoading(false);

      // 配置加载完成后，检查是否有未完成的面试
      if (id) {
        await checkUnfinishedInterview(id);
      }
    };

    loadConfig();
  }, []);

  // 检查是否有未完成的面试
  const checkUnfinishedInterview = async (linkId: string) => {
    if (isCheckingSession) {
      console.log('[检查未完成面试] 正在检查中，跳过');
      return;
    }

    setIsCheckingSession(true);
    console.log(`[检查未完成面试] 开始检查 linkId: ${linkId}`);

    try {
      const response = await fetch(`/api/full-ai-interview/check-session?linkId=${linkId}`);
      const result = await response.json();

      if (result.success && result.hasUnfinishedInterview) {
        console.log(`[检查未完成面试] 发现未完成的面试:`, result.interviewInfo);
        setUnfinishedInterview(result.interviewInfo);
        setShowResumeDialog(true);
      } else {
        console.log(`[检查未完成面试] 没有未完成的面试`);
      }
    } catch (error) {
      console.error('[检查未完成面试] 检查失败:', error);
    } finally {
      setIsCheckingSession(false);
    }
  };

  // 恢复未完成的面试
  const handleResumeInterview = async () => {
    if (!unfinishedInterview) {
      return;
    }

    console.log(`[恢复面试] 开始恢复面试: ${unfinishedInterview.interviewId}`);
    setShowResumeDialog(false);
    setIsLoading(true);

    try {
      const response = await fetch(`/api/full-ai-interview/resume-session?interviewId=${unfinishedInterview.interviewId}`);
      const result = await response.json();

      if (result.success && result.session) {
        console.log(`[恢复面试] 面试恢复成功`);

        // 恢复面试状态
        const session = result.session;
        interviewIdRef.current = session.interviewId;
        setInterviewId(session.interviewId);
        fixedCandidateNameRef.current = session.candidateName || "";
        fixedPositionRef.current = session.positionId || "";
        setSelectedPosition(session.positionId || "");
        setSelectedPositionLabel(session.position?.name || session.positionId || "");
        setSelectedMode(session.mode || "");
        setCandidateName(session.candidateName || "");

        // 恢复消息列表
        const restoredMessages = (session.messages || []).map((msg: any, index: number) => ({
          ...msg,
          id: msg.id || `msg-${Date.now()}-${index}`,
          timestamp: new Date(msg.timestamp)
        }));
        setMessages(restoredMessages);

        // 恢复面试阶段
        interviewStageRef.current = session.interviewStage;
        setCurrentRound(session.currentQuestionCount || 0);

        // 设置面试已开始
        setIsStarted(true);
        setRecordingConsented(true); // 已经同意过录屏

        toast.success("面试已恢复，请继续");

        // 启动轮询
        startPolling(session.interviewId);
      } else {
        console.error(`[恢复面试] 恢复失败:`, result.error);
        toast.error(result.error || "恢复面试失败，请重新开始");
      }
    } catch (error) {
      console.error('[恢复面试] 恢复失败:', error);
      toast.error("恢复面试失败，请重新开始");
    } finally {
      setIsLoading(false);
    }
  };

  // 重新开始面试（放弃之前的进度）
  const handleStartNewInterview = () => {
    console.log(`[重新开始] 放弃之前的面试进度`);
    setShowResumeDialog(false);
    setUnfinishedInterview(null);
    // 不设置 isStarted，让用户从开始页面进入
  };

  // 面试状态轮询和恢复机制
  // 用于处理页面刷新后恢复面试状态
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRestoringRef = useRef(false); // 是否正在恢复状态

  // 从服务器恢复面试状态
  // 注意：interviewIdFromUrl 参数实际上是 linkId（面试链接ID）
  const restoreInterviewState = async (interviewIdFromUrl: string) => {
    if (isRestoringRef.current) {
      console.log('[状态恢复] 正在恢复中，跳过');
      return;
    }

    isRestoringRef.current = true;
    console.log(`[状态恢复] 开始从服务器获取面试状态，linkId: ${interviewIdFromUrl}`);

    try {
      // 使用 linkId 参数查询，后端会查找该链接下进行中的面试
      const response = await fetch(`/api/full-ai-interview/status?linkId=${interviewIdFromUrl}`);
      const result = await response.json();

      if (result.success && result.status) {
        const status = result.status;
        console.log(`[状态恢复] 获取到面试状态:`, {
          interviewStage: status.interviewStage,
          currentQuestionCount: status.currentQuestionCount,
          messagesCount: status.messages?.length || 0
        });

        // 检查面试是否已开始（有消息记录）
        if (status.messages && status.messages.length > 0) {
          console.log(`[状态恢复] 检测到面试已开始，恢复状态`);

          // 恢复面试状态
          interviewIdRef.current = status.interviewId;
          fixedCandidateNameRef.current = status.candidateName || "";
          fixedPositionRef.current = status.positionId || "";
          setSelectedPositionLabel(status.position?.name || status.positionId || "");

          // 恢复消息列表
          const restoredMessages = status.messages.map((msg: any, index: number) => ({
            ...msg,
            id: msg.id || `msg-${Date.now()}-${index}`,
            timestamp: new Date(msg.timestamp)
          }));
          setMessages(restoredMessages);

          // 恢复面试阶段
          interviewStageRef.current = status.interviewStage;
          
          // 设置面试已开始
          setIsStarted(true);
          setCurrentRound(status.currentQuestionCount || 1);
          setCurrentRoundView(status.currentQuestionCount || 1);

          toast.success("已恢复面试进度", {
            description: "检测到您有进行中的面试，已自动恢复"
          });

          console.log(`[状态恢复] 状态恢复完成`);
        } else {
          console.log(`[状态恢复] 面试尚未开始，无需恢复`);
        }
      } else {
        console.log(`[状态恢复] 未找到面试状态或面试尚未开始`);
      }
    } catch (error) {
      console.error('[状态恢复] 恢复面试状态失败:', error);
    } finally {
      isRestoringRef.current = false;
    }
  };

  // 启动状态轮询
  const startPolling = (interviewIdToPoll: string) => {
    // 如果已经有轮询在运行，先停止
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    console.log(`[状态轮询] 启动轮询，interviewId: ${interviewIdToPoll}`);

    // 每5秒轮询一次
    pollingIntervalRef.current = setInterval(async () => {
      // 如果面试已结束，停止轮询
      if (isInterviewEndedRef.current) {
        console.log(`[状态轮询] 面试已结束，停止轮询`);
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        return;
      }

      try {
        const response = await fetch(`/api/full-ai-interview/status?interviewId=${interviewIdToPoll}`);
        const result = await response.json();

        if (result.success && result.status) {
          const status = result.status;
          
          // 只同步关键状态，不同步消息（消息由回答流程更新）
          // 如果检测到阶段变化，更新本地状态
          if (status.interviewStage !== interviewStageRef.current) {
            console.log(`[状态轮询] 检测到阶段变化: ${interviewStageRef.current} -> ${status.interviewStage}`);
            interviewStageRef.current = status.interviewStage;
          }
        }
      } catch (error) {
        console.error('[状态轮询] 轮询失败:', error);
      }
    }, 5000);
  };

  // 页面加载时检查并恢复面试状态
  useEffect(() => {
    const checkAndRestoreState = async () => {
      const id = resolveLinkIdFromLocation();

      if (id && !isStarted && !isInterviewEnded) {
        // 等待配置加载完成后再尝试恢复
        if (!isConfigLoading) {
          console.log(`[状态恢复] 页面加载完成，检查是否需要恢复面试状态`);
          await restoreInterviewState(id);
          
          // 如果面试已恢复，启动轮询
          if (isStarted) {
            startPolling(interviewIdRef.current || id);
          }
        }
      }
    };

    // 延迟执行，确保配置已加载
    const timer = setTimeout(checkAndRestoreState, 1000);

    return () => clearTimeout(timer);
  }, [isConfigLoading, isStarted, isInterviewEnded]);

  // 面试开始后启动轮询
  useEffect(() => {
    if (isStarted && interviewIdRef.current && !isInterviewEnded) {
      startPolling(interviewIdRef.current);
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isStarted, isInterviewEnded]);

  // 15分钟前提醒逻辑
  useEffect(() => {
    if (!interviewTime) return;

    const checkReminder = () => {
      const now = new Date();
      const interviewDate = new Date(interviewTime);
      const timeDiff = interviewDate.getTime() - now.getTime();

      // 15分钟 = 15 * 60 * 1000 毫秒
      const fifteenMinutes = 15 * 60 * 1000;

      // 如果距离面试开始还有15分钟（误差范围1分钟内）
      if (timeDiff > 0 && timeDiff <= fifteenMinutes && timeDiff > fourteenMinutes) {
        setShowReminder(true);
      }
    };

    // 14分钟 = 14 * 60 * 1000 毫秒
    const fourteenMinutes = 14 * 60 * 1000;

    // 立即检查一次
    checkReminder();

    // 每分钟检查一次
    const interval = setInterval(checkReminder, 60000);

    return () => clearInterval(interval);
  }, [interviewTime]);

  // 初始化语音识别
  useEffect(() => {
    if (typeof window === 'undefined') {
      console.log('[语音识别] window 未定义，跳过初始化');
      return;
    }

    // 检查浏览器是否支持语音识别
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.log('[语音识别] 浏览器不支持语音识别，跳过初始化');
      return;
    }

    // 初始化新的语音识别器
    console.log('[语音识别] 初始化 InterviewSpeechRecognizer...');
    console.log('[语音识别] 检查浏览器支持:', {
      hasSpeechRecognition: 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window,
      hasWebkitSpeechRecognition: 'webkitSpeechRecognition' in window,
      userAgent: navigator.userAgent
    });
    
    try {
      const recognizer = new InterviewSpeechRecognizer({
        language: 'zh-CN',
        continuous: true,
        interimResults: true,
        
        onResult: (data: SpeechResult) => {
          console.log('[语音识别] onResult 回调:', data);
          addDebugLog(`[语音识别] 收到结果: final=${data.final ? '是' : '否'}, interim=${data.interim ? '是' : '否'}`);
          
          // 预热状态下不记录结果（等待用户点击"开始录音"）
          if (isPreheatingRef.current && !isManualRecordingReadyRef.current) {
            console.log('[语音识别] 预热状态，忽略识别结果');
            return;
          }
          
          // 如果不在手动录音状态，也忽略结果
          // 停止录音的瞬间允许最后一批 onresult 落入，避免兜底文本被丢失
          if (!isManualRecordingRef.current && !isStoppingManualRecordingRef.current) {
            console.log('[语音识别] 非手动录音状态，忽略识别结果');
            return;
          }
          
          if (data.final) {
            addDebugLog(`[语音识别] 最终文本: ${data.final.substring(0, 50)}...`);
          }
          
          // 如果有新的最终文本，累积到 ref 中
          if (data.final) {
            accumulatedTranscriptRef.current += data.final;
            lastTranscriptLengthRef.current = accumulatedTranscriptRef.current.length;
            addDebugLog(`[语音识别] 累积文本长度: ${accumulatedTranscriptRef.current.length} 字符`);
          }

          // 只要有新的识别结果（包括中间文本），就重新启动停顿检测
          if (data.final || data.interim) {
            addDebugLog(`[语音识别] 检测到语音活动，重置停顿检测`);
            // 重置连续停顿检测计数器（因为有新的语音活动）
            silenceDetectionCountRef.current = 0;
            
            // 清除之前的停顿检测（因为还在说话）
            if (silenceTimeoutRef.current) {
              clearTimeout(silenceTimeoutRef.current);
              silenceTimeoutRef.current = null;
            }

            // 启动停顿检测（如果正在检测回答结束）
            if (isDetectingSilenceRef.current) {
              startSilenceDetection();
            }
          }

          const currentTranscript = accumulatedTranscriptRef.current + data.interim;
          recordingAssistTranscriptRef.current = currentTranscript;
          if (!useFallbackRecordingRef.current) {
            setTranscript(currentTranscript);
          }

          // 更新最后检测到的文本（用于回答结束判断）
          if (isDetectingAnswerEnd) {
            setLastDetectedTranscript(currentTranscript);
            addDebugLog(`[语音识别] 当前文本长度: ${currentTranscript.length} 字符`);
          }
        },
        
        onStart: () => {
          console.log('[语音识别] onStart 回调');
          addDebugLog('[语音识别] ✅ 语音识别已启动');
          
          // 预热状态下不显示 toast 和启动停顿检测
          if (isPreheatingRef.current) {
            console.log('[语音识别] 预热状态，等待用户点击开始录音');
            addDebugLog('[语音识别] 预热状态，等待用户操作');
            if (!useFallbackRecordingRef.current) {
              setIsListening(true);
              isListeningRef.current = true;
            }
            return;
          }
          
          if (!useFallbackRecordingRef.current) {
            setIsListening(true);
            isListeningRef.current = true;
            toast.success("实时语音识别已启动，请立即开始回答", {
              duration: 2000
            });
          }
          
          // 立即启动停顿检测
          if (!useFallbackRecordingRef.current) {
            isDetectingSilenceRef.current = true;
            console.log('[语音识别] 立即开始停顿检测');
            addDebugLog('[语音识别] 开始停顿检测');
            startSilenceDetection();
          }
        },
        
        onEnd: () => {
          console.log('[语音识别] onEnd 回调');
          addDebugLog('[语音识别] ⚠️ 语音识别已结束');
          if (!useFallbackRecordingRef.current) {
            setIsListening(false);
            isListeningRef.current = false;
          }
          
          // 检查是否应该重启
          if (!isInterviewEndedRef.current && shouldRestartRef.current) {
            console.log('[语音识别] 识别器内部会自动重启（continuous 模式）');
            addDebugLog('[语音识别] 等待自动重启...');
          } else {
            console.log('[语音识别] 不重启（面试已结束或禁用重启）');
            addDebugLog('[语音识别] 已禁用自动重启');
          }
        },
        
        onError: (error) => {
          console.error('[语音识别] onError 回调:', error);
          console.error('[语音识别] 错误详情:', {
            name: error?.name,
            message: error?.message,
            code: error?.code,
            fullError: error
          });

          if (error?.name === 'aborted') {
            console.log('[语音识别] 忽略 aborted 错误（录音切换或主动停止时的正常现象）');
            return;
          }
          
          addDebugLog(`[语音识别] ❌ 错误: ${error?.name} - ${error?.message}`);
          
          let errorMessage = error?.message || '语音识别发生未知错误';
          
          // 根据错误类型提供额外的建议
          if (error?.name === 'not-allowed') {
            errorMessage += '（请在浏览器地址栏左侧点击允许麦克风权限）';
          } else if (error?.name === 'audio-capture') {
            errorMessage += '（请检查麦克风是否正确连接）';
          } else if (error?.name === 'network') {
            errorMessage += '（系统已自动切换到录音方案）';
            // 网络错误，不应该重启
            shouldRestartRef.current = false;
          }
          
          // 检查是否是致命错误，不应该重启
          const isFatalError = 
            error?.name === 'network' || 
            error?.name === 'NetworkError' ||
            error?.message?.toLowerCase()?.includes('network') ||
            error?.message?.toLowerCase()?.includes('服务暂时不可用') ||
            error?.message?.toLowerCase()?.includes('网络连接');

          if (isFatalError) {
            shouldRestartRef.current = false;
            hasNetworkErrorRef.current = true;  // 标记已发生网络错误
            console.log('[语音识别] 检测到致命错误，禁用自动重启');

            // 对于网络错误，自动切换到录音方案
            if (!useFallbackRecording) {
              console.log('[语音识别] 网络错误，自动切换到录音方案');
              setUseFallbackRecording(true);

              // 输出诊断信息
              if (speechRecognizerRef.current) {
                console.log('[语音识别] 识别器诊断状态:', speechRecognizerRef.current.getStatus());
              }

              // 延迟后自动启动录音
              setTimeout(() => {
                toast.success("网络不可用，已自动切换到录音识别方案", {
                  description: "录音识别同样可以完成面试，请放心使用"
                });
                console.log('[语音识别] 延迟启动录音');
                toggleListening();
              }, 1000);

              setIsListening(false);
              isListeningRef.current = false;
              return; // 不显示错误 toast
            }
          }

          toast.error(errorMessage);
          setIsListening(false);
          isListeningRef.current = false;
        }
      });

      speechRecognizerRef.current = recognizer;
      console.log('[语音识别] InterviewSpeechRecognizer 初始化完成');
      console.log('[语音识别] 验证识别器:', {
        hasRecognizer: !!speechRecognizerRef.current,
        recognizerType: recognizer.constructor.name,
        isActive: recognizer.isActive?.()
      });

      // 重置网络错误标记
      hasNetworkErrorRef.current = false;
      console.log('[语音识别] 已重置网络错误标记，准备使用浏览器实时语音识别方案');
    } catch (error) {
      console.error('[语音识别] 初始化失败:', error);
      console.error('[语音识别] 错误详情:', {
        name: (error as Error)?.name,
        message: (error as Error)?.message,
        stack: (error as Error)?.stack
      });

      // 初始化失败时，自动切换到录音方案并触发诊断
      console.log('[语音识别] 初始化失败，自动切换到录音方案');
      setUseFallbackRecording(true);
      toast.info("语音识别不可用，已自动切换到录音方案");

      // 自动触发诊断，帮助用户了解问题原因
      setTimeout(() => {
        diagnoseVoiceRecognition();
      }, 1000);
    }
  }, []);  // 只在组件挂载时初始化一次，避免重复创建识别器

  // 同步 useFallbackRecording 到 ref
  useEffect(() => {
    useFallbackRecordingRef.current = useFallbackRecording;
  }, [useFallbackRecording]);

  // 自动滚动到最新消息
  useEffect(() => {
    if (chatContainerRef.current && messages.length > 0) {
      // 使用 setTimeout 确保 DOM 已更新
      setTimeout(() => {
        chatContainerRef.current?.scrollTo({
          top: chatContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);
    }
  }, [messages]);

  // 声明变量，扩大作用域
  let shouldUseBrowserSpeech = false;

  // 开始/停止语音识别
  const toggleListening = async (forceUseBrowserSpeech: boolean = false) => {
    console.log('============================================');
    console.log('[语音识别] toggleListening 函数被调用');
    console.log('[语音识别] 参数:', { forceUseBrowserSpeech });
    console.log('============================================');

    // 声明变量，扩大作用域
    let shouldUseBrowserSpeech = !useFallbackRecording;  // 默认使用当前状态

    // 检查面试是否已结束
    if (isInterviewEnded) {
      console.log('[语音识别] 面试已结束，拒绝启动语音识别/录音');
      toast.info("面试已结束，无法继续回答");
      return;
    }

    // 如果强制使用浏览器方案，重置相关标记
    if (forceUseBrowserSpeech) {
      console.log('[语音识别] 强制使用浏览器方案，重置相关标记');
      hasNetworkErrorRef.current = false;
      setUseFallbackRecording(false);
      useFallbackRecordingRef.current = false;
      // 移除延迟，立即继续
    }

    console.log('[语音识别] toggleListening 被调用, 当前状态:', {
      hasRecognizer: !!speechRecognizerRef.current,
      isListening,
      isListeningRef,
      useFallbackRecording,
      useFallbackRecordingRef: useFallbackRecordingRef.current,
      isRecording,
      isInterviewEnded,
      hasNetworkError: hasNetworkErrorRef.current,
      forceUseBrowserSpeech,
      userAgent: navigator.userAgent.substring(0, 50),
      protocol: window.location.protocol,
      hostname: window.location.hostname
    });

    // 检查浏览器是否支持语音识别
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const browserSupportsSpeech = !!SpeechRecognition;
    
    console.log('[语音识别] 浏览器语音识别支持检查:', {
      browserSupportsSpeech,
      useFallbackRecording,
      SpeechRecognitionExists: 'SpeechRecognition' in window,
      webkitSpeechRecognitionExists: 'webkitSpeechRecognition' in window,
      userAgent: navigator.userAgent,
      locationProtocol: window.location.protocol,
      locationHostname: window.location.hostname
    });

    // 尝试创建一个临时的语音识别实例来验证API是否真的可用
    let speechApiActuallyWorks = false;
    if (browserSupportsSpeech) {
      try {
        const tempRecognition = new SpeechRecognition();
        speechApiActuallyWorks = true;
        console.log('[语音识别] 创建临时语音识别实例成功，API可用');
        // 不启动，只是为了验证API是否可用
      } catch (e) {
        console.error('[语音识别] 创建临时语音识别实例失败:', e);
        speechApiActuallyWorks = false;
      }
    }

    // 如果浏览器支持语音识别但当前使用录音方案，尝试切换回来
    // 但要避免在网络错误后强制切换（添加一个 ref 来标记是否发生过网络错误）

    console.log('[语音识别] 方案选择判断（初始状态）:', {
      browserSupportsSpeech,
      speechApiActuallyWorks,
      useFallbackRecording,
      forceUseBrowserSpeech,
      hasNetworkError: hasNetworkErrorRef.current,
      shouldUseBrowserSpeech,
      browserSupportsSpeechAndForce: forceUseBrowserSpeech && speechApiActuallyWorks
    });

    // 如果强制使用浏览器方案，直接设置
    if (forceUseBrowserSpeech) {
      if (speechApiActuallyWorks) {
        console.log('[语音识别] 强制使用浏览器方案（forceUseBrowserSpeech=true, API可用）');
        shouldUseBrowserSpeech = true;
      } else {
        console.error('[语音识别] 强制使用浏览器方案失败，API不可用');
        toast.error("浏览器不支持语音识别功能，请使用 Chrome 或 Edge 浏览器");
        return;
      }
    } else if (speechApiActuallyWorks && useFallbackRecording && !hasNetworkErrorRef.current) {
      console.log('[语音识别] 浏览器支持语音识别，且未发生过网络错误，切换回实时语音识别');
      setUseFallbackRecording(false);
      useFallbackRecordingRef.current = false;
      shouldUseBrowserSpeech = true;  // 强制使用浏览器方案
    } else if (useFallbackRecording) {
      console.log('[语音识别] 当前使用录音方案，不再切换');
      console.log('[语音识别] 不切换原因详情:', {
        speechApiActuallyWorks,
        forceUseBrowserSpeech,
        hasNetworkError: hasNetworkErrorRef.current,
        useFallbackRecording
      });
      shouldUseBrowserSpeech = false;
    }

    // 如果使用录音方案
    if (!shouldUseBrowserSpeech) {
      console.log('[语音识别] 使用录音方案');
      console.log('[语音识别] 录音状态:', {
        isRecording,
        isListening,
        recordingDuration,
        hasMediaRecorder: !!mediaRecorderRef.current,
        hasRecordingTimer: !!recordingTimerRef.current
      });
      
      if (isRecording) {
        console.log('[语音识别] 停止录音');
        stopRecording();
      } else {
        console.log('[语音识别] 开始录音');
        // 清空之前的转录文本
        accumulatedTranscriptRef.current = "";
        recordingAssistTranscriptRef.current = "";
        setTranscript("");
        stopSilenceDetection();

        // 显示录音启动提示
        if (isMobile) {
          toast.info("移动端使用录音识别，请清晰回答问题，说完后点击提交", { duration: 4000 });
        } else {
          toast.info("正在启动录音识别...", { duration: 2000 });
        }

        try {
          // 开始录音
          await startRecording();
          console.log('[语音识别] startRecording 返回成功');
        } catch (recordingError) {
          console.error('[语音识别] startRecording 抛出错误:', recordingError);
          toast.error("启动录音失败，请刷新页面重试");
          return;
        }

        // 录音方案：设置自动超时停止（60秒后自动停止并提交）
        console.log('[语音识别] 录音方案已启动，60秒后自动停止并提交');
        const recordingTimeout = setTimeout(() => {
          console.log('[语音识别] 录音超时，自动停止并提交');
          console.log('[语音识别] 当前状态检查:', {
            isRecording,
            recordingDuration
          });
          if (isRecording) {
            stopRecording();
          }
        }, 60000); // 60秒后自动停止
        
        // 保存超时定时器的引用，以便在需要时清除
        recordingTimeoutRef.current = recordingTimeout;
        console.log('[语音识别] 录音超时定时器已设置，60秒后自动停止');
      }
      return;
    }

    console.log('[语音识别] 使用浏览器语音识别方案');
    console.log('[语音识别] 语音识别器详情:', {
      speechRecognizerRef: speechRecognizerRef,
      hasRecognizer: !!speechRecognizerRef.current,
      recognizerType: speechRecognizerRef.current?.constructor?.name,
      isActive: speechRecognizerRef.current?.isActive?.(),
      isInitialized: speechRecognizerRef.current?.['isInitialized'],
      isListening: speechRecognizerRef.current?.isListening,
      localIsListening: isListening
    });
    
    if (!speechRecognizerRef.current) {
      console.error('[语音识别] speechRecognizerRef.current 为空');
      console.log('[语音识别] 尝试重新初始化语音识别器...');
      
      // 尝试重新初始化语音识别器
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognizer = new InterviewSpeechRecognizer({
            language: 'zh-CN',
            continuous: true,
            interimResults: true,
            
            onResult: (data: SpeechResult) => {
              console.log('[语音识别] onResult 回调:', data);
              
              if (data.final) {
                accumulatedTranscriptRef.current += data.final;
                lastTranscriptLengthRef.current = accumulatedTranscriptRef.current.length;
              }

              // 只要有新的识别结果（包括中间文本），就重新启动停顿检测
              if (data.final || data.interim) {
                // 重置连续停顿检测计数器（因为有新的语音活动）
                silenceDetectionCountRef.current = 0;
                
                if (silenceTimeoutRef.current) {
                  clearTimeout(silenceTimeoutRef.current);
                  silenceTimeoutRef.current = null;
                }

                if (isDetectingSilenceRef.current) {
                  startSilenceDetection();
                }
              }

              const currentTranscript = accumulatedTranscriptRef.current + data.interim;
              recordingAssistTranscriptRef.current = currentTranscript;
              if (!useFallbackRecordingRef.current) {
                setTranscript(currentTranscript);
              }

              if (isDetectingAnswerEnd) {
                setLastDetectedTranscript(currentTranscript);
              }
            },
            
            onStart: () => {
              console.log('[语音识别] onStart 回调');
              setIsListening(true);
              isListeningRef.current = true;
            },
            
            onEnd: () => {
              console.log('[语音识别] onEnd 回调');
              console.log('[语音识别] onEnd 状态检查:', {
                shouldRestart: shouldRestartRef.current,
                isInterviewEnded: isInterviewEndedRef.current, // 使用 ref 而不是状态变量
                isListeningRef: isListeningRef.current
              });

              // 检查是否应该重启（面试未结束且标志为 true）
              if (shouldRestartRef.current && !isInterviewEndedRef.current) { // 使用 ref 而不是状态变量
                console.log('[语音识别] onEnd: 检测到 shouldRestart=true 且面试未结束，准备重启');
                // 延迟 100ms 后重启
                setTimeout(() => {
                  if (shouldRestartRef.current && !isInterviewEndedRef.current && speechRecognizerRef.current) { // 使用 ref 而不是状态变量
                    console.log('[语音识别] onEnd: 执行重启');
                    try {
                      speechRecognizerRef.current.restart();
                      setIsListening(true);
                      isListeningRef.current = true;
                    } catch (error) {
                      console.error('[语音识别] onEnd: 重启失败:', error);
                    }
                  } else {
                    console.log('[语音识别] onEnd: 重启条件已改变，跳过重启');
                  }
                }, 100);
              } else {
                console.log('[语音识别] onEnd: 不重启（shouldRestart=' + shouldRestartRef.current + ', isInterviewEnded=' + isInterviewEndedRef.current + '）'); // 使用 ref 而不是状态变量
              }

              setIsListening(false);
              isListeningRef.current = false;
            },
            
            onError: (error) => {
              console.error('[语音识别] onError 回调:', error);
              
              // 忽略 aborted 错误，这是正常的停止行为
              if (error?.name === 'aborted') {
                console.log('[语音识别] 忽略 aborted 错误（正常停止）');
                return;
              }
              
              const isFatalError = 
                error?.name === 'network' || 
                error?.name === 'NetworkError' ||
                error?.message?.toLowerCase()?.includes('network') ||
                error?.message?.toLowerCase()?.includes('服务暂时不可用') ||
                error?.message?.toLowerCase()?.includes('网络连接');

              if (isFatalError) {
                hasNetworkErrorRef.current = true;
                shouldRestartRef.current = false;
                console.log('[语音识别] 检测到致命错误，禁用自动重启');
                
                if (!useFallbackRecording) {
                  setUseFallbackRecording(true);
                  toast.success("已自动切换到录音识别方案");
                }
              }
              
              setIsListening(false);
              isListeningRef.current = false;
            }
          });

          speechRecognizerRef.current = recognizer;
          console.log('[语音识别] 语音识别器重新初始化成功');
        } catch (error) {
          console.error('[语音识别] 重新初始化失败:', error);
          toast.error("无法初始化语音识别器，切换到录音方案");
          setUseFallbackRecording(true);
          // 重新调用，使用录音方案
          await toggleListening(false);
          return;
        }
      } else {
        toast.error("您的浏览器不支持语音识别功能，请使用 Chrome 或 Edge 浏览器");
        return;
      }
    }

    // 检查识别器是否已经在运行（更严格的检查）
    const recognizerIsListening = speechRecognizerRef.current.isListening;
    if (recognizerIsListening && !isListening) {
      console.warn('[语音识别] 检测到状态不一致：识别器已在运行但本地状态显示未运行，修复状态');
      setIsListening(true);
      isListeningRef.current = true;
      return; // 不需要重新启动
    }

    if (isListening) {
      // 停止语音识别
      console.log('[语音识别] 停止语音识别');
      try {
        stopSilenceDetection();
        shouldRestartRef.current = false; // 停止时不应该重启
        speechRecognizerRef.current.stop();
        console.log('[语音识别] 语音识别已停止');
      } catch (error) {
        console.error("[语音识别] 停止语音识别失败:", error);
      }
    } else {
      // 开始语音识别
      try {
        console.log('[语音识别] ========== 启动语音识别 ==========');
        console.log('[语音识别] 当前状态检查:', {
          hasRecognizer: !!speechRecognizerRef.current,
          recognizerType: speechRecognizerRef.current?.constructor?.name,
          isActive: speechRecognizerRef.current?.isActive?.(),
          isListening,
          isListeningRef,
          shouldRestart: shouldRestartRef.current
        });

        // 再次检查识别器是否已经在运行（避免重复启动）
        if (speechRecognizerRef.current.isListening) {
          console.warn('[语音识别] 识别器已经在运行中，跳过启动');
          setIsListening(true);
          isListeningRef.current = true;
          // 启动停顿检测（即使跳过启动也要启动检测）
          isDetectingSilenceRef.current = true;
          startSilenceDetection();
          return;
        }

        // 清空之前的转录文本
        accumulatedTranscriptRef.current = "";
        recordingAssistTranscriptRef.current = "";
        setTranscript("");
        stopSilenceDetection();

        // 设置应该重启标志
        shouldRestartRef.current = true;

        // 启动语音识别器 - 使用 restart() 方法确保安全启动
        console.log('[语音识别] 调用 speechRecognizerRef.current.restart()');
        try {
          await speechRecognizerRef.current.restart();
          console.log('[语音识别] ========== restart() 调用成功 ==========');
        } catch (error) {
          console.error('[语音识别] restart() 失败，尝试直接 start():', error);
          await speechRecognizerRef.current.start();
          console.log('[语音识别] ========== start() 调用成功 ==========');
        }

        console.log('[语音识别] ========== 语音识别已启动 ==========');
        console.log('[语音识别] 请开始说话...');
      } catch (error: any) {
        console.error('[语音识别] ========== 启动语音识别失败 ==========');
        console.error('[语音识别] 错误详情:', {
          name: error?.name,
          message: error?.message,
          stack: error?.stack,
          toString: error?.toString()
        });
        setIsListening(false);
        isListeningRef.current = false;

        // 根据错误类型提供不同的提示
        let errorMessage = "启动语音识别失败，请刷新页面重试";

        if (error?.name === 'NotAllowedError') {
          errorMessage = "无法访问麦克风，请在浏览器地址栏左侧点击允许麦克风权限";
        } else if (error?.name === 'NotFoundError') {
          errorMessage = "未找到麦克风设备，请检查麦克风连接";
        } else if (error?.message?.includes('not-allowed')) {
          errorMessage = "麦克风权限被拒绝，请在浏览器设置中允许麦克风访问";
        } else if (error?.message?.includes('network') || error?.name === 'network') {
          errorMessage = "语音识别服务暂时不可用，建议使用录音方案";
        } else if (error?.name === 'UnknownError' || !error?.name) {
          errorMessage = "语音识别发生未知错误，建议使用录音方案";
        }

        // 如果是网络错误、不支持的错误或未知错误，自动切换到录音方案
        const isNetworkError =
          error?.message?.toLowerCase()?.includes('network') ||
          error?.message?.toLowerCase()?.includes('服务暂时不可用') ||
          error?.message?.toLowerCase()?.includes('网络连接') ||
          error?.name === 'NotSupported' ||
          error?.name === 'network' ||
          error?.name === 'NetworkError' ||
          error?.name === 'UnknownError' ||
          !error?.name;

        if (isNetworkError) {
          console.log('[语音识别] 浏览器语音识别不可用，切换到录音方案');
          console.log('[语音识别] 错误类型判断:', {
            hasNetwork: error?.message?.toLowerCase()?.includes('network'),
            hasServiceUnavailable: error?.message?.toLowerCase()?.includes('服务暂时不可用'),
            hasNetworkConnection: error?.message?.toLowerCase()?.includes('网络连接'),
            errorName: error?.name,
            hasErrorName: !!error?.name
          });

          setUseFallbackRecording(true);
          toast.success("已自动切换到录音识别方案");

          // 延迟后自动启动录音
          setTimeout(() => {
            console.log('[语音识别] 延迟启动录音');
            toggleListening();
          }, 1000);
        } else {
          toast.error(errorMessage);
        }
      }
    }
  };

  // 辅助函数：提交回答（手动模式）
  const submitAnswer = async (answerText: string) => {
    console.log("[手动提交] ========== 提交回答 ==========");
    console.log("[手动提交] 回答文本长度:", answerText.length);
    console.log("[手动提交] 回答内容预览:", answerText.substring(0, 100) + "...");

    if (!answerText || answerText.trim().length === 0) {
      toast.error("请先录音或输入内容");
      return;
    }

    // 停止语音识别
    shouldRestartRef.current = false;
    if (speechRecognizerRef.current && isListeningRef.current) {
      console.log("[手动提交] 停止语音识别...");
      speechRecognizerRef.current.stop();
      setIsListening(false);
      isListeningRef.current = false;
      console.log("[手动提交] 语音识别已停止");
    }

    // 停止录音（如果是录音方案）
    if (useFallbackRecordingRef.current && isRecording) {
      console.log("[手动提交] 停止录音...");
      await stopRecording();
    }

    // 停止停顿检测
    stopSilenceDetection();

    // 重置录音状态
    setIsManualRecording(false);
    setHasRecordedContent(false);

    // 提交回答
    try {
      console.log("[手动提交] ========== 调用 handleAnswerSubmit ==========");
      toast.success("正在提交回答...");
      await handleAnswerSubmit();
      console.log("[手动提交] ========== 回答提交成功 ==========");
    } catch (submitError) {
      console.error("[手动提交] ========== 提交回答失败 ==========");
      console.error("[手动提交] 错误详情:", submitError);
      toast.error("提交回答失败，请重试");
    }
  };

  // 预热语音识别器 - 在AI问题播放完成后立即启动识别器，减少用户点击"开始录音"时的延迟
  const preheatSpeechRecognizer = async () => {
    console.log('[预热识别器] ========== 开始预热语音识别器 ==========');
    
    // 直接检查浏览器类型，判断是否需要使用录音方案
    // 不依赖 ref，因为 ref 可能在设备检测 useEffect 完成前还是 false
    const userAgent = navigator.userAgent || '';
    const isChromeBrowser = /Chrome/.test(userAgent) && !/Edg/.test(userAgent) && !/OPR/.test(userAgent) && !/Brave/.test(userAgent);
    const isEdgeBrowser = /Edg/.test(userAgent);
    const isQuarkBrowser = /Quark/.test(userAgent);
    const isUCBrowser = /UCBrowser|UCWEB/.test(userAgent);
    const isQQBrowser = /QQBrowser/.test(userAgent);
    const isBaiduBrowser = /Baidu|BIDUBrowser|baiduboxapp/i.test(userAgent);
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const isWechatBrowser = /MicroMessenger/i.test(userAgent);
    
    // 需要使用录音方案的浏览器
    const needsFallback = isMobileDevice || isWechatBrowser || isChromeBrowser || isEdgeBrowser || isQuarkBrowser || 
                         isUCBrowser || isQQBrowser || isBaiduBrowser;
    
    if (useFallbackRecordingRef.current || needsFallback) {
      console.log('[预热识别器] 检测到需要使用录音方案，跳过浏览器语音识别预热');
      console.log('[预热识别器] 原因: useFallbackRecordingRef=', useFallbackRecordingRef.current, 
                  ', needsFallback=', needsFallback, 
                  ', isChrome=', isChromeBrowser,
                  ', isEdge=', isEdgeBrowser,
                  ', isMobile=', isMobileDevice);
      
      // 确保录音方案被启用
      if (!useFallbackRecordingRef.current) {
        setUseFallbackRecording(true);
        useFallbackRecordingRef.current = true;
      }
      isPreheatingRef.current = false;
      isManualRecordingReadyRef.current = true;
      return;
    }
    
    // 检查识别器是否存在
    if (!speechRecognizerRef.current) {
      console.log('[预热识别器] 语音识别器不存在，跳过预热');
      return;
    }
    
    // 检查识别器是否已经在运行
    if (speechRecognizerRef.current.isListening) {
      console.log('[预热识别器] 识别器已在运行中，标记为预热状态');
      isPreheatingRef.current = true;
      isManualRecordingReadyRef.current = true;
      return;
    }
    
    try {
      console.log('[预热识别器] 启动语音识别器预热...');
      isPreheatingRef.current = true;
      
      // 启动识别器（预热模式）
      await speechRecognizerRef.current.start();
      
      console.log('[预热识别器] ========== 预热成功 ==========');
      isManualRecordingReadyRef.current = true;
    } catch (error) {
      console.error('[预热识别器] 预热失败:', error);
      isPreheatingRef.current = false;
      isManualRecordingReadyRef.current = false;
    }
  };

  // 手动开始录音
  const handleStartRecording = async () => {
    console.log('[手动录音] ========== 开始录音 ==========');
    console.log('[手动录音] 当前状态:', {
      isPreheating: isPreheatingRef.current,
      isManualRecordingReady: isManualRecordingReadyRef.current,
      isListening: isListeningRef.current,
      recognizerIsListening: speechRecognizerRef.current?.isListening,
      useFallbackRecording: useFallbackRecordingRef.current
    });

    const hasPermissions = await ensureRequiredMediaPermissions("startRecording");
    if (!hasPermissions) {
      setIsManualRecording(false);
      isManualRecordingRef.current = false;
      return;
    }
    
    // 直接检查浏览器类型，确保录音方案被正确启用
    const userAgent = navigator.userAgent || '';
    const needsFallback = shouldForceRecordingFallback(userAgent);
    
    if (needsFallback && !useFallbackRecordingRef.current) {
      console.log('[手动录音] 检测到需要使用录音方案的浏览器，强制切换');
      setUseFallbackRecording(true);
      useFallbackRecordingRef.current = true;
    }
    
    // 清空之前的转录文本
    isStoppingManualRecordingRef.current = false;
    accumulatedTranscriptRef.current = "";
    recordingAssistTranscriptRef.current = "";
    setTranscript("");
    setUserAnswer("");
    stopSilenceDetection();
    
    setIsManualRecording(true);
    isManualRecordingRef.current = true;  // 同步更新 ref
    setHasRecordedContent(false);
    
    try {
      let browserAssistStarted = false;

      // 启动语音识别（浏览器方案）
      if (!useFallbackRecordingRef.current) {
        console.log('[手动录音] 启动浏览器语音识别...');
        
        // 检查识别器是否已经在预热状态运行
        if (speechRecognizerRef.current?.isListening && isPreheatingRef.current) {
          console.log('[手动录音] 识别器已在预热状态运行，直接切换到录音模式');
          // 识别器已经在运行，直接切换状态
          setIsListening(true);
          isListeningRef.current = true;
          // 退出预热状态，开始正式录音
          isPreheatingRef.current = false;
          toast.success("录音已开始，请开始说话");
        } else if (speechRecognizerRef.current) {
          console.log('[手动录音] 识别器未预热，重新启动...');
          shouldRestartRef.current = true;
          await speechRecognizerRef.current.start();
          setIsListening(true);
          isListeningRef.current = true;
          isPreheatingRef.current = false;
          toast.success("录音已开始，请开始说话");
        }
      } else {
        // 启动录音方案
        console.log('[手动录音] 启动录音识别...');
        await startRecording();
        if (speechRecognizerRef.current) {
          try {
            if (speechRecognizerRef.current.isListening) {
              console.log('[手动录音] 浏览器识别兜底已在运行，直接复用');
              browserAssistStarted = true;
            } else {
              console.log('[手动录音] 启动浏览器识别作为录音兜底...');
              shouldRestartRef.current = true;
              await speechRecognizerRef.current.start();
              browserAssistStarted = true;
            }
          } catch (assistError) {
            console.warn('[手动录音] 浏览器兜底识别启动失败，继续仅使用录音:', assistError);
          }
        }
        if (browserAssistStarted) {
          console.log('[手动录音] 浏览器识别兜底已启动（不作为主要交互方式）');
        }
        toast.success("录音已开始，请开始说话");
      }
    } catch (error) {
      console.error('[手动录音] 启动失败:', error);
      showDevicePermissionReminder("请先开启麦克风权限，然后再开始录音。", "startRecording");
      setIsManualRecording(false);
      isManualRecordingRef.current = false;  // 同步更新 ref
    }
  };

  // 手动停止录音并自动提交
  const handleSubmitRecording = async () => {
    console.log('[提交录音] ========== 停止录音并自动提交 ==========');
    isStoppingManualRecordingRef.current = true;
    
    // 停止语音识别（浏览器方案）
    if (!useFallbackRecordingRef.current && speechRecognizerRef.current && isListeningRef.current) {
      shouldRestartRef.current = false;
      speechRecognizerRef.current.stop();
      setIsListening(false);
      isListeningRef.current = false;
    }
    
    // 重置预热状态（为下一轮做准备）
    isPreheatingRef.current = false;
    isManualRecordingReadyRef.current = false;
    
    // 停止录音（录音方案）
    if (useFallbackRecordingRef.current && isRecording) {
      if (speechRecognizerRef.current?.isListening) {
        shouldRestartRef.current = false;
        speechRecognizerRef.current.stop();
        await wait(350);
      }
      stopRecording();
      setIsManualRecording(false);
      isManualRecordingRef.current = false;  // 同步更新 ref
      toast.info("录音已提交，正在识别并自动提交回答...");
      return;
    }

    if (speechRecognizerRef.current?.isListening) {
      shouldRestartRef.current = false;
      speechRecognizerRef.current.stop();
    }
    
    // 等待一下让实时识别结果更新
    await wait(500);
    setIsManualRecording(false);
    isManualRecordingRef.current = false;  // 同步更新 ref
    
    // 自动提交回答
    const content = accumulatedTranscriptRef.current || transcript;
    if (content && content.trim().length > 0) {
      console.log('[提交录音] 自动提交回答:', content.substring(0, 50) + '...');
      toast.success("录音完成，正在提交...");
      await submitAnswer(content);
    } else {
      toast.error("未检测到语音内容，请重新录音");
    }

    isStoppingManualRecordingRef.current = false;
  };

  // 手动停止录音（保留原函数用于其他场景）
  const handleStopRecording = async () => {
    console.log('[手动录音] ========== 停止录音 ==========');
    isStoppingManualRecordingRef.current = true;
    
    // 停止语音识别（浏览器方案）
    if (!useFallbackRecordingRef.current && speechRecognizerRef.current && isListeningRef.current) {
      shouldRestartRef.current = false;
      speechRecognizerRef.current.stop();
      setIsListening(false);
      isListeningRef.current = false;
    }
    
    // 重置预热状态（为下一轮做准备）
    isPreheatingRef.current = false;
    isManualRecordingReadyRef.current = false;
    
    // 停止录音（录音方案）
    if (useFallbackRecordingRef.current && isRecording) {
      if (speechRecognizerRef.current?.isListening) {
        shouldRestartRef.current = false;
        speechRecognizerRef.current.stop();
        await wait(350);
      }
      await stopRecording();
    }

    setIsManualRecording(false);
    isManualRecordingRef.current = false;  // 同步更新 ref
    
    // 标记有内容待提交
    const content = accumulatedTranscriptRef.current || transcript;
    if (content && content.trim().length > 0) {
      setHasRecordedContent(true);
      toast.success("录音已停止，请点击提交按钮提交回答");
    } else {
      toast.error("未检测到语音内容，请重新录音");
    }

    isStoppingManualRecordingRef.current = false;
  };

  // 手动提交回答
  const handleSubmitAnswer = async () => {
    const content = accumulatedTranscriptRef.current || transcript || userAnswer;
    if (!content || content.trim().length === 0) {
      toast.error("没有可提交的内容");
      return;
    }
    await submitAnswer(content);
  };

  // 辅助函数：重新启动停顿检测
  const restartSilenceDetection = async () => {
    isDetectingSilenceRef.current = true;
    shouldRestartRef.current = true;

    const recognizerActuallyRunning = speechRecognizerRef.current?.isListening;
    const localStateShowsRunning = isListeningRef.current;

    if (recognizerActuallyRunning) {
      console.log("[停顿检测] 识别器实际正在运行，无需重新启动");
      if (!localStateShowsRunning) {
        setIsListening(true);
        isListeningRef.current = true;
      }
    } else if (speechRecognizerRef.current) {
      try {
        console.log("[停顿检测] 识别器未运行，尝试重新启动");
        await speechRecognizerRef.current.restart();
      } catch (error) {
        console.error("[停顿检测] 重启识别失败:", error);
      }
    }

    startSilenceDetection();
  };

  // 开始停顿检测 - 已禁用自动检测，改为手动提交
  const startSilenceDetection = () => {
    // ========== 手动提交模式：禁用自动停顿检测 ==========
    // 候选人需要手动点击"开始录音"和"提交"按钮
    console.log('[停顿检测] 已禁用自动停顿检测，使用手动提交模式');
    return;

    const silenceDuration = 2000; // 浏览器方案：2秒停顿检测

    console.log(`[停顿检测] 启动停顿检测，等待${silenceDuration / 1000}秒后停止`);
    console.log(`[停顿检测] 浏览器方案：实时识别，2秒停顿后触发判断`);

    // 清除之前的超时
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current as unknown as number);
    }

    // 设置超时
    silenceTimeoutRef.current = setTimeout(async () => {
      console.log("[停顿检测] 检测到停顿，触发判断逻辑");
      isDetectingSilenceRef.current = false;

      // 浏览器语音识别方案：实时识别
      const answerText = accumulatedTranscriptRef.current;

      // 如果回答太短（少于3个字符），认为还在思考中，继续监听
      if (answerText.length < 3) {
        console.log("[停顿检测] 回答太短，继续监听");
        await restartSilenceDetection();
        return;
      }

      // 检查连续性关键词
      console.log("[停顿检测] 检查是否包含连续性关键词...");
      const hasContinuityKeyword = containsContinuityKeyword(answerText);
      console.log(`[停顿检测] 连续性关键词检测结果: ${hasContinuityKeyword ? '有' : '无'}`);

      // 进行语义检测
      console.log("[停顿检测] 启动语义检测...");
      isSemanticCheckingRef.current = true;
      const isSemanticallyComplete = await checkAnswerCompletionWithSemantic(answerText);
      isSemanticCheckingRef.current = false;
      console.log(`[停顿检测] 语义检测结果: ${isSemanticallyComplete ? '完成' : '未完成'}`);

      // ========== 新规则1：语义检测优先 ==========
      // 场景1：语义检测判断回答已完成，无论是否有连续性关键词，都强制提交
      if (isSemanticallyComplete) {
        console.log("[停顿检测] ⚠️ 语义检测判断回答已完成，强制提交（即使有连续性关键词）");
        await submitAnswer(answerText);
        return;
      }

      // ========== 新规则2：语义检测判断回答未完成 ==========
      if (hasContinuityKeyword) {
        // 场景2：有连续性关键词，继续监听，但增加停顿计数
        silenceDetectionCountRef.current++;
        console.log(`[停顿检测] 有连续性关键词，连续停顿次数: ${silenceDetectionCountRef.current}/2`);

        // ========== 新规则3：防止死循环 ==========
        // 连续2次停顿后强制提交（最多4秒）
        if (silenceDetectionCountRef.current >= 2) {
          console.log("[停顿检测] ⚠️ 连续停顿2次（最多4秒），强制提交");
          await submitAnswer(answerText);
          return;
        }

        // 继续监听
        await restartSilenceDetection();
        return;
      } else {
        // 场景3：无连续性关键词且语义未完成，等待3秒后提交
        console.log("[停顿检测] 无连续性关键词且语义未完成，等待3秒后提交");

        // 设置3秒超时后提交
        setTimeout(async () => {
          // 检查是否有新的输入
          const currentText = accumulatedTranscriptRef.current;
          if (currentText !== answerText && currentText.length > answerText.length) {
            // 有新输入，重新开始检测
            console.log("[停顿检测] 3秒内检测到新输入，重新开始检测");
            startSilenceDetection();
            return;
          }

          // 没有新输入，提交回答
          console.log("[停顿检测] 3秒内无新输入，提交回答");
          await submitAnswer(currentText);
        }, 3000);
        return;
      }
    }, silenceDuration);
  };

  // 停止停顿检测
  const stopSilenceDetection = () => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    isDetectingSilenceRef.current = false;
  };

  // 开始录音（服务端识别方案）
  const startRecording = async () => {
    console.log('[录音] ========== 开始录音流程 ==========');
    console.log('[录音] 当前状态:', {
      isRecording,
      recordingDuration,
      hasMediaRecorder: !!mediaRecorderRef.current,
      hasRecordingTimer: !!recordingTimerRef.current
    });

    try {
      // 获取麦克风权限 - 优先复用已预热的音频流，减少点击后的启动延迟
      console.log('[录音] 请求麦克风权限...');
      let stream: MediaStream;

      const warmedUpAudioStream = recordingAudioStreamRef.current;
      const hasWarmAudioTrack = !!warmedUpAudioStream?.getAudioTracks().some(track => track.readyState === "live");

      if (hasWarmAudioTrack && warmedUpAudioStream) {
        stream = warmedUpAudioStream;
        console.log('[录音] 复用已预热的音频流，立即开始录音');
      } else {
        try {
          // 尝试高质量音频配置
          stream = await navigator.mediaDevices.getUserMedia({
            audio: AUDIO_CONSTRAINTS.audio,
          });
          console.log('[录音] 使用高质量音频配置成功');
        } catch (audioError: any) {
          console.warn('[录音] 高质量音频配置失败，尝试降级:', audioError.message);

          // 降级：使用简单配置
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: true,  // 最简单的配置，让浏览器自动选择
            });
            console.log('[录音] 使用简单音频配置成功');
          } catch (simpleError: any) {
            console.error('[录音] 简单配置也失败:', simpleError.message);
            throw audioError;  // 抛出原始错误
          }
        }

        recordingAudioStreamRef.current = stream;
      }
      
      console.log('[录音] 麦克风权限获取成功');
      console.log('[录音] 音频轨道信息:', {
        audioTracks: stream.getAudioTracks().map(t => ({
          id: t.id,
          label: t.label,
          enabled: t.enabled,
          muted: t.muted,
          settings: t.getSettings ? t.getSettings() : 'N/A'
        }))
      });

      // 检查支持的 MIME 类型 - 优先使用 ASR 支持的格式（OGG OPUS > WAV > MP3 > WebM）
      // ASR SDK 支持的格式：WAV/MP3/OGG OPUS
      let mimeType = '';
      const types = [
        'audio/ogg;codecs=opus',  // ASR 原生支持，首选
        'audio/ogg',              // ASR 支持
        'audio/webm;codecs=opus', // 降级选项，后端需要转换
        'audio/webm',             // 降级选项
        'audio/mp4',              // iOS Safari 支持
        'audio/mp4;codecs=mp4a.40.2',  // iOS AAC
        'audio/aac',              // 某些 Android 浏览器支持
      ];
      
      for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          console.log('[录音] 找到支持的 MIME 类型:', mimeType);
          break;
        }
      }
      
      // 如果没有找到支持的类型，使用空字符串让浏览器自动选择
      if (!mimeType) {
        console.warn('[录音] 未找到明确支持的 MIME 类型，使用浏览器默认设置');
      }

      // 创建 MediaRecorder - 带错误处理
      let mediaRecorder: MediaRecorder;
      try {
        mediaRecorder = mimeType 
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
        console.log('[录音] MediaRecorder 创建成功，实际 MIME 类型:', mediaRecorder.mimeType);
      } catch (recorderError: any) {
        console.error('[录音] MediaRecorder 创建失败:', recorderError.message);
        
        // 尝试不指定 MIME 类型
        try {
          mediaRecorder = new MediaRecorder(stream);
          console.log('[录音] 使用默认设置创建 MediaRecorder 成功，MIME 类型:', mediaRecorder.mimeType);
        } catch (defaultError: any) {
          console.error('[录音] 默认设置也失败:', defaultError.message);
          
          // 停止已获取的音频流
          stream.getTracks().forEach(track => track.stop());
          
          throw new Error('您的浏览器不支持录音功能，请使用 Edge 或 Chrome 浏览器');
        }
      }

      mediaRecorderRef.current = mediaRecorder;
      recordedChunksRef.current = [];

      // 设置数据处理器 - 每100ms收集一次数据
      mediaRecorder.ondataavailable = (event) => {
        const chunkSize = event.data.size;
        console.log('[录音] ondataavailable 触发，数据大小:', chunkSize, 'bytes');

        if (chunkSize > 0) {
          recordedChunksRef.current.push(event.data);
          console.log('[录音] 累积数据块数量:', recordedChunksRef.current.length);
        } else {
          console.warn('[录音] 收到空数据块');
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('[录音] 录音停止，开始识别...');
        console.log('[录音] 录音数据块数量:', recordedChunksRef.current.length);

        // 停止所有轨道
        if (recordingAudioStreamRef.current !== stream) {
          stream.getTracks().forEach(track => track.stop());
        }

        // 计算总数据大小
        let totalSize = 0;
        recordedChunksRef.current.forEach(chunk => {
          totalSize += chunk.size;
        });
        console.log('[录音] 总录音数据大小:', totalSize, 'bytes');

        // 检查是否有足够的录音数据（至少 1000 字节，约0.1秒）
        const MIN_AUDIO_SIZE = 1000;

        if (recordedChunksRef.current.length > 0 && totalSize >= MIN_AUDIO_SIZE) {
          const blob = new Blob(recordedChunksRef.current, { type: mimeType });
          console.log('[录音] 录音数据大小:', blob.size, 'bytes');
          console.log('[录音] 录音数据类型:', blob.type);

          // 显示正在识别的提示
          toast.info("正在识别语音...", {
            duration: 2000
          });

          await transcribeRecording(blob);
        } else if (totalSize > 0 && totalSize < MIN_AUDIO_SIZE) {
          console.warn('[录音] 录音数据太小，无法识别');
          toast.error("录音时间太短，无法识别，请重新回答");
          // 重置状态，允许重新录音
          accumulatedTranscriptRef.current = "";
          setTranscript("");
        } else {
          console.warn('[录音] 没有录音数据，可能麦克风未工作');
          toast.error("未检测到录音数据，请检查麦克风是否正常工作", {
            duration: 5000
          });
          // 重置状态，允许重新录音
          accumulatedTranscriptRef.current = "";
          setTranscript("");
        }
      };

      // 开始录音，每100ms收集一次数据
      console.log('[录音] 准备调用 mediaRecorder.start(100)');
      mediaRecorder.start(100);
      console.log('[录音] mediaRecorder.start(100) 调用成功，状态:', mediaRecorder.state);
      
      setIsRecording(true);
      console.log('[录音] setIsRecording(true) 已调用');

      // 开始计时
      setRecordingDuration(0);
      console.log('[录音] 初始化录音时长为 0 秒');
      console.log('[录音] 创建计时器，每 1000ms 更新一次');
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          const newDuration = prev + 1;
          console.log('[录音] ⏱️ 计时器触发:', prev, '秒 ->', newDuration, '秒');
          return newDuration;
        });
      }, 1000);
      console.log('[录音] 计时器已创建，ID:', recordingTimerRef.current);
      
      console.log('[录音] ========== 录音启动完成 ==========');
      console.log('[录音] 最终状态:', {
        isRecording: true,
        mediaRecorderState: mediaRecorder.state,
        hasTimer: !!recordingTimerRef.current,
        recordingDuration: 0
      });

    } catch (error: any) {
      console.error('[录音] 启动录音失败:', error);
      console.error('[录音] 错误详情:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      setIsRecording(false);

      let errorMessage = "无法访问麦克风，请检查权限设置";
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage = "麦克风权限被拒绝，请在浏览器地址栏左侧点击允许麦克风权限";
      } else if (error.name === 'NotFoundError') {
        errorMessage = "未找到麦克风设备，请检查麦克风连接";
      } else if (error.name === 'NotReadableError') {
        errorMessage = "麦克风被其他应用占用，请关闭其他应用后重试";
      }

      toast.error(errorMessage);
      showDevicePermissionReminder("请先开启麦克风权限，再重新开始录音。", "startRecording");
    }
  };

  // 停止录音
  const stopRecording = () => {
    console.log('[录音] 停止录音...');

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // 将录音转换为文本（使用服务端识别）
  const transcribeRecording = async (blob: Blob) => {
    console.log('[录音] 开始识别录音...');
    console.log('[录音] 录音数据大小:', blob.size, 'bytes');
    console.log('[录音] 录音数据类型:', blob.type);

    // 检查录音数据是否有效
    if (blob.size < 1000) {
      console.error('[录音] 录音数据太小:', blob.size, 'bytes');
      toast.error("录音时间太短，请重新回答", {
        description: "录音时长至少需要1秒"
      });
      return;
    }

    try {
      const preparedAudio = await prepareRecordingBlobForAsr(blob);
      if (preparedAudio.converted) {
        console.log('[录音] 已转换为 ASR 兼容格式:', {
          originalMimeType: preparedAudio.originalMimeType,
          mimeType: preparedAudio.mimeType,
          sampleRate: preparedAudio.sampleRate,
          channels: preparedAudio.channels,
        });
      } else {
        console.warn('[录音] 录音格式转换失败，使用原始格式继续识别:', preparedAudio.originalMimeType);
      }

      // 将 Blob 转换为 Base64（使用分块处理避免堆栈溢出）
      console.log('[录音] 转换为 Base64...');
      const arrayBuffer = await preparedAudio.blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // 使用循环而不是展开运算符，避免堆栈溢出
      let binaryString = '';
      const chunkSize = 0x8000; // 32KB 分块
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.slice(i, i + chunkSize);
        binaryString += String.fromCharCode.apply(null, Array.from(chunk));
      }
      const base64Data = btoa(binaryString);

      console.log('[录音] Base64 数据长度:', base64Data.length);

      // 调用语音识别 API，传递 MIME 类型
      console.log('[录音] 调用语音识别 API...');
      // 使用 ref 存储的 interviewId，确保是最新的
      const currentInterviewId = interviewIdRef.current || interviewId;
      const response = await fetchWithRetry('/api/speech-recognition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64Data,
          mimeType: preparedAudio.mimeType,  // 传递转换后的音频格式
          uid: `interview_${currentInterviewId}_${Date.now()}`,
          fallbackTranscript: (recordingAssistTranscriptRef.current || accumulatedTranscriptRef.current).trim(),
        })
      }, 2, 1200);

      console.log('[录音] API 响应状态:', response.status);

      const result = await safeParseResponse(response);
      console.log('[录音] API 响应结果:', result);

      if (!response.ok && !result?.fallbackToBrowserSpeech) {
        console.error('[录音] API 返回错误状态码:', response.status);
        throw new Error(`语音识别服务返回错误: HTTP ${response.status}`);
      }

      if (result?.fallbackToBrowserSpeech) {
        console.warn('[录音] 服务端 ASR 不可用，尝试使用录音期间的本地识别结果:', result.error);
        const browserTranscript = (recordingAssistTranscriptRef.current || accumulatedTranscriptRef.current).trim();
        if (browserTranscript) {
          setTranscript(browserTranscript);
          accumulatedTranscriptRef.current = browserTranscript;
          recordingAssistTranscriptRef.current = browserTranscript;
          lastTranscriptLengthRef.current = browserTranscript.length;
          toast.info("已使用本地识别结果完成转写");
          await handleAnswerSubmit();
          return;
        }

        toast.error("录音转写服务暂不可用，请稍后重试或检查识别配置", {
          duration: 6000,
        });
        return;
      }

      // 检查返回值的有效性
      if (!result || typeof result !== 'object') {
        console.error('[录音] API 返回值无效:', result);
        throw new Error('语音识别服务返回了无效的数据格式');
      }

      if (result.success && result.text) {
        console.log('[录音] 识别成功:', result.text);
        console.log('[录音] 识别时长:', result.duration);

        // 更新累积的文本
        const normalizedTranscript = result.text.trim();
        accumulatedTranscriptRef.current = normalizedTranscript;
        recordingAssistTranscriptRef.current = normalizedTranscript;
        lastTranscriptLengthRef.current = normalizedTranscript.length;
        setTranscript(normalizedTranscript);

        console.log('[录音] 当前累积文本长度:', accumulatedTranscriptRef.current.length);
        console.log('[录音] 累积文本内容:', accumulatedTranscriptRef.current);
        toast.success(`识别成功：${result.text.substring(0, 50)}...`);

        // 录音方案：直接提交回答（不需要判断是否结束）
        // 因为用户已经手动点击"完成回答并提交"按钮，表示已经完成回答
        console.log('[录音] 准备自动提交回答...');
        console.log('[录音] 提交前检查 - transcript:', transcript);
        console.log('[录音] 提交前检查 - accumulatedTranscriptRef.current:', accumulatedTranscriptRef.current);

        try {
          toast.info("正在提交回答...");
          await handleAnswerSubmit();
          console.log('[录音] 回答提交成功');
        } catch (submitError) {
          console.error('[录音] 提交回答失败:', submitError);
          toast.error("提交回答失败，请重试");
        }
      } else {
        console.error('[录音] 识别失败:', result.error);
        console.error('[录音] 错误详情:', result);
        console.error('[录音] success 字段值:', result.success);
        console.error('[录音] text 字段值:', result.text);

        // 构建更详细的错误消息
        let errorMessage = '语音识别失败';
        const errorDetails: string[] = [];

        if (result.error) {
          errorDetails.push(`错误: ${result.error}`);
          errorMessage = `语音识别失败：${result.error}`;
        }

        if (result.details) {
          errorDetails.push(`详情: ${JSON.stringify(result.details)}`);
        }

        if (Object.keys(result).length === 0) {
          errorDetails.push('返回数据为空对象');
          errorMessage = '语音识别服务返回了空数据';
        }

        if (result.success === false) {
          errorDetails.push('success=false');
        }

        if (!result.text && result.success) {
          errorDetails.push('text 字段缺失');
        }

        console.error('[录音] 完整错误信息:', errorDetails.join('; '));

        toast.error(errorMessage, {
          description: '语音识别失败，请检查麦克风并重新回答',
          duration: 5000,
        });

        // 如果是网络错误，额外提示
        if (result.details?.name === 'NetworkError' || result.error?.includes('网络')) {
          console.warn('[录音] 网络连接问题');
        }
      }

    } catch (error: any) {
      console.error('[录音] 识别过程出错:', error);
      console.error('[录音] 错误详情:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });

      const browserTranscript = (recordingAssistTranscriptRef.current || accumulatedTranscriptRef.current).trim();
      if (browserTranscript) {
        console.warn('[录音] 服务端识别失败，回退到录音期间的本地识别结果');
        setTranscript(browserTranscript);
        accumulatedTranscriptRef.current = browserTranscript;
        recordingAssistTranscriptRef.current = browserTranscript;
        lastTranscriptLengthRef.current = browserTranscript.length;
        toast.info("服务端识别失败，已使用本地识别结果");
        await handleAnswerSubmit();
        return;
      }

      toast.error('语音识别服务暂时不可用', {
        description: '请检查麦克风并重新回答',
        duration: 5000,
      });
    } finally {
      isStoppingManualRecordingRef.current = false;
    }
  };

  // 检测回答是否结束
  const detectAnswerEnd = async () => {
    const answerText = accumulatedTranscriptRef.current;

    // 如果回答太短（少于10个字符），认为还在思考中
    if (answerText.length < 10) {
      console.log("[回答结束判断] 回答太短，继续等待");
      setIsDetectingAnswerEnd(false);
      return;
    }

    try {
      setIsDetectingAnswerEnd(true);
      console.log("[回答结束判断] 调用LLM判断回答是否结束");

      const response = await fetch("/api/full-ai-interview/detect-answer-end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interviewId,
          answer: answerText,
        }),
      });

      const result = await safeParseResponse(response);

      if (result.success && result.hasEnded) {
        console.log("[回答结束判断] 回答已结束，准备提交");
        console.log("[自动面试] AI检测到回答完成，自动提交回答");

        // 停止语音识别（浏览器方案）
        if (!useFallbackRecording && speechRecognizerRef.current && isListeningRef.current) {
          speechRecognizerRef.current.stop();
          setIsListening(false);
          isListeningRef.current = false;
        }

        // 停止录音（录音方案）
        if (useFallbackRecording && isRecording) {
          stopRecording();
        }

        // 停止停顿检测
        stopSilenceDetection();

        // 自动提交回答
        try {
          await handleAnswerSubmit();
          console.log("[回答结束判断] 回答提交成功");
        } catch (submitError) {
          console.error("[回答结束判断] 提交回答失败:", submitError);
          toast.error("提交回答失败，请重试");
        }
      } else {
        console.log("[回答结束判断] 回答未结束，继续监听");
        setIsDetectingAnswerEnd(false);

        // 继续检测停顿（仅浏览器语音识别方案需要）
        isDetectingSilenceRef.current = true;

        // 如果是录音方案，无需启动停顿检测，由候选人手动控制
        // 如果是浏览器语音识别方案，启动停顿检测
        if (!useFallbackRecording) {
          startSilenceDetection();
        }
      }
    } catch (error) {
      console.error("[回答结束判断] 判断失败:", error);
      setIsDetectingAnswerEnd(false);
      // 继续检测停顿（仅浏览器语音识别方案需要）
      isDetectingSilenceRef.current = true;
      if (!useFallbackRecording) {
        startSilenceDetection();
      }
    }
  };

  // 诊断语音识别功能
  const diagnoseVoiceRecognition = async () => {
    console.log('[语音诊断] 开始诊断语音识别功能');
    
    // 检测浏览器类型
    const userAgent = navigator.userAgent || '';
    const isWechatBrowser = /MicroMessenger/i.test(userAgent);
    const isChromeBrowser = /Chrome/.test(userAgent) && !/Edg/.test(userAgent) && !/OPR/.test(userAgent) && !/Brave/.test(userAgent);
    const isQuarkBrowser = /Quark/.test(userAgent);
    const isEdgeBrowser = /Edg/.test(userAgent);
    const isSafariBrowser = /Safari/.test(userAgent) && !/Chrome/.test(userAgent);
    
    const diagnosis: any = {
      browserInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        isWechatBrowser,
        isChromeBrowser,
        isQuarkBrowser,
        isEdgeBrowser,
        isSafariBrowser
      },
      supportStatus: {},
      recognitionStatus: {},
      microphonePermission: null,
      testResult: null
    };

    // 1. 检查浏览器支持
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const hasWebkitSpeechRecognition = !!(window as any).webkitSpeechRecognition;
    const hasStandardSpeechRecognition = !!(window as any).SpeechRecognition;
    
    diagnosis.supportStatus = {
      hasWebkitSpeechRecognition,
      hasStandardSpeechRecognition,
      hasAnySpeechRecognition: !!SpeechRecognition,
      // 简化显示：只要支持任一 API，就认为支持语音识别
      hasSpeechRecognition: !!SpeechRecognition,
      // 使用的 API 类型
      apiType: hasWebkitSpeechRecognition ? 'webkit' : (hasStandardSpeechRecognition ? 'standard' : 'none')
    };

    if (!SpeechRecognition) {
      diagnosis.testResult = {
        status: 'failed',
        reason: '浏览器不支持语音识别',
        recommendation: '请使用 Chrome、Edge 或 Safari 浏览器'
      };
      setVoiceDiagnosisResult(diagnosis);
      setShowVoiceDiagnosis(true);
      return;
    }

    // 2. 检查麦克风权限
    try {
      console.log('[语音诊断] 检查麦克风权限...');
      diagnosis.microphonePermission = {
        status: 'checking',
        message: '正在检查麦克风权限...'
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CONSTRAINTS.audio,
      });
      stream.getTracks().forEach(track => track.stop());

      diagnosis.microphonePermission = {
        status: 'granted',
        message: '麦克风权限已授予'
      };
      console.log('[语音诊断] 麦克风权限已授予');
    } catch (error: any) {
      console.error('[语音诊断] 麦克风权限检查失败:', error);
      diagnosis.microphonePermission = {
        status: 'denied',
        message: error.name === 'NotAllowedError' ? '麦克风权限被拒绝' : '无法访问麦克风',
        errorName: error.name,
        errorMessage: error.message
      };
      diagnosis.testResult = {
        status: 'failed',
        reason: '麦克风权限被拒绝',
        recommendation: '请在浏览器设置中允许麦克风访问权限'
      };
      setVoiceDiagnosisResult(diagnosis);
      setShowVoiceDiagnosis(true);
      return;
    }

    // 3. 尝试初始化语音识别
    try {
      console.log('[语音诊断] 尝试初始化语音识别...');
      const testRecognition = new SpeechRecognition();
      testRecognition.continuous = true;
      testRecognition.interimResults = true;
      testRecognition.lang = 'zh-CN';

      diagnosis.recognitionStatus = {
        canInitialize: true,
        language: testRecognition.lang,
        continuous: testRecognition.continuous,
        interimResults: testRecognition.interimResults
      };

      // 4. 尝试启动语音识别
      console.log('[语音诊断] 尝试启动语音识别...');
      let testPassed = false;
      let testError: any = null;

      testRecognition.onstart = () => {
        console.log('[语音诊断] 语音识别已启动');
      };

      testRecognition.onerror = (event: any) => {
        // 忽略 "aborted" 错误，这是正常的停止行为
        if (event.error === 'aborted' || event.error === 'not-allowed') {
          console.log('[语音诊断] 忽略正常停止错误:', event.error);
          return;
        }

        console.error('[语音诊断] 语音识别错误:', event.error);
        testError = event.error;
      };

      testRecognition.onend = () => {
        console.log('[语音诊断] 语音识别已结束');

        // 如果已经显示了诊断结果（超时处理中已经显示），则不再处理
        if (diagnosis.testResult) {
          console.log('[语音诊断] 诊断结果已存在，跳过处理');
          return;
        }

        if (testError) {
          diagnosis.testResult = {
            status: 'failed',
            reason: `语音识别服务错误: ${testError}`,
            recommendation: getErrorRecommendation(testError)
          };
        } else {
          diagnosis.testResult = {
            status: 'success',
            message: '语音识别功能正常',
            recommendation: '可以正常使用语音识别功能'
          };
        }
        setVoiceDiagnosisResult(diagnosis);
        setShowVoiceDiagnosis(true);
      };

      testRecognition.start();

      // 3秒后如果还没有结果，强制结束并标记为成功
      setTimeout(() => {
        if (!testError && !diagnosis.testResult) {
          console.log('[语音诊断] 超时，强制结束测试（识别器能正常启动，视为成功）');
          try {
            testRecognition.abort();
          } catch (e) {
            // 忽略错误
          }

          // 如果没有错误，说明识别器能正常启动，标记为成功
          if (!testError) {
            diagnosis.testResult = {
              status: 'success',
              message: '语音识别功能正常',
              recommendation: '可以正常使用语音识别功能'
            };
            setVoiceDiagnosisResult(diagnosis);
            setShowVoiceDiagnosis(true);
          }
        }
      }, 3000);

    } catch (error: any) {
      console.error('[语音诊断] 语音识别初始化失败:', error);
      diagnosis.recognitionStatus = {
        canInitialize: false,
        error: error.message
      };
      diagnosis.testResult = {
        status: 'failed',
        reason: '语音识别初始化失败',
        error: error.message,
        recommendation: '请刷新页面重试或更换浏览器'
      };
      setVoiceDiagnosisResult(diagnosis);
      setShowVoiceDiagnosis(true);
    }
  };

  const getErrorRecommendation = (error: string): string => {
    const recommendations: Record<string, string> = {
      'network': '网络错误 - Chrome/夸克浏览器依赖 Google 语音服务，建议使用 Edge 浏览器或切换到录音方案',
      'not-allowed': '权限被拒绝，请在浏览器设置中允许麦克风访问',
      'no-speech': '未检测到语音，请确保麦克风工作正常',
      'service-not-allowed': '语音识别服务被禁用，请检查浏览器设置',
      'service-not-supported': '浏览器不支持该语言',
      'language-not-supported': '不支持中文语音识别'
    };
    return recommendations[error] || '未知错误，请刷新页面重试';
  };

  // 清空语音识别结果
  const clearTranscript = () => {
    setTranscript("");
  };

  const stopAllQuestionAudioPlayback = useCallback(() => {
    playbackGenerationRef.current += 1;
    if (ttsAbortControllerRef.current) {
      ttsAbortControllerRef.current.abort();
      ttsAbortControllerRef.current = null;
    }

    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    } catch (error) {
      console.warn("[音频播放] 停止浏览器朗读失败:", error);
    }

    const audioElement = audioPlayerRef.current;
    if (audioElement) {
      try {
        audioElement.pause();
        audioElement.currentTime = 0;
        audioElement.src = "";
        audioElement.load();
      } catch (error) {
        console.warn("[音频播放] 停止音频元素失败:", error);
      }
    }

    setIsAudioPlaying(false);
    isPlayingAudioRef.current = false;
  }, []);

  const ensureRecordingAudioStream = useCallback(async (): Promise<MediaStream | null> => {
    const currentRecordingStream = recordingAudioStreamRef.current;
    const hasLiveRecordingTrack = !!currentRecordingStream?.getAudioTracks().some((track) => track.readyState === "live");
    if (hasLiveRecordingTrack) {
      return currentRecordingStream;
    }

    const existingStream = streamRef.current;
    const existingAudioTrack = existingStream?.getAudioTracks().find((track) => track.readyState === "live");
    if (existingAudioTrack) {
      const clonedTrack = existingAudioTrack.clone();
      const nextStream = new MediaStream([clonedTrack]);
      recordingAudioStreamRef.current = nextStream;
      return nextStream;
    }

    const freshStream = await navigator.mediaDevices.getUserMedia({
      audio: AUDIO_CONSTRAINTS.audio,
    });
    recordingAudioStreamRef.current = freshStream;
    return freshStream;
  }, []);

  // 获取本地媒体流（带降级方案）
  const getLocalMediaStream = async () => {
    // 检查是否已经启动过视频流
    if (isVideoStreamStartedRef.current && streamRef.current) {
      console.log("[Video] 视频流已启动，跳过重复启动");
      return;
    }

    try {
      console.log("[Video] 开始请求媒体流...");
      console.log("[Video] 视频约束:", JSON.stringify(AUDIO_CONSTRAINTS.video));

      let stream: MediaStream;
      try {
        // 尝试使用高质量配置
        stream = await navigator.mediaDevices.getUserMedia({
          video: AUDIO_CONSTRAINTS.video,
          audio: AUDIO_CONSTRAINTS.audio,
        });
        console.log("[Video] 使用高质量配置成功");
      } catch (highQualityError) {
        console.warn("[Video] 高质量配置失败，尝试降级配置:", highQualityError);
        console.log("[Video] 降级约束:", JSON.stringify(FALLBACK_VIDEO_CONSTRAINTS.video));

        // 尝试使用降级配置
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: FALLBACK_VIDEO_CONSTRAINTS.video,
            audio: AUDIO_CONSTRAINTS.audio,
          });
          console.log("[Video] 使用降级配置成功");
          toast.info("使用标准画质（更流畅）");
        } catch (fallbackError) {
          console.error("[Video] 降级配置也失败:", fallbackError);

          // 最后尝试只请求音频（视频失败但音频仍可用）
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: AUDIO_CONSTRAINTS.audio,
            });
            console.log("[Video] 仅获取音频成功");
            toast.error("摄像头不可用，仅使用麦克风");
          } catch (audioOnlyError) {
            console.error("[Video] 完全失败:", audioOnlyError);
            throw new Error("无法访问摄像头和麦克风，请检查权限设置和设备连接");
          }
        }
      }

      // 验证视频轨道
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length > 0) {
        const videoTrack = videoTracks[0];
        console.log("[Video] 视频轨道信息:", {
          id: videoTrack.id,
          label: videoTrack.label,
          enabled: videoTrack.enabled,
          muted: videoTrack.muted,
          settings: videoTrack.getSettings(),
          capabilities: videoTrack.getCapabilities ? videoTrack.getCapabilities() : '不支持',
        });

        // 检查视频轨道是否正常
        if (!videoTrack.enabled) {
          console.warn("[Video] 视频轨道未启用");
          toast.warning("摄像头可能被其他应用占用");
        }
      }

      console.log("[Video] 媒体流获取成功:", {
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
        videoTrackLabel: stream.getVideoTracks()[0]?.label,
        audioTrackLabel: stream.getAudioTracks()[0]?.label,
      });

      streamRef.current = stream;
      setLocalStream(stream);
      isVideoStreamStartedRef.current = true;  // 标记视频流已启动

      console.log("[Video] 已设置 localStream");
    } catch (error: any) {
      console.error("[Video] 获取媒体流失败:", error);

      // 提供详细的错误信息和建议
      let errorMsg = "无法访问摄像头和麦克风";
      if (error.name === 'NotAllowedError') {
        errorMsg = "摄像头/麦克风权限被拒绝，请在浏览器设置中允许访问";
      } else if (error.name === 'NotFoundError') {
        errorMsg = "未检测到摄像头或麦克风设备";
      } else if (error.name === 'NotReadableError') {
        errorMsg = "摄像头或麦克风可能被其他应用占用";
      } else if (error.name === 'OverconstrainedError') {
        errorMsg = "摄像头不支持请求的视频配置";
      }

      console.error("[Video] 错误详情:", {
        name: error.name,
        message: error.message,
        constraint: error.constraint,
      });

      toast.error(errorMsg);
    }
  };

  // 使用 useEffect 响应 localStream 的变化（符合 WebRTC 规范）
  useEffect(() => {
    console.log("[Video] ========== useEffect 开始 ==========");
    console.log("[Video] useEffect 触发: localStream存在=", !!localStream, ", localVideoRef.current存在=", !!localVideoRef.current);
    addDebugLog(`[Video] useEffect: localStream=${!!localStream}, localVideoRef=${!!localVideoRef.current}`);
    
    if (!localStream) {
      console.log("[Video] localStream 为空，跳过");
      addDebugLog("[Video] ⚠️ localStream 为空");
      return;
    }
    
    if (!localVideoRef.current) {
      console.log("[Video] localVideoRef.current 为空，等待 video 元素渲染");
      addDebugLog("[Video] ⏳ 等待 video 元素渲染");
      return;
    }
    
    console.log("[Video] 开始设置视频流");
    addDebugLog("[Video] ✅ 开始设置视频流");
    
    if (localVideoRef.current && localStream) {
      // 使用 requestAnimationFrame 确保 DOM 已经更新
      requestAnimationFrame(() => {
        console.log("[Video] 设置 srcObject 到 video 元素");
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;

        // 设置 onloadedmetadata 事件监听器（确保监控器初始化）
        localVideoRef.current.onloadedmetadata = () => {
          console.log("[Video] (第二个useEffect) onloadedmetadata 触发");
          addDebugLog("[Video] ✅ onloadedmetadata 触发 (useEffect2)");
          
          console.log("[Video] (第二个useEffect) 视频尺寸:", {
            width: localVideoRef.current?.videoWidth,
            height: localVideoRef.current?.videoHeight,
          });
          
          addDebugLog(`[Video] (useEffect2) 视频尺寸: ${localVideoRef.current?.videoWidth}x${localVideoRef.current?.videoHeight}`);
          
          localVideoRef.current?.play().then(() => {
            console.log("[Video] (第二个useEffect) 视频播放成功");
            addDebugLog("[Video] ✅ 视频播放成功 (useEffect2)");
          }).catch((err) => {
            console.error("[Video] (第二个useEffect) 播放失败:", err);
            addDebugLog("[Video] ❌ 播放失败 (useEffect2): " + err.message);
          });
          
          // 初始化候选人状态监控器
          if (localVideoRef.current) {
            console.log("[候选人监控] (第二个useEffect) 开始初始化监控器...");
            addDebugLog("[候选人监控] (useEffect2) 开始初始化监控器...");
            
            // 检查是否有录屏正在进行，如果有则优先保证状态监控
            const screenRecorderRunning = mediaRecorderRef.current?.state === 'recording' || screenMediaRecorderRef.current?.state === 'recording';
            console.log("[候选人监控] 录屏状态:", {
              mediaRecorder: mediaRecorderRef.current?.state,
              screenRecorder: screenMediaRecorderRef.current?.state,
              isRecordingSkipped
            });
            
            if (screenRecorderRunning) {
              console.log("[候选人监控] ⚠️ 检测到录屏正在进行，优先保证状态监控");
              addDebugLog("[候选人监控] 检测到录屏正在进行，优先保证状态监控");
              
              // 停止录屏
              console.log("[候选人监控] 停止录屏以释放资源");
              if (screenMediaRecorderRef.current?.state === 'recording') {
                screenMediaRecorderRef.current.stop();
                addDebugLog("[候选人监控] ✅ 已停止录屏");
              }
            }
            
            const monitor = new CandidateMonitor({
              enabled: true,
              minCheckInterval: 5000,
              maxCheckInterval: 10000,
              minScreenshotInterval: 60000, // 定时截图最小间隔 60 秒
              maxScreenshotInterval: 90000, // 定时截图最大间隔 90 秒
              screenshotQuality: 0.75, // JPEG 质量 75%
              enableScreenCapture: true, // 启用屏幕截图
              threshold: {
                maxFaceLostDuration: 10,
                maxMultipleFaceDuration: 5,
                maxAbnormalDuration: 30,
                maxSwitchCount: 3,
                longAbsenceDuration: 60,
              },
            });
            
            console.log("[候选人监控] (第二个useEffect) CandidateMonitor 实例已创建");
            addDebugLog("[候选人监控] (useEffect2) CandidateMonitor 实例已创建");
            
            monitor.initialize(localVideoRef.current)
              .then(() => {
                console.log("[候选人监控] (第二个useEffect) 监控器初始化成功");
                addDebugLog("[候选人监控] ✅ 监控器初始化成功 (useEffect2)");
                candidateMonitorRef.current = monitor;
                monitorInitializedRef.current = true; // 标记监控器已初始化成功
                
                // 检查屏幕共享状态
                const monitorStatus = monitor.getMonitorStatus();
                console.log("[候选人监控] 监控状态:", monitorStatus);
                
                if (!monitorStatus.screenCaptureEnabled) {
                  console.warn("[候选人监控] ⚠️ 屏幕共享未启用，将无法截取屏幕画面");
                  addDebugLog("[候选人监控] ⚠️ 屏幕共享未启用");
                  
                  // 提示用户屏幕共享未启用
                  toast.warning("屏幕共享未启用", {
                    description: "无法截取屏幕画面，请刷新页面并允许屏幕共享权限",
                    duration: 5000,
                  });
                } else {
                  console.log("[候选人监控] ✅ 屏幕共享已启用");
                  addDebugLog("[候选人监控] ✅ 屏幕共享已启用");
                }
              })
              .catch((error) => {
                console.error("[候选人监控] (第二个useEffect) 监控器初始化失败:", error);
                addDebugLog("[候选人监控] ❌ 监控器初始化失败 (useEffect2): " + (error instanceof Error ? error.message : "未知错误"));
              });
          }
        };

          // 添加视频轨道监听
          const videoTracks = localStream.getVideoTracks();
          if (videoTracks.length > 0) {
            const videoTrack = videoTracks[0];
            console.log("[Video] 监听视频轨道事件:", videoTrack.label);

            // 监听视频轨道的 mute 事件
            videoTrack.addEventListener('mute', () => {
              console.warn("[Video] 视频轨道被静音");
              toast.warning("摄像头可能被其他应用占用");
            });

            // 监听视频轨道的 unmute 事件
            videoTrack.addEventListener('unmute', () => {
              console.log("[Video] 视频轨道取消静音");
            });

            // 监听视频轨道的 ended 事件
            videoTrack.addEventListener('ended', () => {
              console.warn("[Video] 视频轨道已结束");
              toast.warning("摄像头连接已断开");
            });
          }

          localVideoRef.current.onloadedmetadata = () => {
            console.log("[Video] onloadedmetadata 触发，开始播放");
            addDebugLog("[Video] ✅ onloadedmetadata 触发");
            
            console.log("[Video] 视频尺寸:", {
              width: localVideoRef.current?.videoWidth,
              height: localVideoRef.current?.videoHeight,
            });
            
            addDebugLog(`[Video] 视频尺寸: ${localVideoRef.current?.videoWidth}x${localVideoRef.current?.videoHeight}`);

            // 检查视频是否正常（如果尺寸为 0，可能有问题）
            if (localVideoRef.current && (localVideoRef.current.videoWidth === 0 || localVideoRef.current.videoHeight === 0)) {
              console.error("[Video] 视频尺寸异常，可能摄像头被占用或不兼容");
              addDebugLog("[Video] ⚠️ 视频尺寸异常");
              toast.error("摄像头未正常工作，请检查设备连接或关闭其他占用摄像头的应用");
            }

            localVideoRef.current?.play().then(() => {
              console.log("[Video] 视频播放成功");
              addDebugLog("[Video] ✅ 视频播放成功");
            }).catch((err) => {
              console.error("[Video] 播放失败:", err);
              addDebugLog("[Video] ❌ 播放失败: " + err.message);
              toast.error("视频播放失败: " + err.message);
            });
            
            // 监听视频加载错误
            if (localVideoRef.current) {
              localVideoRef.current.onerror = (e) => {
                console.error("[Video] 视频加载错误:", e);
                addDebugLog("[Video] ❌ 视频加载错误");
              };
            }
            
            // 初始化候选人状态监控器
            if (localVideoRef.current) {
              console.log("[候选人监控] 开始初始化监控器...");
              addDebugLog("[候选人监控] 开始初始化监控器...");
              
              const monitor = new CandidateMonitor({
                enabled: true,
                minCheckInterval: 5000, // 最小 5 秒
                maxCheckInterval: 10000, // 最大 10 秒
                minScreenshotInterval: 60000, // 定时截图最小间隔 60 秒
                maxScreenshotInterval: 90000, // 定时截图最大间隔 90 秒
                screenshotQuality: 0.75, // JPEG 质量 75%
                enableScreenCapture: true, // 启用屏幕截图
                threshold: {
                  maxFaceLostDuration: 10,
                  maxMultipleFaceDuration: 5,
                  maxAbnormalDuration: 30,
                  maxSwitchCount: 3,
                  longAbsenceDuration: 60,
                },
              });
              
              console.log("[候选人监控] CandidateMonitor 实例已创建");
              addDebugLog("[候选人监控] CandidateMonitor 实例已创建");
              
              monitor.initialize(localVideoRef.current)
                .then(() => {
                  console.log("[候选人监控] 监控器初始化成功");
                  addDebugLog("[候选人监控] ✅ 监控器初始化成功");
                  candidateMonitorRef.current = monitor;
                  monitorInitializedRef.current = true; // 标记监控器已初始化成功
                  
                  // 检查屏幕共享状态
                  const monitorStatus = monitor.getMonitorStatus();
                  console.log("[候选人监控] 监控状态:", monitorStatus);
                  
                  if (!monitorStatus.screenCaptureEnabled) {
                    console.warn("[候选人监控] ⚠️ 屏幕共享未启用，将无法截取屏幕画面");
                    addDebugLog("[候选人监控] ⚠️ 屏幕共享未启用");
                    
                    toast.warning("屏幕共享未启用", {
                      description: "无法截取屏幕画面，请刷新页面并允许屏幕共享权限",
                      duration: 5000,
                    });
                  } else {
                    console.log("[候选人监控] ✅ 屏幕共享已启用");
                    addDebugLog("[候选人监控] ✅ 屏幕共享已启用");
                  }
                })
                .catch((error) => {
                  console.error("[候选人监控] 监控器初始化失败:", error);
                  addDebugLog("[候选人监控] ❌ 监控器初始化失败: " + (error instanceof Error ? error.message : "未知错误"));
                });
            } else {
              console.warn("[候选人监控] localVideoRef.current 为空，无法初始化监控器");
              addDebugLog("[候选人监控] ⚠️ localVideoRef.current 为空");
            }
          };
        }
      });
    }
  }, [localStream]);

  // 确保 video 元素加载后立即设置 srcObject（解决 DOM 渲染时序问题）
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      console.log("[Video] Video 元素已加载，设置 srcObject");
      
      // 如果已经设置了相同的 srcObject，先清空再重新设置（强制刷新）
      if (localVideoRef.current.srcObject === localStream) {
        console.log("[Video] srcObject 相同，先清空");
        localVideoRef.current.srcObject = null;
        
        // 短暂延迟后重新设置
        setTimeout(() => {
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStream;
            console.log("[Video] 已重新设置 srcObject");
            
            // 确保视频轨道已启用
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack && !videoTrack.enabled) {
              console.log("[Video] 视频轨道被禁用，重新启用");
              videoTrack.enabled = true;
              setIsVideoEnabled(true);
            }

            localVideoRef.current.play().catch((err) => {
              // AbortError 是正常行为（快速切换视频源时），不需要警告
              if (err.name === 'AbortError') {
                console.log("[Video] 播放被中断（正常行为）");
              } else {
                console.error("[Video] 播放失败:", err);
              }
            });
          }
        }, 100);
      } else {
        localVideoRef.current.srcObject = localStream;

        // 设置 onloadedmetadata 事件监听器（确保监控器初始化）
        localVideoRef.current.onloadedmetadata = () => {
          console.log("[Video] (setTimeout) onloadedmetadata 触发");
          addDebugLog("[Video] ✅ onloadedmetadata 触发 (setTimeout)");
          
          console.log("[Video] (setTimeout) 视频尺寸:", {
            width: localVideoRef.current?.videoWidth,
            height: localVideoRef.current?.videoHeight,
          });
          
          addDebugLog(`[Video] (setTimeout) 视频尺寸: ${localVideoRef.current?.videoWidth}x${localVideoRef.current?.videoHeight}`);
          
          // 初始化候选人状态监控器
          if (localVideoRef.current && !candidateMonitorRef.current) {
            console.log("[候选人监控] (setTimeout) 开始初始化监控器...");
            addDebugLog("[候选人监控] (setTimeout) 开始初始化监控器...");
            
            // 检查是否有录屏正在进行，如果有则优先保证状态监控
            const screenRecorderRunning = mediaRecorderRef.current?.state === 'recording' || screenMediaRecorderRef.current?.state === 'recording';
            console.log("[候选人监控] 录屏状态:", {
              mediaRecorder: mediaRecorderRef.current?.state,
              screenRecorder: screenMediaRecorderRef.current?.state,
              isRecordingSkipped
            });
            
            if (screenRecorderRunning) {
              console.log("[候选人监控] ⚠️ 检测到录屏正在进行，优先保证状态监控");
              addDebugLog("[候选人监控] 检测到录屏正在进行，优先保证状态监控");
              
              // 停止录屏
              console.log("[候选人监控] 停止录屏以释放资源");
              if (screenMediaRecorderRef.current?.state === 'recording') {
                screenMediaRecorderRef.current.stop();
                addDebugLog("[候选人监控] ✅ 已停止录屏");
              }
            }
            
            const monitor = new CandidateMonitor({
              enabled: true,
              minCheckInterval: 5000,
              maxCheckInterval: 10000,
              minScreenshotInterval: 60000, // 定时截图最小间隔 60 秒
              maxScreenshotInterval: 90000, // 定时截图最大间隔 90 秒
              screenshotQuality: 0.75, // JPEG 质量 75%
              enableScreenCapture: true, // 启用屏幕截图
              threshold: {
                maxFaceLostDuration: 10,
                maxMultipleFaceDuration: 5,
                maxAbnormalDuration: 30,
                maxSwitchCount: 3,
                longAbsenceDuration: 60,
              },
            });
            
            console.log("[候选人监控] (setTimeout) CandidateMonitor 实例已创建");
            addDebugLog("[候选人监控] (setTimeout) CandidateMonitor 实例已创建");
            
            monitor.initialize(localVideoRef.current)
              .then(() => {
                console.log("[候选人监控] (setTimeout) 监控器初始化成功");
                addDebugLog("[候选人监控] ✅ 监控器初始化成功 (setTimeout)");
                candidateMonitorRef.current = monitor;
                monitorInitializedRef.current = true; // 标记监控器已初始化成功
                
                // 检查屏幕共享状态
                const monitorStatus = monitor.getMonitorStatus();
                console.log("[候选人监控] 监控状态:", monitorStatus);
                
                if (!monitorStatus.screenCaptureEnabled) {
                  console.warn("[候选人监控] ⚠️ 屏幕共享未启用，将无法截取屏幕画面");
                  addDebugLog("[候选人监控] ⚠️ 屏幕共享未启用");
                  
                  toast.warning("屏幕共享未启用", {
                    description: "无法截取屏幕画面，请刷新页面并允许屏幕共享权限",
                    duration: 5000,
                  });
                } else {
                  console.log("[候选人监控] ✅ 屏幕共享已启用");
                  addDebugLog("[候选人监控] ✅ 屏幕共享已启用");
                }
              })
              .catch((error) => {
                console.error("[候选人监控] (setTimeout) 监控器初始化失败:", error);
                addDebugLog("[候选人监控] ❌ 监控器初始化失败 (setTimeout): " + (error instanceof Error ? error.message : "未知错误"));
              });
          }
        };

        // 确保视频轨道已启用
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack && !videoTrack.enabled) {
          console.log("[Video] 视频轨道被禁用，重新启用");
          videoTrack.enabled = true;
          setIsVideoEnabled(true);
        }

        localVideoRef.current.play().catch((err) => {
          // AbortError 是正常行为（快速切换视频源时），不需要警告
          if (err.name === 'AbortError') {
            console.log("[Video] 播放被中断（正常行为）");
          } else {
            console.error("[Video] 播放失败:", err);
          }
        });
      }

      // 定期检查视频是否正在播放，如果暂停则强制播放
      const checkInterval = setInterval(() => {
        if (localVideoRef.current) {
          if (localVideoRef.current.paused) {
            console.log("[Video] 检测到视频暂停，强制播放");
            localVideoRef.current.play().catch((err) => {
              // AbortError 是正常行为（快速切换视频源时），不需要警告
              if (err.name === 'AbortError') {
                console.log("[Video] 强制播放被中断（正常行为）");
              } else {
                console.error("[Video] 强制播放失败:", err);
              }
            });
          }
        }
      }, 1000);

      // 清理定时器
      return () => clearInterval(checkInterval);
    }
  }, [localVideoRef.current, localStream]);

  // 监听 isStarted 变化，确保视频流已启动（兜底逻辑）
  useEffect(() => {
    if (isStarted && !isVideoStreamStartedRef.current) {
      console.log("[Video] 面试开始但视频流未启动，现在启动视频流...");
      getLocalMediaStream();
    }
  }, [isStarted]);

  // 组件卸载时清理媒体流
  useEffect(() => {
    return () => {
      // 清理视频流
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        console.log("[Video] 媒体流已清理");
      }
      isVideoStreamStartedRef.current = false;  // 重置视频流启动标记

      // 清理语音识别
      if (speechRecognizerRef.current) {
        speechRecognizerRef.current.destroy();
        console.log("[语音识别] 语音识别器已清理");
      }

      // 清理录音
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
        console.log("[录音] 录音已停止");
      }

      if (recordingAudioStreamRef.current) {
        recordingAudioStreamRef.current.getTracks().forEach(track => track.stop());
        recordingAudioStreamRef.current = null;
      }

      // 清理计时器
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        console.log("[录音] 计时器已清理");
      }

      // 清理停顿检测
      stopSilenceDetection();
    };
  }, []);

  // 切换摄像头
  const toggleVideo = () => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoEnabled;
        setIsVideoEnabled(!isVideoEnabled);
        toast.success(isVideoEnabled ? "摄像头已关闭" : "摄像头已开启");
      }
    }
  };

  // 切换麦克风
  const toggleAudio = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isAudioEnabled;
        setIsAudioEnabled(!isAudioEnabled);
        toast.success(isAudioEnabled ? "麦克风已关闭" : "麦克风已开启");
      }
    }
  };

  // 清理媒体流
  const cleanupMediaStream = () => {
    if (recordingAudioStreamRef.current) {
      recordingAudioStreamRef.current.getTracks().forEach(track => track.stop());
      recordingAudioStreamRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setLocalStream(null);
    }
  };

  const showDevicePermissionReminder = (
    message: string,
    retryAction: "restartInterview" | "startRecording"
  ) => {
    setDevicePermissionMessage(message);
    setPermissionRetryAction(retryAction);
    setShowDevicePermissionAlert(true);
    toast.error(message, { duration: 5000 });
  };

  const showMediaCapabilityProblem = (
    capability: MediaCapability,
    options?: {
      retryAction?: "restartInterview" | "startRecording";
      reopenRecordingConsent?: boolean;
    }
  ): boolean => {
    const problem = getMediaCapabilityProblem(capability);
    if (!problem) {
      return false;
    }

    console.error("[媒体能力] 浏览器环境不满足要求:", {
      capability,
      problem,
      origin: typeof window !== "undefined" ? window.location.origin : "",
      isSecureContext: typeof window !== "undefined" ? window.isSecureContext : undefined,
    });

    toast.error(problem.title, {
      description: problem.description,
      duration: 8000,
    });

    if (options?.retryAction) {
      setDevicePermissionMessage(problem.description);
      setPermissionRetryAction(options.retryAction);
      setShowDevicePermissionAlert(true);
    }

    if (options?.reopenRecordingConsent) {
      setShowRecordingConsent(true);
    }

    return true;
  };

  const ensureRequiredMediaPermissions = async (
    retryAction: "restartInterview" | "startRecording"
  ): Promise<boolean> => {
    try {
      const existingStream = streamRef.current;
      if (retryAction === "startRecording") {
        const currentRecordingStream = recordingAudioStreamRef.current;
        const hasLiveRecordingTrack = !!currentRecordingStream?.getAudioTracks().some(
          track => track.readyState === "live"
        );

        if (hasLiveRecordingTrack) {
          return true;
        }
      }

      const hasLiveVideoTrack = !!existingStream?.getVideoTracks().some(track => track.readyState === "live");
      const hasLiveAudioTrack = !!existingStream?.getAudioTracks().some(track => track.readyState === "live");
      const requiresVideo = retryAction === "restartInterview";

      if (hasLiveAudioTrack && (!requiresVideo || hasLiveVideoTrack)) {
        return true;
      }

      const requiredCapability: MediaCapability = requiresVideo ? "camera" : "microphone";
      if (showMediaCapabilityProblem(requiredCapability, { retryAction })) {
        return false;
      }

      const stream = await navigator.mediaDevices.getUserMedia(
        requiresVideo
          ? {
              video: AUDIO_CONSTRAINTS.video,
              audio: AUDIO_CONSTRAINTS.audio,
            }
          : {
              audio: AUDIO_CONSTRAINTS.audio,
            }
      );

      let nextStream = stream;

      if (!requiresVideo && existingStream && hasLiveVideoTrack) {
        existingStream.getAudioTracks().forEach(track => track.stop());
        nextStream = new MediaStream([
          ...existingStream.getVideoTracks(),
          ...stream.getAudioTracks(),
        ]);
      } else if (existingStream && existingStream !== stream) {
        existingStream.getTracks().forEach(track => track.stop());
      }

      if (retryAction === "startRecording") {
        recordingAudioStreamRef.current = stream;
      }

      streamRef.current = nextStream;
      setLocalStream(nextStream);
      if (requiresVideo) {
        isVideoStreamStartedRef.current = true;
      }
      setIsVideoEnabled(nextStream.getVideoTracks().length > 0);
      setIsAudioEnabled(nextStream.getAudioTracks().length > 0);
      setShowDevicePermissionAlert(false);

      const videoTrack = nextStream.getVideoTracks()[0];
      const audioTrack = nextStream.getAudioTracks()[0];

      if (!audioTrack || (requiresVideo && !videoTrack)) {
        showDevicePermissionReminder(
          requiresVideo
            ? "请同时开启摄像头和麦克风权限，未开启权限无法继续面试。"
            : "请先开启麦克风权限，否则无法开始录音。",
          retryAction
        );
        return false;
      }

      return true;
    } catch (error: any) {
      const requiresVideo = retryAction === "restartInterview";
      let message = requiresVideo
        ? "请同时开启摄像头和麦克风权限，未开启权限无法继续面试。"
        : "请先开启麦克风权限，否则无法开始录音。";

      if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
        message = requiresVideo
          ? "检测到您未开启摄像头或麦克风权限，请在浏览器地址栏左侧点击允许后，再回来继续面试。"
          : "检测到您未开启麦克风权限，请在浏览器地址栏左侧点击允许后，再回来开始录音。";
      } else if (error?.name === "NotFoundError") {
        message = requiresVideo
          ? "未检测到可用的摄像头或麦克风设备，请连接设备后重新检测。"
          : "未检测到可用的麦克风设备，请连接设备后重新检测。";
      } else if (error?.name === "NotReadableError") {
        message = requiresVideo
          ? "摄像头或麦克风正在被其他应用占用，请关闭占用程序后重新检测。"
          : "麦克风正在被其他应用占用，请关闭占用程序后重新检测。";
      }

      console.error(
        requiresVideo ? "[权限检测] 摄像头/麦克风权限检查失败:" : "[权限检测] 麦克风权限检查失败:",
        error
      );
      showDevicePermissionReminder(message, retryAction);
      return false;
    }
  };

  const handleRetryPermissions = async () => {
    setIsRecheckingPermissions(true);
    const hasPermissions = await ensureRequiredMediaPermissions(permissionRetryAction);
    setIsRecheckingPermissions(false);

    if (!hasPermissions) {
      return;
    }

    toast.success(permissionRetryAction === "startRecording" ? "麦克风权限已恢复" : "摄像头和麦克风权限已恢复");
    setShowDevicePermissionAlert(false);

    if (permissionRetryAction === "startRecording") {
      await handleStartRecording();
      return;
    }

    await handleRecordingConsent(true);
  };

  // 验证候选人姓名是否与面试官端一致
  const validateCandidateName = (): boolean => {
    // 首先检查候选人是否输入了姓名
    if (!candidateName || candidateName.trim().length === 0) {
      toast.error("请输入您的姓名");
      return false;
    }

    // 如果配置中没有明确设置候选人姓名，则跳过验证
    if (!expectedCandidateName || expectedCandidateName.trim().length === 0) {
      console.log("[候选人验证] 配置中未设置候选人姓名，跳过验证");
      return true;
    }

    // 去除空格后比较（允许前后空格差异）
    const inputName = candidateName.trim();
    const expectedName = expectedCandidateName.trim();

    if (inputName !== expectedName) {
      toast.error(`姓名验证失败：您输入的姓名"${inputName}"与面试官邀请的候选人"${expectedName}"不一致，请重新输入`);
      return false;
    }

    return true;
  };

  const handleStartInterview = async () => {
    // 再次验证候选人姓名
    if (!validateCandidateName()) {
      return;
    }

    if (!isMobile && showMediaCapabilityProblem("screen")) {
      return;
    }

    // 弹出录屏同意对话框（移动端和电脑端都必须录屏）
    setShowRecordingConsent(true);
  };

  const handleRecordingConsent = async (consented: boolean) => {
    // 如果用户拒绝录屏，显示提示对话框
    if (!consented) {
      setShowRecordingRequiredAlert(true);
      return;
    }

    setShowRecordingConsent(false);
    setRecordingConsented(true);

    const displayMediaProblem = getMediaCapabilityProblem("screen");
    const isDisplayMediaSupported = !displayMediaProblem;
    console.log(`[录屏] 设备类型: ${isMobile ? '移动端' : '电脑端'}`);
    console.log(`[录屏] 是否支持 getDisplayMedia: ${isDisplayMediaSupported}`);
    if (displayMediaProblem) {
      console.warn("[录屏] 屏幕录制能力检测失败:", displayMediaProblem);
    }

    // 如果是移动端且不支持屏幕录制，跳过录屏步骤，只启动摄像头
    if (isMobile && !isDisplayMediaSupported) {
      console.log("[录屏] 移动端不支持屏幕录制，跳过录屏步骤，只启动摄像头");
      setIsRecordingSkipped(true); // 标记已跳过录屏

      toast.info("移动端将使用摄像头进行面试", {
        duration: 3000,
        description: "您的设备不支持屏幕录制，已为您自动调整为摄像头模式"
      });

      // 直接启动摄像头流
      setIsLoading(true);

      const hasPermissions = await ensureRequiredMediaPermissions("restartInterview");
      if (!hasPermissions) {
        setIsLoading(false);
        return;
      }

      // 关闭准备信息对话框（如果还在显示）
      if (showPreparationInfo) {
        setShowPreparationInfo(false);
      }

      // 继续面试流程（不使用录屏）
      continueInterview(null);
      return;
    }

    let mediaRecorderInstance: MediaRecorder | null = null;

    // 清空之前的数据块
    screenRecordedChunksRef.current = [];

    let stopRecordingResolve: ((blob: Blob) => void) | null = null;
    const recordingCompletePromise = new Promise<Blob>((resolve) => {
      stopRecordingResolve = resolve;
      stopRecordingResolveRef.current = resolve;  // 保存到 ref
    });
    recordingCompletePromiseRef.current = recordingCompletePromise;

    try {
      console.log(`[录屏] 开始请求屏幕录制权限... (设备类型: ${isMobile ? '移动端' : '电脑端'})`);

      // 根据设备类型使用不同的录制配置
      const getDisplayMediaOptions = isMobile ? {
        video: true,
        audio: true
      } : {
        video: {
          displaySurface: 'monitor' as any, // 电脑端强制只显示整个屏幕选项
        },
        audio: true
      };

      if (showMediaCapabilityProblem("screen", { reopenRecordingConsent: true })) {
        return;
      }

      const displayMedia = navigator.mediaDevices?.getDisplayMedia?.bind(navigator.mediaDevices);
      if (!displayMedia) {
        showMediaCapabilityProblem("screen", { reopenRecordingConsent: true });
        return;
      }

      const stream = await displayMedia(getDisplayMediaOptions);

      // 验证用户是否选择了整个屏幕（仅电脑端）
      if (!isMobile) {
        const videoTrack = stream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
        console.log("[录屏] 录制设置:", settings);

        // 检查是否选择了整个屏幕
        if (settings.displaySurface !== 'monitor') {
          console.error("[录屏] 用户未选择整个屏幕，而是选择了:", settings.displaySurface);
          toast.error("必须选择整个屏幕进行录制，不能选择窗口或标签页");

          // 停止所有轨道
          stream.getTracks().forEach(track => track.stop());

          // 重新显示录屏同意对话框
          setShowRecordingConsent(true);
          return;
        }
      }

      console.log("[录屏] 屏幕录制权限获取成功");
      if (isMobile) {
        console.log("[录屏] 移动端录屏模式");
      } else {
        console.log("[录屏] 电脑端录屏模式（整个屏幕）");
      }

      // 检查监控器是否正在运行，如果产生冲突则优先保证状态监控
      console.log("[录屏] 检查状态监控器是否正在运行...");
      const monitorRunning = candidateMonitorRef.current?.isMonitoringRunning() ?? false;
      console.log("[录屏] 监控器运行状态:", monitorRunning);

      if (monitorRunning) {
        console.log("[录屏] ⚠️ 监控器正在运行，优先保证状态监控功能");
        addDebugLog("[录屏] 监控器正在运行，跳过录屏以避免冲突");
        
        // 停止录屏流
        stream.getTracks().forEach(track => track.stop());
        
        // 标记已跳过录屏
        setIsRecordingSkipped(true);
        
        // 继续面试流程（不使用录屏）
        setIsLoading(true);
        if (showPreparationInfo) {
          setShowPreparationInfo(false);
        }
        continueInterview(null);
        return;
      }

      // 创建 MediaRecorder，指定视频比特率以控制文件大小
      // 使用 500 Kbps 比特率，大幅降低文件大小
      // 尝试多种 MIME 类型以提高 Edge 浏览器兼容性
      const supportedMimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4'
      ];

      let selectedMimeType = '';
      for (const mimeType of supportedMimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          console.log("[录屏] 找到支持的 MIME 类型:", mimeType);
          break;
        }
      }

      let recorder: MediaRecorder;

      if (!selectedMimeType) {
        console.warn("[录屏] 没有找到支持的 MIME 类型，使用默认配置");
        recorder = new MediaRecorder(stream);
      } else {
        // 优化比特率配置，提高视频质量
        // 使用 1.5 Mbps 比特率，30 分钟约 300MB，确保视频清晰度
        const recorderOptions = {
          mimeType: selectedMimeType,
          videoBitsPerSecond: 1500000, // 1.5 Mbps - 提高比特率，确保视频质量
        };

        // 检查流的轨道信息
        const videoTracks = stream.getVideoTracks();
        const audioTracks = stream.getAudioTracks();
        console.log("[录屏] 流轨道信息:", {
          videoTracksCount: videoTracks.length,
          audioTracksCount: audioTracks.length,
          videoTracks: videoTracks.map(t => ({ id: t.id, label: t.label, enabled: t.enabled, muted: t.muted, readyState: t.readyState })),
          audioTracks: audioTracks.map(t => ({ id: t.id, label: t.label, enabled: t.enabled, muted: t.muted, readyState: t.readyState }))
        });

        // 检查是否有视频轨道
        if (videoTracks.length === 0) {
          console.error("[录屏] ❌ 错误：流中没有视频轨道！");
          toast.error("无法获取视频轨道，请重新开始录屏");
          stream.getTracks().forEach(track => track.stop());
          setShowRecordingConsent(true);
          return;
        }

        // 检查视频轨道是否被静音
        const videoTrack = videoTracks[0];
        if (videoTrack.muted) {
          console.error("[录屏] ❌ 错误：视频轨道被静音！");
          toast.error("视频轨道被静音，请重新开始录屏");
          stream.getTracks().forEach(track => track.stop());
          setShowRecordingConsent(true);
          return;
        }

        // 不再强制降低分辨率和帧率，使用浏览器默认设置，确保视频质量
        const settings = videoTrack.getSettings();
        console.log("[录屏] 原始视频设置:", settings);

        try {
          recorder = new MediaRecorder(stream, recorderOptions);
          console.log("[录屏] 使用 MIME 类型:", selectedMimeType);
          console.log("[录屏] 使用视频比特率:", recorderOptions.videoBitsPerSecond, "bps (1.5 Mbps)");
          console.log("[录屏] 预估文件大小: 10分钟约", (1500000 * 600) / 8 / 1024 / 1024, "MB; 20分钟约", (1500000 * 1200) / 8 / 1024 / 1024, "MB; 30分钟约", (1500000 * 1800) / 8 / 1024 / 1024, "MB");
        } catch (error) {
          console.error("[录屏] 使用指定配置失败，使用默认配置:", error);
          recorder = new MediaRecorder(stream);
        }
      }

      // 移除局部变量，使用 ref
      // const chunks: Blob[] = [];  // 不再使用局部变量

      recorder.ondataavailable = (event) => {
        console.log("[录屏] ondataavailable 触发，数据大小:", event.data.size);
        if (event.data.size > 0) {
          // 使用 ref 存储数据块
          screenRecordedChunksRef.current.push(event.data);
          console.log("[录屏] 已收集数据块数量:", screenRecordedChunksRef.current.length, "总大小:", screenRecordedChunksRef.current.reduce((sum, b) => sum + b.size, 0));
        } else {
          console.warn("[录屏] 收到空数据块");
        }
      };

      recorder.onstop = () => {
        const chunks = screenRecordedChunksRef.current;
        console.log("[录屏] 录制停止，生成 blob，chunk 数量:", chunks.length);

        if (chunks.length === 0) {
          console.error("[录屏] 警告：没有收集到任何数据块！");
          // 即使没有数据块，也尝试 resolve，避免 Promise 永不 resolve
          if (stopRecordingResolveRef.current) {
            console.log("[录屏] 触发 Promise resolve（空 blob）");
            stopRecordingResolveRef.current(new Blob([], { type: selectedMimeType || 'video/webm' }));
          }
          return;
        }

        // 使用第一个数据块的 MIME 类型
        const blobType = chunks[0].type || (selectedMimeType || 'video/webm');
        const blob = new Blob(chunks, { type: blobType });
        console.log("[录屏] Blob 大小:", blob.size, "bytes");
        console.log("[录屏] Blob 类型:", blob.type);

        // 检查 blob 大小，如果太小，可能是录制失败
        if (blob.size < 1000) {
          console.warn("[录屏] Blob 太小（", blob.size, "bytes），可能是录制失败");
        }

        // 验证 Blob 的前几个字节，检查是否是有效的 WebM/MP4 文件
        const reader = new FileReader();
        reader.onloadend = () => {
          if (reader.readyState === FileReader.DONE && reader.result instanceof ArrayBuffer) {
            const arrayBuffer = reader.result;
            const uint8Array = new Uint8Array(arrayBuffer);
            const headerBytes = uint8Array.slice(0, 12);
            const header = Array.from(headerBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            console.log("[录屏] Blob 文件头部（前12字节）:", header);

            // WebM 文件应该以 1a45dfa3... 开头
            // MP4 文件应该以 000000...ftyp 开头
            if (!header.startsWith('1a45dfa3') && !header.startsWith('000000')) {
              console.error("[录屏] ❌ 错误：Blob 文件头部不正确，可能是无效的视频文件！");
              console.error("[录屏] 头部:", header);
            } else {
              console.log("[录屏] ✅ Blob 文件头部验证通过");
            }
          }
        };
        reader.readAsArrayBuffer(blob.slice(0, 12));

        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        console.log("[录屏] 创建的临时 URL:", url);
        setRecordedUrl(url);
        setRecordedChunks(chunks);

        // 停止录屏的轨道（只停止录屏流，不影响摄像头视频流）
        // 录屏流是从 getDisplayMedia 获取的，与摄像头视频流（getUserMedia）是独立的
        console.log("[录屏] 停止录屏轨道，不影响摄像头视频流");
        stream.getTracks().forEach(track => {
          console.log("[录屏] 停止轨道:", track.kind, track.label);
          track.stop();
        });

        // 触发 Promise resolve（使用 ref）
        if (stopRecordingResolveRef.current) {
          console.log("[录屏] 触发 Promise resolve");
          stopRecordingResolveRef.current(blob);
        } else {
          console.error("[录屏] stopRecordingResolveRef.current 为 null，无法 resolve Promise");
        }
      };

      // 添加更多事件监听器用于调试
      recorder.onstart = () => {
        console.log("[录屏] MediaRecorder onstart 事件触发，状态:", recorder.state);
        console.log("[录屏] 流轨道信息:", {
          videoTracks: stream.getVideoTracks().map(t => ({ id: t.id, label: t.label, enabled: t.enabled, muted: t.muted, readyState: t.readyState })),
          audioTracks: stream.getAudioTracks().map(t => ({ id: t.id, label: t.label, enabled: t.enabled, muted: t.muted, readyState: t.readyState }))
        });
      };

      recorder.onerror = (event) => {
        console.error("[录屏] MediaRecorder onerror 事件触发:", event);
        console.error("[录屏] 错误详情:", (event as any).error);
        console.error("[录屏] MediaRecorder 状态:", recorder.state);
      };

      recorder.onpause = () => {
        console.log("[录屏] MediaRecorder onpause 事件触发");
      };

      recorder.onresume = () => {
        console.log("[录屏] MediaRecorder onresume 事件触发");
      };

      console.log("[录屏] 开始录制，MediaRecorder 状态:", recorder.state);

      recorder.start(); // 不使用 timeslice 参数，让浏览器自动管理数据收集，确保关键帧完整性
      console.log("[录屏] recorder.start() 已调用，MediaRecorder 状态:", recorder.state);
      setMediaRecorder(recorder);
      mediaRecorderInstance = recorder;
      mediaRecorderRef.current = recorder; // 保存到 ref，确保面试结束时能够访问
      setIsScreenRecording(true);
      console.log("[录屏] 录制已启动");
      toast.success("录屏已开始");

      const hasPermissions = await ensureRequiredMediaPermissions("restartInterview");
      if (!hasPermissions) {
        recorder.stop();
        setIsScreenRecording(false);
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      // 立即启动视频流（与录屏并行）
      console.log("[Video] 立即启动视频流...");
      getLocalMediaStream().catch((error) => {
        console.error("[Video] 启动视频流失败:", error);
        showDevicePermissionReminder("请先开启摄像头和麦克风权限，否则无法继续面试。", "restartInterview");
      });
    } catch (error) {
      console.error("[录屏] 启动失败:", error);

      // 检查是否是移动端不支持录屏的错误
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isNotSupportedError = errorMessage.includes("not supported") || errorMessage.includes("not available");
      const isNotAllowedError = errorMessage.includes("NotAllowedError") || errorMessage.includes("Permission denied");
      const isNotFoundError = errorMessage.includes("NotFoundError") || errorMessage.includes("not found");

      if (isNotAllowedError) {
        // 用户取消了屏幕录制选择
        console.error("[录屏] 用户取消了屏幕录制");
        toast.error("您需要同意屏幕录制才能继续进行面试");
        setShowRecordingConsent(true); // 重新显示录屏同意对话框
        return;
      }

      // 录屏启动失败 - 检查是否是移动端
      if (isMobile) {
        if (isNotSupportedError || isNotFoundError) {
          console.error("[录屏] 移动端不支持录屏 API，跳过录屏步骤");
          toast.info("移动端将使用摄像头进行面试", {
            duration: 3000,
            description: "您的设备不支持屏幕录制，已为您自动调整为摄像头模式"
          });

          // 直接启动面试流程（不使用录屏）
          setIsLoading(true);

          // 关闭准备信息对话框（如果还在显示）
          if (showPreparationInfo) {
            setShowPreparationInfo(false);
          }

          // 继续面试流程（不使用录屏）
          continueInterview(null);
          return;
        }
      }

      // 其他错误情况
      console.error("[录屏] 录屏启动失败");
      toast.error("录屏启动失败，请确保允许屏幕录制");
      setShowRecordingConsent(true); // 重新显示录屏同意对话框
      return;
    }

    setIsLoading(true);

    // 关闭准备信息对话框（如果还在显示）
    if (showPreparationInfo) {
      setShowPreparationInfo(false);
    }

    // 继续面试流程
    continueInterview(mediaRecorderInstance);
  };

  // 继续面试流程（提取公共逻辑）- 优化版本，减少延迟
  const continueInterview = async (mediaRecorderInstance: MediaRecorder | null) => {
    try {
      console.log(`[handleStartInterview] 开始面试: interviewId=${interviewId}, candidateName=${candidateName}, mode=${selectedMode}, position=${selectedPosition}`);

      const hasPermissions = await ensureRequiredMediaPermissions("restartInterview");
      if (!hasPermissions) {
        if (mediaRecorderInstance && mediaRecorderInstance.state === "recording") {
          mediaRecorderInstance.stop();
          setIsScreenRecording(false);
        }
        return;
      }

      // ========== 解锁音频播放（解决 iframe 中自动播放被静音的问题）==========
      // 在用户交互的同一事件循环中立即解锁音频
      try {
        const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const audioContext = new AudioContextClass();
          console.log("[音频解锁] AudioContext 状态:", audioContext.state);
          if (audioContext.state === 'suspended') {
            await audioContext.resume();
            console.log("[音频解锁] ✅ AudioContext 已解锁");
          }
          // 创建一个静音的振荡器来确保音频上下文被激活
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          gainNode.gain.value = 0; // 静音
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          oscillator.start();
          oscillator.stop(audioContext.currentTime + 0.001);
          console.log("[音频解锁] ✅ 已播放静音音频来解锁音频播放");
        }
      } catch (unlockError) {
        console.warn("[音频解锁] 解锁音频失败:", unlockError);
      }

      // 保存面试开始时的候选人姓名和岗位（防止状态被修改）
      fixedCandidateNameRef.current = candidateName || "";
      fixedPositionRef.current = selectedPosition || "";

      // 重置网络错误标记，确保从干净的状态开始
      hasNetworkErrorRef.current = false;
      console.log("[handleStartInterview] 已重置网络错误标记");

      // 快速检测浏览器语音识别可用性（不获取麦克风权限）
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        console.log("[语音识别] 浏览器不支持语音识别，将使用录音方案");
        toast.info("您的浏览器不支持实时语音识别，将使用录音方案");
        setUseFallbackRecording(true);
      } else {
        console.log("[语音识别] 浏览器支持语音识别，将使用浏览器实时语音识别方案");
      }

      const response = await fetch("/api/full-ai-interview/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interviewId: interviewId, // 传递链接ID，后端会从中获取简历
          candidateName,
          mode: selectedMode,
          position: selectedPosition,
        }),
      });

      const result = await safeParseResponse(response);
      console.log(`[handleStartInterview] 响应:`, result);

      if (result.success) {
        // 设置面试ID（这是后端返回的实际会话ID，不是URL中的链接ID）
        setInterviewId(result.interviewId);
        interviewIdRef.current = result.interviewId; // 同时更新 ref
        console.log(`[handleStartInterview] 更新 interviewId: ${result.interviewId}`);
        console.log(`[handleStartInterview] interviewIdRef.current: ${interviewIdRef.current}`);
        const messagesWithDate = result.messages.map((msg: any, index: number) => ({
          ...msg,
          id: msg.id || `msg-${Date.now()}-${index}`,  // 确保每条消息都有唯一id
          timestamp: new Date(msg.timestamp)
        }));
        const firstQuestion = messagesWithDate.find((msg: Message) => msg.role === "interviewer");

        flushSync(() => {
          setMessages(messagesWithDate);
          setIsStarted(true);
          setCurrentRound(1);
          setCurrentRoundView(1);
        });
        toast.success("面试已开始");

        if (firstQuestion) {
          void playAiQuestionAudio(firstQuestion.content, requestAiQuestionAudioPayload(firstQuestion.content));
        }

        // 启动候选人状态监控
        if (candidateMonitorRef.current) {
          console.log("[候选人监控] 监控器已存在，直接启动，轮次：1");
          addDebugLog("[候选人监控] 🚀 直接启动监控，轮次：1");
          
          try {
            candidateMonitorRef.current.startMonitoring(1);
            console.log("[候选人监控] startMonitoring 调用成功");
            addDebugLog("[候选人监控] startMonitoring 调用成功");
          } catch (error) {
            console.error("[候选人监控] startMonitoring 调用失败:", error);
            addDebugLog("[候选人监控] ❌ startMonitoring 调用失败");
          }
        } else {
          console.warn("[候选人监控] 监控器未初始化，开始尝试初始化");
          addDebugLog("[候选人监控] ⚠️ 监控器未初始化，开始尝试初始化");
          
          // 延迟初始化，确保视频流已完全就绪
          const initMonitor = async () => {
            if (!localVideoRef.current) {
              console.error("[候选人监控] 视频元素不存在");
              addDebugLog("[候选人监控] ❌ 视频元素不存在");
              return;
            }

            // 检查视频流状态
            const videoElement = localVideoRef.current;
            console.log("[候选人监控] 检查视频元素状态:", {
              readyState: videoElement.readyState,
              videoWidth: videoElement.videoWidth,
              videoHeight: videoElement.videoHeight,
              paused: videoElement.paused,
              hasSrcObject: !!videoElement.srcObject,
              streamTracks: videoElement.srcObject ? (videoElement.srcObject as MediaStream).getVideoTracks().length : 0,
            });
            
            addDebugLog(`[候选人监控] 视频状态: readyState=${videoElement.readyState}, hasStream=${!!videoElement.srcObject}`);

            // 等待视频就绪（最多等待15秒）
            if (videoElement.readyState < 2) {
              console.log("[候选人监控] 等待视频就绪...");
              addDebugLog("[候选人监控] ⏳ 等待视频就绪...");
              
              const maxWaitTime = 15000;
              const startTime = Date.now();
              
              while (videoElement.readyState < 2 && Date.now() - startTime < maxWaitTime) {
                await new Promise(resolve => setTimeout(resolve, 200));
              }
              
              if (videoElement.readyState < 2) {
                console.error("[候选人监控] 视频在15秒内未就绪，放弃初始化监控");
                addDebugLog("[候选人监控] ❌ 视频未就绪，放弃初始化");
                return;
              }
              
              console.log("[候选人监控] 视频已就绪");
              addDebugLog("[候选人监控] ✅ 视频已就绪");
            }

            // 初始化监控器
            try {
              const monitor = new CandidateMonitor({
                enabled: true,
                minCheckInterval: 5000,
                maxCheckInterval: 10000,
                minScreenshotInterval: 60000, // 定时截图最小间隔 60 秒
                maxScreenshotInterval: 90000, // 定时截图最大间隔 90 秒
                screenshotQuality: 0.75, // JPEG 质量 75%
                enableScreenCapture: true, // 启用屏幕截图
                threshold: {
                  maxFaceLostDuration: 10,
                  maxMultipleFaceDuration: 5,
                  maxAbnormalDuration: 30,
                  maxSwitchCount: 3,
                  longAbsenceDuration: 60,
                },
              });
              
              console.log("[候选人监控] 开始初始化监控器...");
              addDebugLog("[候选人监控] 🔧 开始初始化...");
              
              await monitor.initialize(videoElement);
              
              console.log("[候选人监控] 监控器初始化成功");
              addDebugLog("[候选人监控] ✅ 初始化成功");
              
              candidateMonitorRef.current = monitor;
              monitorInitializedRef.current = true; // 标记监控器已初始化成功
              
              // 检查屏幕共享状态
              const monitorStatus = monitor.getMonitorStatus();
              console.log("[候选人监控] 监控状态:", monitorStatus);
              
              if (!monitorStatus.screenCaptureEnabled) {
                console.warn("[候选人监控] ⚠️ 屏幕共享未启用，将无法截取屏幕画面");
                addDebugLog("[候选人监控] ⚠️ 屏幕共享未启用");
                
                toast.warning("屏幕共享未启用", {
                  description: "无法截取屏幕画面，请刷新页面并允许屏幕共享权限",
                  duration: 5000,
                });
              } else {
                console.log("[候选人监控] ✅ 屏幕共享已启用");
                addDebugLog("[候选人监控] ✅ 屏幕共享已启用");
              }
              
              // 启动监控
              candidateMonitorRef.current.startMonitoring(1);
              console.log("[候选人监控] 监控器已启动");
              addDebugLog("[候选人监控] 🚀 监控器已启动");
              
            } catch (error) {
              console.error("[候选人监控] 初始化失败:", error);
              addDebugLog(`[候选人监控] ❌ 初始化失败: ${error}`);
              
              // 提示用户，但不影响面试进行
              toast.warning("状态监控启动失败，但不影响面试进行");
            }
          };
          
          // 延迟1秒后尝试初始化，给视频流更多准备时间
          setTimeout(initMonitor, 1000);
        }

      } else {
        toast.error(result.error || "开始面试失败");
        // API 调用失败，停止录屏
        if (mediaRecorderInstance && isScreenRecording) {
          mediaRecorderInstance.stop();
          setIsScreenRecording(false);
          console.log("[录屏] API 失败，停止录屏");
        }
      }
    } catch (error) {
      console.error("[handleStartInterview] API 调用失败:", error);
      toast.error("开始面试失败");
      // 异常情况，停止录屏
      if (mediaRecorderInstance && isScreenRecording) {
        mediaRecorderInstance.stop();
        setIsScreenRecording(false);
        console.log("[录屏] 异常，停止录屏");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 语音识别预检测
  const precheckSpeechRecognition = async (): Promise<boolean> => {
    console.log('[语音识别预检测] 开始预检测...');

    try {
      // 检查浏览器支持
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        console.log('[语音识别预检测] 浏览器不支持语音识别');
        return false;
      }

      // 检查麦克风权限
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: AUDIO_CONSTRAINTS.audio,
        });
        stream.getTracks().forEach(track => track.stop());
        console.log('[语音识别预检测] 麦克风权限正常');
      } catch (error: any) {
        console.error('[语音识别预检测] 麦克风权限检查失败:', error);
        return false;
      }

      // 尝试初始化并启动语音识别
      return new Promise<boolean>((resolve) => {
        try {
          const testRecognition = new SpeechRecognition();
          testRecognition.continuous = true;
          testRecognition.interimResults = true;
          testRecognition.lang = 'zh-CN';

          let hasError = false;

          testRecognition.onstart = () => {
            console.log('[语音识别预检测] 语音识别启动成功');
            testRecognition.stop();
          };

          testRecognition.onerror = (event: any) => {
            console.error('[语音识别预检测] 语音识别错误:', event.error);
            hasError = true;
          };

          testRecognition.onend = () => {
            if (hasError) {
              console.log('[语音识别预检测] 语音识别不可用');
              resolve(false);
            } else {
              console.log('[语音识别预检测] 语音识别正常');
              resolve(true);
            }
          };

          testRecognition.start();

          // 5秒超时
          setTimeout(() => {
            try {
              testRecognition.stop();
            } catch (e) {
              // 忽略错误
            }
            console.log('[语音识别预检测] 超时，认为不可用');
            resolve(false);
          }, 5000);
        } catch (error) {
          console.error('[语音识别预检测] 预检测异常:', error);
          resolve(false);
        }
      });
    } catch (error) {
      console.error('[语音识别预检测] 预检测失败:', error);
      return false;
    }
  };

  // 处理音频播放 promise
  const handlePlayPromise = (playPromise: Promise<void> | undefined, audioElement: HTMLAudioElement) => {
    if (playPromise === undefined) {
      console.error("[音频播放] playPromise is undefined");
      return;
    }

    // 确保音频没有被静音，音量正常
    audioElement.muted = false;
    audioElement.volume = 1.0;
    console.log("[音频播放] 已设置 muted=false, volume=1.0");

    playPromise.then(() => {
      console.log("[音频播放] 音频播放已启动");
      console.log("[音频播放] 播放状态:", {
        currentTime: audioElement.currentTime,
        duration: audioElement.duration,
        paused: audioElement.paused,
        muted: audioElement.muted,
        volume: audioElement.volume,
        readyState: audioElement.readyState,
        networkState: audioElement.networkState
      });

      // 验证 onended 事件处理器是否已设置
      console.log("[音频播放] 验证事件处理器:", {
        hasOnEnded: typeof audioElement.onended === 'function',
        hasOnError: typeof audioElement.onerror === 'function'
      });

      // 监听音频播放进度，每秒输出一次
      const progressInterval = setInterval(() => {
        if (audioElement.paused || audioElement.ended) {
          clearInterval(progressInterval);
          console.log("[音频播放] 音频播放结束或暂停");
        } else {
          console.log(`[音频播放] 播放进度: ${audioElement.currentTime.toFixed(2)}s / ${audioElement.duration.toFixed(2)}s`);
        }
      }, 1000);

      // 清理定时器的引用（不需要保存，因为如果音频结束就会自动清除）
      audioElement.onprogress = () => {
        // 音频正在加载中
      };

    }).catch(error => {
      console.error("[音频播放] 播放失败:", error);
      console.error("[音频播放] 播放失败详情:", {
        name: error.name,
        message: error.message,
        stack: error.stack
      });

      setIsAudioPlaying(false);
      isPlayingAudioRef.current = false; // 清除正在播放标记

      // 根据错误类型提供不同的提示
      if (error.name === 'NotAllowedError') {
        console.error("[音频播放] 浏览器阻止了自动播放");
        toast.error("浏览器阻止了自动播放，请点击页面任意位置后重试");
      } else if (error.name === 'NotSupportedError') {
        console.error("[音频播放] 不支持该音频格式");
        toast.error("不支持该音频格式");
      } else if (error.name === 'AbortError') {
        console.warn("[音频播放] 音频播放被中断（可能被新的播放请求取代，忽略）");
        // 不显示错误提示，因为这是正常的音频切换
      } else if (error.message && error.message.includes('interrupted')) {
        console.warn("[音频播放] 音频播放被中断（正常情况，忽略）");
        // 不显示错误提示，因为这是正常的音频切换
      } else {
        console.error("[音频播放] 未知播放错误");
        toast.error(`播放语音失败: ${error.message || "未知错误"}`);
      }
    });
  };

  const finalizeAiQuestionPlayback = useCallback(async () => {
    setIsAudioPlaying(false);
    isPlayingAudioRef.current = false;

    if (isInterviewEndedRef.current || isEndingInterviewRef.current) {
      console.log("[自动面试] 面试已结束，不启动语音识别/录音");
      return;
    }

    console.log("[手动面试] 准备预热语音识别器...");
    try {
      await preheatSpeechRecognizer();
      console.log("[手动面试] ========== 语音识别器预热完成 ==========");
    } catch (error) {
      console.error("[手动面试] ========== 预热语音识别器失败 ==========");
      console.error("[手动面试] 错误详情:", error);
    }

    try {
      await ensureRecordingAudioStream();
      isManualRecordingReadyRef.current = true;
      console.log("[手动面试] 录音音频流预热完成");
    } catch (error) {
      console.warn("[手动面试] 录音音频流预热失败:", error);
      isManualRecordingReadyRef.current = false;
    }
  }, [ensureRecordingAudioStream, preheatSpeechRecognizer]);

  const playWithBrowserSpeechSynthesis = useCallback(async (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return false;
    }

    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      await wait(160);
      synth.resume();

      const voiceOption = getInterviewerVoiceOption(interviewerVoice);
      const waitForVoices = async () => {
        let voices = synth.getVoices();
        if (voices.length > 0) {
          return voices;
        }

        await new Promise<void>((resolve) => {
          let settled = false;
          let handleVoicesChanged: (() => void) | null = null;

          const finish = () => {
            if (settled) {
              return;
            }

            settled = true;
            if (handleVoicesChanged) {
              synth.removeEventListener("voiceschanged", handleVoicesChanged);
            }
            resolve();
          };

          const timeoutId = window.setTimeout(finish, 2000);
          handleVoicesChanged = () => {
            window.clearTimeout(timeoutId);
            finish();
          };

          synth.addEventListener("voiceschanged", handleVoicesChanged);
        });

        voices = synth.getVoices();
        for (let attempt = 0; voices.length === 0 && attempt < 10; attempt++) {
          await wait(100);
          voices = synth.getVoices();
        }

        return voices;
      };

      const voices = await waitForVoices();

      const zhVoices = voices.filter((voice) =>
        /zh|cmn|yue/i.test(voice.lang) ||
        /普通话|中文|国语|粤语|mandarin|chinese/i.test(voice.name)
      );

      const rankVoice = (voice: SpeechSynthesisVoice) => {
        const haystack = `${voice.name} ${voice.lang}`.toLowerCase();
        let score = 0;

        for (const keyword of voiceOption.browserVoiceKeywords) {
          if (haystack.includes(keyword.toLowerCase())) {
            score += 120;
          }
        }

        if (/xiaoxiao|xiaoyi|tingting|sinji|meijia|yu-shu/.test(haystack)) {
          score += 90;
        }
        if (/microsoft/.test(haystack)) {
          score += 70;
        }
        if (/google/.test(haystack)) {
          score += 45;
        }
        if (voice.localService) {
          score += 30;
        }
        if (/zh-cn|cmn-hans-cn/.test((voice.lang || "").toLowerCase())) {
          score += 25;
        }
        if (/female|xiaoxiao|xiaoyi|tingting|meijia|sinji/.test(haystack)) {
          score += voiceOption.id === "warm_encouraging" || voiceOption.id === "calm_supportive" ? 40 : 10;
        }
        if (/male|yunxi|yunjian|xiaoming|gang|jun/.test(haystack)) {
          score += voiceOption.id === "steady_professional" || voiceOption.id === "clear_efficient" ? 35 : 5;
        }

        return score;
      };

      const preferredVoice =
        [...zhVoices].sort((a, b) => rankVoice(b) - rankVoice(a))[0] ||
        voices[0] ||
        null;

      if (preferredVoice) {
        console.log("[音频播放] 浏览器朗读使用音色:", preferredVoice.name, preferredVoice.lang);
      }

      const chunks = splitTextForSpeechSynthesis(text);
      console.log("[音频播放] 浏览器朗读分段数:", chunks.length);

      const speakChunk = async (chunkText: string, usePreferredVoice: boolean): Promise<boolean> => {
        const utterance = new SpeechSynthesisUtterance(chunkText);
        utterance.lang = "zh-CN";
        utterance.rate = voiceOption.browserRate;
        utterance.pitch = voiceOption.browserPitch;
        utterance.volume = 1;

        if (usePreferredVoice && preferredVoice) {
          utterance.voice = preferredVoice;
          utterance.lang = preferredVoice.lang || "zh-CN";
        }

        return await new Promise<boolean>((resolve) => {
          let started = false;
          let settled = false;
          let interruptedBeforeStart = false;
          const finish = (value: boolean) => {
            if (settled) {
              return;
            }
            settled = true;
            resolve(value);
          };
          const startTimeout = window.setTimeout(() => {
            if (started) {
              return;
            }

            console.warn("[音频播放] 浏览器朗读启动超时，取消当前分句");
            synth.cancel();
            finish(false);
          }, BROWSER_SPEECH_START_TIMEOUT_MS);

          utterance.onstart = () => {
            started = true;
            window.clearTimeout(startTimeout);
            if (interruptedBeforeStart) {
              console.warn("[音频播放] 浏览器朗读在启动前被中断，放弃当前分句");
              finish(false);
              return;
            }
            console.log("[音频播放] 浏览器朗读已开始:", chunkText.slice(0, 40));
          };

          utterance.onend = () => {
            window.clearTimeout(startTimeout);
            finish(true);
          };

          utterance.onerror = (event) => {
            window.clearTimeout(startTimeout);
            console.error("[音频播放] 浏览器语音朗读失败:", event);
            if ((event as SpeechSynthesisErrorEvent).error === "interrupted" && !started) {
              interruptedBeforeStart = true;
              window.setTimeout(() => finish(false), 120);
              return;
            }
            finish(false);
          };

          synth.speak(utterance);
        });
      };

      for (const chunk of chunks) {
        const preferredPlayed = await speakChunk(chunk, true);
        if (preferredPlayed) {
          continue;
        }

        console.warn("[音频播放] 使用首选音色朗读失败，尝试浏览器默认音色重试");
        const fallbackPlayed = await speakChunk(chunk, false);
        if (!fallbackPlayed) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error("[音频播放] 浏览器语音朗读异常:", error);
      return false;
    }
  }, [interviewerVoice]);

  const fallbackToBrowserAudioPlayback = useCallback(async (text: string, reason?: string, playbackGeneration?: number) => {
    if (
      isInterviewEndedRef.current ||
      isEndingInterviewRef.current ||
      (typeof playbackGeneration === "number" && playbackGeneration !== playbackGenerationRef.current)
    ) {
      console.log("[音频播放] 面试已结束或播放代次失效，跳过浏览器朗读兜底");
      return false;
    }

    console.warn("[音频播放] 切换到浏览器朗读兜底:", reason || "未知原因");

    setIsAudioPlaying(true);
    isPlayingAudioRef.current = true;

    const played = await playWithBrowserSpeechSynthesis(text);

    if (
      isInterviewEndedRef.current ||
      isEndingInterviewRef.current ||
      (typeof playbackGeneration === "number" && playbackGeneration !== playbackGenerationRef.current)
    ) {
      return false;
    }

    if (played) {
      toast.info("已切换为浏览器朗读", {
        duration: 3000,
        description: reason || undefined,
      });
    } else {
      toast.warning("语音播放不可用，请直接阅读题目文字并开始作答", {
        duration: 5000,
      });
    }

    await finalizeAiQuestionPlayback();
    return played;
  }, [finalizeAiQuestionPlayback, playWithBrowserSpeechSynthesis]);

  const buildTtsCacheKey = useCallback((text: string) => {
    return `${interviewerVoice}::${text.trim()}`;
  }, [interviewerVoice]);

  const rememberTtsAudioPayload = useCallback((cacheKey: string, result: TtsAudioResponse) => {
    if (!result.success || !result.audioBase64 || !result.audioFormat) {
      return;
    }

    const cache = ttsAudioCacheRef.current;
    if (cache.has(cacheKey)) {
      cache.delete(cacheKey);
    }
    cache.set(cacheKey, result);

    while (cache.size > MAX_TTS_AUDIO_CACHE_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (!oldestKey) {
        break;
      }
      cache.delete(oldestKey);
    }
  }, []);

  const requestAiQuestionAudioPayload = useCallback(async (text: string): Promise<TtsAudioResponse> => {
    if (isInterviewEndedRef.current || isEndingInterviewRef.current) {
      return {
        success: false,
        error: "面试已结束",
        fallbackToBrowser: false,
      };
    }

    const normalizedText = text.trim();
    if (!normalizedText) {
      return {
        success: false,
        error: "文本内容不能为空",
        fallbackToBrowser: false,
      };
    }

    const cacheKey = buildTtsCacheKey(normalizedText);
    const cachedResult = ttsAudioCacheRef.current.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    const pendingRequest = ttsPendingRequestCacheRef.current.get(cacheKey);
    if (pendingRequest) {
      return pendingRequest;
    }

    const requestPromise = (async () => {
      let controller: AbortController | null = null;
      let timeoutId: number | null = null;

      try {
        if (
          activeTtsRequestKeyRef.current &&
          activeTtsRequestKeyRef.current !== cacheKey &&
          ttsAbortControllerRef.current
        ) {
          ttsAbortControllerRef.current.abort();
        }

        controller = new AbortController();
        activeTtsRequestKeyRef.current = cacheKey;
        ttsAbortControllerRef.current = controller;
        timeoutId = window.setTimeout(() => {
          controller?.abort();
        }, TTS_REQUEST_TIMEOUT_MS);

        const response = await fetch("/api/full-ai-interview/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            text: normalizedText,
            interviewId: interviewIdRef.current || interviewId,
            voiceId: interviewerVoice,
          }),
        });

        const parsedResponse = (await safeParseResponse(response)) as TtsAudioResponse;
        rememberTtsAudioPayload(cacheKey, parsedResponse);
        return parsedResponse;
      } catch (error) {
        if ((error as Error)?.name === "AbortError") {
          return {
            success: false,
            error: "本地语音生成超时，已切换为浏览器朗读",
            fallbackToBrowser: true,
          };
        }
        return {
          success: false,
          error: error instanceof Error ? error.message : "语音服务请求失败",
          fallbackToBrowser: true,
        };
      } finally {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
        ttsPendingRequestCacheRef.current.delete(cacheKey);
        if (ttsAbortControllerRef.current === controller) {
          ttsAbortControllerRef.current = null;
        }
        if (activeTtsRequestKeyRef.current === cacheKey) {
          activeTtsRequestKeyRef.current = null;
        }
      }
    })();

    ttsPendingRequestCacheRef.current.set(cacheKey, requestPromise);
    return requestPromise;
  }, [buildTtsCacheKey, interviewId, interviewerVoice, rememberTtsAudioPayload]);

  // 播放 AI 问题音频
  const playAiQuestionAudio = async (
    text: string,
    prefetchedTtsResult?: TtsAudioResponse | Promise<TtsAudioResponse>
  ) => {
    if (isInterviewEndedRef.current || isEndingInterviewRef.current) {
      console.log("[音频播放] 面试已结束，跳过音频播放");
      return;
    }

    const playbackGeneration = playbackGenerationRef.current;

    addDebugLog(`[音频播放] ========== playAiQuestionAudio 被调用 ==========`);
    addDebugLog(`[音频播放] 参数 text 长度: ${text?.length || 0}`);
    addDebugLog(`[音频播放] 参数 text 内容: ${text || 'N/A'}`);

    console.log("[音频播放 v1.0.11] ========== playAiQuestionAudio 被调用 ==========");
    console.log("[音频播放] 参数 text 类型:", typeof text);
    console.log("[音频播放] 参数 text 长度:", text?.length || 0);
    console.log("[音频播放] 参数 text 内容:", text || 'N/A');
    console.log("[音频播放] 参数 text 前100字符:", text?.substring(0, 100) || 'N/A');

    // ========== 解锁音频播放（解决 iframe 中自动播放被静音的问题）==========
    // 创建一个临时的 AudioContext 并立即恢复，这可以解锁音频播放
    try {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const tempContext = new AudioContextClass();
        console.log("[音频播放] AudioContext 状态:", tempContext.state);
        if (tempContext.state === 'suspended') {
          await tempContext.resume();
          console.log("[音频播放] ✅ AudioContext 已解锁");
        }
        // 创建一个静音的振荡器来确保音频上下文被激活
        const oscillator = tempContext.createOscillator();
        const gainNode = tempContext.createGain();
        gainNode.gain.value = 0; // 静音
        oscillator.connect(gainNode);
        gainNode.connect(tempContext.destination);
        oscillator.start();
        oscillator.stop(tempContext.currentTime + 0.001);
        console.log("[音频播放] ✅ 已播放静音音频来解锁音频");
      }
    } catch (unlockError) {
      console.warn("[音频播放] 解锁音频失败:", unlockError);
    }

    // 验证文本参数
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      addDebugLog(`[音频播放] ❌ 参数 text 无效，返回`);
      console.error("[音频播放] 参数 text 无效，无法播放音频");
      console.error("[音频播放] text 为:", text);
      toast.error("AI问题文本为空，无法播放语音");
      setIsAudioPlaying(false);
      return;
    }

    // 检查是否正在播放音频
    addDebugLog(`[音频播放] 检查 isPlayingAudioRef.current: ${isPlayingAudioRef.current}`);
    if (isPlayingAudioRef.current) {
      addDebugLog(`[音频播放] ⚠️ 已有音频正在播放，跳过本次播放`);
      console.warn("[音频播放] 已有音频正在播放，跳过本次播放");
      return;
    }

    addDebugLog(`[音频播放] ✅ 开始 try 块，准备生成音频`);

    let hasFallbackTriggered = false;
    const triggerBrowserAudioFallback = async (reason: string) => {
      if (hasFallbackTriggered) {
        return;
      }

      if (
        isInterviewEndedRef.current ||
        isEndingInterviewRef.current ||
        playbackGeneration !== playbackGenerationRef.current
      ) {
        return;
      }

      hasFallbackTriggered = true;
      await fallbackToBrowserAudioPlayback(text, reason, playbackGeneration);
    };

    try {
      setIsAudioPlaying(true);
      isPlayingAudioRef.current = true; // 标记为正在播放

      addDebugLog(`[音频播放] 设置 isPlayingAudio = true`);
      console.log(`[音频播放] 开始生成 AI 问题音频，文本长度: ${text.length}`);
      console.log(`[音频播放] 设备类型: ${isMobile ? '移动端' : '电脑端'}`);

      // 检查 audio 元素是否存在，如果不存在则等待最多 3 秒
      addDebugLog(`[音频播放] 检查 audioPlayerRef.current...`);
      let retryCount = 0;
      const maxRetries = 30; // 最多重试 30 次，每次 100ms
      while (!audioPlayerRef.current && retryCount < maxRetries) {
        console.log(`[音频播放] audioPlayerRef.current 为 null，等待中... (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 100));
        retryCount++;
      }

      if (!audioPlayerRef.current) {
        addDebugLog(`[音频播放] ❌ audioPlayerRef.current 仍为 null`);
        console.error("[音频播放] audioPlayerRef.current 仍为 null，已达到最大重试次数");
        await triggerBrowserAudioFallback("音频播放器未就绪");
        return;
      }

      addDebugLog(`[音频播放] ✅ audioPlayerRef.current 已就绪（重试 ${retryCount} 次）`);
      console.log(`[音频播放] audioPlayerRef.current 已就绪（重试 ${retryCount} 次）`);
      const audioElement = audioPlayerRef.current;

      // 先清除旧的事件监听器（避免触发之前设置的错误事件）
      addDebugLog(`[音频播放] 清除旧的事件监听器`);
      audioElement.onended = null;
      audioElement.onerror = null;
      audioElement.oncanplay = null;

      // 停止当前正在播放的音频（避免中断错误）
      addDebugLog(`[音频播放] 停止当前音频（如果有）`);
      console.log("[音频播放] 停止当前音频（如果有）");
      audioElement.pause();
      audioElement.currentTime = 0;

      addDebugLog(`[音频播放] 清空 audioElement.src`);
      audioElement.src = "";
      addDebugLog(`[音频播放] 调用 audioElement.load()`);
      audioElement.load();

      addDebugLog(`[音频播放] 等待 100ms，让音频元素完全重置`);
      // 等待一小段时间确保音频元素完全重置
      await new Promise(resolve => setTimeout(resolve, 100));

      addDebugLog(`[音频播放] 检查浏览器音频配置`);
      console.log("[音频播放] 检查浏览器音频配置:", {
        hasAudioContext: !!(window as any).AudioContext,
        autoplayPolicy: (audioElement as any).autoplayPolicy,
        muted: audioElement.muted,
        volume: audioElement.volume,
        readyState: audioElement.readyState
      });

      // 如果音频被静音，尝试取消静音
      if (audioElement.muted) {
        console.log("[音频播放] 音频被静音，尝试取消静音");
        audioElement.muted = false;
      }

      // 调用 TTS API
      console.log("[音频播放] 调用 TTS API...");
      const result = await (prefetchedTtsResult ?? requestAiQuestionAudioPayload(text));

      console.log(`[音频播放] TTS API 返回摘要:`, {
        success: result.success,
        provider: result.provider,
        audioSize: result.audioSize,
        audioFormat: result.audioFormat,
        audioBase64Length: result.audioBase64?.length || 0,
        fallbackToBrowser: result.fallbackToBrowser,
        error: result.error,
      });

      if (isInterviewEndedRef.current || isEndingInterviewRef.current) {
        console.log("[音频播放] 面试已结束，丢弃已生成的音频结果");
        return;
      }

      if (!result.success) {
        console.warn("[音频播放] TTS 不可用，准备切换浏览器朗读:", result.error);
        await triggerBrowserAudioFallback(result.error || "TTS 服务不可用");
        return;
      }

      console.log(`[音频播放] 音频生成成功，大小: ${result.audioSize} bytes`);
      console.log(`[音频播放] 音频格式: ${result.audioFormat}, base64 数据长度: ${result.audioBase64?.length || 0}`);
      
      // 先清除旧的事件监听器
      audioElement.onended = null;
      audioElement.onerror = null;
      audioElement.oncanplay = null;

      // 验证音频数据是否有效
      if (!result.audioBase64 || result.audioBase64.length === 0) {
        console.error("[音频播放] 音频数据为空");
        toast.error("音频数据无效，请重试");
        setIsAudioPlaying(false);
        isPlayingAudioRef.current = false;
        return;
      }

      if (!result.audioFormat) {
        console.error("[音频播放] 音频格式为空");
        toast.error("音频格式无效，请重试");
        setIsAudioPlaying(false);
        isPlayingAudioRef.current = false;
        return;
      }

      // 验证音频格式是否受支持
      const supportedFormats = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg'];
      console.log(`[音频播放] 检查音频格式: ${result.audioFormat}, 支持的格式: ${supportedFormats.join(', ')}`);

      if (!supportedFormats.includes(result.audioFormat)) {
        console.error(`[音频播放] 不支持的音频格式: ${result.audioFormat}`);
        toast.error(`不支持的音频格式: ${result.audioFormat}`);
        setIsAudioPlaying(false);
        isPlayingAudioRef.current = false;
        return;
      }

      // 动态检查浏览器是否实际支持该格式
      const audioTest = document.createElement('audio');
      const canPlay = audioTest.canPlayType(result.audioFormat);
      console.log(`[音频播放] 浏览器对 ${result.audioFormat} 的支持: ${canPlay}`);

      if (canPlay === '') {
        console.error(`[音频播放] 浏览器不支持播放 ${result.audioFormat} 格式`);
        toast.error(`您的浏览器不支持播放 ${result.audioFormat} 格式的音频`);
        setIsAudioPlaying(false);
        isPlayingAudioRef.current = false;
        return;
      }

      // 设置新的事件监听器
      audioElement.onended = async () => {
        addDebugLog(`[音频播放] ========== 音频播放完成 ==========`);
        console.log("[音频播放] ========== 音频播放完成 ==========");
        console.log("[音频播放] 当前状态检查:", {
          isInterviewEnded,
          audioPlayerRef: !!audioPlayerRef.current,
          audioElementReadyState: audioElement.readyState,
          audioElementPaused: audioElement.paused,
          audioElementEnded: audioElement.ended
        });

        setIsAudioPlaying(false);
        isPlayingAudioRef.current = false; // 清除正在播放标记

        addDebugLog(`[音频播放] 重置 isPlayingAudioRef.current = false`);

        // 检查面试是否已结束
        if (isInterviewEndedRef.current || isEndingInterviewRef.current) {
          console.log("[自动面试] 面试已结束，不启动语音识别/录音");
          return;
        }

        // ========== 手动提交模式：预热语音识别器 ==========
        // 在AI问题播放完成后立即预热语音识别器，减少用户点击"开始录音"时的延迟
        console.log("[手动面试] 准备预热语音识别器...");
        try {
          await preheatSpeechRecognizer();
          console.log("[手动面试] ========== 语音识别器预热完成 ==========");
        } catch (error) {
          console.error("[手动面试] ========== 预热语音识别器失败 ==========");
          console.error("[手动面试] 错误详情:", error);
          // 预热失败不影响用户使用，用户点击"开始录音"时会再次尝试启动
        }
      };

      audioElement.onerror = (error) => {
        // 立即输出版本标记，确保用户知道这是新代码
        addDebugLog(`[音频播放] 🔴🔴🔴 ========== 音频播放出错 ==========`);
        console.error("🔴🔴🔴 [音频播放 v1.0.10] ========== 音频播放出错 ==========");

        // 收集所有错误信息到一个对象中，减少多次日志调用
        const errorInfo: any = {
          version: "v1.0.10", // 明确的版本标识
          audioPlayerRef: !!audioPlayerRef,
          audioElement: !!audioElement,
          timestamp: new Date().toISOString()
        };

        if (!audioElement) {
          console.error("[音频播放] audioElement 为 null 或 undefined");
          console.error("[音频播放] 错误信息:", JSON.stringify(errorInfo));
          void triggerBrowserAudioFallback("音频元素不可用");
          return;
        }

        // 获取错误状态（使用单个 try-catch）
        try {
          errorInfo.error = (audioElement as any).error;
          errorInfo.readyState = audioElement.readyState;
          errorInfo.networkState = audioElement.networkState;
          errorInfo.src = audioElement.src ? audioElement.src.substring(0, 100) : 'N/A';
          errorInfo.errorCode = errorInfo.error ? errorInfo.error.code : 'N/A';
          errorInfo.errorMessage = errorInfo.error ? errorInfo.error.message : 'N/A';
        } catch (e) {
          errorInfo.getErrorDetails = `获取错误详情失败: ${String(e)}`;
        }

        // 一次性输出所有错误信息
        console.error("[音频播放] 错误详情:", JSON.stringify(errorInfo, null, 2));

        // 尝试获取更多错误对象的属性（如果存在）
        if (errorInfo.error && typeof errorInfo.error === 'object') {
          try {
            const errorProps = Object.getOwnPropertyNames(errorInfo.error);
            console.error("[音频播放] 错误对象属性:", JSON.stringify(errorProps));
          } catch (e) {
            console.error("[音频播放] 获取错误对象属性失败:", String(e));
          }
        }

        // 添加错误详情到调试面板
        addDebugLog(`[音频播放] 错误详情: readyState=${errorInfo.readyState}, networkState=${errorInfo.networkState}`);
        addDebugLog(`[音频播放] 错误消息: ${errorInfo.errorMessage || 'N/A'}`);
        addDebugLog(`[音频播放] 错误码: ${errorInfo.errorCode || 'N/A'}`);

        setIsAudioPlaying(false);
        isPlayingAudioRef.current = false; // 清除正在播放标记

        // 根据 readyState 和 networkState 判断可能的错误原因
        // 使用数值常量，避免访问 HTMLMediaElement 属性时出错
        // networkState: 0=NETWORK_EMPTY, 1=NETWORK_IDLE, 2=NETWORK_LOADING, 3=NETWORK_NO_SOURCE
        // readyState: 0=HAVE_NOTHING, 1=HAVE_METADATA, 2=HAVE_CURRENT_DATA, 3=HAVE_FUTURE_DATA, 4=HAVE_ENOUGH_DATA

        let diagnosis = '';
        let userMessage = '播放语音失败，请稍后重试';

        // 安全地比较状态值
        const networkState = errorInfo.networkState || 0;
        const readyState = errorInfo.readyState || 0;

        if (networkState === 3) {  // NETWORK_NO_SOURCE
          diagnosis = '未找到音频源，可能是 URL 无效';
          userMessage = '音频源无效，请重试';
        } else if (networkState === 2 && readyState === 0) {  // NETWORK_LOADING + HAVE_NOTHING
          diagnosis = '音频加载中但尚未加载任何数据';
          userMessage = '音频加载失败，请重试';
        } else if (networkState === 0) {  // NETWORK_EMPTY
          diagnosis = '网络连接已断开';
          userMessage = '网络连接失败，请检查网络';
        } else if (readyState === 0) {  // HAVE_NOTHING
          diagnosis = '音频尚未加载';
          userMessage = '音频加载失败，请重试';
        } else if (readyState === 1) {  // HAVE_METADATA
          diagnosis = '音频元数据已加载，但播放失败';
          userMessage = '音频播放失败，请稍后重试';
        } else {
          diagnosis = `未知错误 (readyState=${readyState}, networkState=${networkState})`;
        }

        console.error("[音频播放] 诊断结果:", diagnosis);
        void triggerBrowserAudioFallback(diagnosis || userMessage);
      };

      // 使用 base64 数据播放
      const audioData = `data:${result.audioFormat};base64,${result.audioBase64}`;
      console.log(`[音频播放] audioData 摘要:`, {
        type: typeof audioData,
        length: audioData.length,
        startsWithData: audioData.startsWith('data:'),
        hasBase64Marker: audioData.includes(';base64,'),
      });

      // 严格验证 audioData 的有效性
      if (!audioData || typeof audioData !== 'string' || audioData.length === 0) {
        console.error("[音频播放] audioData 无效：空值、非字符串或长度为0");
        toast.error("音频数据生成失败，请重试");
        setIsAudioPlaying(false);
        isPlayingAudioRef.current = false;
        return;
      }

      if (!audioData.startsWith('data:')) {
        console.error("[音频播放] audioData 不以 'data:' 开头");
        console.error("[音频播放] audioData 实际值:", audioData);
        toast.error("音频数据格式错误，请重试");
        setIsAudioPlaying(false);
        isPlayingAudioRef.current = false;
        return;
      }

      if (!audioData.includes(';base64,')) {
        console.error("[音频播放] audioData 不包含 ';base64,'");
        console.error("[音频播放] audioData 实际值:", audioData);
        toast.error("音频数据格式错误，请重试");
        setIsAudioPlaying(false);
        isPlayingAudioRef.current = false;
        return;
      }

      // 检查 audioData 是否包含页面 URL（防止错误赋值）
      const currentUrl = window.location.href;
      if (audioData.includes(currentUrl.split('?')[0])) {
        console.error("[音频播放] audioData 包含页面 URL，可能是赋值错误");
        console.error("[音频播放] audioData:", audioData);
        toast.error("音频数据生成错误，请重试");
        setIsAudioPlaying(false);
        isPlayingAudioRef.current = false;
        return;
      }

      console.log(`[音频播放] audioData 验证通过，准备播放`);

      // 验证 Base64 数据格式
      const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;
      if (!base64Pattern.test(result.audioBase64)) {
        console.error("[音频播放] Base64 数据格式不正确");
        console.error("[音频播放] Base64 数据长度:", result.audioBase64.length);
        toast.error("音频数据格式错误，请重试");
        setIsAudioPlaying(false);
        isPlayingAudioRef.current = false;
        return;
      }

      // 验证 audioElement 是否有效
      if (!audioElement) {
        console.error("[音频播放] audioElement 为 null 或 undefined");
        toast.error("音频播放器未就绪，请刷新页面重试");
        setIsAudioPlaying(false);
        isPlayingAudioRef.current = false;
        return;
      }

      if (isInterviewEndedRef.current || isEndingInterviewRef.current) {
        console.log("[音频播放] 面试已结束，跳过播放阶段");
        return;
      }

      // 停止当前播放的音频（如果有）
      if (!audioElement.paused) {
        console.log("[音频播放] 检测到音频正在播放，先停止");
        audioElement.pause();
        audioElement.currentTime = 0;
      }

      // 清除旧的事件监听器
      audioElement.onloadeddata = null;
      audioElement.onloadedmetadata = null;
      audioElement.oncanplaythrough = null;

      // 添加调试事件监听器
      audioElement.onloadeddata = () => {
        console.log("[音频播放] 音频数据加载完成");
      };

      audioElement.onloadedmetadata = () => {
        console.log("[音频播放] 音频元数据加载完成，时长:", audioElement.duration);
      };

      audioElement.oncanplaythrough = () => {
        console.log("[音频播放] 音频可以流畅播放");
      };

      // 设置音频源
      console.log("[音频播放] 设置音频源前 - readyState:", audioElement.readyState);
      console.log("[音频播放] 设置音频源前 - networkState:", audioElement.networkState);
      console.log("[音频播放] 设置音频源前 - currentSrc:", audioElement.currentSrc || 'N/A');
      console.log("[音频播放] 设置音频源前 - src:", audioElement.src || 'N/A');

      audioElement.src = audioData;

      console.log("[音频播放] 设置音频源后 - readyState:", audioElement.readyState);
      console.log("[音频播放] 设置音频源后 - networkState:", audioElement.networkState);
      console.log("[音频播放] 设置音频源后 - src 长度:", audioElement.src ? audioElement.src.length : 0);

      // 等待一小段时间，让浏览器处理音频数据
      await new Promise(resolve => setTimeout(resolve, 50));

      console.log("[音频播放] 设置音频源后 - readyState:", audioElement.readyState);
      console.log("[音频播放] networkState:", audioElement.networkState);

      // 等待音频加载完成后再播放
      audioElement.load();
      console.log("[音频播放] 调用 load() 后 - readyState:", audioElement.readyState);

      // 检查音频是否可以播放
      // HTMLMediaElement.HAVE_FUTURE_DATA = 3
      if (audioElement.readyState < 3) {
        console.log("[音频播放] 音频尚未加载完成，等待 canplay 事件");

        // 添加一次性 canplay 事件监听器
        const handleCanPlay = () => {
          console.log("[音频播放] ========== canplay 事件触发 ==========");
          console.log("[音频播放] audioElement 有效性检查:", {
            exists: !!audioElement,
            src: !!audioElement.src,
            readyState: audioElement.readyState,
            paused: audioElement.paused,
            error: audioElement.error
          });

          // 移除事件监听器
          audioElement.removeEventListener('canplay', handleCanPlay);

          // 再次检查是否还在播放状态（防止在等待过程中被取消）
          if (!isPlayingAudioRef.current) {
            console.warn("[音频播放] 已取消播放，跳过");
            return;
          }

          // 注意：不要在这里重置 useFallbackRecording
          // 如果设备检测时已设置为录音方案（Chrome/移动端等），应该保持不变

          // ⚠️ 关键修复：在 play() 调用之前设置音频属性
          // 确保 muted=false 和 volume=1.0 在播放前设置
          audioElement.muted = false;
          audioElement.volume = 1.0;
          console.log("[音频播放] 播放前设置 muted=false, volume=1.0");

          // 播放音频
          console.log("[音频播放] 开始调用 play()");
          const playPromise = audioElement.play();
          handlePlayPromise(playPromise, audioElement);
        };

        audioElement.addEventListener('canplay', handleCanPlay);

        // 设置超时，防止无限等待
        // HTMLMediaElement.HAVE_FUTURE_DATA = 3
        setTimeout(() => {
          if (audioElement.readyState < 3) {
            console.error("[音频播放] 音频加载超时");
            audioElement.removeEventListener('canplay', handleCanPlay);
            void triggerBrowserAudioFallback("音频加载超时");
          }
        }, 10000); // 10秒超时
      } else {
        console.log("[音频播放] 音频已加载完成，立即播放");

        // 注意：不要在这里重置 useFallbackRecording
        // 如果设备检测时已设置为录音方案（Chrome/移动端等），应该保持不变

        // ⚠️ 关键修复：在 play() 调用之前设置音频属性
        audioElement.muted = false;
        audioElement.volume = 1.0;
        console.log("[音频播放] 播放前设置 muted=false, volume=1.0");

        // 播放音频
        const playPromise = audioElement.play();
        handlePlayPromise(playPromise, audioElement);
      }
    } catch (error: any) {
      console.error("[音频播放] 播放语音失败:", error);
      await triggerBrowserAudioFallback(error.message || "播放语音失败");
    }
  };

  const handleAnswerSubmit = async () => {
    addDebugLog(`[自动面试] ========== handleAnswerSubmit 被调用 ==========`);

    if (isSubmittingAnswerRef.current) {
      addDebugLog(`[自动面试] 检测到重复提交，已忽略本次 handleAnswerSubmit`);
      console.warn("[自动面试] 检测到重复提交，已忽略");
      return;
    }

    // 检查面试是否已结束
    if (isInterviewEnded) {
      addDebugLog(`[自动面试] 面试已结束，拒绝提交回答`);
      console.log('[自动面试] 面试已结束，拒绝提交回答');
      toast.info("面试已结束，无法继续回答");
      return;
    }

    // 使用 ref 存储的 interviewId，确保是最新的（在函数开始时就声明）
    const currentInterviewId = interviewIdRef.current || interviewId;

    // 优先使用 accumulatedTranscriptRef.current，因为它总是最新的
    const answerText = accumulatedTranscriptRef.current || transcript || userAnswer;

    addDebugLog(`[自动面试] ========== 开始提交回答 ==========`);
    addDebugLog(`[自动面试] accumulatedTranscriptRef.current: ${accumulatedTranscriptRef.current?.substring(0, 50) || 'N/A'}`);
    addDebugLog(`[自动面试] transcript: ${transcript?.substring(0, 50) || 'N/A'}`);
    addDebugLog(`[自动面试] userAnswer: ${userAnswer?.substring(0, 50) || 'N/A'}`);
    addDebugLog(`[自动面试] 最终使用的 answerText: ${answerText?.substring(0, 50) || 'N/A'}`);
    addDebugLog(`[自动面试] answerText 长度: ${answerText?.length || 0}`);

    console.log("[自动面试] 提交前检查 - accumulatedTranscriptRef.current:", accumulatedTranscriptRef.current);
    console.log("[自动面试] 提交前检查 - transcript:", transcript);
    console.log("[自动面试] 提交前检查 - userAnswer:", userAnswer);
    console.log("[自动面试] 最终使用的 answerText:", answerText);

    if (!answerText || !answerText.trim()) {
      addDebugLog(`[自动面试] 没有回答内容，跳过提交`);
      console.log("[自动面试] 没有回答内容，跳过提交");
      toast.warning("请先回答问题");
      return;
    }

    // 如果正在语音识别，先停止
    if (isListening) {
      console.log("[自动面试] 停止语音识别");
      toggleListening();
    }

    console.log(`[自动面试] 提交回答，长度: ${answerText.length}`);

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "candidate",
      content: answerText,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    
    // 检测是否是候选人提问，如果是则记录
    if (isCompanyRelatedQuestion(answerText)) {
      console.log("[候选人问题记录] 检测到候选人提问，开始记录");
      addDebugLog("[候选人问题记录] 检测到候选人提问");
      // 保存到 ref，用于后续 AI 回复关联
      lastCandidateQuestionRef.current = answerText;
      saveCandidateQuestionRecord(answerText, undefined, "candidate_question");
    } else {
      // 如果不是候选人问题，清空 ref
      lastCandidateQuestionRef.current = null;
    }
    
    setTranscript("");
    accumulatedTranscriptRef.current = "";  // 清空累积的转录文本
    recordingAssistTranscriptRef.current = "";
    setUserAnswer("");
    setIsLoading(true);
    isSubmittingAnswerRef.current = true;

    try {
      addDebugLog(`[自动面试] ========== 发送 API 请求 ==========`);
      addDebugLog(`[自动面试] API URL: /api/full-ai-interview/answer`);
      addDebugLog(`[自动面试] interviewId: ${currentInterviewId}`);
      addDebugLog(`[自动面试] candidateAnswer 长度: ${answerText.length}`);

      console.log("[自动面试] 发送回答到后端");
      console.log("[自动面试] 使用的 interviewId:", currentInterviewId);
      console.log("[自动面试] 请求参数 - interviewId:", currentInterviewId);
      console.log("[自动面试] 请求参数 - candidateAnswerLength:", answerText.length);
      console.log("[自动面试] 请求参数 - currentRound:", currentRound + 1);
      console.log(`[自动面试] 状态: ${interviewId}, ref: ${interviewIdRef.current}`);

      const response = await fetch("/api/full-ai-interview/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interviewId: currentInterviewId,
          candidateAnswer: answerText,
          currentRound: currentRound + 1,
        }),
      });

      console.log("[自动面试] 后端响应状态:", response.status);
      const result = await safeParseResponse(response);
      console.log("[自动面试] 后端响应完整内容:", JSON.stringify(result));

      if (isInterviewEndedRef.current || isEndingInterviewRef.current) {
        console.log("[自动面试] 面试已结束，忽略后续 AI 响应");
        return;
      }

      addDebugLog(`[自动面试] ========== 收到 API 响应 ==========`);
      addDebugLog(`[自动面试] 响应状态码: ${response.status}`);
      addDebugLog(`[自动面试] result.success: ${result.success}`);
      addDebugLog(`[自动面试] result.error: ${result.error || 'N/A'}`);
      addDebugLog(`[自动面试] result.question: ${result.question || 'N/A'}`);
      addDebugLog(`[自动面试] ========== API 响应结束 ==========`);

      if (result.success) {
        addDebugLog(`[自动面试] ========== 收到AI问题 ==========`);
        addDebugLog(`[自动面试] result.success: ${result.success}`);
        addDebugLog(`[自动面试] result.question 长度: ${result.question?.length || 0}`);
        addDebugLog(`[自动面试] result.question 内容: ${result.question || 'N/A'}`);
        addDebugLog(`[自动面试] ========== 收到AI问题结束 ==========`);

        console.log("[自动面试] ========== 收到AI问题 ==========");
        console.log("[自动面试] result.success:", result.success);
        console.log("[自动面试] result.question 类型:", typeof result.question);
        console.log("[自动面试] result.question 长度:", result.question?.length || 0);
        console.log("[自动面试] result.question 内容:", result.question || 'N/A');
        console.log("[自动面试] result.shouldEnd:", result.shouldEnd);
        console.log("[自动面试] result.interviewStage:", result.interviewStage);
        console.log("[自动面试] 完整 result 对象:", JSON.stringify(result));
        console.log("[自动面试] ========== 收到AI问题结束 ==========");

        // 更新面试阶段
        if (result.interviewStage) {
          interviewStageRef.current = result.interviewStage;
          console.log(`[自动面试] 更新面试阶段为: ${result.interviewStage}`);
        }

        // 验证问题内容是否有效
        if (!result.question || typeof result.question !== 'string' || result.question.trim().length === 0) {
          console.error("[自动面试] 收到的问题无效，无法播放音频");
          toast.error("AI面试官的问题为空，请重试");
          setIsLoading(false);
          return;
        }

        if (isInterviewEndedRef.current || isEndingInterviewRef.current) {
          console.log("[自动面试] 面试已结束，丢弃即将展示的 AI 问题");
          return;
        }

        const prefetchedAiQuestionAudioPromise = requestAiQuestionAudioPayload(result.question);

        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "interviewer",
          content: result.question,
          timestamp: new Date(),
        };
        flushSync(() => {
          setMessages(prev => [...prev, aiMessage]);
        });

        // 检查是否有待关联的候选人问题，如果有则记录 AI 回答
        if (lastCandidateQuestionRef.current) {
          console.log("[候选人问题记录] 检测到 AI 回答候选人问题，开始记录");
          addDebugLog("[候选人问题记录] 检测到 AI 回答候选人问题");
          saveCandidateQuestionRecord(
            lastCandidateQuestionRef.current,
            result.question,
            "interviewer_answer"
          );
          // 清空 ref，避免重复记录
          lastCandidateQuestionRef.current = null;
        }

        // 播放 AI 问题音频（播放完成后会自动启动语音识别）
        console.log("[自动面试] ========== 准备播放AI问题音频 ==========");
        console.log("[自动面试] 问题内容前100字符:", result.question.substring(0, 100));
        console.log("[自动面试] 调用 playAiQuestionAudio...");
        await playAiQuestionAudio(result.question, prefetchedAiQuestionAudioPromise);
        console.log("[自动面试] ========== playAiQuestionAudio 调用完成 ==========");

        if (result.shouldEnd) {
          console.log("[自动面试] AI结束面试");
          // 立即禁用所有交互功能
          setIsInterviewEnded(true);
          // 延迟调用结束流程
          setTimeout(() => {
            handleEndInterview();
          }, 1000);
        } else {
          setCurrentRound(currentRound + 1);
          setCurrentRoundView(currentRound + 1);
          console.log("[自动面试] 面试继续，当前轮数:", currentRound + 1);
          
          // 更新监控器轮次
          if (candidateMonitorRef.current) {
            console.log("[候选人监控] 切换到轮次：", currentRound + 1);
            addDebugLog(`[候选人监控] 🔄 切换到轮次：${currentRound + 1}`);
            candidateMonitorRef.current.setCurrentRound(currentRound + 1);
          }
        }
      } else {
        addDebugLog(`[自动面试] ========== API 返回失败 ==========`);
        addDebugLog(`[自动面试] result.success: ${result.success}`);
        addDebugLog(`[自动面试] result.error: ${result.error || 'N/A'}`);
        addDebugLog(`[自动面试] ========== API 返回失败结束 ==========`);

        console.error("[自动面试] 生成问题失败:", result.error);
        console.error("[自动面试] 完整错误响应:", result);
        toast.error(result.error || "生成追问失败");
      }
    } catch (error) {
      addDebugLog(`[自动面试] ========== 捕获异常 ==========`);
      addDebugLog(`[自动面试] 错误名称: ${(error as Error)?.name || 'N/A'}`);
      addDebugLog(`[自动面试] 错误消息: ${(error as Error)?.message || 'N/A'}`);
      addDebugLog(`[自动面试] ========== 捕获异常结束 ==========`);

      console.error("[自动面试] 提交失败:", error);
      console.error("[自动面试] 错误详情:", {
        name: (error as Error)?.name,
        message: (error as Error)?.message,
        stack: (error as Error)?.stack
      });
      toast.error("生成追问失败");
    } finally {
      addDebugLog(`[自动面试] ========== handleAnswerSubmit 结束 ==========`);
      isSubmittingAnswerRef.current = false;
      setIsLoading(false);
    }
  };

  const handleEndInterview = async () => {
    if (isEndingInterviewRef.current) {
      console.log("[面试结束] 结束流程已在进行中，跳过重复调用");
      return;
    }

    isEndingInterviewRef.current = true;
    addDebugLog(`[面试结束] ========== 开始结束流程 ==========`);
    console.log("[面试结束] 开始结束流程");

    // 使用局部变量存储监控数据，避免状态更新延迟问题
    let finalCandidateStatus: CandidateStatus | null = null;

    addDebugLog(`[面试结束] 当前状态:`);
    addDebugLog(`[面试结束]   - isScreenRecording: ${isScreenRecording}`);
    addDebugLog(`[面试结束]   - isRecording: ${isRecording}`);
    addDebugLog(`[面试结束]   - hasMediaRecorder: ${!!mediaRecorder}`);
    addDebugLog(`[面试结束]   - hasRecordedBlob: ${!!recordedBlob}`);
    addDebugLog(`[面试结束]   - recordedBlobSize: ${recordedBlob?.size || 0}`);

    console.log("[面试结束] 当前状态:", {
      interviewId,
      interviewIdRef: interviewIdRef.current,
      candidateName,
      selectedPosition,
      hasEvaluation: !!evaluation,
      isRecording,
      hasMediaRecorder: !!mediaRecorder,
      hasRecordedBlob: !!recordedBlob,
      recordedBlobSize: recordedBlob?.size || 0,
      hasRecordingPromise: !!recordingCompletePromiseRef.current,
      isListening,
      isListeningRef: isListeningRef.current,
      hasSpeechRecognizer: !!speechRecognizerRef.current
    });

    // 设置面试结束标志，禁止所有自动重启
    setIsInterviewEnded(true);
    isInterviewEndedRef.current = true; // 更新 ref，确保闭包中获取到最新值
    shouldRestartRef.current = false;
    isDetectingSilenceRef.current = false;
    stopAllQuestionAudioPlayback();

    // 停止候选人状态监控
    if (candidateMonitorRef.current) {
      console.log("[候选人监控] 停止监控");
      addDebugLog("[候选人监控] ⏹️ 停止监控");
      candidateMonitorRef.current.stopMonitoring();
      const finalStatus = candidateMonitorRef.current.getCurrentStatus();
      // 保存到局部变量，避免状态更新延迟
      finalCandidateStatus = finalStatus;
      setCandidateStatus(finalStatus);
      
      console.log("[候选人监控] 最终状态:", finalStatus);
      addDebugLog(`[候选人监控] 📋 最终状态: ${finalStatus.overallStatus}, 总时长=${finalStatus.statistics.totalDuration.toFixed(1)}秒`);
      
      // 输出事件摘要
      if (finalStatus.events && finalStatus.events.length > 0) {
        addDebugLog(`[候选人监控] 📊 事件数量: ${finalStatus.events.length}`);
        finalStatus.events.slice(0, 5).forEach((event, i) => {
          addDebugLog(`[候选人监控] 事件 ${i + 1}: ${event.type} - ${event.description}`);
        });
      }
    } else {
      console.warn("[候选人监控] 监控器未初始化，无法停止");
      addDebugLog("[候选人监控] ⚠️ 监控器未初始化，无法停止");
      
      // 如果监控器未初始化，创建一个默认状态，避免显示"未启用"
      // 根据监控器初始化状态提供不同的摘要信息
      const statusSummary = monitorInitializedRef.current 
        ? '状态监控已初始化但无法获取数据' 
        : '状态监控未启用（监控器初始化失败）';
      
      finalCandidateStatus = {
        overallStatus: 'normal',
        summary: statusSummary,
        events: [],
        statistics: {
          totalDuration: 0,
          normalDuration: 0,
          abnormalDuration: 0,
          cheatingDuration: 0,
          faceDetectionRate: 0,
          faceLostCount: 0,
          multipleFaceCount: 0,
          suspiciousActions: 0,
          screenshotCount: 0,
          periodicScreenshotCount: 0,
          eventScreenshotCount: 0,
        },
        screenshots: [],
      };
      addDebugLog(`[候选人监控] ⚠️ 使用默认状态替代: ${statusSummary}`);
    }

    // 停止语音识别（更彻底的停止）
    if (speechRecognizerRef.current) {
      console.log("[面试结束] 停止语音识别");
      try {
        // 停止停顿检测
        stopSilenceDetection();

        // 禁止重启
        shouldRestartRef.current = false;

        // 停止识别器
        if (speechRecognizerRef.current.isListening) {
          speechRecognizerRef.current.stop();
          console.log("[面试结束] 调用了 speechRecognizerRef.current.stop()");
        } else {
          console.log("[面试结束] 语音识别器未在运行，跳过 stop() 调用");
        }

        // 清空识别器引用（防止后续意外使用）
        // speechRecognizerRef.current = null; // 不要清空，避免其他地方出错

        setIsListening(false);
        isListeningRef.current = false;
        console.log("[面试结束] 语音识别已停止");
      } catch (error) {
        console.error("[面试结束] 停止语音识别失败:", error);
      }
    }

    // 停止录音（如果是录音方案）
    if (isRecording && mediaRecorderRef.current) {
      console.log("[面试结束] 停止录音");
      try {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
        console.log("[面试结束] 录音已停止");
      } catch (error) {
        console.error("[面试结束] 停止录音失败:", error);
      }
    }

    let finalBlob: Blob | null = null;

    addDebugLog(`[录屏] ========== 开始检查录屏状态 ==========`);
    addDebugLog(`[录屏] isScreenRecording: ${isScreenRecording}`);
    addDebugLog(`[录屏] hasMediaRecorder: ${!!mediaRecorder}`);
    addDebugLog(`[录屏] hasMediaRecorderRef: ${!!mediaRecorderRef.current}`);
    addDebugLog(`[录屏] hasRecordedBlob: ${!!recordedBlob}`);
    addDebugLog(`[录屏] recordedBlobSize: ${recordedBlob?.size || 0}`);

    // 停止录屏并等待录屏数据生成
    const mediaRecorderForStop = mediaRecorderRef.current || mediaRecorder;
    if (mediaRecorderForStop && isScreenRecording) {
      addDebugLog(`[录屏] ========== 停止录屏 ==========`);
      console.log("[录屏] 停止录屏，当前状态:", {
        isScreenRecording,
        mediaRecorderState: mediaRecorderForStop.state,
        hasRecordingPromise: !!recordingCompletePromiseRef.current
      });

      mediaRecorderForStop.stop();
      setIsScreenRecording(false);
      console.log("[录屏] 录屏已停止");

      // 等待 Promise resolve（缩短超时时间到 3秒）
      console.log("[录屏] 等待录屏数据生成 Promise...");
      addDebugLog(`[录屏] 等待录屏数据生成...`);
      try {
        finalBlob = await Promise.race([
          recordingCompletePromiseRef.current!,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)) // 3秒超时
        ]);

        if (finalBlob) {
          addDebugLog(`[录屏] ✅ Promise resolve 成功，blob 大小: ${finalBlob.size} bytes`);
          console.log("[录屏] Promise resolve 成功，blob 大小:", finalBlob.size, "bytes");
          // 直接使用 Promise 返回的 blob，无论大小
        } else {
          addDebugLog(`[录屏] ⚠️ Promise 超时返回 null，使用状态中的 blob`);
          console.warn("[录屏] Promise 超时返回 null，使用状态中的 blob");
          finalBlob = recordedBlob;
          addDebugLog(`[录屏] 使用状态中的 blob，大小: ${finalBlob?.size || 0} bytes`);
          console.log("[录屏] 使用状态中的 blob，大小:", finalBlob?.size || 0, "bytes");
        }
      } catch (error) {
        console.error("[录屏] 等待录屏数据失败:", error);
        finalBlob = recordedBlob;
        console.log("[录屏] 错误情况下使用状态中的 blob，大小:", finalBlob?.size || 0, "bytes");
      }
    } else {
      addDebugLog(`[录屏] 没有正在进行的录屏，直接使用状态中的 blob`);
      console.log("[录屏] 没有正在进行的录屏，直接使用状态中的 blob");
      console.log("[录屏] 状态详情:", {
        isScreenRecording,
        hasMediaRecorder: !!mediaRecorder,
        hasRecordedBlob: !!recordedBlob,
        recordedBlobSize: recordedBlob?.size || 0
      });
      finalBlob = recordedBlob;
      addDebugLog(`[录屏] 从状态中获取 blob，大小: ${finalBlob?.size || 0} bytes`);
    }

    // 不要清理媒体流，这会导致视频变红色
    // cleanupMediaStream();

    addDebugLog(`[录屏] ========== 检查录屏数据 ==========`);
    // 检查录屏数据是否已准备
    console.log("[录屏] 检查录屏数据:", {
      hasFinalBlob: !!finalBlob,
      blobSize: finalBlob ? finalBlob.size : 0,
      blobType: finalBlob?.type
    });
    addDebugLog(`[录屏] finalBlob 存在: ${!!finalBlob}`);
    addDebugLog(`[录屏] finalBlob 大小: ${finalBlob ? finalBlob.size : 0} bytes`);
    addDebugLog(`[录屏] finalBlob 类型: ${finalBlob?.type || 'N/A'}`);

    // 如果没有录屏数据，给出警告（但如果是移动端跳过录屏，则不警告）
    if (!finalBlob) {
      if (isRecordingSkipped) {
        // 移动端跳过录屏的情况，不显示警告
        addDebugLog(`[录屏] 移动端跳过录屏，正常情况`);
        console.log("[录屏] 移动端跳过录屏，无需上传录屏");
      } else {
        // 非移动端或其他情况，显示警告
        addDebugLog(`[录屏] ⚠️ 没有录屏数据！`);
        console.error("[录屏] 没有录屏数据！");
        console.error("[录屏] 可能的原因:");
        console.error("[录屏] 1. 录屏未正常启动");
        console.error("[录屏] 2. 录屏被用户手动停止");
        console.error("[录屏] 3. 浏览器录屏权限未授予");
        console.error("[录屏] 4. 录屏Promise超时且状态中也没有blob");
        // 静默处理，不显示提示
      }
    } else if (finalBlob.size === 0) {
      addDebugLog(`[录屏] ⚠️ 录屏数据大小为 0，无法上传`);
      console.warn("[录屏] 录屏数据大小为 0，无法上传");
      // 静默处理，不显示提示
    } else {
      addDebugLog(`[录屏] ✅ 录屏数据正常，可以上传`);
    }

    // 保存录屏 Blob 以便后续重试上传
    if (finalBlob && finalBlob.size > 0) {
      setRecordedBlob(finalBlob);
      addDebugLog(`[录屏] 已保存 blob 到状态`);
    }

    // 准备处理评估和上传（不在立即显示结束页面）
    console.log("[面试结束] 准备在后台处理评估和上传");
    setShowEvaluation(true);

    // 在后台继续处理评估和上传
    setIsLoading(true);

    try {
      // 第一步：调用评估API获取评估结果（带重试机制）
      console.log("[评估] 开始调用评估 API");
      // 使用 ref 存储的 interviewId，确保是最新的
      const currentInterviewId = interviewIdRef.current || interviewId;
      console.log(`[评估] 使用的 interviewId: ${currentInterviewId} (状态: ${interviewId}, ref: ${interviewIdRef.current})`);

      const evaluateResponse = await fetchWithRetry(
        "/api/full-ai-interview/evaluate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            interviewId: currentInterviewId,
          }),
        },
        3,  // 最多重试 3 次
        2000  // 每次重试间隔 2 秒
      );

      const evaluateResult = await safeParseResponse(evaluateResponse);
      let currentEvaluation: Evaluation | null = null;

      if (!evaluateResult.success) {
        console.error("[评估] 评估失败:", evaluateResult.error);
        toast.error(evaluateResult.error || "评估失败，将跳过评估报告生成，继续上传录屏...");

        // 评估失败时，提供一个默认的 evaluation 对象，避免数据库错误
        currentEvaluation = {
          isEliminated: false,
          eliminationReason: null,
          overallScore5: 0,
          overallScore100: 0,
          categoryScores: {},
          categoryLabels: {
            communication: "沟通表达与亲和力",
            learning: "学习意愿与适配能力",
            execution: "目标感与执行力",
            resilience: "抗压与抗挫折能力",
            customerSensitivity: "客户需求敏感度"
          },
          summary: "评估服务暂时不可用，无法生成详细评估报告。面试已正常完成，录屏已上传。",
          strengths: [],
          improvements: [],
          recommendation: "consider",
          error: evaluateResult.error || "评估服务不可用"
        };
        setEvaluation(currentEvaluation);
      } else {
        console.log("[评估] 评估成功");

        currentEvaluation = {
          ...evaluateResult.evaluation,
          categoryLabels: {
            communication: "沟通表达与亲和力",
            learning: "学习意愿与适配能力",
            execution: "目标感与执行力",
            resilience: "抗压与抗挫折能力",
            customerSensitivity: "客户需求敏感度"
          }
        };
        setEvaluation(currentEvaluation);
      }

      // 第二步：上传录屏到对象存储（如果录屏被跳过，则跳过此步骤）
      let recordingKey = "";
      let recordingUrl = "";
      
      // 检查是否需要上传录屏
      if (!isRecordingSkipped && finalBlob) {
        console.log("[录屏上传] 检查录屏数据:", {
          hasFinalBlob: !!finalBlob,
          blobSize: finalBlob ? finalBlob.size : 0
        });
        addDebugLog(`[录屏上传] 检查录屏数据: ${!!finalBlob}, 大小: ${finalBlob ? finalBlob.size : 0} bytes`);
        // 验证录屏数据是否有效
        console.log("[录屏上传] ========== 开始验证录屏数据 ==========");
        addDebugLog("[录屏上传] ========== 开始验证录屏数据 ==========");

        // 创建临时 URL
        const tempUrl = URL.createObjectURL(finalBlob);
        console.log("[录屏上传] 临时 URL:", tempUrl);

        // 创建临时 video 元素进行验证（仅用于诊断，不中断上传流程）
        const tempVideo = document.createElement('video');
        tempVideo.src = tempUrl;
        tempVideo.muted = true;

        // 等待元数据加载，验证视频是否有效（仅记录日志，不中断上传）
        const metadataPromise = new Promise<void>((resolve) => {
          let resolved = false;

          tempVideo.onloadedmetadata = () => {
            if (resolved) return;
            resolved = true;

            console.log("[录屏上传] 视频元数据加载成功:", {
              duration: tempVideo.duration,
              videoWidth: tempVideo.videoWidth,
              videoHeight: tempVideo.videoHeight,
              readyState: tempVideo.readyState
            });

            if (tempVideo.duration === 0 || tempVideo.duration === Infinity) {
              console.error("[录屏上传] ⚠️ 警告：视频时长为 0 或无限大，录屏可能无效！");
              addDebugLog("[录屏上传] ⚠️ 警告：视频时长为 0 或无限大");
            } else if (tempVideo.videoWidth === 0 || tempVideo.videoHeight === 0) {
              console.error("[录屏上传] ⚠️ 警告：视频宽高为 0，录屏可能无效！");
              addDebugLog("[录屏上传] ⚠️ 警告：视频宽高为 0");
            } else {
              console.log("[录屏上传] ✅ 视频验证通过");
              addDebugLog("[录屏上传] ✅ 视频验证通过");
            }

            // 释放临时 URL
            URL.revokeObjectURL(tempUrl);

            // 不论验证结果如何，都继续上传
            console.log("[录屏上传] 继续上传流程...");
            resolve();
          };

          tempVideo.onerror = (e) => {
            if (resolved) return;
            resolved = true;

            console.error("[录屏上传] ⚠️ 警告：视频加载失败", e);
            addDebugLog("[录屏上传] ⚠️ 警告：视频加载失败");

            // 释放临时 URL
            URL.revokeObjectURL(tempUrl);

            // 不论验证结果如何，都继续上传
            console.log("[录屏上传] 继续上传流程...");
            resolve();
          };

          // 设置超时，避免一直等待
          setTimeout(() => {
            if (resolved) return;
            resolved = true;

            console.warn("[录屏上传] ⚠️ 警告：视频验证超时（5秒），可能是因为浏览器兼容性问题");
            addDebugLog("[录屏上传] ⚠️ 警告：视频验证超时");

            // 释放临时 URL
            URL.revokeObjectURL(tempUrl);

            // 不论验证结果如何，都继续上传
            console.log("[录屏上传] 继续上传流程...");
            resolve();
          }, 5000);
        });

        await metadataPromise;

        addDebugLog(`[录屏上传] ========== 开始上传录屏 ==========`);
        console.log("[录屏上传] 开始上传录屏，大小:", finalBlob.size, "bytes");

        // 移除文件大小限制，所有录屏文件都尝试上传
        // 大文件上传需要更长时间，请耐心等待
        const sizeInMB = (finalBlob.size / (1024 * 1024)).toFixed(2);
        console.log(`[录屏上传] 录屏文件大小: ${sizeInMB}MB`);
        addDebugLog(`[录屏上传] 录屏文件大小: ${sizeInMB}MB`);

        // 根据文件大小设置不同的超时时间和提示
        let timeoutMinutes = 15; // 默认 15 分钟

        if (finalBlob.size > 100 * 1024 * 1024) { // 大于 100MB
          timeoutMinutes = 30;
        } else if (finalBlob.size > 50 * 1024 * 1024) { // 大于 50MB
          timeoutMinutes = 20;
        }

        addDebugLog(`[录屏上传] 设置超时时间: ${timeoutMinutes} 分钟`);
        
        // 后台上传，不显示任何提示信息
        console.log("[录屏上传] 开始后台上传...");

        // 使用 ref 存储的 interviewId，确保是最新的
        const currentInterviewIdForUpload = interviewIdRef.current || interviewId;
        console.log(`[录屏上传] 使用的 interviewId: ${currentInterviewIdForUpload} (状态: ${interviewId}, ref: ${interviewIdRef.current})`);
        addDebugLog(`[录屏上传] 使用的 interviewId: ${currentInterviewIdForUpload}`);
        
        // 检查网络连接状态
        if (!navigator.onLine) {
          console.error("[录屏上传] 网络离线，无法上传");
          addDebugLog(`[录屏上传] ⚠️ 网络离线，无法上传`);
          toast.error("网络离线，请检查网络连接后重试");
          setUploadSuccess(false);
          setIsUploading(false);
          return;
        }

        // 【修改】使用分块上传解决 413 Payload Too Large 问题
        try {
          addDebugLog(`[录屏上传] ========== 使用分块上传 ==========`);
          console.log(`[录屏上传] 开始分块上传...`);

          // 检查是否已经上传过录屏
          if (hasUploadedRecordingRef.current) {
            console.log("[录屏上传] 录屏已上传过，跳过上传");
            addDebugLog("[录屏上传] 录屏已上传过，跳过上传");
            return;
          }

          // 标记已开始上传
          hasUploadedRecordingRef.current = true;

          // 生成文件名和 Content-Type
          const contentType = finalBlob.type || "video/webm";
          // 根据 Content-Type 选择正确的文件扩展名
          const getFileExtension = (mimeType: string) => {
            if (mimeType.includes('mp4')) return '.mp4';
            if (mimeType.includes('webm')) return '.webm';
            return '.webm'; // 默认使用 webm
          };
          const fileName = `interview-recording-${Date.now()}${getFileExtension(contentType)}`;

          const currentInterviewIdForUpload = interviewIdRef.current || interviewId;
          console.log(`[录屏上传] 使用的 interviewId: ${currentInterviewIdForUpload}`);
          addDebugLog(`[录屏上传] 使用的 interviewId: ${currentInterviewIdForUpload}`);
          addDebugLog(`[录屏上传] 文件名: ${fileName}`);
          addDebugLog(`[录屏上传] Content-Type: ${contentType}`);

          // 使用分块上传
          const startTime = Date.now();
          console.log(`[录屏上传] 开始时间: ${new Date(startTime).toISOString()}`);
          addDebugLog(`[录屏上传] 开始时间: ${new Date(startTime).toISOString()}`);

          const uploadData = await uploadFileInChunks(
            finalBlob,
            currentInterviewIdForUpload,
            fileName,
            contentType,
            (progress) => {
              console.log(`[录屏上传] 上传进度: ${progress}%`);
              addDebugLog(`[录屏上传] 上传进度: ${progress}%`);
            },
            (chunkIndex, totalChunks) => {
              console.log(`[录屏上传] 正在上传分块: ${chunkIndex}/${totalChunks}`);
              addDebugLog(`[录屏上传] 正在上传分块: ${chunkIndex}/${totalChunks}`);
            }
          );

          const endTime = Date.now();
          const duration = endTime - startTime;
          console.log(`[录屏上传] 结束时间: ${new Date(endTime).toISOString()}`);
          console.log(`[录屏上传] 请求耗时: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
          addDebugLog(`[录屏上传] 结束时间: ${new Date(endTime).toISOString()}`);
          addDebugLog(`[录屏上传] 请求耗时: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
          addDebugLog(`[录屏上传] 上传成功: fileKey=${uploadData.fileKey}, fileSize=${uploadData.fileSize} bytes`);

          const { fileKey, fileSize } = uploadData;

          // 【关键修改】将 fileKey 赋值给 recordingKey，以便传递给 save-result
          recordingKey = fileKey;
          recordingUrl = fileKey;  // 暂时使用 fileKey 作为 url

          // 设置上传成功标志（用于 UI 显示）
          setRecordedSignedUrl(fileKey);
          setUploadSuccess(true);
          setUploadError(null);

          console.log("[录屏上传] 上传成功，key:", fileKey);
          addDebugLog(`[录屏上传] ========== 上传成功 ==========`);
          addDebugLog(`[录屏上传] fileKey: ${fileKey}`);
          addDebugLog(`[录屏上传] recordingKey 已设置: ${recordingKey}`);

          // 后台上传成功，不显示提示
        } catch (error: any) {
          addDebugLog(`[录屏上传] ========== 上传异常 ==========`);
          console.error("[录屏上传] 上传异常:", error);

          let errorMsg = "";
          if (error.name === 'AbortError') {
            addDebugLog(`[录屏上传] 异常类型: 超时中止 (AbortError)`);
            errorMsg = `录屏上传超时 (${sizeInMB}MB 文件上传时间超过 ${timeoutMinutes} 分钟)`;
          } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
            addDebugLog(`[录屏上传] 异常类型: 网络请求失败 (TypeError)`);
            errorMsg = "网络请求失败";
          } else if (error.name === 'SecurityError') {
            addDebugLog(`[录屏上传] 异常类型: 安全策略错误 (SecurityError)`);
            errorMsg = "安全策略阻止了上传";
          } else {
            addDebugLog(`[录屏上传] 异常类型: 未知错误`);
            errorMsg = "录屏上传异常: " + (error.message || "未知错误");
          }

          addDebugLog(`[录屏上传] 完整错误消息: ${errorMsg}`);
          // 后台上传失败，不显示错误提示，直接跳过
          console.log("[录屏上传] 上传失败，静默跳过");
        } finally {
          addDebugLog(`[录屏上传] ========== 上传流程结束 ==========`);
          setIsUploading(false);
        }
      } else {
        // 没有录屏数据的情况
        if (isRecordingSkipped) {
          // 移动端跳过录屏，正常情况，不显示错误
          console.log("[录屏上传] 移动端跳过录屏，无需上传");
          addDebugLog("[录屏上传] 移动端跳过录屏，正常情况");
        } else {
          // 其他情况（录屏失败），显示错误
          console.warn("[录屏上传] 没有录屏数据可上传");
          addDebugLog("[录屏上传] ⚠️ 没有录屏数据可上传");
          setUploadError("没有录屏数据可上传"); // 存储错误信息
        }
      }

      // 第三步：获取会话消息并保存面试结果
      console.log("[保存结果] 开始获取会话消息并保存面试结果");
      addDebugLog("[保存结果] 开始获取会话消息");

      // 使用 ref 存储的 interviewId，确保是最新的
      const currentInterviewIdForSave = interviewIdRef.current || interviewId;
      console.log(`[保存结果] 使用的 interviewId: ${currentInterviewIdForSave} (状态: ${interviewId}, ref: ${interviewIdRef.current})`);
      addDebugLog(`[保存结果] interviewId: ${currentInterviewIdForSave}`);

      // 从数据库获取会话消息
      let qaHistory: any[] = [];
      try {
        console.log("[保存结果] 正在从数据库获取会话消息...");
        addDebugLog("[保存结果] 正在从数据库获取会话消息...");
        const sessionResponse = await fetch(`/api/interview/session?interviewId=${currentInterviewIdForSave}`);
        const sessionData = await sessionResponse.json();

        if (sessionData.success && sessionData.session && sessionData.session.messages) {
          console.log(`[保存结果] 成功获取会话消息，共 ${sessionData.session.messages.length} 条`);
          addDebugLog(`[保存结果] 成功获取会话消息，共 ${sessionData.session.messages.length} 条`);

          // 过滤掉系统提示词消息，只保留面试对话（assistant 和 user）
          const conversationMessages = sessionData.session.messages.filter((msg: any) => 
            msg.role !== "system"
          );
          
          console.log(`[保存结果] 过滤后保留对话消息，共 ${conversationMessages.length} 条`);
          addDebugLog(`[保存结果] 过滤后保留对话消息，共 ${conversationMessages.length} 条（已过滤系统提示词）`);

          // 转换会话消息为问答记录格式
          qaHistory = conversationMessages.map((msg: any, index: number) => {
            // 判断消息类型
            let type: string = "answer";
            if (msg.role === "assistant") {
              // 检查是否是回答候选人问题
              const prevMsg = index > 0 ? sessionData.session.messages[index - 1] : null;
              if (prevMsg && prevMsg.role === "user" && isCompanyRelatedQuestion(prevMsg.content)) {
                type = "interviewer_answer";
              } else {
                type = "question";
              }
            } else {
              // 用户消息
              type = isCompanyRelatedQuestion(msg.content) ? "candidate_question" : "answer";
            }

            return {
              id: `${currentInterviewIdForSave}-${index}`,
              role: msg.role === "assistant" ? "interviewer" : "candidate",
              content: msg.content,
              type: type,
              timestamp: msg.timestamp || new Date().toISOString()
            };
          }, conversationMessages); // 使用过滤后的 conversationMessages 而不是原始数组

          console.log(`[保存结果] 转换后的问答记录，共 ${qaHistory.length} 条`);
          addDebugLog(`[保存结果] 转换后的问答记录，共 ${qaHistory.length} 条`);

          // 输出问答记录摘要（仅前5条）
          if (qaHistory.length > 0) {
            qaHistory.slice(0, 5).forEach((qa, i) => {
              console.log(`[保存结果] 问答记录 ${i + 1}: ${qa.role} - ${qa.type} - ${qa.content.substring(0, 50)}...`);
              addDebugLog(`[保存结果] Q&A ${i + 1}: ${qa.role}/${qa.type}/${qa.content.substring(0, 30)}...`);
            });
          }
        } else {
          console.warn("[保存结果] 未获取到会话消息或消息为空");
          addDebugLog("[保存结果] ⚠️ 未获取到会话消息");
        }
      } catch (error) {
        console.error("[保存结果] 获取会话消息失败:", error);
        addDebugLog("[保存结果] ❌ 获取会话消息失败: " + (error instanceof Error ? error.message : "未知错误"));
      }

      console.log("[保存结果] 录屏信息验证:", {
        hasRecordingKey: !!recordingKey,
        recordingKey: recordingKey || "无",
        hasRecordingUrl: !!recordingUrl,
        recordingUrl: recordingUrl ? `${recordingUrl.substring(0, 50)}...` : "无",
        qaHistoryCount: qaHistory.length
      });

      addDebugLog(`[保存结果] 录屏Key: ${recordingKey ? '有' : '无'}, 问答记录: ${qaHistory.length} 条`);

      // 准备保存数据，必须包含 evaluation（使用本地变量 currentEvaluation）
      // 使用 ref 中的值，确保保存的是面试开始时的候选人和岗位信息
      const saveData: any = {
        interviewId: currentInterviewIdForSave,
        candidateName: fixedCandidateNameRef.current || candidateName,
        position: fixedPositionRef.current || selectedPosition,
        evaluation: currentEvaluation,  // 使用本地变量，确保不会是 null
        recordingKey,
        recordingUrl,
        qaHistory: qaHistory.length > 0 ? qaHistory : null, // 包含问答记录
        // 使用局部变量 finalCandidateStatus，避免状态更新延迟
        candidateStatus: finalCandidateStatus || null, // 候选人状态监控信息
        completedAt: new Date().toISOString(),
      };

      console.log("[保存结果] 保存数据预览:", {
        interviewId: saveData.interviewId,
        candidateName: saveData.candidateName,
        position: saveData.position,
        hasEvaluation: !!saveData.evaluation,
        evaluationType: saveData.evaluation ? typeof saveData.evaluation : 'null',
        recordingKey: saveData.recordingKey || "无",
        recordingUrl: saveData.recordingUrl ? "有值" : "无",
        qaHistoryCount: saveData.qaHistory?.length || 0,
        completedAt: saveData.completedAt,
        fixedCandidateName: fixedCandidateNameRef.current,
        fixedPosition: fixedPositionRef.current,
      });

      addDebugLog(`[保存结果] 准备保存: 评估=${!!saveData.evaluation}, 录屏=${!!saveData.recordingKey}, 问答=${saveData.qaHistory?.length || 0}条`);
      
      // 添加候选人状态监控信息到调试日志
      if (saveData.candidateStatus) {
        addDebugLog(`[保存结果] 候选人状态: ${saveData.candidateStatus.overallStatus}, 总时长=${saveData.candidateStatus.statistics.totalDuration.toFixed(1)}s, 事件数=${saveData.candidateStatus.events?.length || 0}`);
      } else {
        addDebugLog(`[保存结果] 候选人状态: 无`);
      }

      try {
        addDebugLog("[保存结果] 正在调用 save-result API...");
        const saveResponse = await fetchWithRetry(
          "/api/full-ai-interview/save-result",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(saveData),
          },
          3,  // 最多重试 3 次
          2000  // 每次重试间隔 2 秒
        );
        const saveResult = await safeParseResponse(saveResponse);
        if (saveResult.success) {
          console.log("[保存结果] 面试结果保存成功:", saveResult.result);
          console.log("[保存结果] 数据库中的 recordingKey:", saveResult.result?.recordingKey || "无");
          console.log("[保存结果] 数据库中的 recordingUrl:", saveResult.result?.recordingUrl ? "有值" : "无");
          console.log("[保存结果] 数据库中的 qaHistory 数量:", saveResult.result?.qaHistory?.length || 0);
          addDebugLog("[保存结果] ✅ 保存成功");
          addDebugLog(`[保存结果] 问答记录已保存: ${saveResult.result?.qaHistory?.length || 0} 条`);
          toast.success("面试已结束，感谢您的参与！");
        } else {
          console.error("[保存结果] 面试结果保存失败:", saveResult.error);
          addDebugLog("[保存结果] ❌ 保存失败: " + (saveResult.error || "未知错误"));
          toast.error("保存面试结果失败，但已完成");
        }
      } catch (error) {
        console.error("[保存结果] 保存面试结果异常:", error);
        addDebugLog("[保存结果] ❌ 保存异常: " + (error instanceof Error ? error.message : "未知错误"));
        toast.error("保存面试结果失败，但已完成");
      }
    } catch (error) {
      console.error("[面试结束] 处理异常:", error);
      toast.error("面试结束失败，请重试");
    } finally {
      isEndingInterviewRef.current = false;
      setIsLoading(false);
    }
  };

  const handleDownloadRecording = async () => {
    // 优先使用远程 URL，如果没有则使用本地 blob
    const downloadUrl = recordedSignedUrl || recordedUrl;
    const localBlob = recordedBlob;

    if (!downloadUrl && !localBlob) {
      toast.error("录屏文件不可用");
      return;
    }

    try {
      let blob: Blob;

      if (downloadUrl) {
        // 使用远程 URL 下载（支持跨域）
        console.log("[下载录屏] 从远程 URL 下载:", downloadUrl.substring(0, 50));
        const response = await fetch(downloadUrl);
        blob = await response.blob();
      } else if (localBlob) {
        // 使用本地 blob
        console.log("[下载录屏] 从本地 blob 下载，大小:", localBlob.size);
        blob = localBlob;
      } else {
        throw new Error("没有可用的录屏数据");
      }

      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `面试录屏-${candidateName}-${new Date().toLocaleDateString('zh-CN')}.webm`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      toast.success("录屏已下载");
    } catch (error) {
      console.error("下载录屏失败:", error);
      toast.error("下载录屏失败，请重试");
    }
  };

  // 重试上传录屏
  const handleRetryUpload = async () => {
    const blobToUpload = recordedBlob;
    if (!blobToUpload || blobToUpload.size === 0) {
      toast.error("没有可用的录屏数据");
      return;
    }

    // 检查是否已经上传过录屏
    if (hasUploadedRecordingRef.current) {
      console.log("[重试上传] 录屏已上传过，跳过上传");
      addDebugLog("[重试上传] 录屏已上传过，跳过上传");
      toast.info("录屏已上传，无需重复上传");
      return;
    }

    console.log("[重试上传] 开始重试上传录屏，大小:", blobToUpload.size, "bytes");
    setIsUploading(true);
    setUploadError(null);

    try {
      // 生成文件名
      const fileName = `interview-recording-retry-${Date.now()}.webm`;
      const contentType = blobToUpload.type || "video/webm";

      const currentInterviewId = interviewIdRef.current || interviewId;
      console.log("[重试上传] 使用的 interviewId:", currentInterviewId);

      // 使用分块上传
      const uploadData = await uploadFileInChunks(
        blobToUpload,
        currentInterviewId,
        fileName,
        contentType,
        (progress) => {
          console.log(`[重试上传] 上传进度: ${progress}%`);
        },
        (chunkIndex, totalChunks) => {
          console.log(`[重试上传] 正在上传分块: ${chunkIndex}/${totalChunks}`);
        }
      );

      const { fileKey, fileSize } = uploadData;
      console.log("[重试上传] 上传成功:", fileKey);

      // 直接设置 recordedSignedUrl，不调用 confirm-upload API（已废弃）
      setRecordedSignedUrl(fileKey);
      setUploadSuccess(true);
      setUploadError(null);
      toast.success("录屏重试上传成功！");
      console.log("[重试上传] 已设置 recordedSignedUrl:", fileKey);
    } catch (error: any) {
      console.error("[重试上传] 重试上传失败:", error);
      setUploadError(error.message || "重试上传失败");
      toast.error("重试上传失败: " + (error.message || "未知错误"));
    } finally {
      setIsUploading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 86) return "text-green-600";
    if (score >= 66) return "text-yellow-600";
    if (score >= 55) return "text-yellow-600";
    return "text-red-600";
  };

  const getScore5Color = (score5: number) => {
    if (score5 >= 5) return "text-green-600";
    if (score5 >= 4) return "text-blue-600";
    if (score5 >= 3) return "text-yellow-600";
    if (score5 >= 2) return "text-orange-600";
    return "text-red-600";
  };

  const getRecommendationBadge = (rec: string) => {
    switch (rec) {
      case "hire":
        return <Badge className="bg-green-600">推荐录用</Badge>;
      case "consider":
        return <Badge className="bg-yellow-600">考虑录用</Badge>;
      case "reject":
        return <Badge className="bg-red-600">不建议录用</Badge>;
      default:
        return <Badge>待评估</Badge>;
    }
  };

  if (isConfigLoading) {
    return (
      <div className="p-8">
        <div className="max-w-6xl mx-auto flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">正在加载面试配置...</p>
          </div>
        </div>
      </div>
    );
  }

  if (configError) {
    return (
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <AlertCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">面试链接无效</h3>
                <p className="text-gray-600 mb-4">{configError}</p>
                <p className="text-sm text-gray-500">请联系面试官获取新的面试链接</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (showEvaluation) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <div className="flex justify-center mb-6">
                <div className="bg-green-100 p-4 rounded-full">
                  <CheckCircle className="h-16 w-16 text-green-600" />
                </div>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-4">
                面试已结束
              </h1>
              <p className="text-lg text-gray-600 mb-8">
                感谢您完成本次AI面试。您的面试记录和评估报告已生成，面试官将尽快查看并反馈结果。
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 text-left">
                <h3 className="font-semibold text-gray-900 mb-2">温馨提示</h3>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <span>您的面试视频已录制并保存</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <span>AI面试官已根据您的表现生成评估报告</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <span>面试官将在 1-3 个工作日内联系您反馈结果</span>
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Bot className="h-8 w-8 text-blue-600" />
            AI面试
          </h1>
          <p className="mt-2 text-gray-600">
            {expectedCandidateName ? `面试邀请对象：${expectedCandidateName}` : '候选人：待确认'} | 岗位：{selectedPosition === 'sales' ? '销售岗' : '管培生'}
          </p>
          {expectedCandidateName && !isStarted && (
            <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 inline-block">
              <p className="text-sm text-amber-800">
                <span className="font-semibold">⚠️ 注意：</span>
                请确保您输入的姓名与面试邀请对象 <strong>&quot;{expectedCandidateName}&quot;</strong> 完全一致，否则无法继续面试
              </p>
            </div>
          )}
          {interviewTime && (
            <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
              <Clock className="h-4 w-4" />
              <span>
                预约时间：{new Date(interviewTime).toLocaleString('zh-CN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          )}
        </div>

        {!isStarted ? (
          <Card>
            <CardHeader>
              <CardTitle>准备面试</CardTitle>
              <CardDescription>
                请输入您的姓名并查看AI面试注意事项
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label>候选人姓名 *</Label>
                <Input
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  placeholder={expectedCandidateName ? `请输入与面试官邀请一致的姓名：${expectedCandidateName}` : "请输入您的真实姓名"}
                  className="mt-2"
                />
                {expectedCandidateName && (
                  <p className="text-xs text-gray-500 mt-1">
                    提示：请输入与面试官邀请的候选人姓名完全一致的姓名
                  </p>
                )}
              </div>

              <Button
                size="lg"
                className="w-full"
                onClick={() => {
                  if (validateCandidateName()) {
                    setShowPreparationInfo(true);
                  }
                }}
                disabled={!candidateName.trim()}
              >
                <>
                  <FileText className="mr-2 h-5 w-5" />
                  查看AI面试注意事项
                </>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isScreenRecording ? (
                      <>
                        <Video className="h-5 w-5 text-red-600 animate-pulse" />
                        <span className="text-sm font-medium text-red-600">录屏进行中</span>
                      </>
                    ) : (
                      <>
                        <VideoOff className="h-5 w-5 text-gray-600" />
                        <span className="text-sm text-gray-600">录屏已停止</span>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>面试对话</CardTitle>
                  <Badge variant="outline">{candidateName}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {/* 视频通话区域 */}
                <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* AI面试官视频 */}
                  <div className="relative bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 rounded-xl overflow-hidden shadow-2xl" style={{ aspectRatio: '16/9' }}>
                    {/* 背景动画 */}
                    <div className="absolute inset-0 overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10 animate-pulse" />
                      <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-blue-400/5 rounded-full blur-3xl animate-pulse delay-1000" />
                      <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-purple-400/5 rounded-full blur-3xl animate-pulse delay-2000" />
                    </div>

                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white relative z-10">
                      {/* AI面试官头像 */}
                      <div className="relative">
                        {/* 外圈光晕 */}
                        <div className={`absolute inset-0 rounded-full bg-blue-400/20 blur-xl transition-all duration-300 ${
                          isAudioPlaying ? 'scale-110 opacity-100' :
                          isListening ? 'scale-105 opacity-80 animate-pulse' :
                          'scale-100 opacity-50'
                        }`} />

                        {/* 头像容器 */}
                        <div className={`w-32 h-32 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center shadow-2xl transition-all duration-300 ${isAudioPlaying ? 'scale-105' : 'scale-100'}`}>
                          {/* AI图标 */}
                          <Bot className={`h-16 w-16 text-white transition-all duration-200 ${isAudioPlaying ? 'scale-110' : 'scale-100'}`} />

                          {/* 说话时的嘴部动画 */}
                          {isAudioPlaying && (
                            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-1">
                              <div className="w-1.5 h-3 bg-white/80 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                              <div className="w-1.5 h-5 bg-white/90 rounded-full animate-bounce" style={{ animationDelay: '100ms' }} />
                              <div className="w-1.5 h-4 bg-white/80 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                              <div className="w-1.5 h-6 bg-white/90 rounded-full animate-bounce" style={{ animationDelay: '50ms' }} />
                              <div className="w-1.5 h-3 bg-white/80 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            </div>
                          )}
                        </div>

                        {/* 脉冲动画 */}
                        {isAudioPlaying && (
                          <div className="absolute inset-0 rounded-full border-2 border-blue-400/30 animate-ping" />
                        )}
                      </div>

                      {/* 候选人信息 */}
                      <div className="text-center mt-6">
                        <h3 className="font-bold text-xl">AI面试官</h3>
                        <p className="text-sm text-blue-200 mt-1">
                          {selectedPositionLabel || positions.find(p => p.id === selectedPosition)?.title || selectedPosition || "未知岗位"}
                        </p>
                      </div>

                      {/* 状态指示器 */}
                      <div className="absolute top-4 left-4 flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${isAudioPlaying ? 'bg-green-400 animate-pulse' : isListening ? 'bg-blue-400 animate-pulse' : 'bg-yellow-400'}`} />
                        <span className="text-xs font-medium bg-black/30 backdrop-blur-sm px-3 py-1 rounded-full">
                          {isAudioPlaying ? '正在发言' : isListening ? '正在聆听你的回答...' : '正在聆听'}
                        </span>
                      </div>

                      {/* 音频波形动画 - AI 说话时显示 */}
                      {isAudioPlaying && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-end gap-1 h-8">
                          {Array.from({ length: 20 }).map((_, i) => (
                            <div
                              key={i}
                              className="w-1 bg-gradient-to-t from-blue-400 to-purple-400 rounded-full"
                              style={{
                                height: `${Math.random() * 24 + 8}px`,
                                animationName: 'wave',
                                animationDuration: `${0.5 + Math.random() * 0.5}s`,
                                animationTimingFunction: 'ease-in-out',
                                animationIterationCount: 'infinite',
                                animationDelay: `${i * 0.05}s`,
                              }}
                            />
                          ))}
                        </div>
                      )}

                      {/* 候选人说话时的声波响应动画 - AI 在听 */}
                      {isListening && !isAudioPlaying && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-end gap-1 h-8">
                          {Array.from({ length: 15 }).map((_, i) => (
                            <div
                              key={`listen-${i}`}
                              className="w-1 bg-gradient-to-t from-green-400 to-blue-400 rounded-full"
                              style={{
                                height: `${Math.sin(Date.now() / 100 + i) * 10 + 12}px`,
                                animationName: 'wave-gentle',
                                animationDuration: `${0.8 + Math.random() * 0.4}s`,
                                animationTimingFunction: 'ease-in-out',
                                animationIterationCount: 'infinite',
                                animationDelay: `${i * 0.08}s`,
                              }}
                            />
                          ))}
                        </div>
                      )}

                      {/* 连接状态 */}
                      <div className="absolute top-4 right-4 flex items-center gap-2 bg-green-500/20 backdrop-blur-sm px-3 py-1.5 rounded-full">
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                        <span className="text-xs font-medium">连线中</span>
                      </div>
                    </div>

                    {/* 边框发光效果 */}
                    <div className={`absolute inset-0 rounded-xl pointer-events-none transition-all duration-500 ${
                      isAudioPlaying ? 'shadow-[0_0_30px_rgba(59,130,246,0.5)]' :
                      isListening ? 'shadow-[0_0_20px_rgba(34,197,94,0.3)]' :
                      'shadow-none'
                    }`} />
                  </div>

                  {/* 候选人视频 */}
                  <div className="relative bg-black rounded-xl overflow-hidden shadow-2xl" style={{ aspectRatio: '16/9' }}>
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted={true}  // 静音以避免回音
                      className="w-full h-full object-cover"
                      style={{ opacity: localStream ? 1 : 0 }}
                      onError={(e) => {
                        console.error("[Video] Video 元素错误:", e);
                        console.error("[Video] 错误详情:", (e.target as any).error);
                        const error = (e.target as any).error;
                        let errorMsg = "视频播放失败";
                        if (error) {
                          switch (error.code) {
                            case MediaError.MEDIA_ERR_ABORTED:
                              errorMsg = "视频加载被中止";
                              break;
                            case MediaError.MEDIA_ERR_NETWORK:
                              errorMsg = "网络错误导致视频加载失败";
                              break;
                            case MediaError.MEDIA_ERR_DECODE:
                              errorMsg = "视频解码失败，可能摄像头被占用或不兼容";
                              break;
                            case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                              errorMsg = "不支持的视频格式";
                              break;
                          }
                        }
                        toast.error(errorMsg);
                      }}
                      onPlay={() => {
                        console.log("[Video] Video 开始播放");
                      }}
                      onPause={() => {
                        console.log("[Video] Video 暂停");
                      }}
                      onWaiting={() => {
                        console.log("[Video] Video 等待数据");
                      }}
                      onCanPlay={() => {
                        console.log("[Video] Video 可以播放");
                      }}
                      onLoadedMetadata={() => {
                        console.log("[Video] Video 元素加载完成，尺寸:", localVideoRef.current?.videoWidth, "x", localVideoRef.current?.videoHeight);
                        addDebugLog("[Video] ✅ Video onLoadedMetadata 触发");
                        // 检查视频是否正常
                        if (localVideoRef.current) {
                          const video = localVideoRef.current;
                          console.log("[Video] Video 详细信息:", {
                            videoWidth: video.videoWidth,
                            videoHeight: video.videoHeight,
                            readyState: video.readyState,
                            currentTime: video.currentTime,
                            duration: video.duration,
                          });

                          addDebugLog(`[Video] 视频尺寸: ${video.videoWidth}x${video.videoHeight}`);

                          // 如果视频尺寸异常，提示用户
                          if (video.videoWidth === 0 || video.videoHeight === 0) {
                            console.warn("[Video] 视频尺寸异常");
                            addDebugLog("[Video] ⚠️ 视频尺寸异常");
                            toast.warning("摄像头可能未正常工作，请检查设备连接");
                          } else {
                            // 视频正常，初始化候选人状态监控器（如果尚未初始化）
                            if (!candidateMonitorRef.current) {
                              console.log("[候选人监控] (onLoadedMetadata) 开始初始化监控器...");
                              addDebugLog("[候选人监控] (onLoadedMetadata) 开始初始化监控器...");
                              
                              const monitor = new CandidateMonitor({
                                enabled: true,
                                minCheckInterval: 5000,
                                maxCheckInterval: 10000,
                                minScreenshotInterval: 60000, // 定时截图最小间隔 60 秒
                                maxScreenshotInterval: 90000, // 定时截图最大间隔 90 秒
                                screenshotQuality: 0.75, // JPEG 质量 75%
                                enableScreenCapture: true, // 启用屏幕截图
                                threshold: {
                                  maxFaceLostDuration: 10,
                                  maxMultipleFaceDuration: 5,
                                  maxAbnormalDuration: 30,
                                  maxSwitchCount: 3,
                                  longAbsenceDuration: 60,
                                },
                              });
                              
                              console.log("[候选人监控] (onLoadedMetadata) CandidateMonitor 实例已创建");
                              addDebugLog("[候选人监控] CandidateMonitor 实例已创建");
                              
                              monitor.initialize(localVideoRef.current)
                                .then(() => {
                                  console.log("[候选人监控] (onLoadedMetadata) 监控器初始化成功");
                                  addDebugLog("[候选人监控] ✅ 监控器初始化成功");
                                  candidateMonitorRef.current = monitor;
                                  monitorInitializedRef.current = true; // 标记监控器已初始化成功
                                  
                                  // 检查屏幕共享状态
                                  const monitorStatus = monitor.getMonitorStatus();
                                  console.log("[候选人监控] 监控状态:", monitorStatus);
                                  
                                  if (!monitorStatus.screenCaptureEnabled) {
                                    console.warn("[候选人监控] ⚠️ 屏幕共享未启用，将无法截取屏幕画面");
                                    addDebugLog("[候选人监控] ⚠️ 屏幕共享未启用");
                                    
                                    toast.warning("屏幕共享未启用", {
                                      description: "无法截取屏幕画面，请刷新页面并允许屏幕共享权限",
                                      duration: 5000,
                                    });
                                  } else {
                                    console.log("[候选人监控] ✅ 屏幕共享已启用");
                                    addDebugLog("[候选人监控] ✅ 屏幕共享已启用");
                                  }
                                  
                                  // 如果面试已经开始，立即启动监控
                                  if (isStarted) {
                                    console.log("[候选人监控] (onLoadedMetadata) 面试已开始，立即启动监控");
                                    addDebugLog("[候选人监控] 🚀 立即启动监控");
                                    candidateMonitorRef.current.startMonitoring(currentRound);
                                  }
                                })
                                .catch((error) => {
                                  console.error("[候选人监控] (onLoadedMetadata) 监控器初始化失败:", error);
                                  addDebugLog("[候选人监控] ❌ 监控器初始化失败: " + (error instanceof Error ? error.message : "未知错误"));
                                });
                            } else {
                              console.log("[候选人监控] (onLoadedMetadata) 监控器已初始化，跳过");
                              addDebugLog("[候选人监控] 监控器已初始化，跳过");
                            }
                          }
                        }
                      }}
                      onLoadedData={() => {
                        console.log("[Video] Video 数据加载完成");
                      }}
                    />
                    {!localStream && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60 bg-gradient-to-br from-gray-900 to-gray-800">
                        <VideoOff className="h-16 w-16 mb-4 opacity-50" />
                        <p className="text-base">摄像头未启动</p>
                        <p className="text-sm mt-2 opacity-60">请点击下方摄像头图标开启</p>
                      </div>
                    )}
                    {/* 视频控制按钮 */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3">
                      <button
                        onClick={toggleVideo}
                        className={`p-3 rounded-full transition-all ${
                          isVideoEnabled
                            ? 'bg-white/20 backdrop-blur-sm hover:bg-white/30'
                            : 'bg-red-500/80 backdrop-blur-sm hover:bg-red-500'
                        }`}
                        title={isVideoEnabled ? '关闭摄像头' : '开启摄像头'}
                      >
                        {isVideoEnabled ? (
                          <Video className="h-5 w-5 text-white" />
                        ) : (
                          <VideoOff className="h-5 w-5 text-white" />
                        )}
                      </button>
                      <button
                        onClick={toggleAudio}
                        className={`p-3 rounded-full transition-all ${
                          isAudioEnabled
                            ? 'bg-white/20 backdrop-blur-sm hover:bg-white/30'
                            : 'bg-red-500/80 backdrop-blur-sm hover:bg-red-500'
                        }`}
                        title={isAudioEnabled ? '关闭麦克风' : '开启麦克风'}
                      >
                        {isAudioEnabled ? (
                          <Mic className="h-5 w-5 text-white" />
                        ) : (
                          <MicOff className="h-5 w-5 text-white" />
                        )}
                      </button>
                    </div>
                    {/* 候选人信息 */}
                    <div className="absolute top-4 left-4">
                      <Badge className="bg-white/20 backdrop-blur-sm text-white border-0 px-3 py-1.5">
                        {candidateName} - 你
                      </Badge>
                    </div>
                    {/* 语音识别状态 */}
                    {isListening && (
                      <div className="absolute top-4 right-4 bg-red-500/80 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-2">
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                        <span className="text-xs font-medium text-white">正在录音</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 面试对话记录区域 - 微信风格聊天界面 */}
                <div className="mb-4">
                  {/* 聊天记录容器 */}
                  <div 
                    ref={chatContainerRef}
                    className="bg-gradient-to-b from-gray-50 to-white border border-gray-200 rounded-xl p-4 overflow-y-auto"
                    style={{ maxHeight: '400px', minHeight: '200px' }}
                  >
                    {messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-gray-400 py-8">
                        <MessageSquare className="h-12 w-12 mb-3 opacity-50" />
                        <p className="text-sm">面试开始后，对话将在这里显示</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {messages.map((message, index) => (
                          <div
                            key={message.id || index}
                            className={`flex ${message.role === 'interviewer' ? 'justify-start' : 'justify-end'}`}
                          >
                            <div className={`flex items-start gap-3 max-w-[80%] ${message.role === 'candidate' ? 'flex-row-reverse' : ''}`}>
                              {/* 头像 */}
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                                message.role === 'interviewer' 
                                  ? 'bg-gradient-to-br from-blue-400 to-purple-600' 
                                  : 'bg-gradient-to-br from-green-400 to-teal-600'
                              }`}>
                                {message.role === 'interviewer' ? (
                                  <Bot className="h-5 w-5 text-white" />
                                ) : (
                                  <User className="h-5 w-5 text-white" />
                                )}
                              </div>
                              
                              {/* 消息内容 */}
                              <div className={`flex flex-col ${message.role === 'candidate' ? 'items-end' : 'items-start'}`}>
                                {/* 角色名称和时间 */}
                                <div className={`flex items-center gap-2 mb-1 ${message.role === 'candidate' ? 'flex-row-reverse' : ''}`}>
                                  <span className={`text-xs font-medium ${
                                    message.role === 'interviewer' ? 'text-blue-600' : 'text-green-600'
                                  }`}>
                                    {message.role === 'interviewer' ? 'AI面试官' : candidateName || '候选人'}
                                  </span>
                                  {message.roundNumber && (
                                    <Badge variant="outline" className="text-xs px-1.5 py-0 h-4">
                                      第{message.roundNumber}轮
                                    </Badge>
                                  )}
                                  <span className="text-xs text-gray-400">
                                    {message.timestamp ? new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}
                                  </span>
                                </div>
                                
                                {/* 消息气泡 */}
                                <div className={`rounded-2xl px-4 py-2.5 shadow-sm ${
                                  message.role === 'interviewer'
                                    ? 'bg-white border border-gray-100 rounded-tl-sm'
                                    : 'bg-gradient-to-r from-green-500 to-teal-500 text-white rounded-tr-sm'
                                }`}>
                                  <p className={`text-sm leading-relaxed whitespace-pre-wrap ${
                                    message.role === 'interviewer' ? 'text-gray-700' : 'text-white'
                                  }`}>
                                    {message.content}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {/* 实时转录提示 - 录音中的临时消息 */}
                        {(isListening || isManualRecording) && transcript && transcript.length > 0 && currentRoundView === currentRound && (
                          <div className="flex justify-end">
                            <div className="flex items-start gap-3 max-w-[80%] flex-row-reverse">
                              {/* 头像 */}
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-teal-600 flex items-center justify-center flex-shrink-0">
                                <User className="h-5 w-5 text-white" />
                              </div>
                              
                              {/* 消息内容 */}
                              <div className="flex flex-col items-end">
                                <div className="flex items-center gap-2 mb-1 flex-row-reverse">
                                  <span className="text-xs font-medium text-green-600">{candidateName || '候选人'}</span>
                                  <div className="flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                                    <span className="text-xs text-blue-500">识别中...</span>
                                  </div>
                                </div>
                                
                                {/* 消息气泡 */}
                                <div className="rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-sm bg-gradient-to-r from-green-400/80 to-teal-400/80 text-white border-2 border-dashed border-green-300">
                                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-white">
                                    {transcript}
                                    <span className="inline-block w-0.5 h-4 bg-white ml-1 animate-pulse" />
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* AI正在输入提示 */}
                        {isLoading && (
                          <div className="flex justify-start">
                            <div className="flex items-start gap-3 max-w-[80%]">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center flex-shrink-0">
                                <Bot className="h-5 w-5 text-white" />
                              </div>
                              <div className="flex flex-col items-start">
                                <span className="text-xs font-medium text-blue-600 mb-1">AI面试官</span>
                                <div className="rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm bg-white border border-gray-100">
                                  <div className="flex items-center gap-1">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 视频通话和语音识别区域 */}
                <div className="mt-6 space-y-6">
                  {/* 语音识别控制区 */}
                  <div className="border rounded-lg p-6 bg-gradient-to-r from-blue-50 to-indigo-50">
                    <div className="space-y-4">
                      {/* 语音识别状态提示 */}
                      {currentRoundView === currentRound && messages.some(m => m.roundNumber === currentRoundView && m.role === 'interviewer') && !messages.some(m => m.roundNumber === currentRoundView && m.role === 'candidate') && (
                        <div className={`rounded-lg p-4 border ${isListening || isManualRecording ? 'bg-blue-50 border-blue-200' : isRecording ? 'bg-green-50 border-green-200' : isAudioPlaying ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'}`}>
                          <div className="flex items-start gap-3">
                            {isListening || isManualRecording ? (
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
                                <span className="text-sm font-medium text-blue-800">
                                  录音中，请说出您的回答...
                                </span>
                              </div>
                            ) : isRecording ? (
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                                <span className="text-sm font-medium text-red-800">正在录音...</span>
                              </div>
                            ) : isAudioPlaying ? (
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-purple-500 rounded-full animate-pulse" />
                                <span className="text-sm font-medium text-purple-800">AI面试官正在提问...</span>
                              </div>
                            ) : isLoading ? (
                              <div className="flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin text-yellow-600" />
                                <span className="text-sm font-medium text-yellow-800">正在生成问题...</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-green-500 rounded-full" />
                                <span className="text-sm font-medium text-green-800">
                                  点击「开始录音」按钮开始回答
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold flex items-center gap-2">
                          {isRecording ? (
                            <>
                              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                              正在录音... ({recordingDuration}s)
                            </>
                          ) : isListening ? (
                            <>
                              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                              {useFallbackRecording ? "录音识别中（松开按钮自动提交）..." : "正在实时识别..."}
                            </>
                          ) : isAudioPlaying ? (
                            <>
                              <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                              AI正在提问...
                            </>
                          ) : isLoading ? (
                            <>
                              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                              处理中...
                            </>
                          ) : (
                            <>
                              <div className="w-2 h-2 bg-green-500 rounded-full" />
                              等待您开始录音...
                            </>
                          )}
                        </Label>
                      </div>

                      {/* 回答输入区 - 实时显示语音识别结果 */}
                      <div className="relative">
                        <div className="absolute top-2 right-2 z-10">
                          {(isListening || isManualRecording) && (
                            <div className="flex items-center gap-2 bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-medium animate-pulse">
                              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                              录音中...
                            </div>
                          )}
                        </div>
                        <Textarea
                          placeholder="点击「开始录音」按钮开始回答问题..."
                          value={transcript || userAnswer}
                          rows={4}
                          readOnly={true}
                          className={`resize-none transition-all duration-300 ${
                            isListening || isManualRecording
                              ? 'bg-blue-50 border-blue-300 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                              : transcript && transcript.length > 0
                              ? 'bg-green-50 border-green-300'
                              : 'bg-gray-50 border-gray-200'
                          }`}
                        />
                        {transcript && transcript.length > 0 && (
                          <div className="absolute bottom-2 right-2 text-xs text-gray-500">
                            已识别 {transcript.length} 字
                          </div>
                        )}
                        {(isListening || isManualRecording) && (
                          <div className="absolute top-3 right-3 flex items-center gap-1">
                            <div className="w-1 h-4 bg-blue-500 rounded animate-bounce" />
                            <div className="w-1 h-4 bg-blue-500 rounded animate-bounce delay-100" />
                            <div className="w-1 h-4 bg-blue-500 rounded animate-bounce delay-200" />
                          </div>
                        )}
                      </div>

                      {/* 控制按钮区 - 单个录音按钮 */}
                      <div className="flex items-center justify-center gap-4 mt-4">
                        {/* 开始录音 / 提交录音 按钮 */}
                        {!isManualRecording && !isListening ? (
                          <Button
                            type="button"
                            size="lg"
                            onClick={handleStartRecording}
                            disabled={isAudioPlaying || isLoading}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 text-lg"
                          >
                            <Mic className="h-5 w-5 mr-2" />
                            开始录音
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="lg"
                            onClick={handleSubmitRecording}
                            className="bg-green-600 hover:bg-green-700 text-white px-8 py-6 text-lg"
                          >
                            <Send className="h-5 w-5 mr-2" />
                            提交录音
                          </Button>
                        )}
                      </div>

                      {/* 状态提示 */}
                      <div className="text-center mt-2">
                        {isManualRecording || isListening ? (
                          <p className="text-sm text-blue-600">
                            录音进行中，请清晰回答问题，完成后点击「提交录音」
                          </p>
                        ) : isAudioPlaying ? (
                          <p className="text-sm text-purple-600">
                            AI正在提问，请认真倾听...
                          </p>
                        ) : isLoading ? (
                          <p className="text-sm text-yellow-600">
                            正在处理中，请稍候...
                          </p>
                        ) : (
                          <p className="text-sm text-gray-500">
                            点击「开始录音」按钮开始回答问题
                          </p>
                        )}
                      </div>

                      {/* 辅助按钮 */}
                      <div className="flex items-center justify-center gap-3 mt-4">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => diagnoseVoiceRecognition()}
                          className="text-blue-600 border-blue-600 hover:bg-blue-50"
                        >
                          <AlertCircle className="h-4 w-4 mr-2" />
                          诊断语音识别
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowEndInterviewConfirm(true)}
                          className="text-red-600 border-red-600 hover:bg-red-50"
                        >
                          <X className="h-4 w-4 mr-2" />
                          结束面试
                        </Button>
                      </div>

                      {/* 操作流程提示 */}
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <MessageSquare className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                          <div className="text-sm text-blue-800">
                            <p className="font-medium mb-2">面试操作流程：</p>
                            <ol className="space-y-2 text-blue-700">
                              <li className="flex items-start gap-2">
                                <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">1</span>
                                <span>认真听AI面试官的问题</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">2</span>
                                <span>点击「开始录音」按钮，语音说出您的回答</span>
                              </li>
                              <li className="flex items-start gap-2">
                                <span className="bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0">3</span>
                                <span>点击「提交录音」按钮，系统自动识别并提交给AI</span>
                              </li>
                            </ol>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* AI面试注意事项弹窗 */}
      <Dialog open={showPreparationInfo} onOpenChange={setShowPreparationInfo}>
        <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <FileText className="h-6 w-6 text-blue-600" />
              AI面试注意事项
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-gray-700 font-semibold">
                尊敬的求职者：
              </p>
              <p className="text-sm text-gray-700 mt-2">
                您好！非常感谢您对我司岗位的关注与认可，现将 AI 面试相关注意事项及规则告知于您，以便您顺利完成面试：
              </p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">一</span>
                前期准备（面试前 30 分钟完成）
              </h3>
              <div className="space-y-4 ml-8">
                <div>
                  <h4 className="font-semibold text-gray-800 mb-2">设备要求：</h4>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
                    <li>必须使用「带摄像头 + 麦克风」的电脑、手机、平板等移动设备；</li>
                    <li>提前检查设备电量（建议插电使用），确保摄像头清晰、麦克风收音正常，关闭外接音响（避免回声）。</li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-2">网络要求：</h4>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
                    <li>连接稳定的有线网络或高速 Wi-Fi；</li>
                    <li>关闭下载、视频播放等占用带宽的后台程序。</li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-2">环境要求：</h4>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
                    <li>选择安静、无干扰的独立空间（避免家人、宠物入镜，远离嘈杂环境）；</li>
                    <li>背景整洁（无杂乱物品、广告标语），光线充足（面部无阴影，可正面打光），坐姿端正，全程正对摄像头。</li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-2">软件准备：</h4>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
                    <li>推荐浏览器：Chrome（谷歌浏览器）、Edge（微软浏览器），提前更新至最新版本；</li>
                    <li>关闭浏览器弹窗拦截、广告插件，关闭电脑杀毒软件、防火墙（避免拦截面试链接）；</li>
                    <li>面试链接将通过微信发送，请提前 15 分钟点击链接登录，完成「设备测试」（摄像头、麦克风、网络连通性）。</li>
                  </ol>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-semibold text-green-900 mb-2 flex items-center gap-2">
                    <Mic className="h-4 w-4" />
                    麦克风权限设置（重要）
                  </h4>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-green-800">
                    <li><strong>面试开始前</strong>，浏览器会请求麦克风权限，请务必点击「允许」；</li>
                    <li>如果看到浏览器地址栏左侧有麦克风图标，请确保图标显示为「允许」状态；</li>
                    <li>如果麦克风权限被拒绝，请在浏览器地址栏左侧点击图标，选择「允许」访问麦克风；</li>
                    <li>建议使用 Chrome 浏览器以获得最佳的语音识别效果；</li>
                  </ol>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">二</span>
                面试过程规则
              </h3>
              <div className="space-y-4 ml-8">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-900 mb-2">面试操作流程</h4>
                  <ul className="space-y-2 text-sm text-blue-800">
                    <li>• <strong>步骤一</strong>：认真听AI面试官的问题</li>
                    <li>• <strong>步骤二</strong>：点击「开始录音」按钮，语音说出您的回答</li>
                    <li>• <strong>步骤三</strong>：点击「提交录音」按钮，系统自动识别并提交给AI</li>
                    <li>• 系统会实时显示语音识别结果，方便您确认内容</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-2">时间要求：</h4>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
                    <li>面试时长为20-30分钟（具体面试过程提示为准），单题答题时间有限制（倒计时结束将自动提交答案）；</li>
                    <li>请在规定时间内登录面试，超时未登录将视为自动放弃，如需调整时间请提前联系 HR。</li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-2">答题规范：</h4>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
                    <li>面试题目为结构化题型（含自我介绍、职业认知、情景模拟等），将以语音形式提问，模拟真实线下面试场景；</li>
                    <li>听到答题提示后开始作答，作答时需面向摄像头，保持面部完整入镜，语言清晰、逻辑连贯，避免中途停顿过久；</li>
                    <li>禁止佩戴耳机、耳麦作答（确保 AI 正常识别语音），禁止使用方言、俚语，避免重复、无关表述。</li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-2">诚信要求：</h4>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
                    <li>面试全程为 AI 智能监考，将实时检测画面、声音异常（如多人入镜、中途离场、语音作弊等）；</li>
                    <li>严禁以下行为：查阅手机、电脑资料（文档、网页、聊天软件）、找人代答、录屏录音、中途切换页面 / 设备；</li>
                    <li>若检测到作弊行为，将直接终止面试，取消应聘资格，相关记录将纳入公司人才库黑名单。</li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-2">其他注意事项：</h4>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
                    <li>面试过程中若出现网络卡顿、画面冻结、声音中断，请不要关闭页面，耐心等待 3-5 秒（系统将自动恢复）；</li>
                    <li>若多次出现技术问题，可刷新页面重新登录，或微信联系 HR获取协助。</li>
                  </ol>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">三</span>
                面试后须知
              </h3>
              <div className="ml-8">
                <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                  <li>面试完成后，系统将自动提交答题视频，无需手动操作，页面将显示「面试结束」提示；</li>
                  <li>面试结果将在 3 个工作日内通过微信 / 邮件告知，后续将由 HR 通知复试安排，请保持通讯畅通；</li>
                  <li>面试视频仅用于公司招聘考核，将严格遵守隐私保护规定，不对外泄露，面试结束后 30 天内自动删除。</li>
                </ol>
              </div>
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <p className="text-sm text-gray-700">
                若您在面试前有任何疑问，可微信联系HR。
              </p>
            </div>
          </div>
          <DialogFooter className="flex gap-3">
            <Button variant="outline" onClick={() => setShowPreparationInfo(false)}>
              返回修改
            </Button>
            <Button onClick={handleStartInterview} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  准备中...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-5 w-5" />
                  我已了解，开始面试
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 结束面试确认对话框 */}
      <Dialog open={showEndInterviewConfirm} onOpenChange={setShowEndInterviewConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              确认结束面试？
            </DialogTitle>
            <DialogDescription>
              结束面试后，系统将自动停止录屏、生成AI评估报告并保存面试记录。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <ul className="space-y-2">
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span className="text-sm">停止录屏并上传到服务器</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span className="text-sm">生成AI评估报告</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span className="text-sm">保存面试记录供面试官查看</span>
              </li>
            </ul>
            <div className="text-sm text-orange-600 font-medium">
              ⚠️ 此操作不可撤销，请确认是否结束面试？
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowEndInterviewConfirm(false)}
              className="flex-1"
            >
              取消，继续面试
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowEndInterviewConfirm(false);
                setIsInterviewEnded(true);
                handleEndInterview();
              }}
              className="flex-1"
            >
              确认结束
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 面试前15分钟提醒弹窗 */}
      <Dialog open={showReminder} onOpenChange={setShowReminder}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              面试提醒
            </DialogTitle>
            <DialogDescription>
              还有15分钟就开始面试了，请准时参加面试~
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <p className="text-sm text-gray-700">
                <span className="font-semibold">面试时间：</span>
                {interviewTime && new Date(interviewTime).toLocaleString('zh-CN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              <p className="text-sm text-orange-700 mt-3">
                不能参加面试的话，请及时和对应的人事联系
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowReminder(false)}>
              我知道了
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 录屏同意对话框 */}
      <Dialog open={showRecordingConsent} onOpenChange={setShowRecordingConsent}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 text-blue-600" />
              录屏确认
            </DialogTitle>
            <DialogDescription>
              为了确保面试过程的透明度和可追溯性，我们需要录制您的屏幕
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* 移动端兼容性提示 */}
            {isMobile && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h4 className="font-semibold text-yellow-900 mb-2 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  移动端录屏提示
                </h4>
                <ul className="text-sm text-yellow-800 space-y-1">
                  <li>• 移动端录屏功能取决于您的设备支持</li>
                  <li>• iOS 设备可能不支持屏幕录制</li>
                  <li>• 如果您的设备不支持录屏，请使用电脑浏览器进行面试</li>
                  <li>• 录屏是必需的，不开启录屏无法继续进行面试</li>
                </ul>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">录屏内容说明</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                {isMobile ? (
                  <>
                    <li>✓ 录制您的手机屏幕画面</li>
                    <li>✓ 包含面试页面和对话内容</li>
                    <li>✓ 包含您的回答内容</li>
                    <li>✓ 录制音频（您的声音）</li>
                  </>
                ) : (
                  <>
                    <li>✓ 录制整个屏幕画面（必须选择整个屏幕，不能选择窗口或标签页）</li>
                    <li>✓ 包含视频通话画面</li>
                    <li>✓ 包含您的回答内容</li>
                    <li>✓ 录制音频（您的声音）</li>
                  </>
                )}
              </ul>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                重要提示
              </h4>
              <ul className="text-sm text-red-800 space-y-1 font-medium">
                {isMobile ? (
                  <>
                    <li>⚠️ 录屏功能取决于您的设备支持</li>
                    <li>⚠️ iOS 设备可能不支持屏幕录制</li>
                    <li>⚠️ 如果您的设备不支持录屏，请使用电脑浏览器进行面试</li>
                    <li>⚠️ 录屏是必需的，不开启录屏无法继续进行面试</li>
                  </>
                ) : (
                  <>
                    <li>⚠️ 必须选择【整个屏幕】进行录制</li>
                    <li>⚠️ 不能选择【窗口】或【标签页】</li>
                    <li>⚠️ 如果选择了窗口或标签页，系统会要求重新选择</li>
                    <li>⚠️ 请确保显示器上没有遮挡屏幕的窗口</li>
                  </>
                )}
              </ul>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 mb-2">隐私保护承诺</h4>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>🔒 录屏仅用于面试评估</li>
                <li>🔒 只有面试官可以查看</li>
                <li>🔒 不会公开分享或用于其他用途</li>
                <li>🔒 严格遵守隐私保护规定</li>
              </ul>
            </div>

            <div className="text-sm text-gray-600">
              <p className="font-medium mb-1">是否同意录制屏幕？</p>
              <p>• 同意：开始面试并进行录屏</p>
              <p>• 拒绝：无法继续进行面试</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowRecordingRequiredAlert(true)}
              className="flex-1"
            >
              拒绝录屏
            </Button>
            <Button
              onClick={() => handleRecordingConsent(true)}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              同意录屏
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 恢复面试对话框 */}
      <Dialog open={showResumeDialog} onOpenChange={setShowResumeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              检测到未完成的面试
            </DialogTitle>
            <DialogDescription>
              您有一场面试尚未完成，请选择继续面试或重新开始
            </DialogDescription>
          </DialogHeader>
          {unfinishedInterview && (
            <div className="py-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">候选人</span>
                <span className="font-medium">{unfinishedInterview.candidateName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">岗位</span>
                <span className="font-medium">{unfinishedInterview.position}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">当前阶段</span>
                <span className="font-medium">{unfinishedInterview.stageName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">已提问</span>
                <span className="font-medium">{unfinishedInterview.questionCount} 个问题</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">已进行</span>
                <span className="font-medium">{unfinishedInterview.durationMinutes} 分钟</span>
              </div>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={handleStartNewInterview}
              className="w-full sm:w-auto"
            >
              重新开始
            </Button>
            <Button
              onClick={handleResumeInterview}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  恢复中...
                </>
              ) : (
                "继续面试"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 录屏必需提示对话框 */}
      <Dialog open={showRecordingRequiredAlert} onOpenChange={setShowRecordingRequiredAlert}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              录屏是必需的
            </DialogTitle>
            <DialogDescription>
              为了确保面试过程的公平性和可追溯性，屏幕录制是必需的
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="font-semibold text-red-900 mb-2">重要提示</h4>
              <ul className="text-sm text-red-800 space-y-2">
                <li>• 不开启录屏无法继续进行面试</li>
                <li>• 录屏仅用于面试评估和存档</li>
                <li>• 面试官和HR可以查看录屏内容</li>
                <li>• 录屏内容会保存一个月后自动删除</li>
              </ul>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">隐私保护</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• 录屏不会公开分享</li>
                <li>• 仅用于本次面试评估</li>
                <li>• 严格遵守隐私保护规定</li>
              </ul>
            </div>

            <div className="text-sm text-gray-600 text-center">
              <p>如果您对录屏有疑问，请提前联系面试官</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowRecordingRequiredAlert(false)}
              className="flex-1"
            >
              重新选择
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowRecordingRequiredAlert(false);
                setShowRecordingConsent(false);
                toast.info("请联系面试官说明情况");
              }}
              className="flex-1"
            >
              退出面试
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDevicePermissionAlert} onOpenChange={setShowDevicePermissionAlert}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-600" />
              需要开启设备权限
            </DialogTitle>
            <DialogDescription>
              未开启摄像头和麦克风权限时，系统不会继续推进面试。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
              {devicePermissionMessage || "请先开启摄像头和麦克风权限。"}
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">请这样操作</h4>
              <ul className="text-sm text-blue-800 space-y-2">
                <li>• 点击浏览器地址栏左侧的锁形图标或摄像头/麦克风图标</li>
                <li>• 将“摄像头”和“麦克风”都切换为“允许”</li>
                <li>• 返回当前页面后，点击下方“我已开启，重新检测”</li>
              </ul>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDevicePermissionAlert(false)}
              className="flex-1"
            >
              稍后再试
            </Button>
            <Button
              onClick={handleRetryPermissions}
              disabled={isRecheckingPermissions}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {isRecheckingPermissions ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  重新检测中...
                </>
              ) : (
                "我已开启，重新检测"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 语音识别诊断对话框 */}
      <Dialog open={showVoiceDiagnosis} onOpenChange={setShowVoiceDiagnosis}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>语音识别诊断报告</DialogTitle>
            <DialogDescription>
              以下是对语音识别功能的详细诊断结果
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* 浏览器信息 */}
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                浏览器信息
              </h3>
              <div className="text-sm space-y-1 text-gray-600">
                <div>用户代理: {voiceDiagnosisResult?.browserInfo?.userAgent?.substring(0, 50)}...</div>
                <div>平台: {voiceDiagnosisResult?.browserInfo?.platform}</div>
                <div>语言: {voiceDiagnosisResult?.browserInfo?.language}</div>
              </div>
            </div>

            {/* 浏览器支持状态 */}
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${voiceDiagnosisResult?.supportStatus?.hasSpeechRecognition ? 'bg-green-500' : 'bg-red-500'}`}></span>
                浏览器支持状态
              </h3>
              <div className="text-sm">
                <div className={`flex justify-between ${voiceDiagnosisResult?.supportStatus?.hasSpeechRecognition ? 'text-green-600' : 'text-gray-400'}`}>
                  <span>语音识别 API:</span>
                  <span>
                    {voiceDiagnosisResult?.supportStatus?.hasSpeechRecognition 
                      ? `✓ 支持 (${voiceDiagnosisResult?.supportStatus?.apiType === 'webkit' ? 'WebKit' : '标准'}版本)` 
                      : '✗ 不支持'}
                  </span>
                </div>
              </div>
            </div>

            {/* 麦克风权限 */}
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${voiceDiagnosisResult?.microphonePermission?.status === 'granted' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                麦克风权限
              </h3>
              <div className={`text-sm ${voiceDiagnosisResult?.microphonePermission?.status === 'granted' ? 'text-green-600' : 'text-red-600'}`}>
                {voiceDiagnosisResult?.microphonePermission?.message}
              </div>
            </div>

            {/* 语音识别状态 */}
            {voiceDiagnosisResult?.recognitionStatus?.canInitialize && (
              <div className="border rounded-lg p-4">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  语音识别初始化
                </h3>
                <div className="text-sm space-y-1 text-gray-600">
                  <div>语言: {voiceDiagnosisResult?.recognitionStatus?.language}</div>
                  <div>持续识别: {voiceDiagnosisResult?.recognitionStatus?.continuous ? '是' : '否'}</div>
                  <div>中间结果: {voiceDiagnosisResult?.recognitionStatus?.interimResults ? '是' : '否'}</div>
                </div>
              </div>
            )}

            {/* 测试结果 */}
            <div className={`border rounded-lg p-4 ${voiceDiagnosisResult?.testResult?.status === 'success' ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${voiceDiagnosisResult?.testResult?.status === 'success' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                测试结果
              </h3>
              <div className={`text-sm font-medium ${voiceDiagnosisResult?.testResult?.status === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                {voiceDiagnosisResult?.testResult?.status === 'success' ? '✓ 通过' : '✗ 失败'}
              </div>
              {voiceDiagnosisResult?.testResult?.reason && (
                <div className="text-sm text-gray-600 mt-1">原因: {voiceDiagnosisResult.testResult.reason}</div>
              )}
              {voiceDiagnosisResult?.testResult?.error && (
                <div className="text-sm text-red-600 mt-1">错误: {voiceDiagnosisResult.testResult.error}</div>
              )}
              {voiceDiagnosisResult?.testResult?.recommendation && (
                <div className="text-sm text-gray-700 mt-2 font-medium">
                  建议: {voiceDiagnosisResult.testResult.recommendation}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowVoiceDiagnosis(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 隐藏的音频播放器 */}
      <audio
        ref={audioPlayerRef}
        autoPlay={false}
        preload="auto"
        muted={false}
      />

      {/* 调试日志面板 - 已隐藏，在后台运行 */}
      <div className="hidden">
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900 text-green-400 p-4 max-h-48 overflow-y-auto text-xs font-mono z-50 border-t-2 border-green-500">
        <div className="flex justify-between items-center mb-2">
          <span className="font-bold text-yellow-400">🐛 调试日志 (v1.0.20 - 后台上传)</span>
          <button
            onClick={() => setDebugLogs([])}
            className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-xs"
          >
            清空
          </button>
        </div>
        
        {/* 候选人状态监控实时状态 */}
        {candidateMonitorRef.current && candidateStatus && (
          <div className="mb-3 p-2 bg-gray-800 rounded border border-blue-500">
            <div className="font-bold text-blue-400 mb-1">📊 候选人状态监控</div>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-gray-400">状态:</span>
                <span className={`ml-1 font-bold ${
                  candidateStatus.overallStatus === 'normal' ? 'text-green-400' :
                  candidateStatus.overallStatus === 'warning' ? 'text-yellow-400' :
                  'text-red-400'
                }`}>
                  {candidateStatus.overallStatus}
                </span>
              </div>
              <div>
                <span className="text-gray-400">总时长:</span>
                <span className="ml-1 font-mono">{candidateStatus.statistics.totalDuration.toFixed(0)}s</span>
              </div>
              <div>
                <span className="text-gray-400">正常:</span>
                <span className="ml-1 font-mono text-green-400">{candidateStatus.statistics.normalDuration.toFixed(0)}s</span>
              </div>
              <div>
                <span className="text-gray-400">异常:</span>
                <span className="ml-1 font-mono text-yellow-400">{candidateStatus.statistics.abnormalDuration.toFixed(0)}s</span>
              </div>
            </div>
          </div>
        )}
        
        {debugLogs.length === 0 ? (
          <div className="text-gray-500">暂无日志，请开始面试测试...</div>
        ) : (
          debugLogs.map((log, index) => (
            <div key={index} className="py-1 border-b border-gray-800">
              {log}
            </div>
          ))
        )}
      </div>
      </div>
    </div>
  );
}
