"use client";

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bot, User, Play, CheckCircle, FileText, Upload, ArrowRight, Star, TrendingUp, AlertCircle, Loader2, Video, VideoOff, Download, Link, Mail, MessageSquare, Mic, MicOff, MessageCircle, ArrowLeft, Bell, History, X, Shield, ShieldAlert, Lightbulb, Eye, RefreshCw, Camera } from "lucide-react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-provider";
import { createClientHeaders, fetchClientJson, fetchClientJsonCached } from "@/lib/client-api";
import { copyTextToClipboard } from "@/lib/clipboard";
import { sync } from "@/lib/sync";
import {
  buildCandidateInterviewLink,
  getInterviewPublicBaseUrlFromBrowser,
  isUnsafeLocalInterviewBaseUrl,
} from "@/lib/interview-public-url";
import {
  DEFAULT_INTERVIEWER_VOICE_ID,
  INTERVIEWER_VOICE_OPTIONS,
  getInterviewerVoiceOption,
} from "@/lib/interviewer-voice";

interface Message {
  id: string;
  role: "interviewer" | "candidate";
  content: string;
  timestamp: Date;
}

interface Evaluation {
  isEliminated: boolean;
  eliminationReason: string | null;
  overallScore5: number;
  overallScore100: number;
  categoryScores: Record<string, { score: number; basis: string }>;
  categoryLabels: Record<string, string>;
  summary: string;
  strengths: (string | {
    title: string;
    description: string;
    evidence: string;
    application: string;
  })[];
  improvements: (string | {
    area: string;
    current: string;
    suggestion: string;
    importance: '高' | '中' | '低';
  })[];
  observations: (string | {
    time: string;
    observation: string;
    category: string;
  })[];
  recommendation: "hire" | "consider" | "reject";
  ruleInfo?: {
    positionKey: string;
    positionName: string;
    ruleName: string;
    ruleVersion: string;
  };
  dimensionResults?: Array<{
    code: string;
    name: string;
    weight: number;
    score100: number;
    score5: number;
    weightedScore: number;
    basis: string;
    evidence: string[];
    risk?: string;
  }>;
  evaluationError?: string;
}

interface QaHistoryItem {
  id: string;
  role: "interviewer" | "candidate";
  content: string;
  type: "question" | "answer" | "candidate_question" | "interviewer_answer";
  timestamp: string;
}

type ResumeSkill = string | { name?: string; level?: string };
type ResumeCertificate = string | { name?: string };

interface ParsedResumeStructuredData {
  basicInfo?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  education?: {
    school?: string;
    major?: string;
    degree?: string;
    gpa?: string;
  };
  workExperience?: Array<{
    company?: string;
    position?: string;
    duration?: string;
    description?: string;
    responsibilities?: string[];
    achievements?: string[];
  }>;
  skills?: ResumeSkill[];
  projects?: Array<{
    name?: string;
    duration?: string;
    role?: string;
    description?: string;
    tasks?: string[];
    results?: string[];
    technologies?: string[];
  }>;
  certificates?: ResumeCertificate[];
}

interface CandidateSearchCandidate {
  id?: string | number;
  name: string;
  phone?: string;
  email?: string;
  position?: string | null;
  resumeText?: string | null;
  resumeFileUrl?: string | null;
  resumeUploaded?: boolean;
  resumeFileName?: string | null;
  resumeParsedData?: {
    content?: string;
    parsedData?: ParsedResumeStructuredData;
    error?: string;
    parsedAt?: string;
  };
}

interface CandidateSearchResponse {
  success: boolean;
  found?: boolean;
  exactMatch?: boolean;
  candidates: CandidateSearchCandidate[];
  error?: string;
}

interface PersistedInterviewMessage {
  id: string;
  sender?: "ai" | "candidate";
  role?: Message["role"];
  content: string;
  timestamp: string;
}

interface InterviewBackup {
  interviewId: string;
  messages: PersistedInterviewMessage[];
  currentRound: number;
  candidateName: string;
  selectedPosition: string;
  selectedMode: string;
  lastSaved?: string;
  interrupted?: boolean;
}

interface CandidateStatusEvent {
  type: "cheating" | "abnormal" | "normal";
  severity?: "high" | "medium" | "low";
  roundNumber?: number;
  description: string;
  timestamp: string;
  evidence?: {
    faceScreenshot?: string;
    screenScreenshot?: string;
    screenshot?: string;
    duration?: number;
    faceCount?: number;
  };
}

interface CandidateStatusScreenshot {
  faceScreenshot?: string;
  screenScreenshot?: string;
  timestamp: string;
  abnormalType?: string;
  description?: string;
  interviewStep?: string;
}

interface CandidateStatusStatistics {
  totalDuration: number;
  normalDuration: number;
  abnormalDuration: number;
  cheatingDuration: number;
  faceDetectionRate: number;
  faceLostCount: number;
  multipleFaceCount: number;
  suspiciousActions: number;
}

interface CandidateStatus {
  overallStatus: string;
  summary: string;
  statistics?: CandidateStatusStatistics;
  events?: CandidateStatusEvent[];
  screenshots?: CandidateStatusScreenshot[];
}

interface InterviewHistoryRecord {
  id?: string | number;
  interviewId: string;
  candidateName: string;
  position: string;
  completedAt: string;
  recordingUrl?: string;
  qaHistory?: QaHistoryItem[];
  evaluation: Evaluation;
  candidateStatus?: CandidateStatus;
}

interface InterviewSessionMessage {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp?: string;
}

interface InterviewSessionResponse {
  success: boolean;
  session?: {
    messages?: InterviewSessionMessage[];
  };
  messages?: InterviewSessionMessage[];
  error?: string;
}

type EvaluationStrengthDetail = Extract<Evaluation["strengths"][number], { title?: string }>;
type EvaluationImprovementDetail = Extract<Evaluation["improvements"][number], { area?: string }>;
type EvaluationObservationDetail = Extract<Evaluation["observations"][number], { observation?: string }>;

const INTERVIEW_BACKUP_PREFIX = "interview_backup_";
const CANDIDATE_STATUS_PREFIX = "candidateStatus_";
const FULL_AI_RESUME_DRAFT_STORAGE_KEY = "full_ai_resume_draft";
const POSITIONS_CACHE_KEY = "positions";

const isStrengthDetail = (value: Evaluation["strengths"][number]): value is EvaluationStrengthDetail =>
  typeof value !== "string";

function getInterviewBackupKey(interviewId: string): string {
  return `${INTERVIEW_BACKUP_PREFIX}${interviewId}`;
}

function getCandidateStatusStorageKey(interviewId: string): string {
  return `${CANDIDATE_STATUS_PREFIX}${interviewId}`;
}

function readStorageJson<T>(storageKey: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(storageKey);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch (error) {
    console.error(`[Storage] 解析 ${storageKey} 失败:`, error);
    return null;
  }
}

function readSessionStorageJson<T>(storageKey: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(storageKey);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch (error) {
    console.error(`[Storage] 解析 sessionStorage ${storageKey} 失败:`, error);
    return null;
  }
}

function toPersistedInterviewMessages(messages: Message[]): PersistedInterviewMessage[] {
  return messages.map((msg) => ({
    id: msg.id,
    sender: msg.role === "interviewer" ? "ai" : "candidate",
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp.toISOString(),
  }));
}

function writeInterviewBackup(backup: InterviewBackup): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getInterviewBackupKey(backup.interviewId), JSON.stringify(backup));
}

function clearInterviewBackup(interviewId: string): void {
  if (typeof window === "undefined" || !interviewId) {
    return;
  }

  window.localStorage.removeItem(getInterviewBackupKey(interviewId));
}

function clearCandidateStatusSnapshot(interviewId: string): void {
  if (typeof window === "undefined" || !interviewId) {
    return;
  }

  window.localStorage.removeItem(getCandidateStatusStorageKey(interviewId));
}

function readCandidateStatusSnapshot(interviewId: string): CandidateStatus | null {
  if (!interviewId) {
    return null;
  }

  return readStorageJson<CandidateStatus>(getCandidateStatusStorageKey(interviewId));
}

function getLatestInterviewBackup(maxAgeMinutes = 5): { key: string; backup: InterviewBackup } | null {
  if (typeof window === "undefined") {
    return null;
  }

  const candidates = Object.keys(window.localStorage)
    .filter((key) => key.startsWith(INTERVIEW_BACKUP_PREFIX))
    .map((key) => ({ key, backup: readStorageJson<InterviewBackup>(key) }))
    .filter((item): item is { key: string; backup: InterviewBackup } => Boolean(item.backup))
    .sort((a, b) => {
      const timeA = new Date(a.backup.lastSaved || 0).getTime();
      const timeB = new Date(b.backup.lastSaved || 0).getTime();
      return timeB - timeA;
    });

  const latest = candidates[0];
  if (!latest || !latest.backup.interrupted) {
    return null;
  }

  const minutesDiff = (Date.now() - new Date(latest.backup.lastSaved || 0).getTime()) / (1000 * 60);
  if (minutesDiff >= maxAgeMinutes) {
    return null;
  }

  return latest;
}

function buildResumeTextFromLocalCandidate(candidate: CandidateSearchCandidate): string {
  if (candidate.resumeParsedData?.content?.trim()) {
    return candidate.resumeParsedData.content;
  }

  const parsedData = candidate.resumeParsedData?.parsedData;
  if (!parsedData) {
    return "";
  }

  const parts: string[] = [];

  if (parsedData.basicInfo) {
    if (parsedData.basicInfo.name) parts.push(`姓名: ${parsedData.basicInfo.name}`);
    if (parsedData.basicInfo.phone) parts.push(`电话: ${parsedData.basicInfo.phone}`);
    if (parsedData.basicInfo.email) parts.push(`邮箱: ${parsedData.basicInfo.email}`);
  }

  if (parsedData.education) {
    parts.push(`\n教育背景:`);
    parts.push(`  学校: ${parsedData.education.school || ''}`);
    parts.push(`  专业: ${parsedData.education.major || ''}`);
    parts.push(`  学历: ${parsedData.education.degree || ''}`);
    if (parsedData.education.gpa) parts.push(`  GPA: ${parsedData.education.gpa}`);
  }

  if (parsedData.workExperience?.length) {
    parts.push(`\n工作经历:`);
    parsedData.workExperience.forEach((exp, idx) => {
      parts.push(`  ${idx + 1}. ${exp.company || ''} - ${exp.position || ''}`);
      if (exp.duration) parts.push(`     时间: ${exp.duration}`);
      if (exp.description) parts.push(`     描述: ${exp.description}`);
      if (exp.responsibilities?.length) parts.push(`     职责: ${exp.responsibilities.join('；')}`);
      if (exp.achievements?.length) parts.push(`     结果: ${exp.achievements.join('；')}`);
    });
  }

  if (parsedData.skills?.length) {
    parts.push(`\n技能:`);
    parts.push(`  ${parsedData.skills.map((skill) => typeof skill === 'string' ? skill : `${skill.name || ''}${skill.level ? `（${skill.level}）` : ''}`).filter(Boolean).join(', ')}`);
  }

  if (parsedData.projects?.length) {
    parts.push(`\n项目经验:`);
    parsedData.projects.forEach((project, idx) => {
      parts.push(`  ${idx + 1}. ${project.name || ''}`);
      if (project.duration) parts.push(`     周期: ${project.duration}`);
      if (project.role) parts.push(`     角色: ${project.role}`);
      if (project.description) parts.push(`     描述: ${project.description}`);
      if (project.tasks?.length) parts.push(`     任务: ${project.tasks.join('；')}`);
      if (project.results?.length) parts.push(`     结果: ${project.results.join('；')}`);
      if (project.technologies?.length) parts.push(`     技术: ${project.technologies.join('、')}`);
    });
  }

  if (parsedData.certificates?.length) {
    parts.push(`\n证书:`);
    parsedData.certificates.forEach((certificate) => {
      parts.push(`  - ${typeof certificate === 'string' ? certificate : certificate.name || ''}`);
    });
  }

  return parts.join('\n').trim();
}

function isUsableCandidateResumeText(value?: string | null): value is string {
  if (!value) {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  return !trimmed.includes('简历文件已上传，但暂未解析内容');
}

function findCandidateFromLocalStorage(name: string): CandidateSearchCandidate | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const candidatesData = localStorage.getItem('candidates');
  if (!candidatesData) {
    return null;
  }

  try {
    const candidates = JSON.parse(candidatesData) as CandidateSearchCandidate[];
    return (
      candidates.find((candidate) => candidate.name === name) ||
      candidates.find((candidate) => candidate.name.includes(name)) ||
      null
    );
  } catch (error) {
    console.error('[搜索候选人] 解析 localStorage 数据失败:', error);
    return null;
  }
}

const isImprovementDetail = (value: Evaluation["improvements"][number]): value is EvaluationImprovementDetail =>
  typeof value !== "string";

const isObservationDetail = (value: Evaluation["observations"][number]): value is EvaluationObservationDetail =>
  typeof value !== "string";

interface ResumeExtractResponse {
  success: boolean;
  content: string;
  detectedInfo?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  error?: string;
}

interface FullAiResumeDraft {
  candidateName: string;
  selectedPosition: string;
  selectedMode: string;
  resumeText: string;
  resumeFileName: string;
  interviewerVoice?: string;
}

interface StartInterviewMessage {
  id?: string;
  sender?: "ai" | "candidate";
  role?: Message["role"];
  content: string;
  timestamp: string | Date;
}

interface StartInterviewResponse {
  success: boolean;
  interviewId: string;
  messages: StartInterviewMessage[];
  error?: string;
}

interface AnswerInterviewResponse {
  success: boolean;
  question: string;
  shouldEnd?: boolean;
  interviewStage?: number;
  evaluation?: Evaluation;
  error?: string;
}

interface SaveInterviewResultResponse {
  success: boolean;
  result: {
    recordingUrl?: string;
  };
  error?: string;
}

interface InterviewHistoryListResponse {
  success: boolean;
  results: InterviewHistoryRecord[];
  error?: string;
}

interface InterviewHistoryDetailResponse {
  success: boolean;
  result: InterviewHistoryRecord;
  error?: string;
}

interface CandidateQuestionSaveResponse {
  success: boolean;
  skipped?: boolean;
  data?: {
    totalRecords?: number;
  };
  error?: string;
}

interface SaveConfigResponse {
  success: boolean;
  error?: string;
}

interface GlobalInterviewerVoiceResponse {
  success: boolean;
  data?: {
    voiceId: string;
  };
  error?: string;
}

interface EvaluateInterviewResponse {
  success: boolean;
  evaluation: Evaluation;
  error?: string;
}

interface UploadRecordingResponse {
  success: boolean;
  fileKey: string;
  signedUrl: string;
  error?: string;
}

interface AutoSaveResponse {
  success: boolean;
  data: {
    savedAt: string;
  };
  error?: string;
}

interface DeleteResultResponse {
  success: boolean;
  error?: string;
}

interface InterviewPositionOption {
  id: string;
  title: string;
  department?: string;
  description?: string;
  jobDescription?: string;
  education?: string;
  experience?: string;
}

function toInterviewPositionOptions(
  positions?: Array<{
    id?: string | number;
    title?: string;
    department?: string;
    jobDescription?: string;
    education?: string;
    experience?: string;
  }>
): InterviewPositionOption[] {
  if (!positions || positions.length === 0) {
    return LEGACY_INTERVIEW_POSITIONS;
  }

  const nextPositions = positions
    .filter((position) => position && position.id !== undefined && position.title)
    .map((position) => ({
      id: String(position.id),
      title: position.title as string,
      department: position.department,
      description: position.jobDescription,
      jobDescription: position.jobDescription,
      education: position.education,
      experience: position.experience,
    }));

  return nextPositions.length > 0 ? nextPositions : LEGACY_INTERVIEW_POSITIONS;
}

const practiceModes = [
  {
    id: "junior",
    title: "初级岗位",
    description: "针对1-3年经验候选人",
    difficulty: "简单",
    icon: "🌱",
  },
  {
    id: "senior",
    title: "中级岗位",
    description: "针对3-5年经验候选人",
    difficulty: "中等",
    icon: "🚀",
  },
  {
    id: "expert",
    title: "高级岗位",
    description: "针对5年以上经验候选人",
    difficulty: "困难",
    icon: "🏆",
  },
];

const LEGACY_INTERVIEW_POSITIONS: InterviewPositionOption[] = [
  { id: "hr", title: "人事", description: "人力资源相关岗位" },
  { id: "ai_management", title: "智能体管培生", description: "智能体方向管理培训生" },
];

// 根据分类 key 获取中文标签
const getCategoryLabel = (key: string, categoryLabels?: Record<string, string>): string => {
  // 优先使用后端返回的 categoryLabels
  if (categoryLabels && categoryLabels[key]) {
    return categoryLabels[key];
  }

  // 如果后端没有返回，使用默认映射
  const defaultLabels: Record<string, string> = {
    // 智能体管培生（6个维度）
    activeLearning: "主动学习能力",
    practicalApplication: "实操与AI工具应用能力",
    frontlineCommunication: "一线落地与沟通协作能力",
    reflectionProblemSolving: "反思复盘与问题解决能力",
    expressionSharing: "表达与知识分享能力",
    technicalFoundation: "技术基础能力",
    // 通用岗位（5个维度）
    communication: "沟通表达与亲和力",
    learning: "学习意愿与适配能力",
    execution: "目标感与执行力",
    resilience: "抗压与抗挫折能力",
    customerSensitivity: "客户需求敏感度"
  };

  return defaultLabels[key] || key;
};

function generateClientInterviewId(): string {
  const browserCrypto = globalThis.crypto as Crypto | undefined;

  if (browserCrypto?.randomUUID) {
    return browserCrypto.randomUUID();
  }

  if (browserCrypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    browserCrypto.getRandomValues(bytes);

    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `interview-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function FullAiInterviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();

  // 检查登录状态
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthLoading, isAuthenticated, router]);

  const initialDraft = useMemo(
    () => readSessionStorageJson<FullAiResumeDraft>(FULL_AI_RESUME_DRAFT_STORAGE_KEY),
    []
  );
  const [selectedMode, setSelectedMode] = useState<string>(initialDraft?.selectedMode || "");
  const [selectedPosition, setSelectedPosition] = useState<string>(initialDraft?.selectedPosition || "");
  const [availablePositions, setAvailablePositions] = useState<InterviewPositionOption[]>(() => {
    const cachedPositions = readStorageJson<Array<{
      id?: string | number;
      title?: string;
      department?: string;
      jobDescription?: string;
      education?: string;
      experience?: string;
    }>>(POSITIONS_CACHE_KEY);

    return toInterviewPositionOptions(cachedPositions || undefined);
  });
  const [candidateName, setCandidateName] = useState(initialDraft?.candidateName || "");
  const [resumeText, setResumeText] = useState(initialDraft?.resumeText || "");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeFileName, setResumeFileName] = useState(initialDraft?.resumeFileName || "");
  const [isSearchingCandidate, setIsSearchingCandidate] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [interviewId, setInterviewId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [currentRound, setCurrentRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(5);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string>("");
  const [userAnswer, setUserAnswer] = useState("");
  const [interviewLink, setInterviewLink] = useState<string>("");
  const [interviewTime, setInterviewTime] = useState<string>("");
  const [selectedInterviewerVoice, setSelectedInterviewerVoice] = useState<string>(initialDraft?.interviewerVoice || DEFAULT_INTERVIEWER_VOICE_ID);
  const [isSavingInterviewerVoice, setIsSavingInterviewerVoice] = useState(false);
  const [minInterviewTime, setMinInterviewTime] = useState<string>("");
  const [hasError, setHasError] = useState(false);
  const interviewLinkInputRef = useRef<HTMLInputElement | null>(null);

  // 获取历史记录的防抖标志
  const isFetchingHistoryRef = useRef(false);
  // 用于取消进行中的请求
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastSearchedCandidateNameRef = useRef("");
  const searchAbortControllerRef = useRef<AbortController | null>(null);

  // 恢复中断的面试
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const latestBackup = getLatestInterviewBackup();
    if (!latestBackup) {
      return;
    }

    const backupTime = new Date(latestBackup.backup.lastSaved || 0);
    const shouldRestore = window.confirm(
      `检测到未完成的面试（${backupTime.toLocaleTimeString()}），是否恢复？\n\n如果点击"取消"，备份将被清除。`
    );

    if (shouldRestore) {
      setInterviewId(latestBackup.backup.interviewId);
      setMessages(latestBackup.backup.messages.map((msg) => ({
        id: msg.id,
        role: msg.role || (msg.sender === "ai" ? "interviewer" : "candidate"),
        content: msg.content,
        timestamp: new Date(msg.timestamp),
      })));
      setCurrentRound(latestBackup.backup.currentRound || 0);
      setCandidateName(latestBackup.backup.candidateName || "");
      setSelectedPosition(latestBackup.backup.selectedPosition || "");
      setSelectedMode(latestBackup.backup.selectedMode || "");
      setIsStarted(true);

      writeInterviewBackup({
        ...latestBackup.backup,
        interrupted: false,
      });

      toast.success("面试已恢复");
    } else {
      window.localStorage.removeItem(latestBackup.key);
      toast.info("备份已清除");
    }
  }, []);

  // 视频通话相关状态
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // 拖拽上传状态
  const [isDragging, setIsDragging] = useState(false);

  // 历史面试记录相关状态
  const [historyResults, setHistoryResults] = useState<InterviewHistoryRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedHistoryResult, setSelectedHistoryResult] = useState<InterviewHistoryRecord | null>(null);
  const [viewingHistoryDetail, setViewingHistoryDetail] = useState(false);
  const [showRecordingPlayer, setShowRecordingPlayer] = useState(false);
  const recordingVideoRef = useRef<HTMLVideoElement>(null);

  // 删除相关状态
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 录屏完成 Promise
  const recordingCompletePromiseRef = useRef<Promise<Blob> | null>(null);

  // 自动保存相关状态
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<Date | null>(null);
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const autoSaveInProgressRef = useRef(false);

  // 设置面试时间的最小值为当前时间（仅在客户端设置，避免 Hydration 错误）
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setMinInterviewTime(new Date().toISOString().slice(0, 16));
    }
  }, []);

  const isSuperAdmin = user?.role === "super_admin";
  const selectedInterviewerVoiceOption = getInterviewerVoiceOption(selectedInterviewerVoice);
  const getPositionTitle = useCallback((positionId: string) => {
    const dynamicPosition = availablePositions.find((position) => position.id === positionId);
    if (dynamicPosition) {
      return dynamicPosition.title;
    }

    const legacyPosition = LEGACY_INTERVIEW_POSITIONS.find((position) => position.id === positionId);
    return legacyPosition?.title || positionId;
  }, [availablePositions]);

  const findMatchingPositionId = useCallback((positionValue?: string | null) => {
    if (!positionValue) {
      return "";
    }

    const normalizedValue = positionValue.trim().toLowerCase();
    if (!normalizedValue) {
      return "";
    }

    const matchedDynamicPosition = availablePositions.find((position) => {
      const dynamicFields = [
        position.id,
        position.title,
        position.department,
        position.description,
        position.jobDescription,
      ]
        .filter(Boolean)
        .map((value) => String(value).trim().toLowerCase());

      return dynamicFields.includes(normalizedValue);
    });

    if (matchedDynamicPosition) {
      return matchedDynamicPosition.id;
    }

    const matchedLegacyPosition = LEGACY_INTERVIEW_POSITIONS.find((position) => {
      const legacyFields = [position.id, position.title, position.description]
        .filter(Boolean)
        .map((value) => String(value).trim().toLowerCase());

      return legacyFields.includes(normalizedValue);
    });

    return matchedLegacyPosition?.id || "";
  }, [availablePositions]);

  const fetchPositions = useCallback(async () => {
    try {
      const result = await fetchClientJsonCached<{
        success: boolean;
        data: Array<{
          id: number;
          title: string;
          department?: string;
          jobDescription?: string;
          education?: string;
          experience?: string;
        }>;
      }>("/api/positions", {}, {
        ttlMs: 15_000,
      });

      if (!result.success) {
        return;
      }

      const nextPositions = toInterviewPositionOptions(result.data);

      if (typeof window !== "undefined") {
        window.localStorage.setItem(POSITIONS_CACHE_KEY, JSON.stringify(result.data));
      }

      setAvailablePositions(nextPositions);
      setSelectedPosition((currentPosition) => {
        if (!currentPosition) {
          return currentPosition;
        }

        const stillExists = nextPositions.some((position) => position.id === currentPosition);
        return stillExists ? currentPosition : "";
      });
    } catch (error) {
      console.error("[全AI面试] 加载岗位列表失败:", error);
      setAvailablePositions(LEGACY_INTERVIEW_POSITIONS);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let cancelled = false;

    const loadGlobalInterviewerVoice = async () => {
      try {
        const result = await fetchClientJsonCached<GlobalInterviewerVoiceResponse>("/api/full-ai-interview/interviewer-voice", {}, {
          ttlMs: 20_000,
        });
        const globalVoiceId = result.data?.voiceId || DEFAULT_INTERVIEWER_VOICE_ID;

        if (cancelled) {
          return;
        }

        setSelectedInterviewerVoice((currentVoice) => {
          if (isSuperAdmin && currentVoice !== DEFAULT_INTERVIEWER_VOICE_ID) {
            return currentVoice;
          }
          return globalVoiceId;
        });
      } catch (error) {
        console.error("[全AI面试] 加载全局音色失败:", error);
      }
    };

    const idleCallback = globalThis.requestIdleCallback;
    if (typeof idleCallback === "function") {
      const handle = idleCallback(() => {
        void loadGlobalInterviewerVoice();
      }, { timeout: 1200 });

      return () => {
        cancelled = true;
        globalThis.cancelIdleCallback?.(handle);
      };
    }

    const timer = window.setTimeout(() => {
      void loadGlobalInterviewerVoice();
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isAuthenticated, isSuperAdmin]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const idleCallback = globalThis.requestIdleCallback;
    if (typeof idleCallback === "function") {
      const handle = idleCallback(() => {
        void fetchPositions();
      }, { timeout: 1200 });

      return () => globalThis.cancelIdleCallback?.(handle);
    }

    const timer = window.setTimeout(() => {
      void fetchPositions();
    }, 120);

    return () => window.clearTimeout(timer);
  }, [fetchPositions, isAuthenticated]);

  useEffect(() => {
    const unsubscribe = sync.on("positionsUpdated", () => {
      void fetchPositions();
    });

    return unsubscribe;
  }, [fetchPositions]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (isStarted) {
      window.sessionStorage.removeItem(FULL_AI_RESUME_DRAFT_STORAGE_KEY);
      return;
    }

    if (!candidateName && !selectedPosition && !selectedMode && !resumeText && !resumeFileName) {
      window.sessionStorage.removeItem(FULL_AI_RESUME_DRAFT_STORAGE_KEY);
      return;
    }

    const draft: FullAiResumeDraft = {
      candidateName,
      selectedPosition,
      selectedMode,
      resumeText,
      resumeFileName,
      interviewerVoice: selectedInterviewerVoice,
    };

    window.sessionStorage.setItem(
      FULL_AI_RESUME_DRAFT_STORAGE_KEY,
      JSON.stringify(draft)
    );
  }, [candidateName, isStarted, resumeFileName, resumeText, selectedInterviewerVoice, selectedMode, selectedPosition]);

  const selectedPositionTitle = selectedPosition ? getPositionTitle(selectedPosition) : "";

  const handleInterviewerVoiceChange = useCallback(async (voiceId: string) => {
    const previousVoice = selectedInterviewerVoice;
    setSelectedInterviewerVoice(voiceId);

    if (!isSuperAdmin) {
      return;
    }

    setIsSavingInterviewerVoice(true);
    try {
      const result = await fetchClientJson<GlobalInterviewerVoiceResponse>("/api/full-ai-interview/interviewer-voice", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceId }),
      });

      setSelectedInterviewerVoice(result.data?.voiceId || voiceId);
      toast.success("AI 面试官全局音色已同步");
    } catch (error) {
      console.error("[全AI面试] 保存全局音色失败:", error);
      setSelectedInterviewerVoice(previousVoice);
      toast.error("保存全局音色失败，请稍后重试");
    } finally {
      setIsSavingInterviewerVoice(false);
    }
  }, [isSuperAdmin, selectedInterviewerVoice]);

  const persistInterviewBackup = useCallback((options?: { interrupted?: boolean }) => {
    if (!interviewId) {
      return;
    }

    writeInterviewBackup({
      interviewId,
      messages: toPersistedInterviewMessages(messages),
      currentRound,
      candidateName,
      selectedPosition,
      selectedMode,
      lastSaved: new Date().toISOString(),
      interrupted: options?.interrupted ?? false,
    });
  }, [interviewId, messages, currentRound, candidateName, selectedPosition, selectedMode]);

  const clearInterviewPersistence = useCallback((targetInterviewId?: string) => {
    const effectiveInterviewId = targetInterviewId || interviewId;
    if (!effectiveInterviewId) {
      return;
    }

    clearInterviewBackup(effectiveInterviewId);
    clearCandidateStatusSnapshot(effectiveInterviewId);
  }, [interviewId]);

  useEffect(() => {
    if (!isStarted || showEvaluation || !interviewId) {
      return;
    }

    persistInterviewBackup();
  }, [isStarted, showEvaluation, interviewId, persistInterviewBackup]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processResumeFile(file);
    }
  }, []);

  const searchCandidate = useCallback(async (
    name: string,
    options?: { silent?: boolean; force?: boolean }
  ) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    const normalizedName = trimmedName.toLowerCase();
    if (!options?.force && lastSearchedCandidateNameRef.current === normalizedName) {
      return;
    }

    lastSearchedCandidateNameRef.current = normalizedName;

    const applyMatchedCandidate = (
      candidate: CandidateSearchCandidate,
      matchedResumeText: string,
      source: "database" | "local"
    ) => {
      setResumeText(matchedResumeText);
      setResumeFile(null);
      setResumeFileName(candidate.resumeFileName || "");

      const matchedPositionId = findMatchingPositionId(candidate.position);
      if (matchedPositionId) {
        setSelectedPosition(matchedPositionId);
      }

      if (!options?.silent) {
        toast.success(`已自动加载候选人 "${candidate.name}" 的简历`, {
          duration: 3000,
          description: source === "database" ? "简历内容已自动填充" : "已从本地缓存补充简历内容",
        });
      }
    };

    let controller: AbortController | null = null;

    try {
      setIsSearchingCandidate(true);
      console.log(`[搜索候选人] 正在搜索候选人: ${trimmedName}`);
      let matchedCandidateName: string | null = null;
      if (searchAbortControllerRef.current) {
        searchAbortControllerRef.current.abort();
      }

      controller = new AbortController();
      searchAbortControllerRef.current = controller;

      const result = await fetchClientJson<CandidateSearchResponse>(
        `/api/candidates/search?name=${encodeURIComponent(trimmedName)}`,
        { signal: controller.signal }
      );

      if (result.success && result.found) {
        console.log(`[搜索候选人] 数据库找到候选人:`, result.candidates);

        // 优先使用精确匹配的候选人
        const candidate = result.exactMatch
          ? result.candidates.find((item) => item.name.trim().toLowerCase() === normalizedName)
          : result.candidates[0];

        matchedCandidateName = candidate?.name ?? null;

        if (candidate && isUsableCandidateResumeText(candidate.resumeText)) {
          applyMatchedCandidate(candidate, candidate.resumeText, "database");
          console.log(`[搜索候选人] 已加载简历，长度: ${candidate.resumeText.length}`);
          return;
        } else if (candidate && candidate.resumeFileUrl) {
          console.log(`[搜索候选人] 数据库找到候选人但简历暂未解析，尝试读取本地缓存...`);
        } else if (candidate) {
          console.log(`[搜索候选人] 数据库找到候选人但没有简历内容，尝试读取本地缓存...`);
        }
      } else {
        console.log('[搜索候选人] 数据库未找到匹配候选人，尝试读取本地缓存...');
      }

      const localCandidate = findCandidateFromLocalStorage(trimmedName);

      if (localCandidate) {
        console.log(`[搜索候选人] 从 localStorage 找到候选人:`, localCandidate.name);
        const resumeContent = buildResumeTextFromLocalCandidate(localCandidate);

        if (resumeContent) {
          applyMatchedCandidate(localCandidate, resumeContent, "local");
          return;
        }

        if (localCandidate.resumeParsedData?.error) {
          if (!options?.silent) {
            toast.error(`候选人 "${localCandidate.name}" 简历解析失败`, {
              duration: 5000,
              description: `错误: ${localCandidate.resumeParsedData.error}。请在候选人管理页面重新上传简历。`
            });
          }
          return;
        }

        if (localCandidate.resumeUploaded && localCandidate.resumeFileName) {
          if (!options?.silent) {
            toast.warning(`候选人 "${localCandidate.name}" 简历未解析`, {
              duration: 5000,
              description: `文件 ${localCandidate.resumeFileName} 已上传，请在候选人管理页面重新上传简历以触发解析。`
            });
          }
          return;
        }

        if (matchedCandidateName || localCandidate.name) {
          if (!options?.silent) {
            toast.info(`找到候选人 "${localCandidate.name}"，但没有简历信息`, {
              duration: 5000,
              description: "请在候选人管理页面上传简历。"
            });
          }
          return;
        }
      }

      console.log('[搜索候选人] 未找到匹配的候选人');
      if (!options?.silent) {
        toast.info(`未找到候选人 "${trimmedName}" 的简历`);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error('[搜索候选人] 搜索失败:', error);
      if (!options?.silent) {
        toast.error("搜索候选人失败，请稍后重试");
      }
    } finally {
      if (controller && searchAbortControllerRef.current === controller) {
        searchAbortControllerRef.current = null;
      }
      setIsSearchingCandidate(false);
    }
  }, [findMatchingPositionId]);

  useEffect(() => {
    if (isStarted) {
      return;
    }

    const trimmedName = candidateName.trim();
    if (trimmedName.length === 0) {
      lastSearchedCandidateNameRef.current = "";
      return;
    }

    const timer = window.setTimeout(() => {
      void searchCandidate(trimmedName, { silent: true });
    }, 450);

    return () => window.clearTimeout(timer);
  }, [candidateName, isStarted, searchCandidate]);

  // 处理简历文件的通用函数
  const processResumeFile = useCallback(async (file: File) => {
    console.log(`[processResumeFile] 开始处理简历文件: ${file.name}, type: ${file.type}, size: ${file.size}`);
    setResumeFile(file);
    setResumeFileName(file.name);
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      console.log("[processResumeFile] 调用简历解析 API...");
      const result = await fetchClientJson<ResumeExtractResponse>("/api/resume/extract", {
        method: "POST",
        body: formData,
      });

      console.log("[processResumeFile] API 响应结果:", result);

      if (result.success) {
        console.log(`[processResumeFile] 解析成功，内容长度: ${result.content.length}`);
        setResumeText(result.content);
        if (!candidateName.trim() && result.detectedInfo?.name) {
          setCandidateName(result.detectedInfo.name);
        }
        toast.success("简历解析成功");
      } else {
        const errorMessage = result.error || "未知错误";
        console.error("[processResumeFile] 解析失败:", errorMessage);
        toast.error("简历解析失败：" + errorMessage);
      }
    } catch (error) {
      console.error("[processResumeFile] 请求异常:", error);
      toast.error("简历解析失败，请手动输入");
    } finally {
      setIsLoading(false);
    }
  }, [candidateName]);

  // 拖拽事件处理函数 - 优化性能
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      // 检查文件类型
      const allowedTypes = ['.pdf', '.doc', '.docx', '.txt'];
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();

      if (allowedTypes.includes(fileExtension)) {
        await processResumeFile(file);
      } else {
        toast.error('不支持的文件格式，请上传 PDF、Word 或 TXT 文件');
      }
    }
  }, [processResumeFile]);

  // 获取本地媒体流
  const getLocalMediaStream = useCallback(async () => {
    try {
      console.log("[Video] 开始请求本地媒体流...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      console.log("[Video] 媒体流获取成功");
      streamRef.current = stream;
      setLocalStream(stream);
    } catch (error: unknown) {
      console.error("[Video] 获取媒体流失败:", error);
      
      // 根据错误类型提供不同的提示
      let errorMessage = "无法访问摄像头和麦克风";
      let errorDescription = "";
      
      const errorName = error instanceof Error ? error.name : "";
      const errorMessageText = error instanceof Error ? error.message : "未知错误";

      if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
        errorMessage = "摄像头和麦克风权限被拒绝";
        errorDescription = "请在浏览器设置中允许访问摄像头和麦克风，然后刷新页面重试。";
        toast.error(errorMessage, {
          description: errorDescription,
          duration: 5000,
        });
      } else if (errorName === 'NotFoundError') {
        errorMessage = "未找到摄像头或麦克风设备";
        errorDescription = "请检查设备是否正确连接，并确保摄像头和麦克风正常工作。";
        toast.error(errorMessage, {
          description: errorDescription,
          duration: 5000,
        });
      } else if (errorName === 'NotReadableError') {
        errorMessage = "无法读取摄像头或麦克风";
        errorDescription = "设备可能被其他应用占用，请关闭其他使用摄像头/麦克风的应用后重试。";
        toast.error(errorMessage, {
          description: errorDescription,
          duration: 5000,
        });
      } else if (errorName === 'OverconstrainedError') {
        errorMessage = "设备不支持请求的参数";
        errorDescription = "您的设备不支持所需的摄像头或麦克风配置。";
        toast.error(errorMessage, {
          description: errorDescription,
          duration: 5000,
        });
      } else {
        errorMessage = "获取媒体流失败";
        errorDescription = `错误信息: ${errorMessageText}。请刷新页面重试。`;
        toast.error(errorMessage, {
          description: errorDescription,
          duration: 5000,
        });
      }
      
      // 设置错误状态，可以在界面上显示
      setHasError(true);
    }
  }, []);

  // 监听 localStream 变化，设置视频源
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      console.log("[Video] 设置视频源");
      // 使用 requestAnimationFrame 确保 DOM 已经更新
      requestAnimationFrame(() => {
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
          localVideoRef.current.onloadedmetadata = () => {
            console.log("[Video] 视频元数据加载完成，开始播放");
            localVideoRef.current?.play().catch((err) => {
              console.error("[Video] 播放失败:", err);
            });
          };
        }
      });
    }
  }, [localStream]);

  // 监听 isStarted 变化，在面试开始时获取媒体流
  useEffect(() => {
    if (isStarted) {
      console.log("[Video] 面试开始，获取本地媒体流...");
      getLocalMediaStream();
    }
  }, [isStarted, getLocalMediaStream]);

  // 组件卸载时清理媒体流
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        console.log("[Video] 媒体流已清理");
      }
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
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setLocalStream(null);
    }
  };

  const handleStartInterview = async () => {
    if (!resumeText.trim() || !candidateName.trim() || !selectedPosition) {
      toast.error("请填写候选人姓名、简历内容并选择岗位");
      return;
    }

    // 重置错误状态
    setHasError(false);
    
    setIsLoading(true);

    // 开始录屏
    let stopRecordingResolve: ((blob: Blob) => void) | null = null;
    const recordingCompletePromise = new Promise<Blob>((resolve) => {
      stopRecordingResolve = resolve;
    });
    recordingCompletePromiseRef.current = recordingCompletePromise;
    let startedRecorder: MediaRecorder | null = null;
    let startedStream: MediaStream | null = null;

    try {
      console.log("[录屏] 开始请求屏幕录制权限...");
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "monitor"
        },
        audio: true
      });
      console.log("[录屏] 屏幕录制权限获取成功");
      startedStream = stream;

      const recorder = new MediaRecorder(stream);
      startedRecorder = recorder;
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        console.log("[录屏] ondataavailable 触发，数据大小:", event.data.size);
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        console.log("[录屏] 录制停止，生成 blob，chunk 数量:", chunks.length);
        const blob = new Blob(chunks, { type: "video/webm" });
        console.log("[录屏] Blob 大小:", blob.size, "bytes");
        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
        setRecordedChunks(chunks);

        // 停止所有轨道
        stream.getTracks().forEach(track => track.stop());

        // 触发 Promise resolve
        if (stopRecordingResolve) {
          console.log("[录屏] 触发 Promise resolve");
          stopRecordingResolve(blob);
        }
      };

      // 添加更多事件监听器用于调试
      recorder.onstart = () => {
        console.log("[录屏] MediaRecorder onstart 事件触发，状态:", recorder.state);
      };

      recorder.onerror = (event) => {
        console.error("[录屏] MediaRecorder onerror 事件触发:", event);
        const recorderError = (event as Event & { error?: DOMException }).error;
        console.error("[录屏] 错误详情:", recorderError);
      };

      recorder.onpause = () => {
        console.log("[录屏] MediaRecorder onpause 事件触发");
      };

      recorder.onresume = () => {
        console.log("[录屏] MediaRecorder onresume 事件触发");
      };

      console.log("[录屏] 开始录制，MediaRecorder 状态:", recorder.state);
      console.log("[录屏] 流轨道信息:", {
        videoTracks: stream.getVideoTracks().map(t => ({ id: t.id, label: t.label, enabled: t.enabled, muted: t.muted })),
        audioTracks: stream.getAudioTracks().map(t => ({ id: t.id, label: t.label, enabled: t.enabled, muted: t.muted }))
      });

      recorder.start(1000); // 每1秒触发一次 ondataavailable，确保数据及时收集
      console.log("[录屏] recorder.start() 已调用，MediaRecorder 状态:", recorder.state);
      setMediaRecorder(recorder);
      setIsRecording(true);
      toast.success("录屏已开始");
    } catch (error) {
      console.error("录屏启动失败:", error);
      toast.error("录屏启动失败，请确保允许屏幕录制");
    }

    try {
      const result = await fetchClientJson<StartInterviewResponse>("/api/full-ai-interview/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateName,
          resume: resumeText,
          mode: selectedMode,
          position: selectedPosition,
        }),
      });

      if (result.success) {
        setInterviewId(result.interviewId);
        // 转换 timestamp 为 Date 对象
        const messagesWithDate = result.messages.map((msg) => ({
          id: msg.id ?? Date.now().toString(),
          role: msg.role ?? (msg.sender === "ai" ? "interviewer" : "candidate"),
          content: msg.content,
          timestamp: new Date(msg.timestamp),
        }));
        setMessages(messagesWithDate);
        setIsStarted(true);
        setCurrentRound(1);
        toast.success("面试已开始");
      } else {
        if (startedRecorder && startedRecorder.state !== "inactive") {
          startedRecorder.stop();
        }
        startedStream?.getTracks().forEach((track) => track.stop());
        setMediaRecorder(null);
        setIsRecording(false);
        setRecordedBlob(null);
        setRecordedChunks([]);
        setRecordedUrl("");
        toast.error(result.error || "开始面试失败");
      }
    } catch (error) {
      if (startedRecorder && startedRecorder.state !== "inactive") {
        startedRecorder.stop();
      }
      startedStream?.getTracks().forEach((track) => track.stop());
      setMediaRecorder(null);
      setIsRecording(false);
      setRecordedBlob(null);
      setRecordedChunks([]);
      setRecordedUrl("");
      toast.error("开始面试失败");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswerSubmit = async () => {
    if (!userAnswer.trim()) {
      toast.error("请输入你的回答");
      return;
    }

    // 添加用户回答到消息列表
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "candidate",
      content: userAnswer,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    
    // 检测是否是候选人提问，如果是则记录
    if (isCompanyRelatedQuestion(userAnswer)) {
      console.log("[候选人问题记录] 检测到候选人提问，开始记录");
      // 保存到 ref，用于后续 AI 回复关联
      lastCandidateQuestionRef.current = userAnswer;
      saveCandidateQuestionRecord(userAnswer, undefined, "candidate_question");
    } else {
      // 如果不是候选人问题，清空 ref
      lastCandidateQuestionRef.current = null;
    }
    
    setUserAnswer("");
    setIsLoading(true);

    try {
      const result = await fetchClientJson<AnswerInterviewResponse>("/api/full-ai-interview/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interviewId,
          candidateAnswer: userAnswer,
          currentRound: currentRound + 1,
        }),
      });

      if (result.success) {
        // 更新面试阶段
        if (result.interviewStage) {
          interviewStageRef.current = result.interviewStage;
          console.log(`[自动面试] 更新面试阶段为: ${result.interviewStage}`);
        }
        
        // 添加AI面试官的追问
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "interviewer",
          content: result.question,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, aiMessage]);
        
        // 检查是否有待关联的候选人问题，如果有则记录 AI 回答
        if (lastCandidateQuestionRef.current) {
          console.log("[候选人问题记录] 检测到 AI 回答候选人问题，开始记录");
          saveCandidateQuestionRecord(
            lastCandidateQuestionRef.current,
            result.question,
            "interviewer_answer"
          );
          // 清空 ref，避免重复记录
          lastCandidateQuestionRef.current = null;
        }
        
        if (result.shouldEnd) {
          // AI面试官决定结束面试，自动触发评估
          toast.success("面试官已结束面试，正在生成评估报告...");
          setTimeout(() => {
            handleEndInterview();
          }, 1000);
        } else {
          setCurrentRound(currentRound + 1);
        }
      } else {
        toast.error(result.error || "生成追问失败");
      }
    } catch (error) {
      toast.error("生成追问失败");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateLink = async () => {
    if (!candidateName.trim() || !selectedMode || !selectedPosition) {
      toast.error("请先填写候选人姓名、选择面试模式和岗位");
      return;
    }

    if (!resumeText.trim()) {
      toast.error("请先上传或填写简历内容");
      return;
    }

    setIsLoading(true);
    try {
      // 生成唯一的面试ID
      const interviewId = generateClientInterviewId();
      
      // 构建面试链接
      const baseUrl = getInterviewPublicBaseUrlFromBrowser();
      const link = buildCandidateInterviewLink(baseUrl, interviewId);

      // 保存面试配置到全局存储（供共享页面使用）
      const saveResult = await fetchClientJson<SaveConfigResponse>("/api/full-ai-interview/save-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interviewId,
          candidateName,
          mode: selectedMode,
          position: selectedPosition,
          resume: resumeText,
          interviewTime: interviewTime,
          interviewerVoice: selectedInterviewerVoice,
        }),
      });
      if (!saveResult.success) {
        toast.error("保存面试配置失败：" + saveResult.error);
        return;
      }

      console.log(`[handleGenerateLink] 配置已保存: interviewId=${interviewId}, resume长度=${resumeText.length}`);
      setInterviewLink(link);
      toast.success("面试链接生成成功", {
        description: isUnsafeLocalInterviewBaseUrl(baseUrl)
          ? "当前仍在本地地址环境，部署时请配置公开候选人域名以彻底隔离后台访问。"
          : "候选人将通过独立公开面试链接进入纯面试页面。",
      });
    } catch (error) {
      console.error("[handleGenerateLink] 生成面试链接失败:", error);
      toast.error(
        error instanceof Error && error.message
          ? `生成面试链接失败：${error.message}`
          : "生成面试链接失败"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyInterviewLink = async () => {
    if (!interviewLink) return;

    const copied = await copyTextToClipboard(interviewLink);
    if (copied) {
      toast.success("链接已复制到剪贴板");
      return;
    }

    interviewLinkInputRef.current?.select();
    toast.error("自动复制失败，请手动复制已选中的链接");
  };

  const handleSendEmail = () => {
    if (!interviewLink) return;
    
    const subject = encodeURIComponent("AI面试邀请");
    const body = encodeURIComponent(
      `您好 ${candidateName}，\n\n感谢您对我们${selectedPositionTitle || selectedPosition}岗位的申请。\n\n请点击以下链接参加AI面试：\n${interviewLink}\n\n请注意：\n1. 面试将由AI面试官进行，预计需要15-20分钟\n2. 请确保您的设备摄像头和麦克风工作正常\n3. 面试过程中请保持网络稳定\n\n如有问题请联系我们。\n\n祝您面试顺利！`
    );
    
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  };

  const handleSendSMS = () => {
    if (!interviewLink) return;

    const message = encodeURIComponent(
      `【面试邀请】您好 ${candidateName}，请点击链接参加AI面试：${interviewLink}`
    );

    window.open(`sms:?body=${message}`, '_blank');
  };

  const handleSendWeChat = async () => {
    if (!interviewLink) return;

    // 提取面试ID（从链接中获取）
    const interviewIdMatch = interviewLink.match(/id=([^&]+)/);
    const meetingId = interviewIdMatch ? interviewIdMatch[1] : "未设置";

    // 格式化面试时间
    let formattedTime = "待定";
    if (interviewTime) {
      try {
        const date = new Date(interviewTime);
        formattedTime = date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch (e) {
        formattedTime = interviewTime;
      }
    }

    // 获取岗位名称
    const positionTitle = selectedPositionTitle || selectedPosition;

    // 生成微信消息
    const wechatMessage = `【面试邀请】
${candidateName}，您好，我们诚邀您参加${positionTitle}岗位的面试，请通过以下链接进入面试室：

📱 面试室链接：${interviewLink}
🔑 会议ID：${meetingId}
⏰ 面试时间：${formattedTime}
💻 请使用电脑的微软Edge浏览器打开链接

如有任何问题，请及时与人事联系。
祝您面试顺利！`;

    const copied = await copyTextToClipboard(wechatMessage);
    if (copied) {
      toast.success("微信消息已复制到剪贴板，请粘贴到微信发送");
      return;
    }

    toast.error("复制失败，请手动复制以下内容");
    alert(wechatMessage);
  };

  const handleEndInterview = async () => {
    console.log("[面试结束] 开始结束流程");

    let finalBlob: Blob | null = null;

    // 停止录屏并等待录屏数据生成
    if (mediaRecorder && isRecording) {
      console.log("[录屏] 停止录屏，当前状态:", { isRecording, mediaRecorderState: mediaRecorder.state });
      mediaRecorder.stop();
      setIsRecording(false);
      toast.success("录屏已停止");

      // 等待 Promise resolve
      console.log("[录屏] 等待录屏数据生成 Promise...");
      try {
        finalBlob = await Promise.race([
          recordingCompletePromiseRef.current!,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))
        ]);

        if (finalBlob) {
          console.log("[录屏] 录屏数据生成成功，大小:", finalBlob.size, "bytes");
        } else {
          console.warn("[录屏] 等待录屏数据超时，尝试使用状态中的 blob");
          finalBlob = recordedBlob;
        }
      } catch (error) {
        console.error("[录屏] 等待录屏数据失败:", error);
        finalBlob = recordedBlob;
      }
    } else {
      console.log("[录屏] 没有正在进行的录屏，状态:", { isRecording, hasMediaRecorder: !!mediaRecorder });
      finalBlob = recordedBlob;
    }

    // 清理媒体流
    cleanupMediaStream();

    setIsLoading(true);

    // 检查录屏数据是否已准备
    console.log("[录屏] 检查录屏数据:", {
      hasFinalBlob: !!finalBlob,
      blobSize: finalBlob ? finalBlob.size : 0,
      blobType: finalBlob?.type
    });

    // 第一步：调用评估API获取评估结果
    try {
      const result = await fetchClientJson<EvaluateInterviewResponse>("/api/full-ai-interview/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interviewId,
        }),
      });
      if (!result.success) {
        toast.error(result.error || "评估失败");
        setIsLoading(false);
        return;
      }

      // 直接使用后端返回的评估结果（已包含正确的 categoryLabels）
      setEvaluation(result.evaluation);

      // 第二步：上传录屏到对象存储
      let recordingKey = "";
      let recordingUrl = "";
      if (finalBlob) {
        console.log("[录屏上传] 开始上传录屏，大小:", finalBlob.size, "bytes");
        toast.info("正在上传录屏...");
        try {
          const formData = new FormData();
          formData.append("file", finalBlob);
          formData.append("interviewId", interviewId);
          formData.append("candidateName", candidateName);

          const uploadResult = await fetchClientJson<UploadRecordingResponse>("/api/full-ai-interview/upload-recording", {
            method: "POST",
            body: formData,
          });
          console.log("[录屏上传] 上传响应:", uploadResult);
          if (uploadResult.success) {
            recordingKey = uploadResult.fileKey;
            recordingUrl = uploadResult.signedUrl;
            console.log("[录屏上传] 上传成功，key:", recordingKey, "url:", recordingUrl);
            toast.success("录屏上传成功");
          } else {
            console.error("[录屏上传] 上传失败:", uploadResult.error);
            toast.error("录屏上传失败，但面试已结束");
          }
        } catch (error) {
          console.error("[录屏上传] 上传异常:", error);
          toast.error("录屏上传异常，但面试已结束");
        }
      } else {
        console.warn("[录屏上传] 没有录屏数据可上传");
      }

      // 第三步：保存面试结果
      console.log("[保存结果] 开始保存面试结果，录屏 key:", recordingKey || "无", "url存在:", !!recordingUrl);
      try {
        const saveResult = await fetchClientJson<SaveInterviewResultResponse>("/api/full-ai-interview/save-result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            interviewId,
            candidateName,
            position: selectedPosition,
            evaluation: result.evaluation,
            recordingKey,
            recordingUrl,
            completedAt: new Date().toISOString(),
          }),
        });
        console.log("[保存结果] 保存响应:", saveResult);
        if (!saveResult.success) {
          console.error("保存面试结果失败:", saveResult.error);
          toast.error("保存面试结果失败，但已完成");
        } else {
          console.log("[保存结果] 保存成功，recordingUrl:", saveResult.result.recordingUrl);
        }
      } catch (error) {
        console.error("保存面试结果异常:", error);
        toast.error("保存面试结果失败，但已完成");
      }

      setShowEvaluation(true);
      clearInterviewPersistence(interviewId);
      toast.success("面试评估完成");
    } catch (error) {
      toast.error("评估失败");
    } finally {
      setIsLoading(false);
    }
  };

  // 自动保存函数
  const autoSave = useCallback(async () => {
    // 如果没有开始面试或面试已结束，不进行自动保存
    if (!interviewId || !isStarted || showEvaluation || autoSaveInProgressRef.current) {
      return;
    }

    autoSaveInProgressRef.current = true;

    try {
      console.log('[自动保存] 开始自动保存，面试ID:', interviewId);

      const candidateStatus = readCandidateStatusSnapshot(interviewId);
      const formattedMessages = toPersistedInterviewMessages(messages);

      const result = await fetchClientJson<AutoSaveResponse>('/api/full-ai-interview/auto-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interviewId,
          messages: formattedMessages,
          currentRound,
          candidateStatus,
        }),
      });

      if (result.success) {
        console.log('[自动保存] 保存成功，时间:', result.data.savedAt);
        setLastAutoSaveTime(new Date(result.data.savedAt));
        persistInterviewBackup();
      } else {
        console.error('[自动保存] 保存失败:', result.error);
      }
    } catch (error) {
      console.error('[自动保存] 异常:', error);
    } finally {
      autoSaveInProgressRef.current = false;
    }
  }, [interviewId, isStarted, showEvaluation, messages, currentRound, persistInterviewBackup]);

  // 设置自动保存定时器
  useEffect(() => {
    if (isStarted && !showEvaluation && interviewId) {
      console.log('[自动保存] 启动自动保存，间隔30秒');
      setAutoSaveEnabled(true);

      // 立即执行一次
      autoSave();

      // 每30秒自动保存一次
      const interval = setInterval(() => {
        console.log('[自动保存] 定时保存触发');
        autoSave();
      }, 30000);

      autoSaveIntervalRef.current = interval;

      return () => {
        console.log('[自动保存] 清除定时器');
        if (autoSaveIntervalRef.current) {
          clearInterval(autoSaveIntervalRef.current);
          autoSaveIntervalRef.current = null;
        }
      };
    } else {
      setAutoSaveEnabled(false);
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
        autoSaveIntervalRef.current = null;
      }
    }
  }, [isStarted, showEvaluation, interviewId, autoSave]);

  // 页面关闭前保存
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // 如果面试正在进行中，提示用户
      if (isStarted && !showEvaluation && interviewId) {
        event.preventDefault();
        event.returnValue = ''; // Chrome 需要设置 returnValue

        const backupMessages = toPersistedInterviewMessages(messages);
        persistInterviewBackup({ interrupted: true });

        void fetch('/api/full-ai-interview/auto-save', {
          method: 'POST',
          headers: createClientHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            interviewId,
            messages: backupMessages,
            currentRound,
            candidateStatus: readCandidateStatusSnapshot(interviewId),
          }),
          keepalive: true,
        }).catch((error) => {
          console.error('[页面关闭] 自动保存失败:', error);
        });
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isStarted, showEvaluation, interviewId, messages, currentRound, persistInterviewBackup]);

  const handleDownloadRecording = () => {
    if (recordedUrl) {
      const a = document.createElement("a");
      a.href = recordedUrl;
      a.download = `面试录屏-${candidateName}-${new Date().toLocaleDateString()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("录屏已下载");
    }
  };

  const handleRestart = () => {
    clearInterviewPersistence(interviewId);

    // 清理录屏资源
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
    }

    // 清理媒体流
    cleanupMediaStream();

    // 清理自动保存定时器
    if (autoSaveIntervalRef.current) {
      clearInterval(autoSaveIntervalRef.current);
      autoSaveIntervalRef.current = null;
    }

    setIsStarted(false);
    setMessages([]);
    setInterviewId("");
    setEvaluation(null);
    setUserAnswer("");
    setCurrentRound(0);
    setShowEvaluation(false);
    setCurrentRound(0);
    setCandidateName("");
    setResumeText("");
    setResumeFile(null);
    setSelectedMode("");
    setSelectedPosition("");
    setRecordedBlob(null);
    setRecordedUrl("");
    setRecordedChunks([]);
    setIsVideoEnabled(true);
    setIsAudioEnabled(true);
    setAutoSaveEnabled(false);
    setLastAutoSaveTime(null);
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

  // 获取历史面试记录 - 优化性能
  const fetchHistoryResults = useCallback(async (retryCount: number = 0, maxRetries: number = 2) => {
    // 防抖：如果正在获取，跳过此次请求
    if (isFetchingHistoryRef.current) {
      console.log("[面试官端] 正在获取历史记录，跳过此次请求");
      return;
    }

    // 取消之前的请求（如果存在）
    if (abortControllerRef.current) {
      console.log("[面试官端] 取消之前的请求");
      abortControllerRef.current.abort();
    }

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController();

    isFetchingHistoryRef.current = true;

    try {
      console.log("[面试官端] 获取历史面试记录...", retryCount > 0 ? `(重试 ${retryCount}/${maxRetries})` : "");
      const result = await fetchClientJson<InterviewHistoryListResponse>("/api/full-ai-interview/save-result", {
        signal: abortControllerRef.current.signal
      });

      console.log("[面试官端] API 响应:", {
        success: result.success,
        hasError: !!result.error,
        error: result.error,
        hasResults: !!result.results,
        resultsLength: result.results?.length || 0
      });

      if (result.success) {
        console.log(`[面试官端] 获取到 ${result.results?.length || 0} 条历史记录`);
        setHistoryResults(result.results || []);
      } else {
        const errorMessage = result.error || "未知错误";
        console.error("[面试官端] 获取历史记录失败:", errorMessage);
      }
    } catch (error) {
      // 如果是 AbortError，说明请求被取消，不需要处理
      if (error instanceof Error && error.name === 'AbortError') {
        console.log("[面试官端] 请求已取消");
        return;
      }

      // 使用字符串拼接避免对象被简化显示
      let errorMsg = '未知错误';
      if (error instanceof Error) {
        errorMsg = `${error.name}: ${error.message}`;
      } else if (error && typeof error === 'object') {
        errorMsg = JSON.stringify(error);
      } else if (error) {
        errorMsg = String(error);
      }
      
      console.error(`[面试官端] 获取历史面试记录失败: ${errorMsg}`);

      // 如果是网络错误且未达到最大重试次数，自动重试
      if (retryCount < maxRetries) {
        console.log(`[面试官端] 遇到网络错误，2秒后自动重试... (${retryCount + 1}/${maxRetries})`);
        setTimeout(() => {
          isFetchingHistoryRef.current = false;
          fetchHistoryResults(retryCount + 1, maxRetries);
        }, 2000);
        return;
      }
    } finally {
      // 释放防抖标志
      isFetchingHistoryRef.current = false;
      // 清理 AbortController
      abortControllerRef.current = null;
    }
  }, []);

  // 页面加载时获取历史面试记录，并定时刷新（仅在未开始面试时）
  useEffect(() => {
    // 如果面试已经开始，不需要刷新历史记录
    if (isStarted) {
      console.log("[面试官端] 面试进行中，暂停刷新历史记录");
      return;
    }

    // 首次加载获取历史记录
    fetchHistoryResults();

    // 每30秒刷新一次历史记录，以便获取候选人完成的面试
    const intervalId = setInterval(() => {
      // 再次检查，防止在定时器执行时面试已经开始
      if (!isStarted) {
        fetchHistoryResults();
      }
    }, 30000);

    return () => {
      clearInterval(intervalId);
      // 组件卸载时取消进行中的请求
      if (abortControllerRef.current) {
        console.log("[面试官端] 组件卸载，取消进行中的请求");
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [fetchHistoryResults, isStarted]);

  // 监听URL参数，如果存在interviewId，自动打开历史记录对话框并显示评估报告
  useEffect(() => {
    const interviewId = searchParams.get('interviewId');
    if (interviewId && !isStarted) {
      console.log("[URL参数] 检测到面试ID:", interviewId);
      // 先获取历史记录
      fetchHistoryResults().then(() => {
        // 然后打开历史记录对话框
        setShowHistory(true);
        // 延迟打开详情对话框，确保历史记录已加载
        setTimeout(() => {
          handleViewHistoryDetail(interviewId);
        }, 500);
      });
    }
  }, [searchParams, fetchHistoryResults, isStarted]);

  // 查看历史面试详情
  const handleViewHistoryDetail = async (interviewId: string) => {
    try {
      console.log("[handleViewHistoryDetail] 开始获取面试详情，面试ID:", interviewId);
      const result = await fetchClientJson<InterviewHistoryDetailResponse>(`/api/full-ai-interview/save-result?id=${interviewId}`);
      console.log("[handleViewHistoryDetail] API返回数据:", result);
      if (result.success) {
        console.log("[handleViewHistoryDetail] 成功获取面试详情，设置selectedHistoryResult和viewingHistoryDetail");
        setSelectedHistoryResult(result.result);
        setViewingHistoryDetail(true);
        setShowHistory(false);
      } else {
        console.error("[handleViewHistoryDetail] API返回失败:", result.error);
        toast.error(result.error || "获取面试详情失败");
      }
    } catch (error) {
      console.error("[handleViewHistoryDetail] 获取面试详情失败:", error);
      toast.error("获取面试详情失败");
    }
  };

  // 下载历史录屏
  const handleDownloadHistoryRecording = async (url: string, candidateName: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `面试录屏-${candidateName}-${new Date().toLocaleDateString()}.webm`;
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

  // 打开录屏播放器
  const handleViewRecording = async (url: string, candidateName: string) => {
    if (!url) {
      toast.error("录屏文件不存在");
      return;
    }

    try {
      // 设置录屏URL
      setShowRecordingPlayer(true);
      // 等待对话框渲染完成后设置视频源
      setTimeout(() => {
        if (recordingVideoRef.current) {
          recordingVideoRef.current.src = url;
          recordingVideoRef.current.load();
        }
      }, 100);
    } catch (error) {
      console.error("打开录屏失败:", error);
      toast.error("打开录屏失败，请重试");
    }
  };

  // 关闭录屏播放器
  const handleCloseRecordingPlayer = () => {
    if (recordingVideoRef.current) {
      recordingVideoRef.current.pause();
      recordingVideoRef.current.src = "";
    }
    setShowRecordingPlayer(false);
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

  // 存储最后一条候选人问题，用于 AI 回复时关联
  const lastCandidateQuestionRef = useRef<string | null>(null);
  const interviewStageRef = useRef<number>(1); // 当前面试阶段（1=自我介绍, 2=核心问题, 3=问答）

  // 保存候选人问题记录到文件（只记录第三阶段）
  const saveCandidateQuestionRecord = async (
    question: string,
    answer?: string,
    type: "candidate_question" | "interviewer_answer" = "candidate_question"
  ) => {
    try {
      if (!interviewId) {
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
      
      const result = await fetchClientJson<CandidateQuestionSaveResponse>("/api/full-ai-interview/candidate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interviewId,
          candidateName,
          position: selectedPosition,
          question,
          answer,
          type,
          timestamp: new Date().toISOString(),
          stage: currentStage, // 传递面试阶段
        }),
      });

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

  // 下载面试评估报告
  // 获取面试问答记录（过滤掉简历相关内容）
  const fetchQaHistory = async (interviewId: string): Promise<QaHistoryItem[]> => {
    try {
      console.log("[fetchQaHistory] 开始获取面试问答记录:", interviewId);
      
      if (!interviewId) {
        console.error("[fetchQaHistory] 面试ID为空");
        return [];
      }
      
      const responseData = await fetchClientJson<InterviewSessionResponse>(`/api/interview/session?interviewId=${encodeURIComponent(interviewId)}`);
      console.log("[fetchQaHistory] 获取成功，响应格式:", typeof responseData, responseData);

      // 从响应中提取消息数组
      const data = responseData.session?.messages || responseData.messages || [];
      console.log("[fetchQaHistory] 提取的消息数量:", data.length);

      // 过滤掉系统消息（role: system），只保留用户和AI面试官的对话
      const filteredMessages = data.filter((msg) => {
        // 过滤掉系统消息
        if (msg.role === "system") {
          console.log("[fetchQaHistory] 过滤掉系统消息");
          return false;
        }
        // 只保留 user 和 assistant 的消息
        return msg.role === "user" || msg.role === "assistant";
      });

      console.log("[fetchQaHistory] 过滤后的消息数量:", filteredMessages.length);

      // 转换会话消息为问答记录格式（与 share/page.tsx 中的转换逻辑一致）
      const qaHistory: QaHistoryItem[] = filteredMessages.map((msg, index: number) => {
        // 判断消息类型
        let type: QaHistoryItem["type"] = "answer";
        if (msg.role === "assistant") {
          // 检查是否是回答候选人问题
          const prevMsg = index > 0 ? filteredMessages[index - 1] : null;
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
          id: `${interviewId}-${index}`,
          role: msg.role === "assistant" ? "interviewer" : "candidate",
          content: msg.content,
          type: type,
          timestamp: msg.timestamp || new Date().toISOString()
        };
      });

      // 打印前3条问答记录的详细信息
      if (qaHistory.length > 0) {
        console.log("[fetchQaHistory] 前3条问答记录详情:");
        qaHistory.slice(0, 3).forEach((qa, i: number) => {
          console.log(`  [${i}] role: ${qa.role}, type: ${qa.type}, content: ${qa.content?.substring(0, 50)}...`);
        });
      }

      console.log("[fetchQaHistory] 返回条目数:", qaHistory.length);
      return qaHistory;
    } catch (error) {
      console.error("[fetchQaHistory] 请求异常:", error);
      return [];
    }
  };

  const handleDownloadReport = async (result: InterviewHistoryRecord) => {
    try {
      console.log("[handleDownloadReport] 开始下载报告，面试ID:", result.interviewId || result.id);
      
      // 获取问答记录
      const qaHistory = await fetchQaHistory(result.interviewId || String(result.id || ""));
      console.log("[handleDownloadReport] 获取到的问答记录数量:", qaHistory?.length || 0);
      console.log("[handleDownloadReport] 问答记录预览:", qaHistory?.slice(0, 2));
      
      const report = generateReportText(result, qaHistory);

      // 创建 Blob (使用 HTML 格式)
      const blob = new Blob([report], { type: 'text/html;charset=utf-8' });
      const blobUrl = window.URL.createObjectURL(blob);

      // 下载文件
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `面试评估报告-${result.candidateName}-${new Date().toLocaleDateString()}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      toast.success("评估报告已下载");
    } catch (error) {
      console.error("下载报告失败:", error);
      toast.error("下载报告失败，请重试");
    }
  };

  // 生成报告文本
  const generateReportText = (result: InterviewHistoryRecord, qaHistory?: QaHistoryItem[]) => {
    const evaluation = result.evaluation;
    const timestamp = new Date(result.completedAt).toLocaleString('zh-CN');
    const positionTitle = getPositionTitle(result.position);

    console.log("[generateReportText] 收到的问答记录:", qaHistory?.length || 0, "条");
    if (qaHistory && qaHistory.length > 0) {
      console.log("[generateReportText] 第一条问答:", qaHistory[0]);
    }
    
    // 检查候选人状态监控截图
    console.log("[generateReportText] 候选人状态监控数据:", {
      hasCandidateStatus: !!result.candidateStatus,
      overallStatus: result.candidateStatus?.overallStatus,
      screenshotsCount: result.candidateStatus?.screenshots?.length || 0,
      screenshots: result.candidateStatus?.screenshots?.slice(0, 2) // 只打印前两条预览
    });

    // 生成 HTML 格式报告
    let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>面试评估报告 - ${result.candidateName}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
      padding: 20px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      border-radius: 8px;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      border-bottom: 3px solid #1890ff;
      padding-bottom: 20px;
    }
    .header h1 {
      color: #1890ff;
      font-size: 28px;
      margin-bottom: 10px;
    }
    .info-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      background: #f0f9ff;
      padding: 15px;
      border-radius: 6px;
      margin-bottom: 20px;
    }
    .info-item {
      flex: 1;
      min-width: 200px;
    }
    .info-label {
      color: #666;
      font-size: 14px;
    }
    .info-value {
      color: #333;
      font-weight: 500;
      font-size: 16px;
    }
    .section {
      margin-bottom: 30px;
    }
    .section-title {
      font-size: 20px;
      font-weight: 600;
      color: #1890ff;
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e8f4ff;
    }
    .section-title::before {
      content: "📋 ";
    }
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      margin: 15px 0;
    }
    .stat-item {
      background: #fafafa;
      padding: 12px;
      border-radius: 6px;
      border-left: 4px solid #1890ff;
    }
    .stat-label {
      color: #666;
      font-size: 14px;
    }
    .stat-value {
      color: #333;
      font-weight: 600;
      font-size: 18px;
    }
    .event-item {
      background: #fff;
      border: 1px solid #e8e8e8;
      border-radius: 6px;
      padding: 15px;
      margin-bottom: 12px;
    }
    .event-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .event-type {
      font-weight: 600;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 14px;
    }
    .event-type.normal {
      background: #f6ffed;
      color: #52c41a;
      border: 1px solid #b7eb8f;
    }
    .event-type.abnormal {
      background: #fff7e6;
      color: #fa8c16;
      border: 1px solid #ffd591;
    }
    .event-type.cheating {
      background: #fff1f0;
      color: #ff4d4f;
      border: 1px solid #ffa39e;
    }
    .event-time {
      color: #999;
      font-size: 12px;
    }
    .event-description {
      color: #666;
      font-size: 14px;
      margin: 8px 0;
    }
    .event-evidence {
      background: #f9f9f9;
      padding: 10px;
      border-radius: 4px;
      margin-top: 8px;
      font-size: 14px;
      color: #666;
    }
    .event-screenshot {
      margin-top: 10px;
      border: 1px solid #e8e8e8;
      border-radius: 4px;
      overflow: hidden;
      max-width: 400px;
    }
    .event-screenshot img {
      display: block;
      width: 100%;
      height: auto;
    }
    .score-section {
      background: #f0f9ff;
      padding: 20px;
      border-radius: 6px;
      text-align: center;
    }
    .total-score {
      font-size: 48px;
      font-weight: 700;
      color: #1890ff;
      margin-bottom: 10px;
    }
    .recommendation {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 10px;
    }
    .recommendation.hire {
      color: #52c41a;
    }
    .recommendation.consider {
      color: #fa8c16;
    }
    .recommendation.reject {
      color: #ff4d4f;
    }
    .category-score {
      background: #fff;
      padding: 12px;
      border-radius: 6px;
      border: 1px solid #e8e8e8;
      margin-bottom: 10px;
    }
    .category-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .category-name {
      font-weight: 600;
      font-size: 16px;
    }
    .category-score-value {
      font-size: 24px;
      font-weight: 700;
      color: #1890ff;
    }
    .category-basis {
      color: #666;
      font-size: 14px;
      padding-left: 12px;
    }
    .qa-item {
      background: #f9f9f9;
      padding: 15px;
      border-radius: 6px;
      margin-bottom: 12px;
    }
    .qa-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e8e8e8;
    }
    .qa-role {
      font-weight: 600;
      font-size: 14px;
    }
    .qa-role.ai {
      color: #1890ff;
    }
    .qa-role.candidate {
      color: #52c41a;
    }
    .qa-time {
      color: #999;
      font-size: 12px;
    }
    .qa-content {
      color: #333;
      font-size: 14px;
      line-height: 1.8;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .footer {
      text-align: center;
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e8e8e8;
      color: #999;
      font-size: 12px;
    }
    ul, ol {
      padding-left: 20px;
    }
    li {
      margin: 6px 0;
    }
    @media print {
      body {
        background: white;
      }
      .container {
        box-shadow: none;
        padding: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 面试评估报告</h1>
    </div>

    <div class="info-bar">
      <div class="info-item">
        <div class="info-label">👤 候选人</div>
        <div class="info-value">${result.candidateName}</div>
      </div>
      <div class="info-item">
        <div class="info-label">💼 岗位</div>
        <div class="info-value">${positionTitle}</div>
      </div>
      <div class="info-item">
        <div class="info-label">🕐 面试时间</div>
        <div class="info-value">${timestamp}</div>
      </div>
      <div class="info-item">
        <div class="info-label">🆔 面试ID</div>
        <div class="info-value">${result.interviewId || result.id}</div>
      </div>
    </div>

    ${evaluation && evaluation.evaluationError ? `
    <div style="background: #fff1f0; padding: 20px; border-radius: 6px; margin-bottom: 20px; border: 2px solid #ffccc7;">
      <div style="font-size: 18px; font-weight: 700; color: #ff4d4f; margin-bottom: 10px;">
        ⚠️ 评估失败原因
      </div>
      <div style="color: #666; line-height: 1.6;">
        本报告的自动评估未能完成，因此采用了默认评分。以下是评估失败的原因：
        <br><br>
        <strong style="color: #ff4d4f;">${evaluation.evaluationError}</strong>
        <br><br>
        注意：由于评估失败，本报告的评分和建议仅供参考。建议面试官结合面试问答记录和候选人表现进行人工评估。
      </div>
    </div>
    ` : ''}

    <div class="section">
      <div class="section-title">一、候选人状态监控</div>
`;

    if (result.candidateStatus) {
      const status = result.candidateStatus;
      const statistics = status.statistics ?? {
        totalDuration: 0,
        normalDuration: 0,
        abnormalDuration: 0,
        cheatingDuration: 0,
        faceDetectionRate: 0,
        faceLostCount: 0,
        multipleFaceCount: 0,
        suspiciousActions: 0,
      };

      html += `
      <div style="margin-bottom: 15px;">
        <strong>✓ 整体状态：</strong>${getOverallStatusText(status.overallStatus)}<br>
        <strong>📝 状态摘要：</strong>${status.summary}
      </div>

      <div class="stat-grid">
        <div class="stat-item">
          <div class="stat-label">总时长</div>
          <div class="stat-value">${statistics.totalDuration.toFixed(0)}秒</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">正常</div>
          <div class="stat-value">${statistics.normalDuration.toFixed(0)}秒</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">异常</div>
          <div class="stat-value">${statistics.abnormalDuration.toFixed(0)}秒</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">作弊</div>
          <div class="stat-value">${statistics.cheatingDuration.toFixed(0)}秒</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">人脸检测率</div>
          <div class="stat-value">${statistics.faceDetectionRate.toFixed(1)}%</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">人脸丢失</div>
          <div class="stat-value">${statistics.faceLostCount}次</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">多人出现</div>
          <div class="stat-value">${statistics.multipleFaceCount}次</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">可疑行为</div>
          <div class="stat-value">${statistics.suspiciousActions}次</div>
        </div>
      </div>
`;

      if (status.events && status.events.length > 0) {
        html += `
      <div style="margin-top: 20px;">
        <strong>⚠️ 监控事件（${status.events.length}条）</strong>
`;
        status.events.forEach((event, index: number) => {
          const time = new Date(event.timestamp).toLocaleString('zh-CN');
          const typeClass = event.type === 'normal' ? 'normal' :
                           event.type === 'abnormal' ? 'abnormal' :
                           event.type === 'cheating' ? 'cheating' : 'abnormal';
          const typeLabel = event.type === 'normal' ? '✓ 正常' :
                           event.type === 'abnormal' ? '⚠️ 异常' :
                           event.type === 'cheating' ? '🚫 作弊' : event.type;

          html += `
        <div class="event-item">
          <div class="event-header">
            <span class="event-type ${typeClass}">${typeLabel}</span>
            <span class="event-time">${time}</span>
          </div>
          <div class="event-description">
            <strong>描述：</strong>${event.description}<br>
            <strong>轮次：</strong>第${event.roundNumber}轮
          </div>`;

          if (event.evidence) {
            const details = [];
            if (event.evidence.duration) details.push(`持续${event.evidence.duration.toFixed(2)}秒`);
            if (event.evidence.faceCount) details.push(`${event.evidence.faceCount}张人脸`);
            
            if (details.length > 0) {
              html += `
          <div class="event-evidence">
            <strong>详情：</strong>${details.join('，')}
          </div>`;
            }
            
            if (event.evidence.screenshot) {
              html += `
          <div class="event-screenshot">
            <img src="${event.evidence.screenshot}" alt="事件截图证据" />
          </div>`;
            }
          }
          
          html += `
        </div>`;
        });
        
        html += `
      </div>`;
      }
      
      // 添加截图展示部分
      if (status.screenshots && status.screenshots.length > 0) {
        html += `
      <div style="margin-top: 20px;">
        <strong>📸 面试监控截图（${status.screenshots.length}张）</strong>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; margin-top: 15px;">
`;
        status.screenshots.forEach((screenshot, idx: number) => {
          const screenshotTime = new Date(screenshot.timestamp).toLocaleString('zh-CN');
          const screenshotLabel = screenshot.abnormalType ? '异常事件截图' : '定时监控截图';
          
          html += `
          <div style="border: 1px solid #e8e8e8; border-radius: 6px; overflow: hidden; background: #fff;">
            <div style="padding: 8px 12px; background: #f5f5f5; border-bottom: 1px solid #e8e8e8;">
              <div style="font-weight: 600; font-size: 14px; color: #333;">${screenshotLabel} #${idx + 1}</div>
              <div style="font-size: 12px; color: #999;">${screenshotTime}</div>
              ${screenshot.interviewStep ? `<div style="font-size: 12px; color: #666;">面试步骤：${screenshot.interviewStep}</div>` : ''}
              ${screenshot.description ? `<div style="font-size: 12px; color: #666;">${screenshot.description}</div>` : ''}
            </div>
            <div style="padding: 10px;">`;
          
          // 人脸截图
          if (screenshot.faceScreenshot) {
            html += `
              <div style="margin-bottom: 10px;">
                <div style="font-size: 12px; color: #666; margin-bottom: 5px;">👤 候选人画面</div>
                <img src="${screenshot.faceScreenshot}" style="width: 100%; border-radius: 4px; border: 1px solid #e8e8e8;" alt="人脸截图" />
              </div>`;
          }
          
          // 屏幕截图
          if (screenshot.screenScreenshot) {
            html += `
              <div>
                <div style="font-size: 12px; color: #666; margin-bottom: 5px;">🖥️ 屏幕画面</div>
                <img src="${screenshot.screenScreenshot}" style="width: 100%; border-radius: 4px; border: 1px solid #e8e8e8;" alt="屏幕截图" />
              </div>`;
          }
          
          html += `
            </div>
          </div>`;
        });
        
        html += `
        </div>
      </div>`;
      }
    } else {
      html += `
      <div style="color: #999;">✗ 状态监控未启用</div>
`;
    }

    html += `
    </div>

    <div class="section">
      <div class="section-title">二、综合评分</div>
`;

    if (evaluation.isEliminated) {
      html += `
      <div style="background: #fff1f0; padding: 20px; border-radius: 6px; text-align: center; margin-bottom: 20px;">
        <div style="font-size: 24px; font-weight: 700; color: #ff4d4f;">❌ 判定结果：淘汰</div>
      </div>
      <div style="margin-bottom: 15px;">
        <strong>淘汰原因：</strong><br>
        ${evaluation.eliminationReason}
      </div>
      <div style="margin-bottom: 20px;">
        <strong>评价总结：</strong><br>
        ${evaluation.summary}
      </div>
`;
    } else {
      const recClass = evaluation.recommendation === 'hire' ? 'hire' :
                      evaluation.recommendation === 'consider' ? 'consider' : 'reject';

      html += `
      <div class="score-section">
        <div class="total-score">${evaluation.overallScore5}/5</div>
        <div class="recommendation ${recClass}">🎯 ${getRecommendationText(evaluation.recommendation)}</div>
      </div>

      <div style="margin-top: 20px;">
        <strong>分类评分</strong>
`;
      if (evaluation.categoryScores && evaluation.categoryLabels) {
        Object.entries(evaluation.categoryScores).forEach(([key, value]: [string, { score: number; basis: string }]) => {
          const label = getCategoryLabel(key, evaluation.categoryLabels);
          html += `
        <div class="category-score">
          <div class="category-header">
            <span class="category-name">• ${label}</span>
            <span class="category-score-value">${value.score}分</span>
          </div>
          <div class="category-basis">理由：${value.basis}</div>
        </div>`;
        });
      }

      html += `
      </div>

      <div style="margin-top: 20px;">
        <strong>评价总结</strong><br>
        <div style="background: #f9f9f9; padding: 15px; border-radius: 6px; margin-top: 10px;">
          ${evaluation.summary}
        </div>
      </div>

      <div style="margin-top: 20px;">
        <strong>主要优势</strong>
        <div style="margin-top: 10px;">`;
      evaluation.strengths.forEach((strength) => {
        if (!isStrengthDetail(strength)) {
          html += `
          <div style="margin-bottom: 15px; padding: 10px; background: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 4px;">
            ${strength}
          </div>`;
        } else {
          html += `
          <div style="margin-bottom: 15px; padding: 12px; background: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 4px;">
            <div style="font-weight: bold; margin-bottom: 5px;">${strength.title || '优势项'}</div>
            <div style="font-size: 14px; margin-bottom: 5px;">${strength.description || ''}</div>
            ${strength.evidence ? `<div style="background: #c8e6c9; padding: 8px; border-radius: 4px; font-size: 13px;"><strong>支撑证据：</strong>${strength.evidence}</div>` : ''}
            ${strength.application ? `<div style="margin-top: 8px; font-size: 13px;"><strong>应用场景：</strong>${strength.application}</div>` : ''}
          </div>`;
        }
      });
      html += `
        </div>
      </div>`;

      // 改进建议
      if (evaluation.improvements && evaluation.improvements.length > 0) {
        html += `
      <div style="margin-top: 20px;">
        <strong>改进建议</strong>
        <div style="margin-top: 10px;">`;
        evaluation.improvements.forEach((improvement) => {
          if (!isImprovementDetail(improvement)) {
            html += `
          <div style="margin-bottom: 15px; padding: 12px; background: #fff8e1; border-left: 4px solid #9e9e9e; border-radius: 4px;">
            ${improvement}
          </div>`;
            return;
          }

          const importanceClass = improvement.importance === '高' ? '#ef5350' : improvement.importance === '中' ? '#ffca28' : '#9e9e9e';
          html += `
          <div style="margin-bottom: 15px; padding: 12px; background: #fff8e1; border-left: 4px solid ${importanceClass}; border-radius: 4px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
              <div style="font-weight: bold;">${improvement.area || '改进项'}</div>
              <div style="background: ${importanceClass}; color: white; padding: 2px 8px; border-radius: 3px; font-size: 12px;">重要性：${improvement.importance || '中'}</div>
            </div>
            ${improvement.current ? `<div style="margin-bottom: 5px; font-size: 14px;"><strong>当前表现：</strong>${improvement.current}</div>` : ''}
            ${improvement.suggestion ? `<div style="font-size: 14px;"><strong>改进建议：</strong>${improvement.suggestion}</div>` : ''}
          </div>`;
        });
        html += `
        </div>
      </div>`;
      }

      // 面试观察记录
      if (evaluation.observations && evaluation.observations.length > 0) {
        html += `
      <div style="margin-top: 20px;">
        <strong>面试观察记录</strong>
        <div style="margin-top: 10px;">`;
        evaluation.observations.forEach((observation) => {
          if (!isObservationDetail(observation)) {
            html += `
          <div style="margin-bottom: 12px; padding-left: 12px; border-left: 4px solid #2196f3;">
            <div style="font-size: 14px;">${observation}</div>
          </div>`;
            return;
          }

          html += `
          <div style="margin-bottom: 12px; padding-left: 12px; border-left: 4px solid #2196f3;">
            <div style="margin-bottom: 3px;">
              ${observation.time ? `<span style="background: #e3f2fd; color: #1976d2; padding: 2px 8px; border-radius: 3px; font-size: 12px; margin-right: 5px;">${observation.time}</span>` : ''}
              ${observation.category ? `<span style="font-size: 12px; color: #666;">${observation.category}</span>` : ''}
            </div>
            <div style="font-size: 14px;">${observation.observation}</div>
          </div>`;
        });
        html += `
        </div>
      </div>`;
      }
    }

    // 添加面试问答记录
    if (qaHistory && qaHistory.length > 0) {
      html += `
    </div>

    <div class="section">
      <div class="section-title">三、面试问答记录</div>
`;

      qaHistory.forEach((item: QaHistoryItem, index: number) => {
        const time = new Date(item.timestamp).toLocaleString('zh-CN');
        const isInterviewer = item.role === 'interviewer';
        const roleClass = isInterviewer ? 'ai' : 'candidate';
        const typeLabel = item.type === 'question' ? '提问' :
                         item.type === 'answer' ? '回答' :
                         item.type === 'candidate_question' ? '反问' : '回答';

        html += `
      <div class="qa-item">
        <div class="qa-header">
          <span class="qa-role ${roleClass}">${isInterviewer ? '🤖 AI面试官' : '👤 候选人'} | ${typeLabel}</span>
          <span class="qa-time">${time}</span>
        </div>
        <div class="qa-content">${item.content}</div>
      </div>`;
      });
    }

    html += `
    </div>

    <div class="footer">
      <div style="margin-bottom: 10px;">
        <strong>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</strong>
      </div>
      <div style="margin-bottom: 5px;">✨ 本报告由 AI 智能面试系统自动生成</div>
      <div>📅 生成时间：${new Date().toLocaleString('zh-CN')}</div>
    </div>
  </div>
</body>
</html>`;

    return html;
  };

  // 删除面试结果
  const handleDeleteResult = async () => {
    if (!deletingId) {
      return;
    }

    try {
      console.log("[删除] 开始删除面试结果:", deletingId);
      const result = await fetchClientJson<DeleteResultResponse>(`/api/full-ai-interview/delete-result?id=${deletingId}`, {
        method: 'DELETE',
      });

      if (result.success) {
        toast.success("删除成功");
        // 刷新历史记录
        await fetchHistoryResults();
        setShowDeleteConfirm(false);
        setDeletingId(null);
      } else {
        toast.error(result.error || "删除失败");
      }
    } catch (error) {
      console.error("[删除] 删除面试结果失败:", error);
      toast.error("删除失败，请重试");
    }
  };

  // 打开删除确认对话框
  const handleOpenDeleteConfirm = (id: string, candidateName: string) => {
    setDeletingId(id);
    setShowDeleteConfirm(true);
  };

  // 获取推荐结果文本
  const getRecommendationText = (recommendation: string) => {
    switch (recommendation) {
      case "hire":
        return "推荐录用";
      case "consider":
        return "考虑录用";
      case "reject":
        return "不建议录用";
      default:
        return "待评估";
    }
  };

  // 获取整体状态文本
  const getOverallStatusText = (status: string) => {
    switch (status) {
      case "normal":
        return "正常";
      case "warning":
        return "警告";
      case "cheating":
        return "作弊";
      default:
        return "未知";
    }
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

  if (showEvaluation && evaluation) {
    return (
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Star className="h-8 w-8 text-yellow-600" />
                面试评估报告
              </h1>
              <p className="mt-2 text-gray-600">
                候选人：{candidateName}
                {selectedPosition && ` | 岗位：${selectedPositionTitle || selectedPosition}`}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => router.push('/')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              返回导航栏
            </Button>
          </div>

          <div className="grid gap-6">
            {/* 淘汰状态 */}
            {evaluation.isEliminated && (
              <Card className="border-red-200 bg-red-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="h-5 w-5" />
                    淘汰判定
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-red-700 font-medium">{evaluation.eliminationReason}</p>
                </CardContent>
              </Card>
            )}

            {/* 总体评分 */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>综合评分</CardTitle>
                  {getRecommendationBadge(evaluation.recommendation)}
                </div>
              </CardHeader>
              <CardContent>
                {!evaluation.isEliminated && (
                  <div className="text-center p-4 border rounded-lg">
                    <div className="text-sm text-gray-600 mb-2">5分制总分</div>
                    <div className="text-5xl font-bold text-blue-600">
                      {evaluation.overallScore5}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">满分5分</div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 分类评分 */}
            {!evaluation.isEliminated && (
              <Card>
                <CardHeader>
                  <CardTitle>分类评分</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {Object.entries(evaluation.categoryScores).map(([key, value]) => (
                      <div key={key} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-medium text-gray-900">
                            {getCategoryLabel(key, evaluation.categoryLabels)}
                          </div>
                          <div className="text-right">
                            <div className={`text-2xl font-bold ${getScore5Color(value.score)}`}>
                              {value.score}分
                            </div>
                            {evaluation.dimensionResults?.find((item) => item.code === key) && (
                              <div className="text-xs text-gray-500">
                                权重 {(evaluation.dimensionResults.find((item) => item.code === key)?.weight || 0) * 100}% /
                                百分制 {evaluation.dimensionResults.find((item) => item.code === key)?.score100} 分
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                          <div
                            className={`h-2 rounded-full transition-all ${getScore5Color(value.score).replace('text-', 'bg-')}`}
                            style={{ width: `${(value.score / 5) * 100}%` }}
                          />
                        </div>
                        <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                          <span className="font-medium">判定依据：</span>
                          {value.basis}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 评价总结 */}
            <Card>
              <CardHeader>
                <CardTitle>评价总结</CardTitle>
              </CardHeader>
              <CardContent>
                {evaluation.ruleInfo && (
                  <div className="mb-4 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-900">
                    评分规则：{evaluation.ruleInfo.ruleName} / 版本：{evaluation.ruleInfo.ruleVersion}
                  </div>
                )}
                <p className="text-gray-700 leading-relaxed">{evaluation.summary}</p>
              </CardContent>
            </Card>

            {/* 优势 */}
            {!evaluation.isEliminated && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    主要优势
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {evaluation.strengths.map((strength, index) => (
                      <div key={`strength-${typeof strength === 'string' ? strength : (strength.title || '优势')}-${index}`} className="border border-green-200 rounded-lg p-4 bg-green-50">
                        <div className="flex items-start gap-2">
                          <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            {typeof strength === 'string' ? (
                              <p className="text-gray-700">{strength}</p>
                            ) : (
                              <div>
                                <h4 className="font-semibold text-gray-900 mb-2">{strength.title || '优势项'}</h4>
                                <p className="text-gray-700 text-sm mb-2">{strength.description || ''}</p>
                                {strength.evidence && (
                                  <div className="bg-green-100 rounded px-3 py-2">
                                    <span className="text-xs font-medium text-green-800">支撑证据：</span>
                                    <span className="text-xs text-green-700">{strength.evidence}</span>
                                  </div>
                                )}
                                {strength.application && (
                                  <div className="mt-2">
                                    <span className="text-xs font-medium text-gray-600">应用场景：</span>
                                    <span className="text-xs text-gray-700">{strength.application}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 改进建议 */}
            {!evaluation.isEliminated && evaluation.improvements && evaluation.improvements.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-amber-600" />
                    改进建议
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {evaluation.improvements.map((improvement, index: number) => (
                      isImprovementDetail(improvement) ? (
                        <div key={`improvement-${improvement.area || '改进项'}-${index}`} className="border border-amber-200 rounded-lg p-4 bg-amber-50">
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="font-semibold text-gray-900">{improvement.area || '改进项'}</h4>
                            {improvement.importance && (
                              <span className={`text-xs px-2 py-1 rounded ${
                                improvement.importance === '高' ? 'bg-red-100 text-red-700' :
                                improvement.importance === '中' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                重要性：{improvement.importance}
                              </span>
                            )}
                          </div>
                          {improvement.current && (
                            <div className="mb-2">
                              <span className="text-xs font-medium text-gray-600">当前表现：</span>
                              <p className="text-sm text-gray-700 mt-1">{improvement.current}</p>
                            </div>
                          )}
                          {improvement.suggestion && (
                            <div>
                              <span className="text-xs font-medium text-gray-600">改进建议：</span>
                              <p className="text-sm text-gray-700 mt-1">{improvement.suggestion}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div key={`improvement-${index}`} className="border border-amber-200 rounded-lg p-4 bg-amber-50 text-sm text-gray-700">
                          {improvement}
                        </div>
                      )
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 面试观察记录 */}
            {!evaluation.isEliminated && evaluation.observations && evaluation.observations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="h-5 w-5 text-blue-600" />
                    面试观察记录
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {evaluation.observations.map((observation, index: number) => (
                      isObservationDetail(observation) ? (
                        <div key={`observation-${observation.time || observation.category || '观察'}-${index}`} className="border-l-4 border-blue-400 pl-4">
                          <div className="flex items-center gap-2 mb-1">
                            {observation.time && (
                              <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
                                {observation.time}
                              </span>
                            )}
                            {observation.category && (
                              <span className="text-xs text-gray-500">{observation.category}</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-700">{observation.observation}</p>
                        </div>
                      ) : (
                        <div key={`observation-${index}`} className="border-l-4 border-blue-400 pl-4 text-sm text-gray-700">
                          {observation}
                        </div>
                      )
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 操作按钮 */}
            <div className="flex justify-end gap-4">
              <Button variant="outline" onClick={handleRestart}>
                开始新面试
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Bot className="h-8 w-8 text-blue-600" />
              全AI面试
            </h1>
            <p className="mt-2 text-gray-600">
              AI作为面试官，根据你的简历进行提问，你作为候选人回答问题，面试结束后生成智能评分报告
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => setShowHistory(true)}
              className="flex items-center gap-2 text-blue-600"
            >
              <History className="h-4 w-4" />
              查看历史记录 ({historyResults.length})
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push('/')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              返回导航栏
            </Button>
          </div>
        </div>

        {/* 面试通知 */}
        {historyResults.length > 0 && (
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-blue-900">
                  <Bell className="h-5 w-5" />
                  面试通知
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fetchHistoryResults()}
                  className="text-blue-600 hover:text-blue-700"
                >
                  刷新
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {historyResults.slice(0, 3).map((result) => (
                  <div
                    key={result.id}
                    className="flex items-center justify-between p-3 bg-white rounded-lg border border-blue-100"
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="font-medium text-gray-900">
                          {result.candidateName} 已经完成面试
                        </p>
                        <p className="text-sm text-gray-600">
                          岗位：{getPositionTitle(result.position)} | 时间：{new Date(result.completedAt).toLocaleString('zh-CN')}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewHistoryDetail(result.interviewId || String(result.id || ""))}
                      className="text-blue-600 border-blue-300 hover:bg-blue-50"
                    >
                      查看报告
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex justify-center mt-3">
                <Button
                  variant="link"
                  onClick={() => setShowHistory(true)}
                  className="text-blue-600"
                >
                  查看全部 {historyResults.length} 条历史记录 →
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!isStarted ? (
          <Card>
            <CardHeader>
              <CardTitle>开始全AI面试</CardTitle>
              <CardDescription>
                上传简历或输入简历内容，选择面试模式，AI将自动进行完整面试流程
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 候选人姓名 */}
              <div>
                <Label htmlFor="candidate-name" className="flex items-center gap-2">
                  候选人姓名 *
                  {isSearchingCandidate && (
                    <Loader2 className="h-3 w-3 animate-spin text-gray-500" />
                  )}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="candidate-name"
                    placeholder="输入候选人姓名后会自动匹配简历"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    onBlur={() => {
                      void searchCandidate(candidateName, { force: true });
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      void searchCandidate(candidateName, { force: true });
                    }}
                    disabled={isSearchingCandidate || !candidateName.trim()}
                  >
                    {isSearchingCandidate ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    搜索简历
                  </Button>
                </div>
              </div>

              {/* 简历上传 */}
              <div>
                <Label>简历内容 *</Label>
                <div className="mt-2 space-y-4">
                  {/* 拖拽上传区域 */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`relative border-2 border-dashed rounded-lg p-6 transition-all ${
                      isDragging
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center text-center space-y-3">
                      <div className={`p-4 rounded-full ${isDragging ? 'bg-blue-100' : 'bg-gray-100'}`}>
                        <Upload className={`h-8 w-8 ${isDragging ? 'text-blue-600' : 'text-gray-400'}`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {isDragging ? '松开鼠标上传简历' : '拖拽简历文件到此处'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          支持 PDF、Word、TXT 格式，最大 10MB
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span>或</span>
                        <div className="flex items-center gap-2">
                          <label
                            htmlFor="resume-file"
                            className="cursor-pointer text-blue-600 hover:text-blue-700 font-medium"
                          >
                            点击上传
                          </label>
                          <Input
                            id="resume-file"
                            type="file"
                            accept=".pdf,.doc,.docx,.txt"
                            onChange={handleFileUpload}
                            disabled={isLoading}
                            className="hidden"
                          />
                        </div>
                      </div>
                    </div>
                    {isLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                          <span className="text-sm text-gray-600">正在解析简历...</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 简历内容编辑区域 */}
                  <div className="relative">
                    <Textarea
                      placeholder="简历内容将在此处显示，也可以手动输入或粘贴..."
                      value={resumeText}
                      onChange={(e) => setResumeText(e.target.value)}
                      rows={12}
                    />
                    {(resumeFile || resumeFileName) && (
                      <Badge className="absolute top-2 right-2">
                        <FileText className="h-3 w-3 mr-1" />
                        {resumeFile?.name || resumeFileName}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* 面试模式 */}
              <div>
                <Label>选择面试模式 *</Label>
                <Tabs value={selectedMode} onValueChange={setSelectedMode} className="mt-4">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="junior">初级</TabsTrigger>
                    <TabsTrigger value="senior">中级</TabsTrigger>
                    <TabsTrigger value="expert">高级</TabsTrigger>
                  </TabsList>
                  <TabsContent value="junior" className="mt-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>初级岗位面试</CardTitle>
                        <CardDescription>针对1-3年经验候选人</CardDescription>
                      </CardHeader>
                    </Card>
                  </TabsContent>
                  <TabsContent value="senior" className="mt-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>中级岗位面试</CardTitle>
                        <CardDescription>针对3-5年经验候选人</CardDescription>
                      </CardHeader>
                    </Card>
                  </TabsContent>
                  <TabsContent value="expert" className="mt-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>高级岗位面试</CardTitle>
                        <CardDescription>针对5年以上经验候选人</CardDescription>
                      </CardHeader>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>

              {/* 岗位选择 */}
              <div>
                <Label htmlFor="position-select">选择岗位 *</Label>
                <Select value={selectedPosition} onValueChange={setSelectedPosition}>
                  <SelectTrigger id="position-select">
                    <SelectValue placeholder="请选择面试岗位" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePositions.map((pos) => (
                      <SelectItem key={pos.id} value={pos.id}>
                        {pos.title}
                        {pos.department ? ` - ${pos.department}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 生成面试链接 */}
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <FileText className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="flex-1 space-y-4">
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-1">发送面试链接</h4>
                        <p className="text-sm text-gray-600 mb-3">
                          生成面试链接发送给候选人，候选人可以通过链接直接进行AI面试
                        </p>
                      </div>

                      <div>
                        <Label htmlFor="interviewer-voice">
                          AI 面试官音色风格
                          {isSuperAdmin ? "（超级管理员可全局设置）" : "（跟随超级管理员全局设置）"}
                        </Label>
                        {isSuperAdmin ? (
                          <div className="mt-2 space-y-2">
                            <Select value={selectedInterviewerVoice} onValueChange={(value) => { void handleInterviewerVoiceChange(value); }}>
                              <SelectTrigger id="interviewer-voice">
                                <SelectValue placeholder="请选择 AI 面试官音色风格" />
                              </SelectTrigger>
                              <SelectContent>
                                {INTERVIEWER_VOICE_OPTIONS.map((voice) => (
                                  <SelectItem key={voice.id} value={voice.id}>
                                    {voice.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-gray-500">
                              {selectedInterviewerVoiceOption.description}。保存后会同步为其他账号创建 AI 面试链接时的默认音色。
                            </p>
                            {isSavingInterviewerVoice && (
                              <p className="text-xs text-blue-600 flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                正在同步全局音色...
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="mt-2 rounded-md border bg-white px-3 py-2">
                            <div className="text-sm font-medium text-gray-900">
                              {selectedInterviewerVoiceOption.label}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {selectedInterviewerVoiceOption.description}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* 面试时间选择 */}
                      <div>
                        <Label htmlFor="interview-time">面试时间</Label>
                        <Input
                          id="interview-time"
                          type="datetime-local"
                          value={interviewTime}
                          onChange={(e) => setInterviewTime(e.target.value)}
                          min={minInterviewTime}
                          className="mt-2"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          设置面试时间后，系统将在面试前15分钟自动提醒候选人
                        </p>
                      </div>

                      <Button
                        onClick={handleGenerateLink}
                        disabled={!candidateName.trim() || !selectedMode || !selectedPosition}
                        variant="outline"
                        className="w-full"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            生成中...
                          </>
                        ) : (
                          <>
                            <Link className="mr-2 h-5 w-5" />
                            生成面试链接
                          </>
                        )}
                      </Button>
                      {interviewLink && (
                        <div className="space-y-2 pt-2">
                          <div className="flex items-center gap-2 p-2 bg-white rounded border">
                            <input
                              ref={interviewLinkInputRef}
                              type="text"
                              value={interviewLink}
                              readOnly
                              className="flex-1 text-sm text-gray-600 bg-transparent outline-none"
                              onClick={() => interviewLinkInputRef.current?.select()}
                              onFocus={() => interviewLinkInputRef.current?.select()}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                void handleCopyInterviewLink();
                              }}
                            >
                              复制
                            </Button>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleSendEmail}
                              className="flex-1"
                            >
                              <Mail className="h-4 w-4 mr-1" />
                              发送邮件
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleSendSMS}
                              className="flex-1"
                            >
                              <MessageSquare className="h-4 w-4 mr-1" />
                              发送短信
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                void handleSendWeChat();
                              }}
                              className="flex-1"
                            >
                              <MessageCircle className="h-4 w-4 mr-1" />
                              发送微信
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 开始按钮 */}
              <Button
                size="lg"
                className="w-full"
                onClick={handleStartInterview}
                disabled={!resumeText.trim() || !candidateName.trim() || !selectedMode || !selectedPosition || isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    准备中...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-5 w-5" />
                    开始面试
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* 进度指示 */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-600">面试进度</span>
                    <span className="text-sm font-medium">
                      第 {currentRound} / {totalRounds} 轮
                    </span>
                  </div>
                  {/* 自动保存状态 */}
                  {autoSaveEnabled && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {lastAutoSaveTime ? (
                        <>
                          <Shield className="h-4 w-4 text-green-600" />
                          <span>已保存 {lastAutoSaveTime.toLocaleTimeString('zh-CN')}</span>
                        </>
                      ) : (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                          <span>保存中...</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${(currentRound / totalRounds) * 100}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* 录屏状态 */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isRecording ? (
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
                  {recordedUrl && !isRecording && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDownloadRecording}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      下载录屏
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 对话区域 */}
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
                  <div className="relative bg-gradient-to-br from-blue-900 to-blue-700 rounded-xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                      <div className="w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mb-4">
                        <Bot className="h-12 w-12" />
                      </div>
                      <div className="text-center">
                        <h3 className="font-semibold text-lg">AI面试官</h3>
                        <p className="text-sm text-blue-200">{selectedPositionTitle || selectedPosition}</p>
                      </div>
                      {/* 模拟AI说话动画 */}
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1">
                        <div className="w-2 h-4 bg-white/40 rounded-full animate-pulse" />
                        <div className="w-2 h-6 bg-white/60 rounded-full animate-pulse delay-100" />
                        <div className="w-2 h-3 bg-white/40 rounded-full animate-pulse delay-200" />
                      </div>
                    </div>
                  </div>

                  {/* 候选人视频 */}
                  <div className="relative bg-black rounded-xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    {!localStream && !hasError && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60">
                        <VideoOff className="h-12 w-12 mb-2" />
                        <p className="text-sm">摄像头未启动</p>
                      </div>
                    )}
                    {hasError && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-black/90">
                        <AlertCircle className="h-16 w-16 mb-4 text-red-500" />
                        <p className="text-lg font-semibold mb-2">摄像头或麦克风无法访问</p>
                        <p className="text-sm text-center text-white/70 px-8 mb-4">
                          请确保允许浏览器访问摄像头和麦克风，然后刷新页面重试。
                        </p>
                        <Button
                          onClick={() => window.location.reload()}
                          variant="outline"
                          className="bg-white/20 text-white border-white/30 hover:bg-white/30"
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          刷新页面
                        </Button>
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
                      <Badge className="bg-white/20 backdrop-blur-sm text-white border-0">
                        {candidateName} - 你
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="h-[500px] overflow-y-auto space-y-4 mb-4 p-4 bg-gray-50 rounded-lg">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${
                        message.role === "interviewer" ? "justify-start" : "justify-end"
                      }`}
                    >
                      {message.role === "interviewer" && (
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <Bot className="h-5 w-5 text-blue-600" />
                        </div>
                      )}
                      <div
                        className={`max-w-[70%] p-3 rounded-lg ${
                          message.role === "interviewer"
                            ? "bg-blue-600 text-white"
                            : "bg-white border"
                        }`}
                      >
                        <p className="text-sm">{message.content}</p>
                        <p className={`text-xs mt-1 ${
                          message.role === "interviewer" ? "text-blue-200" : "text-gray-500"
                        }`}>
                          {message.timestamp.toLocaleTimeString('zh-CN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      {message.role === "candidate" && (
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                          <User className="h-5 w-5 text-green-600" />
                        </div>
                      )}
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex gap-3 justify-start">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <Bot className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="bg-white border p-3 rounded-lg">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 用户回答输入 */}
                <div className="mt-4 space-y-3">
                  <Label htmlFor="user-answer">你的回答</Label>
                  <Textarea
                    id="user-answer"
                    placeholder="请输入你的回答..."
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    rows={4}
                    disabled={isLoading}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAnswerSubmit();
                      }
                    }}
                  />
                  <div className="flex gap-3">
                    <Button
                      onClick={handleAnswerSubmit}
                      disabled={isLoading || !userAnswer.trim()}
                      className="flex-1"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          回答中...
                        </>
                      ) : (
                        <>
                          <ArrowRight className="mr-2 h-5 w-5" />
                          提交回答
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={handleEndInterview}
                      disabled={isLoading}
                      variant="outline"
                      size="sm"
                      title="在特殊情况下提前结束面试"
                    >
                      提前结束
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500">
                    提示：按 Enter 快速提交，Shift+Enter 换行。面试将由AI面试官控制何时结束。
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* 历史记录对话框 */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              历史面试记录
            </DialogTitle>
            <DialogDescription>
              查看所有已完成的AI面试记录和评估报告
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {historyResults.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                暂无历史面试记录
              </div>
            ) : (
              historyResults.map((result) => (
                <Card key={result.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <CheckCircle className="h-5 w-5 text-green-600" />
                          <div>
                            <h3 className="font-semibold text-gray-900">{result.candidateName}</h3>
                            <p className="text-sm text-gray-600">
                              岗位：{getPositionTitle(result.position)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-600">
                          <span>
                            完成时间：{new Date(result.completedAt).toLocaleString('zh-CN')}
                          </span>
                          {result.evaluation && (
                            <>
                              <span className="text-blue-600">
                                总分：{result.evaluation.overallScore5}分
                              </span>
                              {getRecommendationBadge(result.evaluation.recommendation)}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewHistoryDetail(result.interviewId || String(result.id || ""))}
                        >
                          查看详情
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDeleteConfirm(result.interviewId || String(result.id || ""), result.candidateName)}
                          className="text-red-600 border-red-300 hover:bg-red-50"
                        >
                          删除
                        </Button>
                        {result.recordingUrl && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadHistoryRecording(result.recordingUrl || "", result.candidateName)}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            下载录屏
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 历史详情对话框 */}
      <Dialog open={viewingHistoryDetail} onOpenChange={setViewingHistoryDetail}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-600" />
                面试评估报告
              </div>
              <Button variant="ghost" size="sm" onClick={() => setViewingHistoryDetail(false)}>
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          {selectedHistoryResult && (
            <div className="space-y-6 mt-4">
              <div>
                <p className="text-sm text-gray-600">候选人：{selectedHistoryResult.candidateName}</p>
                <p className="text-sm text-gray-600">岗位：{getPositionTitle(selectedHistoryResult.position)}</p>
                <p className="text-sm text-gray-600">完成时间：{new Date(selectedHistoryResult.completedAt).toLocaleString('zh-CN')}</p>
                <p className="text-sm text-gray-600">
                  录屏状态：{selectedHistoryResult.recordingUrl && selectedHistoryResult.recordingUrl.trim().length > 0 ? (
                    <span className="text-green-600">已上传</span>
                  ) : (
                    <span className="text-red-600">未上传</span>
                  )}
                </p>
              </div>

              {/* 候选人状态监控 */}
              {selectedHistoryResult.candidateStatus && (
                <Card className={`border-2 ${
                  selectedHistoryResult.candidateStatus.overallStatus === 'cheating' 
                    ? 'border-red-300 bg-red-50' 
                    : selectedHistoryResult.candidateStatus.overallStatus === 'warning'
                    ? 'border-yellow-300 bg-yellow-50'
                    : 'border-green-300 bg-green-50'
                }`}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {selectedHistoryResult.candidateStatus.overallStatus === 'cheating' && (
                        <ShieldAlert className="h-5 w-5 text-red-600" />
                      )}
                      {selectedHistoryResult.candidateStatus.overallStatus === 'warning' && (
                        <AlertCircle className="h-5 w-5 text-yellow-600" />
                      )}
                      {selectedHistoryResult.candidateStatus.overallStatus === 'normal' && (
                        <Shield className="h-5 w-5 text-green-600" />
                      )}
                      候选人面试状态
                      <Badge variant="outline" className={`ml-2 ${
                        selectedHistoryResult.candidateStatus.overallStatus === 'cheating'
                          ? 'bg-red-100 text-red-700 border-red-300'
                          : selectedHistoryResult.candidateStatus.overallStatus === 'warning'
                          ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
                          : 'bg-green-100 text-green-700 border-green-300'
                      }`}>
                        {selectedHistoryResult.candidateStatus.overallStatus === 'cheating' && '⚠️ 可疑'}
                        {selectedHistoryResult.candidateStatus.overallStatus === 'warning' && '⚡ 异常'}
                        {selectedHistoryResult.candidateStatus.overallStatus === 'normal' && '✓ 正常'}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* 状态摘要 */}
                    <div className="mb-4">
                      <p className={`text-sm font-medium ${
                        selectedHistoryResult.candidateStatus.overallStatus === 'cheating'
                          ? 'text-red-700'
                          : selectedHistoryResult.candidateStatus.overallStatus === 'warning'
                          ? 'text-yellow-700'
                          : 'text-green-700'
                      }`}>
                        {selectedHistoryResult.candidateStatus.summary}
                      </p>
                    </div>

                    {/* 统计数据 */}
                    {selectedHistoryResult.candidateStatus.statistics && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="bg-white p-3 rounded-lg border">
                          <div className="text-xs text-gray-500 mb-1">总时长</div>
                          <div className="text-lg font-semibold text-gray-900">
                            {Math.floor(selectedHistoryResult.candidateStatus.statistics.totalDuration / 60)}分钟
                          </div>
                        </div>
                        <div className="bg-white p-3 rounded-lg border">
                          <div className="text-xs text-gray-500 mb-1">人脸检测率</div>
                          <div className={`text-lg font-semibold ${
                            selectedHistoryResult.candidateStatus.statistics.faceDetectionRate > 0.9
                              ? 'text-green-600'
                              : selectedHistoryResult.candidateStatus.statistics.faceDetectionRate > 0.7
                              ? 'text-yellow-600'
                              : 'text-red-600'
                          }`}>
                            {(selectedHistoryResult.candidateStatus.statistics.faceDetectionRate * 100).toFixed(1)}%
                          </div>
                        </div>
                        <div className="bg-white p-3 rounded-lg border">
                          <div className="text-xs text-gray-500 mb-1">人脸丢失次数</div>
                          <div className={`text-lg font-semibold ${
                            selectedHistoryResult.candidateStatus.statistics.faceLostCount === 0
                              ? 'text-green-600'
                              : selectedHistoryResult.candidateStatus.statistics.faceLostCount <= 3
                              ? 'text-yellow-600'
                              : 'text-red-600'
                          }`}>
                            {selectedHistoryResult.candidateStatus.statistics.faceLostCount}次
                          </div>
                        </div>
                        <div className="bg-white p-3 rounded-lg border">
                          <div className="text-xs text-gray-500 mb-1">多人出现次数</div>
                          <div className={`text-lg font-semibold ${
                            selectedHistoryResult.candidateStatus.statistics.multipleFaceCount === 0
                              ? 'text-green-600'
                              : 'text-red-600'
                          }`}>
                            {selectedHistoryResult.candidateStatus.statistics.multipleFaceCount}次
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 状态事件列表 */}
                    {selectedHistoryResult.candidateStatus.events && selectedHistoryResult.candidateStatus.events.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 mb-3">状态事件记录</h4>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {selectedHistoryResult.candidateStatus.events.map((event, index: number) => {
                            const faceScreenshot = event.evidence?.faceScreenshot;
                            const screenScreenshot = event.evidence?.screenScreenshot;

                            return (
                            <div
                              key={`${event.type}-${event.roundNumber || index}`}
                              className={`p-3 rounded-lg border ${
                                event.type === 'cheating'
                                  ? 'bg-red-50 border-red-200'
                                  : event.type === 'abnormal'
                                  ? 'bg-yellow-50 border-yellow-200'
                                  : 'bg-green-50 border-green-200'
                              }`}
                            >
                              <div className="flex items-start justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  {event.type === 'cheating' && (
                                    <ShieldAlert className="h-4 w-4 text-red-600" />
                                  )}
                                  {event.type === 'abnormal' && (
                                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                                  )}
                                  {event.type === 'normal' && (
                                    <Shield className="h-4 w-4 text-green-600" />
                                  )}
                                  <span className={`text-xs font-medium ${
                                    event.type === 'cheating'
                                      ? 'text-red-700'
                                      : event.type === 'abnormal'
                                      ? 'text-yellow-700'
                                      : 'text-green-700'
                                  }`}>
                                    {event.type === 'cheating' && '作弊警告'}
                                    {event.type === 'abnormal' && '异常提醒'}
                                    {event.type === 'normal' && '正常状态'}
                                  </span>
                                  {event.severity === 'high' && (
                                    <Badge variant="outline" className="text-xs bg-red-100 text-red-700 border-red-300">
                                      严重
                                    </Badge>
                                  )}
                                  {event.severity === 'medium' && (
                                    <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-700 border-yellow-300">
                                      中等
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-xs text-gray-400">
                                  第{event.roundNumber}轮
                                </span>
                              </div>
                              <p className="text-sm text-gray-700">{event.description}</p>
                              {/* 事件截图证据 */}
                              {(faceScreenshot || screenScreenshot) && (
                                <div className="mt-2 flex gap-2 flex-wrap">
                                  {faceScreenshot && (
                                    <div className="relative group">
                                      <img 
                                        src={faceScreenshot} 
                                        alt="人脸截图" 
                                        className="w-24 h-18 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity"
                                        onClick={() => window.open(faceScreenshot, '_blank')}
                                      />
                                      <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs py-0.5 text-center rounded-b">人脸</span>
                                    </div>
                                  )}
                                  {screenScreenshot && (
                                    <div className="relative group">
                                      <img 
                                        src={screenScreenshot} 
                                        alt="屏幕截图" 
                                        className="w-24 h-18 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity"
                                        onClick={() => window.open(screenScreenshot, '_blank')}
                                      />
                                      <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs py-0.5 text-center rounded-b">屏幕</span>
                                    </div>
                                  )}
                                </div>
                              )}
                              <div className="text-xs text-gray-400 mt-1">
                                {new Date(event.timestamp).toLocaleString('zh-CN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit'
                                })}
                              </div>
                            </div>
                          )})}
                        </div>
                      </div>
                    )}

                    {/* 监控截图列表 */}
                    {selectedHistoryResult.candidateStatus.screenshots && selectedHistoryResult.candidateStatus.screenshots.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                          <Camera className="h-4 w-4" />
                          监控截图 ({selectedHistoryResult.candidateStatus.screenshots.length}张)
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                          {selectedHistoryResult.candidateStatus.screenshots.map((screenshot, index: number) => (
                            <div key={index} className="relative group">
                              <div className="bg-gray-100 rounded-lg overflow-hidden border">
                                {screenshot.faceScreenshot ? (
                                  <img 
                                    src={screenshot.faceScreenshot} 
                                    alt={`截图 ${index + 1}`} 
                                    className="w-full h-20 object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                    onClick={() => {
                                      // 显示大图预览
                                      const newWindow = window.open('', '_blank');
                                      if (newWindow) {
                                        newWindow.document.write(`
                                          <html>
                                            <head><title>监控截图 ${index + 1}</title></head>
                                            <body style="margin:0;display:flex;flex-direction:column;align-items:center;background:#1a1a1a;min-height:100vh;">
                                              ${screenshot.faceScreenshot ? `<img src="${screenshot.faceScreenshot}" style="max-width:90%;max-height:45vh;margin:10px;" />` : ''}
                                              ${screenshot.screenScreenshot ? `<img src="${screenshot.screenScreenshot}" style="max-width:90%;max-height:45vh;margin:10px;" />` : ''}
                                              <div style="color:#888;font-size:12px;margin:10px;">
                                                时间: ${new Date(screenshot.timestamp).toLocaleString('zh-CN')}
                                                ${screenshot.description ? ` | ${screenshot.description}` : ''}
                                              </div>
                                            </body>
                                          </html>
                                        `);
                                        newWindow.document.close();
                                      }
                                    }}
                                  />
                                ) : (
                                  <div className="w-full h-20 bg-gray-200 flex items-center justify-center text-gray-400 text-xs">
                                    无截图
                                  </div>
                                )}
                                <div className="p-1.5 bg-gray-50 border-t">
                                  <div className="text-xs text-gray-500 truncate">
                                    {screenshot.abnormalType === 'periodic_check' ? '定时截图' : 
                                     screenshot.abnormalType ? `异常: ${screenshot.abnormalType}` : 
                                     screenshot.description || '监控截图'}
                                  </div>
                                  <div className="text-xs text-gray-400">
                                    {new Date(screenshot.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* 评估报告 */}
              {selectedHistoryResult.evaluation && (
                <>
                  {/* 淘汰状态 */}
                  {selectedHistoryResult.evaluation.isEliminated && (
                    <Card className="border-red-200 bg-red-50">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-red-600">
                          <AlertCircle className="h-5 w-5" />
                          淘汰判定
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-red-700 font-medium">{selectedHistoryResult.evaluation.eliminationReason}</p>
                      </CardContent>
                    </Card>
                  )}

                  {/* 总体评分 */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>综合评分</CardTitle>
                        {getRecommendationBadge(selectedHistoryResult.evaluation.recommendation)}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {!selectedHistoryResult.evaluation.isEliminated && (
                        <div className="text-center p-4 border rounded-lg">
                          <div className="text-sm text-gray-600 mb-2">5分制总分</div>
                          <div className="text-5xl font-bold text-blue-600">
                            {selectedHistoryResult.evaluation.overallScore5}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">满分5分</div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* 分类评分 */}
                  {!selectedHistoryResult.evaluation.isEliminated && (
                    <Card>
                      <CardHeader>
                        <CardTitle>分类评分</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {Object.entries(selectedHistoryResult.evaluation.categoryScores).map(([key, value]: [string, { score: number; basis: string }]) => (
                            <div key={key} className="p-4 border rounded-lg">
                              <div className="flex items-center justify-between mb-2">
                                <div className="font-medium text-gray-900">
                                  {getCategoryLabel(key, selectedHistoryResult.evaluation.categoryLabels)}
                                </div>
                                <div className="text-right">
                                  <div className={`text-2xl font-bold ${getScore5Color(value.score)}`}>
                                    {value.score}分
                                  </div>
                                  {selectedHistoryResult.evaluation.dimensionResults?.find((item) => item.code === key) && (
                                    <div className="text-xs text-gray-500">
                                      权重 {(selectedHistoryResult.evaluation.dimensionResults.find((item) => item.code === key)?.weight || 0) * 100}% /
                                      百分制 {selectedHistoryResult.evaluation.dimensionResults.find((item) => item.code === key)?.score100} 分
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                                <div
                                  className={`h-2 rounded-full transition-all ${getScore5Color(value.score).replace('text-', 'bg-')}`}
                                  style={{ width: `${(value.score / 5) * 100}%` }}
                                />
                              </div>
                              <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                                <span className="font-medium">判定依据：</span>
                                {value.basis}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* 评价总结 */}
                    <Card>
                      <CardHeader>
                        <CardTitle>评价总结</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {selectedHistoryResult.evaluation.ruleInfo && (
                          <div className="mb-4 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-900">
                            评分规则：{selectedHistoryResult.evaluation.ruleInfo.ruleName} / 版本：{selectedHistoryResult.evaluation.ruleInfo.ruleVersion}
                          </div>
                        )}
                        <p className="text-gray-700 leading-relaxed">{selectedHistoryResult.evaluation.summary}</p>
                      </CardContent>
                    </Card>

                  {/* 优势 */}
                  {!selectedHistoryResult.evaluation.isEliminated && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-green-600" />
                          主要优势
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {selectedHistoryResult.evaluation.strengths.map((strength, index: number) => (
                            <div key={`history-strength-${typeof strength === 'string' ? strength : (strength.title || '优势')}-${index}`} className="border border-green-200 rounded-lg p-4 bg-green-50">
                              <div className="flex items-start gap-2">
                                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                                <div className="flex-1">
                                  {!isStrengthDetail(strength) ? (
                                    <p className="text-gray-700">{strength}</p>
                                  ) : (
                                    <div>
                                      <h4 className="font-semibold text-gray-900 mb-2">{strength.title || '优势项'}</h4>
                                      <p className="text-gray-700 text-sm mb-2">{strength.description || ''}</p>
                                      {strength.evidence && (
                                        <div className="bg-green-100 rounded px-3 py-2">
                                          <span className="text-xs font-medium text-green-800">支撑证据：</span>
                                          <span className="text-xs text-green-700">{strength.evidence}</span>
                                        </div>
                                      )}
                                      {strength.application && (
                                        <div className="mt-2">
                                          <span className="text-xs font-medium text-gray-600">应用场景：</span>
                                          <span className="text-xs text-gray-700">{strength.application}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* 改进建议 */}
                  {!selectedHistoryResult.evaluation.isEliminated && 
                   selectedHistoryResult.evaluation.improvements && 
                   selectedHistoryResult.evaluation.improvements.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Lightbulb className="h-5 w-5 text-amber-600" />
                          改进建议
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {selectedHistoryResult.evaluation.improvements.map((improvement, index: number) => (
                            isImprovementDetail(improvement) ? (
                              <div key={`history-improvement-${improvement.area || '改进项'}-${index}`} className="border border-amber-200 rounded-lg p-4 bg-amber-50">
                                <div className="flex items-start justify-between mb-2">
                                  <h4 className="font-semibold text-gray-900">{improvement.area || '改进项'}</h4>
                                  {improvement.importance && (
                                    <span className={`text-xs px-2 py-1 rounded ${
                                      improvement.importance === '高' ? 'bg-red-100 text-red-700' :
                                      improvement.importance === '中' ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-gray-100 text-gray-700'
                                    }`}>
                                      重要性：{improvement.importance}
                                    </span>
                                  )}
                                </div>
                                {improvement.current && (
                                  <div className="mb-2">
                                    <span className="text-xs font-medium text-gray-600">当前表现：</span>
                                    <p className="text-sm text-gray-700 mt-1">{improvement.current}</p>
                                  </div>
                                )}
                                {improvement.suggestion && (
                                  <div>
                                    <span className="text-xs font-medium text-gray-600">改进建议：</span>
                                    <p className="text-sm text-gray-700 mt-1">{improvement.suggestion}</p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div key={`history-improvement-${index}`} className="border border-amber-200 rounded-lg p-4 bg-amber-50 text-sm text-gray-700">
                                {improvement}
                              </div>
                            )
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* 面试观察记录 */}
                  {!selectedHistoryResult.evaluation.isEliminated && 
                   selectedHistoryResult.evaluation.observations && 
                   selectedHistoryResult.evaluation.observations.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Eye className="h-5 w-5 text-blue-600" />
                          面试观察记录
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {selectedHistoryResult.evaluation.observations.map((observation, index: number) => (
                            isObservationDetail(observation) ? (
                              <div key={`history-observation-${observation.time || observation.category || '观察'}-${index}`} className="border-l-4 border-blue-400 pl-4">
                                <div className="flex items-center gap-2 mb-1">
                                  {observation.time && (
                                    <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
                                      {observation.time}
                                    </span>
                                  )}
                                  {observation.category && (
                                    <span className="text-xs text-gray-500">{observation.category}</span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-700">{observation.observation}</p>
                              </div>
                            ) : (
                              <div key={`history-observation-${index}`} className="border-l-4 border-blue-400 pl-4 text-sm text-gray-700">
                                {observation}
                              </div>
                            )
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* 面试问答记录 */}
                  {selectedHistoryResult.qaHistory && selectedHistoryResult.qaHistory.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <MessageSquare className="h-5 w-5 text-blue-600" />
                          面试问答记录
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4 max-h-[600px] overflow-y-auto">
                          {selectedHistoryResult.qaHistory.map((qa: QaHistoryItem, index: number) => {
                            const isInterviewer = qa.role === "interviewer";
                            const isQuestion = qa.type === "question" || qa.type === "candidate_question";
                            return (
                              <div
                                key={qa.id || index}
                                className={`flex gap-3 ${isInterviewer ? "flex-row" : "flex-row-reverse"}`}
                              >
                                <div
                                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                                    isInterviewer
                                      ? "bg-blue-100 text-blue-600"
                                      : "bg-green-100 text-green-600"
                                  }`}
                                >
                                  {isInterviewer ? <Bot className="h-5 w-5" /> : <User className="h-5 w-5" />}
                                </div>
                                <div
                                  className={`flex-1 max-w-[80%] ${
                                    isInterviewer ? "bg-gray-100" : "bg-blue-50"
                                  } rounded-2xl px-4 py-3`}
                                >
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-medium text-gray-900">
                                      {isInterviewer ? "AI面试官" : "候选人"}
                                    </span>
                                    {qa.type === "candidate_question" && (
                                      <Badge variant="outline" className="text-xs">
                                        提问
                                      </Badge>
                                    )}
                                    {qa.type === "question" && (
                                      <Badge variant="outline" className="text-xs">
                                        问题
                                      </Badge>
                                    )}
                                    {qa.type === "answer" && (
                                      <Badge variant="outline" className="text-xs">
                                        回答
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                                    {qa.content}
                                  </p>
                                  <div className="text-xs text-gray-400 mt-2">
                                    {new Date(qa.timestamp).toLocaleString('zh-CN', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      second: '2-digit'
                                    })}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* 操作按钮 */}
                  <div className="flex justify-end gap-4">
                    <Button
                      variant="outline"
                      onClick={() => handleDownloadReport(selectedHistoryResult)}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      下载报告
                    </Button>
                    {selectedHistoryResult.recordingUrl && (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => handleViewRecording(selectedHistoryResult.recordingUrl || "", selectedHistoryResult.candidateName)}
                        >
                          <Video className="mr-2 h-4 w-4" />
                          查看录屏
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleDownloadHistoryRecording(selectedHistoryResult.recordingUrl || "", selectedHistoryResult.candidateName)}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          下载录屏
                        </Button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              确认删除
            </DialogTitle>
            <DialogDescription>
              删除后无法恢复，确定要删除这条面试记录吗？
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteConfirm(false);
                setDeletingId(null);
              }}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteResult}
            >
              确认删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 录屏播放器对话框 */}
      <Dialog open={showRecordingPlayer} onOpenChange={setShowRecordingPlayer}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Video className="h-5 w-5 text-blue-600" />
                面试录屏
              </div>
              <Button variant="ghost" size="sm" onClick={handleCloseRecordingPlayer}>
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
            <DialogDescription>
              {selectedHistoryResult?.candidateName} - {selectedHistoryResult?.completedAt
                ? new Date(selectedHistoryResult.completedAt).toLocaleString('zh-CN')
                : '未知时间'}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <div className="bg-black rounded-xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
              <video
                ref={recordingVideoRef}
                controls
                autoPlay
                className="w-full h-full"
              >
                您的浏览器不支持视频播放
              </video>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  if (selectedHistoryResult?.recordingUrl && selectedHistoryResult?.candidateName) {
                    handleDownloadHistoryRecording(selectedHistoryResult.recordingUrl, selectedHistoryResult.candidateName);
                  }
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                下载录屏
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// 包装器组件，用于 Suspense 边界
export default function FullAiInterviewPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <FullAiInterviewPage />
    </Suspense>
  );
}
