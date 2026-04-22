"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef, useMemo, useCallback, memo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, Eye, FileText, Calendar, Phone, Mail, Upload, Loader2, Download, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Edit, User, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-provider";
import { ClientApiError, fetchClientJson, fetchClientJsonCached } from "@/lib/client-api";
import {
  DEFAULT_CANDIDATE_MAJOR_OPTIONS,
  dedupeCandidateMajorOptions,
  normalizeCandidateMajorOption,
} from "@/lib/candidate-major-library";
import type { PositionVetoCheck } from "@/lib/position-veto-rules";
import {
  extractContactInfoFromText,
  extractNameFromResumeFileName,
  normalizeResumeEmail,
  normalizeResumeName,
  normalizeResumePhone,
} from "@/lib/resume-contact-info";
import { sync } from "@/lib/sync";

const BatchResumeUpload = dynamic(
  () => import("@/components/batch-resume-upload").then((mod) => mod.BatchResumeUpload),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="h-32 animate-pulse rounded-lg bg-muted" />
      </div>
    ),
  }
);

interface ResumeExtractResponse {
  success: boolean;
  content?: string;
  detectedInfo?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  error?: string;
}

interface ResumeBasicInfo {
  name?: string;
  phone?: string;
  email?: string;
  age?: number | null;
  gender?: string;
}

interface ResumeParseData {
  basicInfo?: ResumeBasicInfo;
  workExperience?: ResumeWorkExperience[];
  education?: ResumeEducation;
  skills?: ResumeSkill[];
  certificates?: ResumeCertificate[];
  projects?: ResumeProject[];
  conflictMarkers?: ResumeConflictMarker[];
  matchAnalysis?: ResumeMatchAnalysis;
  [key: string]: unknown;
}

interface ResumeParseResponse {
  success: boolean;
  data?: ResumeParseData;
  error?: string;
}

type CandidateStatus = "pending" | "interviewing" | "passed" | "rejected";
type CandidateInterviewStage =
  | "pending"
  | "initial"
  | "second"
  | "final"
  | "offer"
  | "hired"
  | "rejected"
  | "rejectedOffer";
type CandidateInterviewResult = "pass" | "fail" | "pending" | null;

interface ResumeWorkExperience {
  company?: string;
  position?: string;
  duration?: string;
  responsibilities?: string[];
  achievements?: string[];
}

interface ResumeEducation {
  school?: string;
  major?: string;
  degree?: string;
  gpa?: string;
  scholarships?: string[];
}

interface ResumeSkill {
  name?: string;
  level?: string;
}

interface ResumeCertificate {
  name?: string;
  level?: string;
  date?: string;
}

interface ResumeProject {
  name?: string;
  duration?: string;
  role?: string;
  description?: string;
  tasks?: string[];
  results?: string[];
  technologies?: string[];
}

interface ResumeConflictMarker {
  type?: string;
  description?: string;
}

interface ResumeMatchedItem {
  requirement?: string;
  evidence?: string;
  matchLevel?: string;
}

interface ResumeUnmatchedItem {
  requirement?: string;
  gap?: string;
  importance?: string;
}

type ResumeStrength = string | {
  area?: string;
  description?: string;
  evidence?: string;
};

type ResumeWeakness = string | {
  area?: string;
  description?: string;
  gap?: string;
};

interface ResumeJobAspectAnalysisItem {
  aspect?: string;
  conclusion?: string;
  evidence?: string;
}

interface ResumeMatchAnalysis {
  matchScore?: number;
  matchedItems?: ResumeMatchedItem[];
  unmatchedItems?: ResumeUnmatchedItem[];
  strengths?: ResumeStrength[];
  weaknesses?: ResumeWeakness[];
  jobAspectAnalysis?: ResumeJobAspectAnalysisItem[];
  vetoCheck?: PositionVetoCheck;
}

interface CandidateResumeParsedData {
  content?: string;
  parsedData?: ResumeParseData | null;
  parsedAt?: string;
  error?: string;
  errorAt?: string;
  parseStatus?: "processing" | "completed" | "failed";
  processingAt?: string;
}

interface Candidate {
  id: number;
  name: string;
  gender: string;
  school: string;
  major: string;
  education: string;
  phone: string;
  email: string;
  position: string;
  status: CandidateStatus;
  source: string;
  createdAt: string;
  resumeUploaded: boolean;
  resumeFileName: string;
  resumeFileKey: string;
  resumeDownloadUrl: string;
  resumeParsedData: CandidateResumeParsedData | null;
  interviewStage: CandidateInterviewStage;
  initialInterviewPassed: CandidateInterviewResult;
  secondInterviewPassed: CandidateInterviewResult;
  finalInterviewPassed: CandidateInterviewResult;
  isHired: boolean;
  initialInterviewTime: string | null;
  secondInterviewTime: string | null;
  finalInterviewTime: string | null;
  initialInterviewEvaluation?: string | null;
  secondInterviewEvaluation?: string | null;
  finalInterviewEvaluation?: string | null;
  createdById?: string | null;
  createdByName?: string | null;
  createdByUsername?: string | null;
  resumeUploadedAt?: string;
}

function parseCandidateCreatedAt(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const normalized = value.includes("T") ? value : `${value}T00:00:00`;
  const fallbackParsed = new Date(normalized);
  return Number.isNaN(fallbackParsed.getTime()) ? null : fallbackParsed;
}

function getCandidateCreatedTimestamp(candidate: Candidate): number {
  return parseCandidateCreatedAt(candidate.createdAt)?.getTime() ?? 0;
}

function compareCandidatesByCreatedAtDesc(a: Candidate, b: Candidate): number {
  const timestampDiff = getCandidateCreatedTimestamp(b) - getCandidateCreatedTimestamp(a);
  if (timestampDiff !== 0) {
    return timestampDiff;
  }

  return b.id - a.id;
}

interface NewCandidateFormState {
  name: string;
  gender: string;
  school: string;
  major: string;
  education: string;
  phone: string;
  email: string;
  position: string;
  source: string;
  resumeFile: File | null;
  resumeFileName: string;
  resumeFileKey: string;
  resumeDownloadUrl: string;
  resumeParsedData: CandidateResumeParsedData | null;
  resumeUploadedAt: string;
}

interface StoredNewCandidateDraft {
  form: Omit<NewCandidateFormState, "resumeFile">;
  isDialogOpen: boolean;
  debugExtractedText: string;
  showDebugInfo: boolean;
}

interface ResumeUploadResponse {
  success: boolean;
  fileKey: string;
  fileName: string;
  downloadUrl: string;
  error?: string;
}

interface PositionOption {
  id?: number;
  title: string;
  department?: string;
  jobDescription?: string;
  education?: string;
  experience?: string;
  coreRequirements?: string[];
  softSkills?: string[];
  interviewerPreferences?: {
    focusAreas?: string[];
    questionStyle?: string;
    additionalNotes?: string;
  } | null;
  vetoRules?: Array<{
    id: string;
    ruleName: string;
    description: string;
    keywords: string[];
    enabled: boolean;
  }>;
}

function findPositionOption(
  positions: PositionOption[],
  value: string | number | null | undefined
): PositionOption | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = String(value).trim();
  if (!normalizedValue) {
    return null;
  }

  return (
    positions.find((position) => String(position.id) === normalizedValue) ||
    positions.find((position) => position.title === normalizedValue) ||
    positions.find((position) => position.title.trim().toLowerCase() === normalizedValue.toLowerCase()) ||
    null
  );
}

interface CandidateApiRecord {
  id: number;
  name: string;
  gender?: string | null;
  school?: string | null;
  major?: string | null;
  education?: string | null;
  phone?: string | null;
  email?: string | null;
  position?: string | null;
  status?: string | null;
  source?: string | null;
  resumeUploaded?: boolean | null;
  resumeFileName?: string | null;
  resumeFileKey?: string | null;
  resumeDownloadUrl?: string | null;
  resumeParsedData?: CandidateResumeParsedData | null;
  resumeUploadedAt?: string | null;
  interviewStage?: CandidateInterviewStage | null;
  initialInterviewPassed?: CandidateInterviewResult;
  secondInterviewPassed?: CandidateInterviewResult;
  finalInterviewPassed?: CandidateInterviewResult;
  isHired?: boolean | null;
  initialInterviewTime?: string | null;
  secondInterviewTime?: string | null;
  finalInterviewTime?: string | null;
  initialInterviewEvaluation?: string | null;
  secondInterviewEvaluation?: string | null;
  finalInterviewEvaluation?: string | null;
  createdAt?: string;
  createdById?: string | null;
  createdByName?: string | null;
  createdByUsername?: string | null;
}

interface CandidateApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

interface ImportedCandidateRecord {
  sourceResultId: string;
  name: string;
  gender?: string;
  school?: string;
  major?: string;
  education?: string;
  phone: string;
  email: string;
  position: string;
  fileName: string;
  fileKey: string;
  downloadUrl: string;
  parsedData?: ResumeParseData;
  extractedContent?: string;
}

type StoredCandidate = Omit<
  Partial<Candidate>,
  "resumeParsedData" | "initialInterviewPassed" | "secondInterviewPassed" | "finalInterviewPassed"
> &
  Pick<Candidate, "id" | "name"> & {
    resumeParsedData?: CandidateResumeParsedData | ResumeParseData | null;
    initialInterviewPassed?: CandidateInterviewResult | boolean;
    secondInterviewPassed?: CandidateInterviewResult | boolean;
    finalInterviewPassed?: CandidateInterviewResult | boolean;
  };

const normalizeCandidateName = (value: string | undefined): string => normalizeResumeName(value);

const normalizeCandidatePhone = (value: string | undefined): string => normalizeResumePhone(value);

const normalizeCandidateEmail = (value: string | undefined): string => normalizeResumeEmail(value);
const NEW_CANDIDATE_DRAFT_STORAGE_KEY = "candidate_add_dialog_draft";

function extractCandidateStructuredFields(
  parsedData: ResumeParseData | null | undefined
): Pick<NewCandidateFormState, "gender" | "school" | "major" | "education"> {
  return {
    gender: normalizeGender(parsedData?.basicInfo?.gender),
    school: typeof parsedData?.education?.school === "string" ? parsedData.education.school.trim() : "",
    major: typeof parsedData?.education?.major === "string" ? parsedData.education.major.trim() : "",
    education: normalizeEducationLevel(parsedData?.education?.degree),
  };
}

function applyImportedStructuredFieldsToParsedData(
  parsedData: ResumeParseData | undefined,
  fields: {
    name: string;
    phone: string;
    email: string;
    gender: string;
    school: string;
    major: string;
    education: string;
  }
): ResumeParseData | undefined {
  if (!parsedData) {
    return parsedData;
  }

  return {
    ...parsedData,
    basicInfo: {
      ...(parsedData.basicInfo || {}),
      name: fields.name || parsedData.basicInfo?.name || "",
      phone: fields.phone || parsedData.basicInfo?.phone || "",
      email: fields.email || parsedData.basicInfo?.email || "",
      gender: fields.gender || parsedData.basicInfo?.gender || "",
    },
    education: {
      ...(parsedData.education || {}),
      school: fields.school || parsedData.education?.school || "",
      major: fields.major || parsedData.education?.major || "",
      degree: fields.education || parsedData.education?.degree || "",
    },
  };
}

const isStrengthObject = (value: ResumeStrength): value is Exclude<ResumeStrength, string> =>
  typeof value !== "string";

const isWeaknessObject = (value: ResumeWeakness): value is Exclude<ResumeWeakness, string> =>
  typeof value !== "string";

const isLegacyResumeParseData = (
  value: CandidateResumeParsedData | ResumeParseData
): value is ResumeParseData =>
  "basicInfo" in value || "workExperience" in value || "education" in value || "skills" in value;

const normalizeCandidateResumeParsedData = (
  value: CandidateResumeParsedData | ResumeParseData | string | null | undefined
): CandidateResumeParsedData | null => {
  if (!value) {
    return null;
  }

  let normalizedValue: unknown = value;

  if (typeof normalizedValue === "string") {
    try {
      normalizedValue = JSON.parse(normalizedValue);
    } catch {
      return null;
    }
  }

  if (!normalizedValue || typeof normalizedValue !== "object" || Array.isArray(normalizedValue)) {
    return null;
  }

  if (isLegacyResumeParseData(normalizedValue as CandidateResumeParsedData | ResumeParseData)) {
    return {
      parsedData: normalizedValue as ResumeParseData,
    };
  }

  return normalizedValue as CandidateResumeParsedData;
};

const hasDetailedResumeResult = (
  resumeParsedData: CandidateResumeParsedData | null | undefined,
  requireMatchAnalysis: boolean = false
): boolean => {
  if (!resumeParsedData || resumeParsedData.error || resumeParsedData.parseStatus === "processing") {
    return false;
  }

  if (requireMatchAnalysis) {
    const matchAnalysis = resumeParsedData.parsedData?.matchAnalysis;
    const hasMatchAnalysis = Boolean(
      matchAnalysis &&
        (
          typeof matchAnalysis.matchScore === "number" ||
          (matchAnalysis.matchedItems?.length ?? 0) > 0 ||
          (matchAnalysis.unmatchedItems?.length ?? 0) > 0 ||
          (matchAnalysis.strengths?.length ?? 0) > 0 ||
          (matchAnalysis.weaknesses?.length ?? 0) > 0 ||
          (matchAnalysis.jobAspectAnalysis?.length ?? 0) > 0
        )
    );

    if (!hasMatchAnalysis) {
      return false;
    }
  }

  if (resumeParsedData.parseStatus === "completed") {
    return true;
  }

  if (resumeParsedData.content?.trim()) {
    return true;
  }

  return Boolean(resumeParsedData.parsedData);
};

const normalizeStoredInterviewResult = (
  value: CandidateInterviewResult | boolean | undefined
): CandidateInterviewResult => {
  if (value === true) {
    return "pass";
  }

  if (value === false) {
    return "fail";
  }

  return value === "pending" || value === "pass" || value === "fail" ? value : null;
};

const mergeDetectedContactInfo = (fileName: string, text: string, parsedData?: ResumeParseData) => {
  const textContactInfo = extractContactInfoFromText(text, { fileName });
  const parsedBasicInfo = parsedData?.basicInfo;

  return {
    name:
      normalizeCandidateName(parsedBasicInfo?.name) ||
      textContactInfo.name ||
      extractNameFromResumeFileName(fileName),
    phone:
      normalizeCandidatePhone(parsedBasicInfo?.phone) ||
      textContactInfo.phone,
    email:
      normalizeCandidateEmail(parsedBasicInfo?.email) ||
      textContactInfo.email,
  };
};

// 模拟候选人数据
const mockCandidates: Candidate[] = [
  {
    id: 1,
    name: "张三",
    gender: "",
    school: "",
    major: "",
    education: "",
    phone: "138****5678",
    email: "zhangsan@example.com",
    position: "Java开发工程师",
    status: "pending",
    source: "Boss直聘",
    createdAt: "2024-01-20",
    resumeUploaded: true,
    resumeFileName: "张三_简历.pdf",
    resumeFileKey: "",
    resumeDownloadUrl: "",
    // 简历解析数据
    resumeParsedData: null,
    // 面试流程状态
    interviewStage: "pending", // pending: 待处理, initial: 待初试, second: 待复试, final: 待终试, offer: 待入职, hired: 已入职, rejected: 已拒绝
    initialInterviewPassed: null as "pass" | "fail" | "pending" | null, // null: 未面试, 'pass': 通过, 'fail': 未通过, 'pending': 待定
    secondInterviewPassed: null as "pass" | "fail" | "pending" | null,
    finalInterviewPassed: null as "pass" | "fail" | "pending" | null,
    isHired: false,
    // 面试时间
    initialInterviewTime: null as string | null, // ISO 格式的时间字符串
    secondInterviewTime: null as string | null,
    finalInterviewTime: null as string | null,
    // 面试官评价
    initialInterviewEvaluation: null as string | null, // 初试评价
    secondInterviewEvaluation: null as string | null, // 复试评价
    finalInterviewEvaluation: null as string | null, // 终试评价
    // 创建者信息（全域共享 + 创建者专属编辑权限）
    createdById: null as string | null,
    createdByName: null as string | null,
    createdByUsername: null as string | null,
  },
  {
    id: 2,
    name: "李四",
    gender: "",
    school: "",
    major: "",
    education: "",
    phone: "139****6789",
    email: "lisi@example.com",
    position: "前端开发工程师",
    status: "interviewing",
    source: "猎聘",
    createdAt: "2024-01-18",
    resumeUploaded: true,
    resumeFileName: "李四_简历.pdf",
    resumeFileKey: "",
    resumeDownloadUrl: "",
    resumeParsedData: null,
    interviewStage: "initial",
    initialInterviewPassed: null as "pass" | "fail" | "pending" | null,
    secondInterviewPassed: null as "pass" | "fail" | "pending" | null,
    finalInterviewPassed: null as "pass" | "fail" | "pending" | null,
    isHired: false,
    initialInterviewTime: null as string | null,
    secondInterviewTime: null as string | null,
    finalInterviewTime: null as string | null,
  },
  {
    id: 3,
    name: "王五",
    gender: "",
    school: "",
    major: "",
    education: "",
    phone: "137****7890",
    email: "wangwu@example.com",
    position: "产品经理",
    status: "passed",
    source: "拉勾网",
    createdAt: "2024-01-15",
    resumeUploaded: true,
    resumeFileName: "王五_简历.pdf",
    resumeFileKey: "",
    resumeDownloadUrl: "",
    resumeParsedData: null,
    interviewStage: "second",
    initialInterviewPassed: "pass" as const,
    secondInterviewPassed: null as "pass" | "fail" | "pending" | null,
    finalInterviewPassed: null as "pass" | "fail" | "pending" | null,
    isHired: false,
    initialInterviewTime: null as string | null,
    secondInterviewTime: null as string | null,
    finalInterviewTime: null as string | null,
  },
  {
    id: 4,
    name: "赵六",
    gender: "",
    school: "",
    major: "",
    education: "",
    phone: "136****8901",
    email: "zhaoliu@example.com",
    position: "UI设计师",
    status: "rejected",
    source: "智联招聘",
    createdAt: "2024-01-12",
    resumeUploaded: true,
    resumeFileName: "赵六_简历.pdf",
    resumeFileKey: "",
    resumeDownloadUrl: "",
    resumeParsedData: null,
    interviewStage: "rejected",
    initialInterviewPassed: "fail" as const,
    secondInterviewPassed: null as "pass" | "fail" | "pending" | null,
    finalInterviewPassed: null as "pass" | "fail" | "pending" | null,
    isHired: false,
    initialInterviewTime: null as string | null,
    secondInterviewTime: null as string | null,
    finalInterviewTime: null as string | null,
  },
];

// 从 localStorage 加载数据
const loadCandidatesFromStorage = (): Candidate[] => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('candidates');
    if (stored) {
      const data = JSON.parse(stored) as StoredCandidate[];
      console.log('[候选人管理] 从 localStorage 加载数据:', {
        count: data.length,
        sample: data.map((c) => ({
          id: c.id,
          name: c.name,
          initialInterviewTime: c.initialInterviewTime,
          secondInterviewTime: c.secondInterviewTime,
          finalInterviewTime: c.finalInterviewTime,
          initialInterviewEvaluation: c.initialInterviewEvaluation,
          secondInterviewEvaluation: c.secondInterviewEvaluation,
          finalInterviewEvaluation: c.finalInterviewEvaluation
        }))
      });
      // 数据迁移：为老数据添加面试流程字段和简历解析数据字段
      const migrated: Candidate[] = data.map((c) => {
        const migratedParsedData = normalizeCandidateResumeParsedData(c.resumeParsedData || null);
        const extractedStructuredFields = extractCandidateStructuredFields(migratedParsedData?.parsedData);

        return {
          ...c,
          gender: c.gender || extractedStructuredFields.gender || "",
          school: c.school || extractedStructuredFields.school || "",
          major: c.major || extractedStructuredFields.major || "",
          education: c.education || extractedStructuredFields.education || "",
          phone: c.phone || "",
          email: c.email || "",
          position: c.position || "",
          status: c.status || "pending",
          source: c.source || "其他",
          createdAt: c.createdAt || new Date().toISOString().split('T')[0],
          resumeUploaded: c.resumeUploaded || false,
          // 确保面试流程字段存在
          interviewStage: c.interviewStage || "pending",
          // 数据迁移：将 boolean 类型转换为 string 类型
          initialInterviewPassed: normalizeStoredInterviewResult(c.initialInterviewPassed),
          secondInterviewPassed: normalizeStoredInterviewResult(c.secondInterviewPassed),
          finalInterviewPassed: normalizeStoredInterviewResult(c.finalInterviewPassed),
          isHired: c.isHired || false,
          // 确保简历字段存在
          resumeFileName: c.resumeFileName || "",
          resumeFileKey: c.resumeFileKey || "",
          resumeDownloadUrl: c.resumeDownloadUrl || "",
          // 使用迁移后的简历解析数据
          resumeParsedData: migratedParsedData,
          // 确保面试时间字段存在
          initialInterviewTime: c.initialInterviewTime || null,
          secondInterviewTime: c.secondInterviewTime || null,
          finalInterviewTime: c.finalInterviewTime || null,
          // 确保面试官评价字段存在
          initialInterviewEvaluation: c.initialInterviewEvaluation || null,
          secondInterviewEvaluation: c.secondInterviewEvaluation || null,
          finalInterviewEvaluation: c.finalInterviewEvaluation || null,
          // 创建者信息字段迁移
          createdById: c.createdById || null,
          createdByName: c.createdByName || null,
          createdByUsername: c.createdByUsername || null,
        };
      });
      console.log('[候选人管理] 数据迁移完成:', {
        sample: migrated.map((c) => ({
          id: c.id,
          name: c.name,
          initialInterviewTime: c.initialInterviewTime,
          secondInterviewTime: c.secondInterviewTime,
          finalInterviewTime: c.finalInterviewTime,
          initialInterviewEvaluation: c.initialInterviewEvaluation,
          secondInterviewEvaluation: c.secondInterviewEvaluation,
          finalInterviewEvaluation: c.finalInterviewEvaluation
        }))
      });
      return migrated;
    }
  }
  console.log('[候选人管理] localStorage 中没有数据，返回默认数据');
  return mockCandidates;
};

// 保存数据到 localStorage
const saveCandidatesToStorage = (candidates: Candidate[]) => {
  if (typeof window !== 'undefined') {
    const dataToSave = JSON.stringify(candidates);
    localStorage.setItem('candidates', dataToSave);
    console.log('[候选人管理] 数据已保存到 localStorage:', {
      count: candidates.length,
      sample: candidates.map(c => ({
        id: c.id,
        name: c.name,
        hasInitialTime: !!c.initialInterviewTime,
        hasSecondTime: !!c.secondInterviewTime,
        hasFinalTime: !!c.finalInterviewTime,
        hasInitialEval: !!c.initialInterviewEvaluation,
        hasSecondEval: !!c.secondInterviewEvaluation,
        hasFinalEval: !!c.finalInterviewEvaluation
      }))
    });
    // 触发自定义事件，通知其他组件数据已更新
    window.dispatchEvent(new Event('candidatesUpdated'));
  }
};

const buildCandidateFromApiRecord = (
  apiCandidate: CandidateApiRecord,
  existingCandidate?: Candidate | null,
  position = ""
): Candidate => {
  const mergedResumeParsedData =
    normalizeCandidateResumeParsedData(apiCandidate.resumeParsedData ?? null) ??
    normalizeCandidateResumeParsedData(existingCandidate?.resumeParsedData ?? null) ??
    null;
  const extractedStructuredFields = extractCandidateStructuredFields(mergedResumeParsedData?.parsedData);

  return {
    id: apiCandidate.id,
    name: apiCandidate.name,
    gender: apiCandidate.gender || existingCandidate?.gender || extractedStructuredFields.gender || "",
    school: apiCandidate.school || existingCandidate?.school || extractedStructuredFields.school || "",
    major: apiCandidate.major || existingCandidate?.major || extractedStructuredFields.major || "",
    education: apiCandidate.education || existingCandidate?.education || extractedStructuredFields.education || "",
    phone: apiCandidate.phone || existingCandidate?.phone || "",
    email: apiCandidate.email || existingCandidate?.email || "",
    position: apiCandidate.position || existingCandidate?.position || position,
    status:
      apiCandidate.status === "pending" ||
      apiCandidate.status === "interviewing" ||
      apiCandidate.status === "passed" ||
      apiCandidate.status === "rejected"
        ? apiCandidate.status
        : existingCandidate?.status || "pending",
    source: apiCandidate.source || existingCandidate?.source || "其他",
    createdAt:
      apiCandidate.createdAt?.split("T")[0] ||
      existingCandidate?.createdAt ||
      new Date().toISOString().split("T")[0],
    resumeUploaded: apiCandidate.resumeUploaded ?? existingCandidate?.resumeUploaded ?? false,
    resumeFileName: apiCandidate.resumeFileName || existingCandidate?.resumeFileName || "",
    resumeFileKey: apiCandidate.resumeFileKey || existingCandidate?.resumeFileKey || "",
    resumeDownloadUrl: apiCandidate.resumeDownloadUrl || existingCandidate?.resumeDownloadUrl || "",
    resumeParsedData: mergedResumeParsedData,
    interviewStage: apiCandidate.interviewStage || existingCandidate?.interviewStage || "pending",
    initialInterviewPassed: apiCandidate.initialInterviewPassed ?? existingCandidate?.initialInterviewPassed ?? null,
    secondInterviewPassed: apiCandidate.secondInterviewPassed ?? existingCandidate?.secondInterviewPassed ?? null,
    finalInterviewPassed: apiCandidate.finalInterviewPassed ?? existingCandidate?.finalInterviewPassed ?? null,
    isHired: apiCandidate.isHired ?? existingCandidate?.isHired ?? false,
    initialInterviewTime: apiCandidate.initialInterviewTime ?? existingCandidate?.initialInterviewTime ?? null,
    secondInterviewTime: apiCandidate.secondInterviewTime ?? existingCandidate?.secondInterviewTime ?? null,
    finalInterviewTime: apiCandidate.finalInterviewTime ?? existingCandidate?.finalInterviewTime ?? null,
    initialInterviewEvaluation: apiCandidate.initialInterviewEvaluation ?? existingCandidate?.initialInterviewEvaluation ?? null,
    secondInterviewEvaluation: apiCandidate.secondInterviewEvaluation ?? existingCandidate?.secondInterviewEvaluation ?? null,
    finalInterviewEvaluation: apiCandidate.finalInterviewEvaluation ?? existingCandidate?.finalInterviewEvaluation ?? null,
    createdById: apiCandidate.createdById ?? existingCandidate?.createdById ?? null,
    createdByName: apiCandidate.createdByName ?? existingCandidate?.createdByName ?? null,
    createdByUsername: apiCandidate.createdByUsername ?? existingCandidate?.createdByUsername ?? null,
    resumeUploadedAt: apiCandidate.resumeUploadedAt ?? existingCandidate?.resumeUploadedAt,
  };
};

const mergeApiCandidatesWithLocal = (
  localCandidates: Candidate[],
  apiCandidates: CandidateApiRecord[]
): Candidate[] => {
  const localCandidateMap = new Map(localCandidates.map((candidate) => [candidate.id, candidate]));
  const mergedCandidates = apiCandidates.map((apiCandidate) =>
    buildCandidateFromApiRecord(apiCandidate, localCandidateMap.get(apiCandidate.id))
  );
  const mergedIds = new Set(mergedCandidates.map((candidate) => candidate.id));
  const localOnlyCandidates = localCandidates.filter((candidate) => !mergedIds.has(candidate.id));
  return [...mergedCandidates, ...localOnlyCandidates];
};

type EducationFilterValue =
  | "博士"
  | "硕士"
  | "本科"
  | "大专"
  | "高中"
  | "中专 / 中技"
  | "初中及以下";

type GenderFilterValue = "all" | "男" | "女" | "不限";

type SchoolTierFilterValue = "985" | "211" | "一本" | "二本" | "三本" | "普通院校";

type SchoolNatureFilterValue = "公办" | "民办";

const EDUCATION_FILTER_OPTIONS: EducationFilterValue[] = [
  "博士",
  "硕士",
  "本科",
  "大专",
  "高中",
  "中专 / 中技",
  "初中及以下",
];

const SCHOOL_TIER_OPTIONS: SchoolTierFilterValue[] = ["985", "211", "一本", "二本", "三本", "普通院校"];
const SCHOOL_NATURE_OPTIONS: SchoolNatureFilterValue[] = ["公办", "民办"];
const CANDIDATE_MAJOR_DATALIST_ID = "candidate-major-options-library";

const SCHOOLS_985 = [
  "清华大学",
  "北京大学",
  "中国人民大学",
  "北京航空航天大学",
  "北京理工大学",
  "中国农业大学",
  "北京师范大学",
  "中央民族大学",
  "南开大学",
  "天津大学",
  "大连理工大学",
  "东北大学",
  "吉林大学",
  "哈尔滨工业大学",
  "复旦大学",
  "同济大学",
  "上海交通大学",
  "华东师范大学",
  "南京大学",
  "东南大学",
  "浙江大学",
  "中国科学技术大学",
  "厦门大学",
  "山东大学",
  "中国海洋大学",
  "武汉大学",
  "华中科技大学",
  "湖南大学",
  "中南大学",
  "中山大学",
  "华南理工大学",
  "四川大学",
  "重庆大学",
  "电子科技大学",
  "西安交通大学",
  "西北工业大学",
  "西北农林科技大学",
  "兰州大学",
  "国防科技大学",
];

const SCHOOLS_211 = [
  ...SCHOOLS_985,
  "北京工业大学",
  "北京交通大学",
  "北京科技大学",
  "北京化工大学",
  "北京邮电大学",
  "北京林业大学",
  "北京中医药大学",
  "北京外国语大学",
  "中国传媒大学",
  "中央财经大学",
  "对外经济贸易大学",
  "中国政法大学",
  "华北电力大学",
  "中国矿业大学（北京）",
  "中国石油大学（北京）",
  "中国地质大学（北京）",
  "上海外国语大学",
  "东华大学",
  "华东理工大学",
  "上海财经大学",
  "上海大学",
  "天津医科大学",
  "河北工业大学",
  "太原理工大学",
  "内蒙古大学",
  "辽宁大学",
  "大连海事大学",
  "东北师范大学",
  "延边大学",
  "哈尔滨工程大学",
  "东北农业大学",
  "东北林业大学",
  "苏州大学",
  "南京航空航天大学",
  "南京理工大学",
  "中国矿业大学",
  "河海大学",
  "江南大学",
  "南京农业大学",
  "中国药科大学",
  "南京师范大学",
  "安徽大学",
  "合肥工业大学",
  "福州大学",
  "南昌大学",
  "中国石油大学（华东）",
  "郑州大学",
  "武汉理工大学",
  "华中师范大学",
  "华中农业大学",
  "中南财经政法大学",
  "湖南师范大学",
  "暨南大学",
  "华南师范大学",
  "广西大学",
  "西南交通大学",
  "西南财经大学",
  "四川农业大学",
  "贵州大学",
  "云南大学",
  "西北大学",
  "西安电子科技大学",
  "长安大学",
  "陕西师范大学",
  "第四军医大学",
  "海南大学",
  "宁夏大学",
  "青海大学",
  "新疆大学",
  "石河子大学",
  "西藏大学",
];

const PRIVATE_SCHOOL_KEYWORDS = [
  "民办",
  "独立学院",
  "城市学院",
  "应用科技学院",
];

function normalizeFilterText(value: string | undefined | null): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, "");
}

function normalizeEducationLevel(value: string | undefined): EducationFilterValue | "" {
  const normalized = normalizeFilterText(value);

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

  return "";
}

function normalizeGender(value: string | undefined): "男" | "女" | "" {
  if (value === "男") {
    return "男";
  }
  if (value === "女") {
    return "女";
  }
  return "";
}

function inferSchoolNature(schoolName: string | undefined): SchoolNatureFilterValue | "" {
  const school = (schoolName || "").trim();
  const normalized = normalizeFilterText(school);

  if (!normalized) {
    return "";
  }

  const isPrivate = PRIVATE_SCHOOL_KEYWORDS.some((keyword) => normalized.includes(normalizeFilterText(keyword)));
  return isPrivate ? "民办" : "公办";
}

function inferSchoolTierTags(schoolName: string | undefined): SchoolTierFilterValue[] {
  const school = (schoolName || "").trim();
  const normalized = normalizeFilterText(school);

  if (!normalized) {
    return [];
  }

  const is985 = SCHOOLS_985.some((item) => normalized.includes(normalizeFilterText(item)));
  if (is985) {
    return ["985", "211", "一本"];
  }

  const is211 = SCHOOLS_211.some((item) => normalized.includes(normalizeFilterText(item)));
  if (is211) {
    return ["211", "一本"];
  }

  if (/(职业学院|职业技术学院|高等专科学校|专科学校)/.test(school)) {
    return ["普通院校"];
  }

  const schoolNature = inferSchoolNature(school);
  if (schoolNature === "民办" && /(大学|学院)/.test(school)) {
    return ["三本"];
  }

  if (school.includes("大学")) {
    return ["一本"];
  }

  if (school.includes("学院")) {
    return ["二本"];
  }

  return ["普通院校"];
}

// 面试阶段映射
const interviewStageMap = {
  pending: { label: "待初试", variant: "secondary" as const, color: "bg-gray-500" },
  initial: { label: "待初试", variant: "default" as const, color: "bg-blue-500" },
  second: { label: "待复试", variant: "default" as const, color: "bg-orange-500" },
  final: { label: "待终试", variant: "default" as const, color: "bg-purple-500" },
  offer: { label: "待入职", variant: "default" as const, color: "bg-blue-600" },
  hired: { label: "已入职", variant: "default" as const, color: "bg-green-600" },
  rejected: { label: "已淘汰", variant: "secondary" as const, color: "bg-red-600" },
  rejectedOffer: { label: "拒绝入职", variant: "secondary" as const, color: "bg-orange-600" },
};

// 候选人卡片组件 - 使用 React.memo 优化渲染性能
interface CandidateCardProps {
  candidate: Candidate;
  isSelected: boolean;
  onToggleSelect: (id: number) => void;
  onViewDetail: (candidate: Candidate) => void;
  canEdit: boolean; // 是否有编辑权限
}

const CandidateCard = memo(({ candidate, isSelected, onToggleSelect, onViewDetail, canEdit }: CandidateCardProps) => {
  // 缓存计算结果
  const stage = candidate.interviewStage || "pending";
  const stageInfo = interviewStageMap[stage as keyof typeof interviewStageMap];
  const isPending = candidate.initialInterviewPassed === 'pending' ||
                   candidate.secondInterviewPassed === 'pending' ||
                   candidate.finalInterviewPassed === 'pending';
  
  // 缓存匹配度信息
  const matchScore = candidate.resumeParsedData?.parsedData?.matchAnalysis?.matchScore;
  const matchScoreBadge = matchScore !== undefined ? (
    <div className="flex items-center gap-1">
      <span className="text-gray-500">匹配度：</span>
      <Badge 
        variant={matchScore >= 70 ? "default" : "secondary"}
        className={
          matchScore >= 70 
            ? "bg-green-500 hover:bg-green-600" 
            : matchScore >= 50 
            ? "bg-yellow-500 hover:bg-yellow-600" 
            : "bg-red-500 hover:bg-red-600"
        }
      >
        {matchScore}%
      </Badge>
    </div>
  ) : null;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(candidate.id)}
              className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
            />
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary text-primary-foreground">
                {candidate.name[0]}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">{candidate.name}</h3>
                <Badge
                  variant={stageInfo.variant}
                  className={stageInfo.color || ""}
                >
                  {stageInfo.label}
                </Badge>
                {isPending && (
                  <Badge variant="secondary" className="text-orange-600 bg-orange-50">
                    待定
                  </Badge>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  <span>{candidate.position}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  <span>{candidate.phone}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  <span>{candidate.email}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  <span>{candidate.createdAt}</span>
                </div>
                {matchScoreBadge}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">来源：{candidate.source}</span>
            {/* 显示创建者信息 */}
            <div className="flex items-center gap-1 text-sm text-gray-500">
              <User className="h-3 w-3" />
              <span title={candidate.createdByName ? `创建者：${candidate.createdByName}${candidate.createdByUsername ? ` (${candidate.createdByUsername})` : ''}` : '历史数据，无创建者信息'}>
                {candidate.createdByName ? `创建者：${candidate.createdByName}` : '创建者：历史数据'}
              </span>
            </div>
            {candidate.resumeUploaded && (
              <Badge variant="secondary" className="text-xs">
                <FileText className="mr-1 h-3 w-3" />
                简历
              </Badge>
            )}
            {!canEdit && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                仅查看
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={() => onViewDetail(candidate)}>
              <Eye className="mr-2 h-4 w-4" />
              查看详情
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
CandidateCard.displayName = 'CandidateCard';

interface InterviewRoundSectionProps {
  title: string;
  result: CandidateInterviewResult;
  time: string | null;
  evaluation: string | null | undefined;
  disabled?: boolean;
  onTimeChange: (value: string | null) => void;
  onTimeConfirm: (value: string | null) => Promise<void>;
  onEvaluationChange: (value: string) => void;
  onEvaluationBlur: (value: string) => Promise<void>;
  onPass: () => Promise<void>;
  onPending: () => Promise<void>;
  onFail: () => Promise<void>;
}

function InterviewRoundSection({
  title,
  result,
  time,
  evaluation,
  disabled = false,
  onTimeChange,
  onTimeConfirm,
  onEvaluationChange,
  onEvaluationBlur,
  onPass,
  onPending,
  onFail,
}: InterviewRoundSectionProps) {
  const indicatorClassName =
    result === "pass"
      ? "bg-green-500"
      : result === "fail"
      ? "bg-red-500"
      : result === "pending"
      ? "bg-orange-500"
      : "bg-gray-400";

  return (
    <div className="flex flex-col gap-2 p-3 bg-gray-50 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${indicatorClassName}`} />
          <span className="font-medium">{title}</span>
          {result === "pass" && (
            <Badge variant="outline" className="ml-2 bg-green-50 text-green-700 border-green-300">
              ✅ 已通过
            </Badge>
          )}
          {result === "fail" && (
            <Badge variant="destructive" className="ml-2">
              ❌ 未通过
            </Badge>
          )}
          {result === "pending" && (
            <Badge variant="secondary" className="ml-2 text-orange-700 bg-orange-50 border-orange-300">
              ⏳ 待定
            </Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-sm text-gray-600">面试时间:</Label>
        <Input
          type="datetime-local"
          value={time || ""}
          onChange={(e) => onTimeChange(e.target.value || null)}
          className="text-sm h-8 w-auto"
          disabled={disabled}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void onTimeConfirm(time || null)}
          disabled={disabled}
        >
          确定
        </Button>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-sm text-gray-600">面试官评价:</Label>
        <Textarea
          placeholder={`请输入${title}评价...`}
          value={evaluation || ""}
          onChange={(e) => onEvaluationChange(e.target.value)}
          onBlur={(e) => void onEvaluationBlur(e.target.value)}
          className="text-sm h-20 resize-none"
          rows={2}
          disabled={disabled}
        />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={result === "pass" ? "default" : "outline"}
          onClick={() => void onPass()}
          disabled={disabled || result === "pass"}
        >
          通过
        </Button>
        <Button
          size="sm"
          variant={result === "pending" ? "secondary" : "outline"}
          onClick={() => void onPending()}
          disabled={disabled}
        >
          待定
        </Button>
        <Button
          size="sm"
          variant={result === "fail" ? "destructive" : "outline"}
          onClick={() => void onFail()}
          disabled={disabled || result === "fail"}
        >
          不通过
        </Button>
      </div>
    </div>
  );
}

/**
 * 检查用户是否有权限编辑/删除候选人
 * 规则：
 * 1. 超级管理员(super_admin)和管理员(admin)拥有所有数据的编辑权限（兜底权限）
 * 2. 普通用户只能编辑自己创建的数据
 */
const canEditCandidate = (user: { id: string; role: string } | null, candidate: { createdById?: string | null } | null): boolean => {
  if (!user || !candidate) return false;
  
  // 超级管理员和管理员拥有所有权限
  if (user.role === 'super_admin' || user.role === 'admin') {
    return true;
  }
  
  // 普通用户只能编辑自己创建的数据
  // 如果候选人没有创建者信息，允许编辑（兼容老数据）
  if (!candidate.createdById) return true;
  
  return candidate.createdById === user.id;
};

export default function CandidatesPage() {
  // 获取当前用户信息
  const { user } = useAuth();
  const canManageMajorLibrary = user?.role === "super_admin";
  
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [positions, setPositions] = useState<PositionOption[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"basic" | "resume">("basic"); // basic: 基本信息, resume: 简历内容
  const [filterStage, setFilterStage] = useState("all"); // all, pending, initial, second, final, offer, hired, rejected, pendingInterview
  const [filterPosition, setFilterPosition] = useState("all"); // all: 全部, 其他: 具体岗位名称
  const [filterYear, setFilterYear] = useState("all");
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterDay, setFilterDay] = useState("all");
  const [sortByMatchScore, setSortByMatchScore] = useState<"none" | "desc" | "asc">("none"); // 按匹配度排序：无、降序、升序
  const [filterAgeMin, setFilterAgeMin] = useState("");
  const [filterAgeMax, setFilterAgeMax] = useState("");
  const [filterEducationLevels, setFilterEducationLevels] = useState<EducationFilterValue[]>([]);
  const [filterGender, setFilterGender] = useState<GenderFilterValue>("all");
  const [filterSchoolTiers, setFilterSchoolTiers] = useState<SchoolTierFilterValue[]>([]);
  const [filterSchoolNatures, setFilterSchoolNatures] = useState<SchoolNatureFilterValue[]>([]);
  const [filterMajorKeyword, setFilterMajorKeyword] = useState("");
  const [filterMajorMatchMode, setFilterMajorMatchMode] = useState<"fuzzy" | "exact">("fuzzy");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedCandidate, setEditedCandidate] = useState<Candidate | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editResumeFile, setEditResumeFile] = useState<File | null>(null);
  const [isReuploading, setIsReuploading] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const newCandidateRef = useRef<NewCandidateFormState>({
    name: "",
    gender: "",
    school: "",
    major: "",
    education: "",
    phone: "",
    email: "",
    position: "",
    source: "",
    resumeFile: null,
    resumeFileName: "",
    resumeFileKey: "",
    resumeDownloadUrl: "",
    resumeParsedData: null,
    resumeUploadedAt: "",
  });

  // 批量选择相关状态
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<number>>(new Set());
  const [isAllSelected, setIsAllSelected] = useState(false);
  const [isBatchDeleteDialogOpen, setIsBatchDeleteDialogOpen] = useState(false);
  const addCandidateInFlightRef = useRef(false);

  const [newCandidate, setNewCandidate] = useState<NewCandidateFormState>({
    name: "",
    gender: "",
    school: "",
    major: "",
    education: "",
    phone: "",
    email: "",
    position: "",
    source: "",
    resumeFile: null as File | null,
    resumeFileName: "",
    resumeFileKey: "",
    resumeDownloadUrl: "",
    resumeParsedData: null,
    resumeUploadedAt: "",
  });
  const [isAdding, setIsAdding] = useState(false);
  const [isProcessingResume, setIsProcessingResume] = useState(false);
  const [isPreparingResume, setIsPreparingResume] = useState(false);
  const [candidateDialogTab, setCandidateDialogTab] = useState<"single" | "batch">("single");
  const [majorLibraryOptions, setMajorLibraryOptions] = useState<string[]>(
    () => dedupeCandidateMajorOptions(DEFAULT_CANDIDATE_MAJOR_OPTIONS)
  );
  const [isMajorLibraryDialogOpen, setIsMajorLibraryDialogOpen] = useState(false);
  const [newMajorLibraryOption, setNewMajorLibraryOption] = useState("");
  const [editingMajorLibraryOption, setEditingMajorLibraryOption] = useState<string | null>(null);
  const [editingMajorLibraryValue, setEditingMajorLibraryValue] = useState("");
  const [isUpdatingMajorLibrary, setIsUpdatingMajorLibrary] = useState(false);
  const majorLibrarySyncSignatureRef = useRef("");
  const majorLibraryListRef = useRef<HTMLDivElement | null>(null);
  
  // 调试状态：存储提取的简历文本
  const [debugExtractedText, setDebugExtractedText] = useState("");
  const [showDebugInfo, setShowDebugInfo] = useState(false);

  const toggleEducationLevel = useCallback((value: EducationFilterValue) => {
    setFilterEducationLevels((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  }, []);

  const toggleSchoolTier = useCallback((value: SchoolTierFilterValue) => {
    setFilterSchoolTiers((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  }, []);

  const toggleSchoolNature = useCallback((value: SchoolNatureFilterValue) => {
    setFilterSchoolNatures((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  }, []);

  const clearAdvancedFilters = useCallback(() => {
    setFilterAgeMin("");
    setFilterAgeMax("");
    setFilterEducationLevels([]);
    setFilterGender("all");
    setFilterSchoolTiers([]);
    setFilterSchoolNatures([]);
    setFilterMajorKeyword("");
    setFilterMajorMatchMode("fuzzy");
  }, []);

  const patchEditedCandidate = useCallback((patch: Partial<Candidate>) => {
    setEditedCandidate((prev) => (prev ? { ...prev, ...patch } : null));
  }, []);

  const createEmptyNewCandidate = useCallback((): NewCandidateFormState => ({
    name: "",
    gender: "",
    school: "",
    major: "",
    education: "",
    phone: "",
    email: "",
    position: "",
    source: "",
    resumeFile: null,
    resumeFileName: "",
    resumeFileKey: "",
    resumeDownloadUrl: "",
    resumeParsedData: null,
    resumeUploadedAt: "",
  }), []);

  const updateNewCandidate = useCallback((
    updater: (prev: NewCandidateFormState) => NewCandidateFormState
  ) => {
    setNewCandidate((prev) => {
      const next = updater(prev);
      newCandidateRef.current = next;
      return next;
    });
  }, []);

  const patchNewCandidate = useCallback((patch: Partial<NewCandidateFormState>) => {
    updateNewCandidate((prev) => ({ ...prev, ...patch }));
  }, [updateNewCandidate]);

  const persistNewCandidateDraft = useCallback((
    formState: NewCandidateFormState,
    dialogOpen: boolean,
    debugText: string,
    debugVisible: boolean
  ) => {
    if (typeof window === "undefined") {
      return;
    }

    const serializableDraft: StoredNewCandidateDraft = {
      form: {
        name: formState.name,
        gender: formState.gender,
        school: formState.school,
        major: formState.major,
        education: formState.education,
        phone: formState.phone,
        email: formState.email,
        position: formState.position,
        source: formState.source,
        resumeFileName: formState.resumeFileName,
        resumeFileKey: formState.resumeFileKey,
        resumeDownloadUrl: formState.resumeDownloadUrl,
        resumeParsedData: formState.resumeParsedData,
        resumeUploadedAt: formState.resumeUploadedAt,
      },
      isDialogOpen: dialogOpen,
      debugExtractedText: debugText,
      showDebugInfo: debugVisible,
    };

    window.sessionStorage.setItem(
      NEW_CANDIDATE_DRAFT_STORAGE_KEY,
      JSON.stringify(serializableDraft)
    );
  }, []);

  const clearNewCandidateDraft = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.sessionStorage.removeItem(NEW_CANDIDATE_DRAFT_STORAGE_KEY);
  }, []);

  const resetNewCandidateForm = useCallback(() => {
    const emptyState = createEmptyNewCandidate();
    newCandidateRef.current = emptyState;
    setNewCandidate(emptyState);
    setDebugExtractedText("");
    setShowDebugInfo(false);
    clearNewCandidateDraft();
    if (resumeInputRef.current) {
      resumeInputRef.current.value = "";
    }
  }, [clearNewCandidateDraft, createEmptyNewCandidate]);

  useEffect(() => {
    newCandidateRef.current = newCandidate;
  }, [newCandidate]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const rawDraft = window.sessionStorage.getItem(NEW_CANDIDATE_DRAFT_STORAGE_KEY);
    if (!rawDraft) {
      return;
    }

    try {
      const draft = JSON.parse(rawDraft) as StoredNewCandidateDraft;
      const restoredForm: NewCandidateFormState = {
        ...createEmptyNewCandidate(),
        ...draft.form,
        resumeFile: null,
      };

      newCandidateRef.current = restoredForm;
      setNewCandidate(restoredForm);
      setDebugExtractedText(draft.debugExtractedText || "");
      setShowDebugInfo(Boolean(draft.showDebugInfo));
      setIsAddDialogOpen(Boolean(draft.isDialogOpen));
    } catch (error) {
      console.error("[候选人管理] 恢复添加候选人草稿失败:", error);
      window.sessionStorage.removeItem(NEW_CANDIDATE_DRAFT_STORAGE_KEY);
    }
  }, [createEmptyNewCandidate]);

  useEffect(() => {
    persistNewCandidateDraft(newCandidate, isAddDialogOpen, debugExtractedText, showDebugInfo);
  }, [debugExtractedText, isAddDialogOpen, newCandidate, persistNewCandidateDraft, showDebugInfo]);

  const closeAddDialog = useCallback(() => {
    setIsAddDialogOpen(false);
    resetNewCandidateForm();
  }, [resetNewCandidateForm]);

  const handleAddDialogOpenChange = useCallback((open: boolean) => {
    if (open) {
      setIsAddDialogOpen(true);
      return;
    }

    const hasDraftContent = Boolean(
      newCandidateRef.current.resumeFile ||
      newCandidateRef.current.resumeFileKey ||
      newCandidateRef.current.resumeParsedData ||
      newCandidateRef.current.name ||
      newCandidateRef.current.gender ||
      newCandidateRef.current.school ||
      newCandidateRef.current.major ||
      newCandidateRef.current.education ||
      newCandidateRef.current.phone ||
      newCandidateRef.current.email
    );

    if (isPreparingResume || isAdding || hasDraftContent) {
      return;
    }

    setIsAddDialogOpen(false);
    resetNewCandidateForm();
  }, [isAdding, isPreparingResume, resetNewCandidateForm]);

  const fetchPositions = useCallback(async (forceRefresh: boolean = false) => {
    try {
      const data = await fetchClientJsonCached<CandidateApiResponse<PositionOption[]>>(
        '/api/positions',
        {},
        {
          forceRefresh,
          ttlMs: 15_000,
        }
      );
      if (data.success) {
        setPositions(
          data.data
            .filter((position) => typeof position.title === "string" && position.title.length > 0)
            .map((position) => ({
              id: position.id,
              title: position.title,
              department: position.department,
              jobDescription: position.jobDescription,
              education: position.education,
              experience: position.experience,
              coreRequirements: Array.isArray(position.coreRequirements)
                ? position.coreRequirements.filter((item): item is string => typeof item === "string")
                : [],
              softSkills: Array.isArray(position.softSkills)
                ? position.softSkills.filter((item): item is string => typeof item === "string")
                : [],
              interviewerPreferences:
                position.interviewerPreferences && typeof position.interviewerPreferences === "object"
                  ? position.interviewerPreferences
                  : null,
            }))
        );
      }
    } catch (error) {
      console.error('获取岗位列表失败:', error);
      setPositions(loadPositionsFromStorage());
    }
  }, []);

  const fetchMajorLibraryOptions = useCallback(async (forceRefresh: boolean = false) => {
    try {
      const data = await fetchClientJsonCached<CandidateApiResponse<string[]>>(
        "/api/candidates/major-options",
        {},
        {
          forceRefresh,
          ttlMs: 15_000,
        }
      );

      if (data.success) {
        setMajorLibraryOptions(
          dedupeCandidateMajorOptions(data.data || DEFAULT_CANDIDATE_MAJOR_OPTIONS)
        );
      }
    } catch (error) {
      console.error("获取专业选项库失败:", error);
      setMajorLibraryOptions(dedupeCandidateMajorOptions(DEFAULT_CANDIDATE_MAJOR_OPTIONS));
    }
  }, []);

  const syncCandidateMajorsToLibrary = useCallback(async (majors: string[]) => {
    const normalizedMajors = dedupeCandidateMajorOptions(majors);
    if (normalizedMajors.length === 0) {
      return;
    }

    try {
      const data = await fetchClientJson<CandidateApiResponse<string[]>>(
        "/api/candidates/major-options",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            majors: normalizedMajors,
            mode: "sync",
          }),
        }
      );

      if (data.success) {
        setMajorLibraryOptions(
          dedupeCandidateMajorOptions(data.data || normalizedMajors)
        );
      }
    } catch (error) {
      console.error("同步专业选项库失败:", error);
    }
  }, []);

  const handleAddMajorLibraryOption = useCallback(async () => {
    const normalizedMajor = normalizeCandidateMajorOption(newMajorLibraryOption);
    if (!normalizedMajor) {
      toast.error("请输入专业名称");
      return;
    }

    setIsUpdatingMajorLibrary(true);
    try {
      const data = await fetchClientJson<CandidateApiResponse<string[]>>(
        "/api/candidates/major-options",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            major: normalizedMajor,
          }),
        }
      );

      if (data.success) {
        setMajorLibraryOptions(
          dedupeCandidateMajorOptions(data.data || [normalizedMajor])
        );
        setNewMajorLibraryOption("");
        toast.success("专业选项已添加");
        sync.emit("settingsUpdated");
      }
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "添加专业选项失败");
    } finally {
      setIsUpdatingMajorLibrary(false);
    }
  }, [newMajorLibraryOption]);

  const startEditMajorLibraryOption = useCallback((major: string) => {
    setEditingMajorLibraryOption(major);
    setEditingMajorLibraryValue(major);
  }, []);

  const cancelEditMajorLibraryOption = useCallback(() => {
    setEditingMajorLibraryOption(null);
    setEditingMajorLibraryValue("");
  }, []);

  useEffect(() => {
    if (canManageMajorLibrary || !isMajorLibraryDialogOpen) {
      return;
    }

    setIsMajorLibraryDialogOpen(false);
    cancelEditMajorLibraryOption();
    setNewMajorLibraryOption("");
  }, [
    canManageMajorLibrary,
    cancelEditMajorLibraryOption,
    isMajorLibraryDialogOpen,
  ]);

  const handleSaveMajorLibraryOption = useCallback(async () => {
    if (!editingMajorLibraryOption) {
      return;
    }

    const normalizedMajor = normalizeCandidateMajorOption(editingMajorLibraryValue);
    if (!normalizedMajor) {
      toast.error("请输入专业名称");
      return;
    }

    setIsUpdatingMajorLibrary(true);
    try {
      const data = await fetchClientJson<CandidateApiResponse<string[]>>(
        "/api/candidates/major-options",
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            previousMajor: editingMajorLibraryOption,
            nextMajor: normalizedMajor,
          }),
        }
      );

      if (data.success) {
        setMajorLibraryOptions(
          dedupeCandidateMajorOptions(data.data || [normalizedMajor])
        );
        cancelEditMajorLibraryOption();
        toast.success("专业选项已更新");
        sync.emit("settingsUpdated");
      }
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "更新专业选项失败");
    } finally {
      setIsUpdatingMajorLibrary(false);
    }
  }, [cancelEditMajorLibraryOption, editingMajorLibraryOption, editingMajorLibraryValue]);

  const handleDeleteMajorLibraryOption = useCallback(async (major: string) => {
    const normalizedMajor = normalizeCandidateMajorOption(major);
    if (!normalizedMajor) {
      return;
    }

    setIsUpdatingMajorLibrary(true);
    try {
      const data = await fetchClientJson<CandidateApiResponse<string[]>>(
        "/api/candidates/major-options",
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            major: normalizedMajor,
          }),
        }
      );

      if (data.success) {
        setMajorLibraryOptions(
          dedupeCandidateMajorOptions(data.data || [])
        );
        if (editingMajorLibraryOption === normalizedMajor) {
          cancelEditMajorLibraryOption();
        }
        toast.success("专业选项已删除");
        sync.emit("settingsUpdated");
      }
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "删除专业选项失败");
    } finally {
      setIsUpdatingMajorLibrary(false);
    }
  }, [cancelEditMajorLibraryOption, editingMajorLibraryOption]);

  const handleMajorLibraryListKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const container = majorLibraryListRef.current;
    if (!container || container.scrollHeight <= container.clientHeight) {
      return;
    }

    const pageStep = Math.max(container.clientHeight - 48, 120);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      container.scrollTop += 48;
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      container.scrollTop -= 48;
      return;
    }

    if (event.key === "PageDown") {
      event.preventDefault();
      container.scrollTop += pageStep;
      return;
    }

    if (event.key === "PageUp") {
      event.preventDefault();
      container.scrollTop -= pageStep;
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      container.scrollTop = 0;
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  const refreshCandidatesFromApi = useCallback(async (forceRefresh: boolean = false) => {
    const localCandidates = loadCandidatesFromStorage();

    try {
      const data = await fetchClientJsonCached<CandidateApiResponse<CandidateApiRecord[]>>(
        '/api/candidates',
        {},
        {
          forceRefresh,
          ttlMs: 10_000,
        }
      );
      if (data.success) {
        const mergedCandidates = mergeApiCandidatesWithLocal(localCandidates, data.data);
        setCandidates(mergedCandidates);
        saveCandidatesToStorage(mergedCandidates);
        return;
      }
    } catch (error) {
      console.error('获取候选人列表失败:', error);
    }

    setCandidates(localCandidates);
  }, []);

  const processingCandidateCount = useMemo(
    () =>
      candidates.filter(
        (candidate) => candidate.resumeParsedData?.parseStatus === "processing"
      ).length,
    [candidates]
  );

  const hasProcessingCandidates = processingCandidateCount > 0;
  const matchAnalysisBackfillRef = useRef<Set<number>>(new Set());

  // 从 localStorage 加载岗位数据
  const loadPositionsFromStorage = (): PositionOption[] => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('positions');
      if (stored) {
        const positionData = JSON.parse(stored) as Array<PositionOption>;
        return positionData
          .filter((p): p is PositionOption => typeof p.title === "string" && p.title.length > 0)
          .map((p) => ({
            id: p.id,
            title: p.title,
            department: p.department,
            jobDescription: p.jobDescription,
            education: p.education,
            experience: p.experience,
            coreRequirements: Array.isArray(p.coreRequirements) ? p.coreRequirements : [],
            softSkills: Array.isArray(p.softSkills) ? p.softSkills : [],
            interviewerPreferences: p.interviewerPreferences || null,
          }));
      }
    }
    return [];
  };

  // 导出候选人数据为 Excel
  const handleExportCandidates = async () => {
    try {
      const XLSX = await import("xlsx");
      console.log('[导出] 开始导出候选人数据，总数:', candidates.length);
      
      // 准备导出数据
      const exportData = candidates.map((candidate) => ({
        'ID': candidate.id,
        '姓名': candidate.name,
        '电话': candidate.phone,
        '邮箱': candidate.email,
        '应聘岗位': candidate.position,
        '来源': candidate.source,
        '创建日期': candidate.createdAt,
        '简历已上传': candidate.resumeUploaded ? '是' : '否',
        '简历文件名': candidate.resumeFileName || '',
        // 面试流程
        '当前阶段': interviewStageMap[candidate.interviewStage as keyof typeof interviewStageMap]?.label || candidate.interviewStage,
        '初试结果': candidate.initialInterviewPassed === 'pass' ? '通过' : 
                     candidate.initialInterviewPassed === 'fail' ? '未通过' : 
                     candidate.initialInterviewPassed === 'pending' ? '待定' : '未面试',
        '复试结果': candidate.secondInterviewPassed === 'pass' ? '通过' : 
                     candidate.secondInterviewPassed === 'fail' ? '未通过' : 
                     candidate.secondInterviewPassed === 'pending' ? '待定' : '未面试',
        '终试结果': candidate.finalInterviewPassed === 'pass' ? '通过' : 
                     candidate.finalInterviewPassed === 'fail' ? '未通过' : 
                     candidate.finalInterviewPassed === 'pending' ? '待定' : '未面试',
        '是否已入职': candidate.isHired ? '是' : '否',
        // 面试时间
        '初试时间': candidate.initialInterviewTime ? new Date(candidate.initialInterviewTime).toLocaleString('zh-CN') : '',
        '复试时间': candidate.secondInterviewTime ? new Date(candidate.secondInterviewTime).toLocaleString('zh-CN') : '',
        '终试时间': candidate.finalInterviewTime ? new Date(candidate.finalInterviewTime).toLocaleString('zh-CN') : '',
        // 面试官评价
        '初试评价': candidate.initialInterviewEvaluation || '',
        '复试评价': candidate.secondInterviewEvaluation || '',
        '终试评价': candidate.finalInterviewEvaluation || '',
      }));

      // 创建工作簿
      const wb = XLSX.utils.book_new();
      
      // 创建工作表
      const ws = XLSX.utils.json_to_sheet(exportData);
      
      // 设置列宽
      const colWidths = [
        { wch: 8 },   // ID
        { wch: 12 },  // 姓名
        { wch: 15 },  // 电话
        { wch: 25 },  // 邮箱
        { wch: 20 },  // 应聘岗位
        { wch: 12 },  // 来源
        { wch: 15 },  // 创建日期
        { wch: 10 },  // 简历已上传
        { wch: 25 },  // 简历文件名
        { wch: 12 },  // 当前阶段
        { wch: 10 },  // 初试结果
        { wch: 10 },  // 复试结果
        { wch: 10 },  // 终试结果
        { wch: 10 },  // 是否已入职
        { wch: 20 },  // 初试时间
        { wch: 20 },  // 复试时间
        { wch: 20 },  // 终试时间
        { wch: 50 },  // 初试评价
        { wch: 50 },  // 复试评价
        { wch: 50 },  // 终试评价
      ];
      ws['!cols'] = colWidths;

      // 添加工作表到工作簿
      XLSX.utils.book_append_sheet(wb, ws, "候选人数据");

      // 生成文件名
      const fileName = `候选人数据_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.xlsx`;

      // 导出文件
      XLSX.writeFile(wb, fileName);

      console.log('[导出] 导出成功:', fileName);
      toast.success(`导出成功！文件名：${fileName}`);
    } catch (error) {
      console.error('[导出] 导出失败:', error);
      toast.error("导出失败，请重试");
    }
  };

  useEffect(() => {
    const storedCandidates = loadCandidatesFromStorage();
    setCandidates(storedCandidates);
    setPositions(loadPositionsFromStorage());

    const hydrateRemoteData = () => {
      void refreshCandidatesFromApi(false);
      void fetchPositions(false);
      void fetchMajorLibraryOptions(false);
    };

    const idleCallback = globalThis.requestIdleCallback;
    if (typeof idleCallback === "function") {
      const handle = idleCallback(hydrateRemoteData, { timeout: 1200 });
      return () => globalThis.cancelIdleCallback?.(handle);
    }

    const timer = window.setTimeout(hydrateRemoteData, 120);
    return () => window.clearTimeout(timer);
  }, [fetchMajorLibraryOptions, fetchPositions, refreshCandidatesFromApi]);

  // 监听岗位数据变化，实时更新
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'positions') {
        void fetchPositions(true);
      }

      if (event.key === 'candidates') {
        void refreshCandidatesFromApi(true);
      }
    };

    const handlePositionsChange = () => {
      void fetchPositions(true);
    };

    const unsubscribeSettings = sync.on("settingsUpdated", () => {
      void fetchMajorLibraryOptions(true);
    });

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('positionsUpdated', handlePositionsChange);

    return () => {
      unsubscribeSettings();
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('positionsUpdated', handlePositionsChange);
    };
  }, [fetchMajorLibraryOptions, fetchPositions, refreshCandidatesFromApi]);

  // 局域网多浏览器场景下，单靠 storage 事件无法跨设备同步；
  // 这里增加轻量轮询，确保其他用户也能看到最新简历解析结果。
  useEffect(() => {
    const syncLatestData = () => {
      void refreshCandidatesFromApi(true);
      void fetchPositions(true);
      void fetchMajorLibraryOptions(true);
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        syncLatestData();
      }
    }, 8000);

    const handleFocus = () => {
      syncLatestData();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncLatestData();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchMajorLibraryOptions, fetchPositions, refreshCandidatesFromApi]);

  useEffect(() => {
    if (!hasProcessingCandidates) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshCandidatesFromApi(true);
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [hasProcessingCandidates, refreshCandidatesFromApi]);

  const candidateMajorOptionsFromData = useMemo(() => {
    return dedupeCandidateMajorOptions(
      candidates.flatMap((candidate) =>
        [candidate.major, candidate.resumeParsedData?.parsedData?.education?.major].filter(
          (major): major is string => typeof major === "string"
        )
      )
    );
  }, [candidates]);

  useEffect(() => {
    const signature = candidateMajorOptionsFromData.join("||");
    if (!signature || signature === majorLibrarySyncSignatureRef.current) {
      return;
    }

    majorLibrarySyncSignatureRef.current = signature;
    void syncCandidateMajorsToLibrary(candidateMajorOptionsFromData);
  }, [candidateMajorOptionsFromData, syncCandidateMajorsToLibrary]);

  useEffect(() => {
    if (!isDetailDialogOpen || !selectedCandidate) {
      return;
    }

    const latestCandidate = candidates.find((candidate) => candidate.id === selectedCandidate.id);
    if (!latestCandidate) {
      return;
    }

    setSelectedCandidate((prev) => {
      if (!prev || prev.id !== latestCandidate.id) {
        return latestCandidate;
      }

      return prev === latestCandidate ? prev : latestCandidate;
    });
  }, [candidates, isDetailDialogOpen, selectedCandidate]);

  const backfillCandidateMatchAnalysis = useCallback(async (candidate: Candidate) => {
    const resumeContent = candidate.resumeParsedData?.content?.trim();
    const positionInfo = findPositionOption(positions, candidate.position);

    if (!resumeContent || !positionInfo || matchAnalysisBackfillRef.current.has(candidate.id)) {
      return;
    }

    matchAnalysisBackfillRef.current.add(candidate.id);

    try {
      const parseResult = await fetchClientJson<ResumeParseResponse>("/api/resume/parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resumeContent,
          position: positionInfo,
        }),
      });

      if (!parseResult.success || !parseResult.data) {
        throw new Error(parseResult.error || "岗位匹配分析补全失败");
      }

      const parsedAt = new Date().toISOString();
      await fetchClientJson<CandidateApiResponse<CandidateApiRecord>>(`/api/candidates/${candidate.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          position: candidate.position || positionInfo.title,
          resumeParsedData: {
            ...(candidate.resumeParsedData || {}),
            content: candidate.resumeParsedData?.content || resumeContent,
            parsedData: parseResult.data,
            parsedAt,
            parseStatus: "completed",
          },
        }),
      });

      await refreshCandidatesFromApi(true);
    } catch (error) {
      console.error(`[候选人管理] 补全候选人 ${candidate.id} 岗位匹配分析失败:`, error);
      matchAnalysisBackfillRef.current.delete(candidate.id);
    }
  }, [positions, refreshCandidatesFromApi]);

  useEffect(() => {
    if (positions.length === 0) {
      return;
    }

    const candidateNeedingBackfill = candidates.find((candidate) => {
      if (!candidate.position || !candidate.resumeParsedData?.content?.trim()) {
        return false;
      }

      if (candidate.resumeParsedData.error || candidate.resumeParsedData.parseStatus === "processing") {
        return false;
      }

      return !hasDetailedResumeResult(candidate.resumeParsedData, true);
    });

    if (!candidateNeedingBackfill) {
      return;
    }

    void backfillCandidateMatchAnalysis(candidateNeedingBackfill);
  }, [backfillCandidateMatchAnalysis, candidates, positions]);

  // 缓存搜索查询和过滤条件，避免不必要的重新计算
  const searchQueryLower = useMemo(() => searchQuery.toLowerCase(), [searchQuery]);
  const availableYears = useMemo(() => {
    const years = new Set<string>();

    candidates.forEach((candidate) => {
      const createdAt = parseCandidateCreatedAt(candidate.createdAt);
      if (createdAt) {
        years.add(String(createdAt.getFullYear()));
      }
    });

    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [candidates]);

  const isAdvancedFilterPanelVisible = filterPosition !== "all";

  const availableMajorOptions = useMemo(() => {
    return dedupeCandidateMajorOptions(majorLibraryOptions).slice(0, 20);
  }, [majorLibraryOptions]);

  const addCandidateMajorQuickOptions = useMemo(() => {
    const normalizedKeyword = normalizeFilterText(newCandidate.major);
    const matchedOptions =
      normalizedKeyword.length > 0
        ? majorLibraryOptions.filter((major) =>
            normalizeFilterText(major).includes(normalizedKeyword)
          )
        : majorLibraryOptions;

    return matchedOptions.slice(0, 8);
  }, [majorLibraryOptions, newCandidate.major]);

  const hasAdvancedFilterSelection =
    filterAgeMin !== "" ||
    filterAgeMax !== "" ||
    filterEducationLevels.length > 0 ||
    filterGender !== "all" ||
    filterSchoolTiers.length > 0 ||
    filterSchoolNatures.length > 0 ||
    filterMajorKeyword.trim() !== "";

  const advancedFilterSummaryItems = useMemo(() => {
    const summary: string[] = [];

    if (filterAgeMin !== "" || filterAgeMax !== "") {
      summary.push(`年龄 ${filterAgeMin || "不限"}-${filterAgeMax || "不限"}`);
    }

    if (filterEducationLevels.length > 0) {
      summary.push(`学历 ${filterEducationLevels.join(" / ")}`);
    }

    if (filterGender !== "all") {
      summary.push(`性别 ${filterGender}`);
    }

    if (filterSchoolTiers.length > 0) {
      summary.push(`学校层次 ${filterSchoolTiers.join(" / ")}`);
    }

    if (filterSchoolNatures.length > 0) {
      summary.push(`学校性质 ${filterSchoolNatures.join(" / ")}`);
    }

    if (filterMajorKeyword.trim() !== "") {
      summary.push(`专业${filterMajorMatchMode === "exact" ? "精准" : "模糊"} ${filterMajorKeyword.trim()}`);
    }

    return summary;
  }, [
    filterAgeMin,
    filterAgeMax,
    filterEducationLevels,
    filterGender,
    filterSchoolTiers,
    filterSchoolNatures,
    filterMajorKeyword,
    filterMajorMatchMode,
  ]);

  // 使用 useMemo 缓存过滤后的候选人列表，避免每次渲染都重新计算
  const filteredCandidates = useMemo(() => {
    // 如果没有任何过滤条件，直接返回原始数据
    const noFilters = searchQueryLower === '' && 
                     filterStage === 'all' && 
                     filterPosition === 'all' && 
                     filterYear === 'all' &&
                     filterMonth === 'all' &&
                     filterDay === 'all' &&
                     !hasAdvancedFilterSelection &&
                     sortByMatchScore === 'none';
    
    if (noFilters) {
      return [...candidates].sort(compareCandidatesByCreatedAtDesc);
    }

    let filtered = candidates.filter((candidate) => {
      // 搜索过滤
      let matchesSearch = true;
      
      if (searchQueryLower !== '') {
        if (searchMode === "basic") {
          // 基本信息搜索：姓名、岗位、手机号、邮箱
          matchesSearch = Boolean(
            candidate.name.toLowerCase().includes(searchQueryLower) ||
            candidate.position.toLowerCase().includes(searchQueryLower) ||
            (candidate.phone && candidate.phone.includes(searchQueryLower)) ||
            (candidate.email && candidate.email.toLowerCase().includes(searchQueryLower))
          );
        } else {
          // 简历内容搜索
          matchesSearch = false;
          
          // 1. 搜索简历原文内容
          const resumeContent = candidate.resumeParsedData?.content;
          if (resumeContent && resumeContent.toLowerCase().includes(searchQueryLower)) {
            matchesSearch = true;
          }
          
          // 2. 搜索解析后的结构化数据
          if (!matchesSearch && candidate.resumeParsedData?.parsedData) {
            const parsed = candidate.resumeParsedData.parsedData;
            
            // 搜索技能
            if (parsed.skills && Array.isArray(parsed.skills)) {
              for (const skill of parsed.skills) {
                const skillName = typeof skill === 'string' ? skill : skill.name;
                if (skillName && skillName.toLowerCase().includes(searchQueryLower)) {
                  matchesSearch = true;
                  break;
                }
              }
            }
            
            // 搜索工作经历
            if (!matchesSearch && parsed.workExperience && Array.isArray(parsed.workExperience)) {
              for (const exp of parsed.workExperience) {
                if ((exp.company && exp.company.toLowerCase().includes(searchQueryLower)) ||
                    (exp.position && exp.position.toLowerCase().includes(searchQueryLower)) ||
                    (exp.responsibilities && exp.responsibilities.some((r: string) => r.toLowerCase().includes(searchQueryLower)))) {
                  matchesSearch = true;
                  break;
                }
              }
            }
            
            // 搜索项目经历
            if (!matchesSearch && parsed.projects && Array.isArray(parsed.projects)) {
              for (const proj of parsed.projects) {
                if ((proj.name && proj.name.toLowerCase().includes(searchQueryLower)) ||
                    (proj.description && proj.description.toLowerCase().includes(searchQueryLower)) ||
                    (proj.technologies && proj.technologies.some((t: string) => t.toLowerCase().includes(searchQueryLower)))) {
                  matchesSearch = true;
                  break;
                }
              }
            }
            
            // 搜索教育背景
            if (!matchesSearch && parsed.education) {
              const edu = parsed.education;
              if ((edu.school && edu.school.toLowerCase().includes(searchQueryLower)) ||
                  (edu.major && edu.major.toLowerCase().includes(searchQueryLower))) {
                matchesSearch = true;
              }
            }
            
            // 搜索证书
            if (!matchesSearch && parsed.certificates && Array.isArray(parsed.certificates)) {
              for (const cert of parsed.certificates) {
                if (cert.name && cert.name.toLowerCase().includes(searchQueryLower)) {
                  matchesSearch = true;
                  break;
                }
              }
            }
          }
          
          // 3. 同时也搜索基本信息
          if (!matchesSearch) {
            matchesSearch =
              candidate.name.toLowerCase().includes(searchQueryLower) ||
              candidate.position.toLowerCase().includes(searchQueryLower);
          }
        }
      }

      // 面试阶段过滤
      let matchesStage = true;
      if (filterStage !== "all") {
        if (filterStage === "pendingInterview") {
          // 待定：任何一轮面试结果为 pending
          matchesStage = candidate.initialInterviewPassed === 'pending' ||
                         candidate.secondInterviewPassed === 'pending' ||
                         candidate.finalInterviewPassed === 'pending';
        } else {
          matchesStage = candidate.interviewStage === filterStage;
        }
      }

      // 岗位过滤
      const matchesPosition = filterPosition === "all" || candidate.position === filterPosition;

      const parsedData = candidate.resumeParsedData?.parsedData;
      const candidateAge = parsedData?.basicInfo?.age;
      const parsedStructuredFields = extractCandidateStructuredFields(parsedData);
      const candidateGender = normalizeGender(candidate.gender) || parsedStructuredFields.gender;
      const candidateEducationLevel =
        normalizeEducationLevel(candidate.education) || parsedStructuredFields.education;
      const candidateSchool =
        (typeof candidate.school === "string" ? candidate.school.trim() : "") ||
        parsedStructuredFields.school;
      const candidateSchoolNature = inferSchoolNature(candidateSchool);
      const candidateSchoolTierTags = inferSchoolTierTags(candidateSchool);
      const candidateMajor =
        (typeof candidate.major === "string" ? candidate.major.trim() : "") ||
        parsedStructuredFields.major;

      // 创建时间过滤
      const createdAt = parseCandidateCreatedAt(candidate.createdAt);
      const matchesYear = filterYear === "all" || (createdAt && String(createdAt.getFullYear()) === filterYear);
      const matchesMonth =
        filterMonth === "all" ||
        (createdAt && String(createdAt.getMonth() + 1).padStart(2, "0") === filterMonth);
      const matchesDay =
        filterDay === "all" ||
        (createdAt && String(createdAt.getDate()).padStart(2, "0") === filterDay);

      let matchesAdvancedFilters = true;
      if (isAdvancedFilterPanelVisible) {
        const normalizedAgeMin = filterAgeMin === "" ? null : Number(filterAgeMin);
        const normalizedAgeMax = filterAgeMax === "" ? null : Number(filterAgeMax);
        const validAge = typeof candidateAge === "number" && Number.isFinite(candidateAge);
        const matchesAge =
          normalizedAgeMin === null && normalizedAgeMax === null
            ? true
            : validAge &&
              (normalizedAgeMin === null || candidateAge >= normalizedAgeMin) &&
              (normalizedAgeMax === null || candidateAge <= normalizedAgeMax);

        const matchesEducation =
          filterEducationLevels.length === 0 ||
          (candidateEducationLevel !== "" &&
            filterEducationLevels.includes(candidateEducationLevel as EducationFilterValue));

        const matchesGender =
          filterGender === "all" ||
          filterGender === "不限" ||
          (candidateGender !== "" && candidateGender === filterGender);

        const matchesSchoolTier =
          filterSchoolTiers.length === 0 ||
          filterSchoolTiers.some((tier) => candidateSchoolTierTags.includes(tier));

        const matchesSchoolNature =
          filterSchoolNatures.length === 0 ||
          (candidateSchoolNature !== "" && filterSchoolNatures.includes(candidateSchoolNature));

        const normalizedMajorKeyword = normalizeFilterText(filterMajorKeyword);
        const normalizedMajor = normalizeFilterText(candidateMajor);
        const matchesMajor =
          normalizedMajorKeyword === "" ||
          (normalizedMajor !== "" &&
            (filterMajorMatchMode === "exact"
              ? normalizedMajor === normalizedMajorKeyword
              : normalizedMajor.includes(normalizedMajorKeyword)));

        matchesAdvancedFilters =
          matchesAge &&
          matchesEducation &&
          matchesGender &&
          matchesSchoolTier &&
          matchesSchoolNature &&
          matchesMajor;
      }

      return (
        matchesSearch &&
        matchesStage &&
        matchesPosition &&
        matchesYear &&
        matchesMonth &&
        matchesDay &&
        matchesAdvancedFilters
      );
    });

    // 按匹配度排序
    if (sortByMatchScore !== "none") {
      filtered = [...filtered].sort((a, b) => {
        const matchScoreA = a.resumeParsedData?.parsedData?.matchAnalysis?.matchScore ?? 0;
        const matchScoreB = b.resumeParsedData?.parsedData?.matchAnalysis?.matchScore ?? 0;

        const primaryDiff = sortByMatchScore === "desc"
          ? matchScoreB - matchScoreA
          : matchScoreA - matchScoreB;

        if (primaryDiff !== 0) {
          return primaryDiff;
        }

        return compareCandidatesByCreatedAtDesc(a, b);
      });
    } else {
      filtered = [...filtered].sort(compareCandidatesByCreatedAtDesc);
    }

    return filtered;
  }, [
    candidates,
    searchQueryLower,
    searchMode,
    filterStage,
    filterPosition,
    filterYear,
    filterMonth,
    filterDay,
    sortByMatchScore,
    hasAdvancedFilterSelection,
    isAdvancedFilterPanelVisible,
    filterAgeMin,
    filterAgeMax,
    filterEducationLevels,
    filterGender,
    filterSchoolTiers,
    filterSchoolNatures,
    filterMajorKeyword,
    filterMajorMatchMode,
  ]);

  const startBackgroundResumeParse = useCallback(async (
    resumeFile: File,
    candidateId: number,
    position: string
  ) => {
    setIsProcessingResume(true);

    try {
      const formData = new FormData();
      formData.append("file", resumeFile);

      const positionInfo = findPositionOption(positions, position);
      if (positionInfo) {
        formData.append("positionInfo", JSON.stringify(positionInfo));
      }

      const response = await fetchClientJson<CandidateApiResponse<{
        candidateId: number;
        fileKey: string;
        fileName: string;
        processingAt: string;
      }>>(`/api/candidates/${candidateId}/parse-resume-task`, {
        method: "POST",
        body: formData,
      });

      setCandidates((prevCandidates) => {
        const updatedCandidates = prevCandidates.map((candidate) =>
          candidate.id === candidateId
            ? {
                ...candidate,
                resumeUploaded: true,
                resumeFileName: response.data.fileName,
                resumeFileKey: response.data.fileKey,
                resumeUploadedAt: response.data.processingAt,
                resumeParsedData: {
                  ...(candidate.resumeParsedData || {}),
                  parseStatus: "processing" as const,
                  processingAt: response.data.processingAt,
                },
              }
            : candidate
        );
        saveCandidatesToStorage(updatedCandidates);
        return updatedCandidates;
      });

      toast.success("已启动后台简历解析", {
        description: "切换页面不会中断，解析成功后候选人详情会自动补全。",
      });
    } catch (error) {
      console.error("启动后台简历解析失败:", error);
      setCandidates((prevCandidates) => {
        const updatedCandidates = prevCandidates.map((candidate) =>
          candidate.id === candidateId
            ? {
                ...candidate,
                resumeParsedData: {
                  ...(candidate.resumeParsedData || {}),
                  parseStatus: "failed" as const,
                  error: error instanceof Error ? error.message : "启动后台简历解析失败",
                  errorAt: new Date().toISOString(),
                },
              }
            : candidate
        );
        saveCandidatesToStorage(updatedCandidates);
        return updatedCandidates;
      });
      toast.error("启动后台简历解析失败", {
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    } finally {
      setIsProcessingResume(false);
      void refreshCandidatesFromApi(true);
    }
  }, [positions, refreshCandidatesFromApi]);

  // 使用 useCallback 优化事件处理函数
  const handleAddCandidate = useCallback(async () => {
    if (addCandidateInFlightRef.current || isAdding) {
      return;
    }

    if (!newCandidate.name.trim()) {
      toast.error("请填写姓名");
      return;
    }

    if (!newCandidate.gender.trim()) {
      toast.error("请选择性别");
      return;
    }

    if (!newCandidate.school.trim()) {
      toast.error("请填写学校");
      return;
    }

    if (!newCandidate.major.trim()) {
      toast.error("请填写专业");
      return;
    }

    if (!newCandidate.education.trim()) {
      toast.error("请选择学历");
      return;
    }

    if (!newCandidate.phone.trim()) {
      toast.error("请填写手机号");
      return;
    }

    if (!newCandidate.position.trim()) {
      toast.error("请选择应聘岗位");
      return;
    }

    if (isPreparingResume) {
      toast.info("简历仍在解析中，请稍候再保存候选人");
      return;
    }

    addCandidateInFlightRef.current = true;
    setIsAdding(true);

    // 重复检测：姓名 + 手机号 双字段联合精准匹配
    if (newCandidate.name && newCandidate.phone) {
      try {
        const token = localStorage.getItem('auth_token');
        const checkResponse = await fetch("/api/resumes/check-duplicate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { "Authorization": `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            name: newCandidate.name,
            phone: newCandidate.phone,
            mode: "strict", // 严格模式：姓名+手机号联合匹配
          }),
        });

        if (checkResponse.ok) {
          const checkResult = await checkResponse.json();
          
          if (checkResult.isDuplicate) {
            toast.error("检测到重复候选人", {
              description: "该候选人姓名+手机号已存在系统中，不可重复上传简历，请核对信息后上传新的简历",
              duration: 5000,
            });
            return;
          }
        }
      } catch (error) {
        console.error("重复检测失败:", error);
        // 检测失败不阻止添加，继续执行
      }
    }

    try {
      const createdCandidateResponse = await fetchClientJson<CandidateApiResponse<CandidateApiRecord>>('/api/candidates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newCandidate.name,
          gender: newCandidate.gender,
          school: newCandidate.school,
          major: newCandidate.major,
          education: newCandidate.education,
          phone: newCandidate.phone || undefined,
          email: newCandidate.email || undefined,
          position: newCandidate.position || undefined,
          source: newCandidate.source || "其他",
          status: "pending",
          resumeUploaded: Boolean(newCandidate.resumeFileKey),
          resumeFileName: newCandidate.resumeFileName || undefined,
          resumeFileKey: newCandidate.resumeFileKey || undefined,
          resumeDownloadUrl: newCandidate.resumeDownloadUrl || undefined,
          resumeParsedData: newCandidate.resumeParsedData || undefined,
          resumeUploadedAt: newCandidate.resumeUploadedAt || undefined,
        }),
      });

      const candidate = buildCandidateFromApiRecord(
        createdCandidateResponse.data,
        null,
        newCandidate.position
      );

      const newCandidates = [...candidates, candidate];
      setCandidates(newCandidates);
      saveCandidatesToStorage(newCandidates);

      const resumeFileToProcess = newCandidate.resumeFile;
      const candidatePosition = newCandidate.position;
      const hasCompletedResumeAnalysis = hasDetailedResumeResult(
        newCandidate.resumeParsedData,
        Boolean(candidatePosition)
      );
      closeAddDialog();

      if (resumeFileToProcess && !hasCompletedResumeAnalysis) {
        const processingAt = new Date().toISOString();
        const processingPatch: Partial<Candidate> = {
          resumeUploaded: true,
          resumeFileName: resumeFileToProcess.name,
          resumeParsedData: {
            ...(candidate.resumeParsedData || {}),
            parseStatus: "processing",
            processingAt,
          },
          resumeUploadedAt: processingAt,
        };

        const processingCandidates = newCandidates.map((item) =>
          item.id === candidate.id ? { ...item, ...processingPatch } : item
        );
        setCandidates(processingCandidates);
        saveCandidatesToStorage(processingCandidates);
        setIsProcessingResume(true);
        void startBackgroundResumeParse(resumeFileToProcess, candidate.id, candidatePosition);
      }

      toast.success("候选人添加成功", {
        description: resumeFileToProcess
          ? hasCompletedResumeAnalysis
            ? "候选人信息和简历已保存"
            : "简历正在后台持续解析，完成后会自动补全详情"
          : "简历未上传",
      });
    } catch (error) {
      console.error("创建候选人失败:", error);
      toast.error(error instanceof ClientApiError ? error.message : "创建候选人失败，请稍后重试");
    } finally {
      addCandidateInFlightRef.current = false;
      setIsAdding(false);
    }
  }, [candidates, closeAddDialog, isAdding, isPreparingResume, newCandidate, startBackgroundResumeParse]);

  // 批量导入候选人处理函数
  const handleBatchImportCandidates = useCallback(async (candidatesToImport: ImportedCandidateRecord[]) => {
    setIsAdding(true);
    
    try {
      let duplicateCount = 0;
      const duplicateNames: string[] = [];
      const invalidCandidates: string[] = [];
      const createdCandidates: Candidate[] = [];
      const importedResultIds: string[] = [];
      const seenImportKeys = new Set<string>();
      const existingCandidateKeys = new Set<string>();

      for (const candidate of candidates) {
        if (candidate.resumeFileKey) {
          existingCandidateKeys.add(`file:${candidate.resumeFileKey}`);
        }
        const normalizedPhone = normalizeCandidatePhone(candidate.phone);
        if (normalizedPhone) {
          existingCandidateKeys.add(`phone:${normalizedPhone}`);
        }
        const normalizedEmail = normalizeCandidateEmail(candidate.email);
        if (normalizedEmail) {
          existingCandidateKeys.add(`email:${normalizedEmail}`);
        }
        const normalizedName = normalizeCandidateName(candidate.name);
        const normalizedFileName = candidate.resumeFileName?.trim().toLowerCase();
        if (normalizedName && normalizedFileName) {
          existingCandidateKeys.add(`name-file:${normalizedName}::${normalizedFileName}`);
        }
      }

      for (const candidate of candidatesToImport) {
        const extractedStructuredFields = extractCandidateStructuredFields(candidate.parsedData);
        const resolvedName =
          normalizeCandidateName(candidate.name) ||
          normalizeCandidateName(candidate.parsedData?.basicInfo?.name) ||
          "";
        const resolvedGender =
          candidate.gender?.trim() ||
          extractedStructuredFields.gender;
        const resolvedSchool =
          candidate.school?.trim() ||
          extractedStructuredFields.school;
        const resolvedMajor =
          candidate.major?.trim() ||
          extractedStructuredFields.major;
        const resolvedEducation =
          candidate.education?.trim() ||
          extractedStructuredFields.education;
        const resolvedPhone = normalizeCandidatePhone(
          candidate.phone || candidate.parsedData?.basicInfo?.phone || ""
        );
        const resolvedEmail = normalizeCandidateEmail(
          candidate.email || candidate.parsedData?.basicInfo?.email || ""
        );
        const resolvedPosition = candidate.position?.trim() || "";
        const normalizedPhone = resolvedPhone;
        const normalizedEmail = resolvedEmail;
        const normalizedName = resolvedName;
        const normalizedFileKey = candidate.fileKey?.trim();
        const normalizedFileName = candidate.fileName?.trim().toLowerCase();
        const normalizedParsedData = applyImportedStructuredFieldsToParsedData(candidate.parsedData, {
          name: resolvedName,
          phone: resolvedPhone,
          email: resolvedEmail,
          gender: resolvedGender,
          school: resolvedSchool,
          major: resolvedMajor,
          education: resolvedEducation,
        });
        const missingFields = [
          !resolvedName ? "姓名" : "",
          !resolvedGender ? "性别" : "",
          !resolvedSchool ? "学校" : "",
          !resolvedMajor ? "专业" : "",
          !resolvedEducation ? "学历" : "",
          !resolvedPhone ? "手机号" : "",
          !resolvedPosition ? "应聘岗位" : "",
        ].filter(Boolean);

        if (missingFields.length > 0) {
          invalidCandidates.push(`${candidate.fileName || resolvedName || "未命名简历"}（缺少${missingFields.join("、")}）`);
          continue;
        }

        const dedupeKeys = [
          normalizedFileKey ? `file:${normalizedFileKey}` : "",
          normalizedPhone ? `phone:${normalizedPhone}` : "",
          normalizedEmail ? `email:${normalizedEmail}` : "",
          normalizedName && normalizedFileName ? `name-file:${normalizedName}::${normalizedFileName}` : "",
        ].filter(Boolean);

        if (dedupeKeys.some((key) => seenImportKeys.has(key) || existingCandidateKeys.has(key))) {
          duplicateCount++;
          duplicateNames.push(`${candidate.name}(${candidate.phone || '无手机号'})`);
          continue;
        }

        dedupeKeys.forEach((key) => seenImportKeys.add(key));

        try {
          const response = await fetchClientJson<CandidateApiResponse<CandidateApiRecord>>('/api/candidates', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: resolvedName,
              gender: resolvedGender,
              school: resolvedSchool,
              major: resolvedMajor,
              education: resolvedEducation,
              phone: resolvedPhone,
              email: resolvedEmail || undefined,
              position: resolvedPosition,
              source: "批量导入",
              resumeUploaded: true,
              resumeFileName: candidate.fileName || undefined,
              resumeFileKey: candidate.fileKey || undefined,
              resumeDownloadUrl: candidate.downloadUrl || undefined,
              resumeUploadedAt: new Date().toISOString(),
              resumeParsedData: normalizedParsedData || candidate.extractedContent
                ? {
                    content: candidate.extractedContent || "",
                    parsedData: normalizedParsedData || null,
                    parsedAt: new Date().toISOString(),
                  }
                : undefined,
            }),
          });

          createdCandidates.push(
            buildCandidateFromApiRecord(response.data, null, resolvedPosition)
          );
          importedResultIds.push(candidate.sourceResultId);
          dedupeKeys.forEach((key) => existingCandidateKeys.add(key));
        } catch (error) {
          if (error instanceof ClientApiError && error.status === 409) {
            duplicateCount++;
            duplicateNames.push(`${resolvedName}(${resolvedPhone || '无手机号'})`);
            continue;
          }

          throw error;
        }
      }

      if (createdCandidates.length > 0) {
        const updatedCandidates = [...candidates, ...createdCandidates];
        setCandidates(updatedCandidates);
        saveCandidatesToStorage(updatedCandidates);
      }
      
      // 显示结果提示
      if (duplicateCount > 0) {
        toast.warning(`检测到 ${duplicateCount} 位重复候选人: ${duplicateNames.join('、')}`, {
          duration: 5000,
        });
      }

      if (invalidCandidates.length > 0) {
        toast.warning(`有 ${invalidCandidates.length} 份简历缺少必填信息，未导入候选人管理`, {
          description: invalidCandidates.slice(0, 3).join("、"),
          duration: 5000,
        });
      }
      
      if (createdCandidates.length > 0) {
        toast.success(`成功导入 ${createdCandidates.length} 位候选人${duplicateCount > 0 ? `，跳过 ${duplicateCount} 位重复候选人` : ''}${invalidCandidates.length > 0 ? `，另有 ${invalidCandidates.length} 份信息不完整` : ''}`);
        if (invalidCandidates.length === 0) {
          setIsAddDialogOpen(false);
        }
      } else {
        toast.info(
          duplicateCount > 0 || invalidCandidates.length > 0
            ? "本次没有成功导入新的候选人"
            : "所有候选人都已存在于系统中"
        );
      }

      return importedResultIds;
    } catch (error) {
      console.error('批量导入失败:', error);
      const message = error instanceof ClientApiError ? error.message : error instanceof Error ? error.message : "批量导入失败";
      toast.error(message);
      throw error;
    } finally {
      setIsAdding(false);
    }
  }, [candidates]);

  const handleViewDetail = useCallback((candidate: typeof mockCandidates[0]) => {
    setSelectedCandidate(candidate);
    setIsDetailDialogOpen(true);
  }, []);

  const updateCandidateDraft = useCallback((candidateId: number, patch: Partial<Candidate>) => {
    setCandidates((prevCandidates) => {
      const updatedCandidates = prevCandidates.map((candidate) =>
        candidate.id === candidateId ? { ...candidate, ...patch } : candidate
      );
      saveCandidatesToStorage(updatedCandidates);
      return updatedCandidates;
    });

    setSelectedCandidate((prevCandidate) =>
      prevCandidate && prevCandidate.id === candidateId
        ? { ...prevCandidate, ...patch }
        : prevCandidate
    );
  }, []);

  const persistCandidatePatch = useCallback(async (
    candidateId: number,
    patch: Partial<Candidate>,
    successMessage?: string
  ) => {
    const previousCandidate = candidates.find((candidate) => candidate.id === candidateId);
    if (!previousCandidate) {
      return false;
    }

    updateCandidateDraft(candidateId, patch);

    try {
      const response = await fetchClientJson<CandidateApiResponse<CandidateApiRecord>>(`/api/candidates/${candidateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patch),
      });

      const mergedCandidate = buildCandidateFromApiRecord(
        response.data,
        { ...previousCandidate, ...patch },
        previousCandidate.position
      );

      setCandidates((prevCandidates) => {
        const updatedCandidates = prevCandidates.map((candidate) =>
          candidate.id === candidateId ? mergedCandidate : candidate
        );
        saveCandidatesToStorage(updatedCandidates);
        return updatedCandidates;
      });
      setSelectedCandidate((prevCandidate) =>
        prevCandidate && prevCandidate.id === candidateId ? mergedCandidate : prevCandidate
      );

      if (successMessage) {
        toast.success(successMessage);
      }

      return true;
    } catch (error) {
      updateCandidateDraft(candidateId, previousCandidate);
      toast.error(error instanceof ClientApiError ? error.message : "保存失败，请稍后重试");
      return false;
    }
  }, [candidates, updateCandidateDraft]);

  // 导出候选人数据（PDF格式）- 使用 Blob URL + iframe + html2pdf.js
  const handleExportCandidateData = useCallback(async (candidate: Candidate) => {
    if (!candidate) {
      return;
    }

    try {
      toast.loading('正在生成PDF...', { id: 'export-pdf' });

      const response = await fetch('/api/candidates/export-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ candidate }),
      });

      if (!response.ok) {
        throw new Error('生成报告失败');
      }

      // 获取 HTML 内容
      const htmlContent = await response.text();

      // 动态加载 html2canvas 和 jsPDF
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;

      // 创建一个完全隔离的 iframe
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.left = '-9999px';
      iframe.style.top = '0';
      iframe.style.width = '210mm';
      iframe.style.height = '297mm';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);

      // 写入 HTML 内容到 iframe
      const iframeDoc = iframe.contentDocument || iframe.contentWindow!.document;
      iframeDoc.open();
      iframeDoc.write(htmlContent);
      iframeDoc.close();

      // 等待 iframe 内容完全加载
      await new Promise((resolve) => {
        if (iframeDoc.readyState === 'complete') {
          resolve(0);
        } else {
          iframeDoc.onreadystatechange = () => {
            if (iframeDoc.readyState === 'complete') {
              resolve(0);
            }
          };
        }
      });

      // 额外等待确保样式加载
      await new Promise(resolve => setTimeout(resolve, 500));

      // 使用 html2canvas 截图
      const canvas = await html2canvas(iframeDoc.body, {
        scale: 2,
        useCORS: true,
        logging: false,
        allowTaint: true,
        backgroundColor: '#ffffff',
        foreignObjectRendering: false,
      });

      // 清理临时 iframe
      document.body.removeChild(iframe);

      // 创建 PDF
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');

      // 计算图片在 PDF 中的尺寸
      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      // 添加第一页
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      // 如果内容超过一页，添加新页面
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      // 下载 PDF
      const filename = `${candidate.name}_${candidate.position}.pdf`;
      pdf.save(filename);

      toast.success('PDF 导出成功', { id: 'export-pdf' });
    } catch (error) {
      console.error('导出PDF失败:', error);
      toast.error('导出PDF失败：' + (error instanceof Error ? error.message : '未知错误'), { id: 'export-pdf' });
    }
  }, []);

  const handleDeleteCandidate = useCallback(async () => {
    if (!selectedCandidate) {
      return;
    }

    try {
      await fetchClientJson<CandidateApiResponse<null>>(`/api/candidates/${selectedCandidate.id}`, {
        method: 'DELETE',
      });
    } catch (error) {
      if (!(error instanceof ClientApiError) || error.status !== 404) {
        toast.error(error instanceof ClientApiError ? error.message : "删除失败，请稍后重试");
        return;
      }
    }

    const updated = candidates.filter(c => c.id !== selectedCandidate.id);
    setCandidates(updated);
    saveCandidatesToStorage(updated);
    setIsDetailDialogOpen(false);
    setIsDeleteConfirmOpen(false);
    toast.success("候选人已删除");
  }, [selectedCandidate, candidates]);

  // 处理复选框选择
  const handleToggleSelect = useCallback((candidateId: number) => {
    setSelectedCandidateIds(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(candidateId)) {
        newSelected.delete(candidateId);
      } else {
        newSelected.add(candidateId);
      }
      setIsAllSelected(newSelected.size === filteredCandidates.length);
      return newSelected;
    });
  }, [filteredCandidates.length]);

  // 处理全选/取消全选
  const handleToggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedCandidateIds(new Set());
      setIsAllSelected(false);
    } else {
      const allIds = new Set(filteredCandidates.map(c => c.id));
      setSelectedCandidateIds(allIds);
      setIsAllSelected(true);
    }
  }, [isAllSelected, filteredCandidates]);

  // 处理批量删除
  const handleBatchDelete = useCallback(async () => {
    if (selectedCandidateIds.size === 0) {
      toast.error("请先选择要删除的候选人");
      return;
    }

    for (const candidateId of selectedCandidateIds) {
      try {
        await fetchClientJson<CandidateApiResponse<null>>(`/api/candidates/${candidateId}`, {
          method: 'DELETE',
        });
      } catch (error) {
        if (!(error instanceof ClientApiError) || error.status !== 404) {
          toast.error(error instanceof ClientApiError ? error.message : "批量删除失败，请稍后重试");
          return;
        }
      }
    }

    const updated = candidates.filter(c => !selectedCandidateIds.has(c.id));
    setCandidates(updated);
    saveCandidatesToStorage(updated);
    setSelectedCandidateIds(new Set());
    setIsAllSelected(false);
    setIsBatchDeleteDialogOpen(false);
    toast.success(`已删除 ${selectedCandidateIds.size} 位候选人`);
  }, [selectedCandidateIds, candidates]);

  const handleResumeDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleResumeDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // 上传并解析简历，提前把姓名/电话/邮箱和简历元数据准备好
  const prepareResumeForNewCandidate = useCallback(async (file: File) => {
    toast.loading("正在上传并解析简历...", { id: "extract-info" });
    setIsPreparingResume(true);

    try {
      const fallbackName = extractNameFromResumeFileName(file.name);
      if (fallbackName) {
        updateNewCandidate((prev) => ({
          ...prev,
          resumeFile: file,
          resumeFileName: file.name,
          name: prev.name || fallbackName,
        }));
      }

      const uploadFormData = new FormData();
      uploadFormData.append("file", file);
      const uploadResult = await fetchClientJson<ResumeUploadResponse>("/api/resume/upload", {
        method: "POST",
        body: uploadFormData,
      });

      const extractResult = await fetchClientJson<ResumeExtractResponse>("/api/resume/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileKey: uploadResult.fileKey,
          fileName: uploadResult.fileName || file.name,
        }),
      });

      if (!extractResult.success || !extractResult.content) {
        throw new Error("未能从文件中提取到有效内容");
      }

      const serverDetectedInfo = {
        name: normalizeCandidateName(extractResult.detectedInfo?.name),
        phone: normalizeCandidatePhone(extractResult.detectedInfo?.phone),
        email: normalizeCandidateEmail(extractResult.detectedInfo?.email),
      };

      const latestPosition = newCandidateRef.current.position;
      const positionInfo = findPositionOption(positions, latestPosition);
      let parsedData: ResumeParseData | undefined;
      try {
        const parseResult = await fetchClientJson<ResumeParseResponse>("/api/resume/parse", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            resumeContent: extractResult.content,
            position: positionInfo,
          }),
        });

        if (parseResult.success && parseResult.data) {
          parsedData = parseResult.data;
        }
      } catch (parseError) {
        console.error("[简历信息提取] 结构化解析失败，回退到文本识别:", parseError);
      }

      const fallbackContactInfo = mergeDetectedContactInfo(file.name, extractResult.content, parsedData);
      const contactInfo = {
        name: serverDetectedInfo.name || fallbackContactInfo.name,
        phone: serverDetectedInfo.phone || fallbackContactInfo.phone,
        email: serverDetectedInfo.email || fallbackContactInfo.email,
      };

      const resumeUploadedAt = new Date().toISOString();
      const resumeParsedData: CandidateResumeParsedData = {
        content: extractResult.content,
        parsedData: parsedData || null,
        parsedAt: resumeUploadedAt,
      };
      const extractedStructuredFields = extractCandidateStructuredFields(parsedData || null);

      console.log('[简历信息提取]', {
        原始文本长度: extractResult.content.length,
        提取结果: contactInfo,
        服务端提取结果: serverDetectedInfo,
        结构化基础信息: parsedData?.basicInfo || null,
        原始文本预览: extractResult.content.substring(0, 500)
      });

      setDebugExtractedText(extractResult.content);
      setShowDebugInfo(true);

      updateNewCandidate((prev) => ({
        ...prev,
        resumeFile: file,
        resumeFileName: uploadResult.fileName || file.name,
        resumeFileKey: uploadResult.fileKey,
        resumeDownloadUrl: uploadResult.downloadUrl,
        resumeParsedData,
        resumeUploadedAt,
        name: contactInfo.name || prev.name,
        gender: extractedStructuredFields.gender || prev.gender,
        school: extractedStructuredFields.school || prev.school,
        major: extractedStructuredFields.major || prev.major,
        education: extractedStructuredFields.education || prev.education,
        phone: contactInfo.phone || prev.phone,
        email: contactInfo.email || prev.email,
      }));

      const filledFields = [];
      if (contactInfo.name) filledFields.push("姓名");
      if (extractedStructuredFields.gender) filledFields.push("性别");
      if (extractedStructuredFields.school) filledFields.push("学校");
      if (extractedStructuredFields.major) filledFields.push("专业");
      if (extractedStructuredFields.education) filledFields.push("学历");
      if (contactInfo.phone) filledFields.push("手机号");
      if (contactInfo.email) filledFields.push("邮箱");

      toast.dismiss("extract-info");
      if (filledFields.length > 0) {
        toast.success("简历解析成功", {
          description: `已自动填充：${filledFields.join("、")}，并已准备保存简历`,
        });
      } else {
        toast.info("简历解析完成", {
          description: "已保存简历内容，但未能提取到完整联系信息，请手动补充",
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "请重试";
      updateNewCandidate((prev) => ({
        ...prev,
        resumeFile: file,
        resumeFileName: file.name,
        resumeFileKey: "",
        resumeDownloadUrl: "",
        resumeUploadedAt: "",
        resumeParsedData: {
          error: errorMessage,
          errorAt: new Date().toISOString(),
        },
      }));
      toast.dismiss("extract-info");
      console.error('[简历信息提取失败]', error);
      toast.error("简历解析失败", {
        description: errorMessage,
      });
    } finally {
      setIsPreparingResume(false);
    }
  }, [positions, updateNewCandidate]);

  const handleResumeDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      
      // 验证文件类型
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
        toast.error("不支持的文件格式，请上传文档或图片文件");
        return;
      }

      // 验证文件大小
      const maxSize = file.type.startsWith('image/') ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
      if (file.size > maxSize) {
        toast.error(file.type.startsWith('image/') ? "图片文件大小不能超过 20MB" : "文档文件大小不能超过 10MB");
        return;
      }

      // 立即更新状态显示文件信息
      patchNewCandidate({ resumeFile: file });

      // 异步上传并提取联系信息
      await prepareResumeForNewCandidate(file);
    }
  }, [patchNewCandidate, prepareResumeForNewCandidate]);

  return (
    <div className="p-8">
      <datalist id={CANDIDATE_MAJOR_DATALIST_ID}>
        {majorLibraryOptions.map((major) => (
          <option key={major} value={major} />
        ))}
      </datalist>

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">候选人管理</h1>
          <p className="mt-2 text-gray-600">管理所有候选人信息</p>
          {(isProcessingResume || hasProcessingCandidates) && (
            <div className="mt-3 flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                正在后台处理 {processingCandidateCount || 1} 份简历，切换页面不会中断，处理完成后会自动更新候选人信息...
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleExportCandidates}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            导出数据
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={handleAddDialogOpenChange}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                添加候选人
              </Button>
            </DialogTrigger>
          <DialogContent
            className="sm:max-w-[600px] max-h-[90vh]"
            onInteractOutside={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>添加候选人</DialogTitle>
              <DialogDescription>
                支持单个添加或批量上传简历
              </DialogDescription>
            </DialogHeader>
            <Tabs
              value={candidateDialogTab}
              onValueChange={(value) => setCandidateDialogTab(value as "single" | "batch")}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="single">单个添加</TabsTrigger>
                <TabsTrigger value="batch">批量上传</TabsTrigger>
              </TabsList>
              
              {/* 单个添加 Tab */}
              <TabsContent value="single" className="space-y-4 py-4 overflow-y-auto max-h-[calc(90vh-280px)] pr-2">
              <div className="grid gap-2">
                <Label htmlFor="name">姓名 *</Label>
                <Input
                  id="name"
                  value={newCandidate.name}
                  onChange={(e) => patchNewCandidate({ name: e.target.value })}
                  placeholder="请输入候选人姓名"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="gender">性别 *</Label>
                <Select
                  value={newCandidate.gender}
                  onValueChange={(value) => patchNewCandidate({ gender: value })}
                >
                  <SelectTrigger id="gender">
                    <SelectValue placeholder="请选择性别" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="男">男</SelectItem>
                    <SelectItem value="女">女</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="school">学校 *</Label>
                <Input
                  id="school"
                  value={newCandidate.school}
                  onChange={(e) => patchNewCandidate({ school: e.target.value })}
                  placeholder="请输入毕业院校"
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="major">专业 *</Label>
                  {canManageMajorLibrary ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => setIsMajorLibraryDialogOpen(true)}
                    >
                      管理专业库
                    </Button>
                  ) : null}
                </div>
                <Input
                  id="major"
                  list={CANDIDATE_MAJOR_DATALIST_ID}
                  value={newCandidate.major}
                  onChange={(e) => patchNewCandidate({ major: e.target.value })}
                  placeholder="请输入所学专业"
                />
                <p className="text-xs text-slate-500">
                  支持手动输入、下拉联想和快捷选择，专业选项与筛选面板实时同步
                </p>
                <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto pr-1">
                  {addCandidateMajorQuickOptions.map((major) => (
                    <Button
                      key={major}
                      type="button"
                      variant={newCandidate.major === major ? "default" : "outline"}
                      size="sm"
                      className="h-8"
                      onClick={() => patchNewCandidate({ major })}
                    >
                      {major}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="education">学历 *</Label>
                <Select
                  value={newCandidate.education}
                  onValueChange={(value) => patchNewCandidate({ education: value })}
                >
                  <SelectTrigger id="education">
                    <SelectValue placeholder="请选择学历" />
                  </SelectTrigger>
                  <SelectContent>
                    {EDUCATION_FILTER_OPTIONS.map((educationOption) => (
                      <SelectItem key={educationOption} value={educationOption}>
                        {educationOption}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">手机号 *</Label>
                <Input
                  id="phone"
                  value={newCandidate.phone}
                  onChange={(e) => patchNewCandidate({ phone: e.target.value })}
                  placeholder="请输入手机号"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  value={newCandidate.email}
                  onChange={(e) => patchNewCandidate({ email: e.target.value })}
                  placeholder="请输入邮箱地址（选填）"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="position">应聘岗位 *</Label>
                <Select
                  value={newCandidate.position}
                  onValueChange={(value) => patchNewCandidate({ position: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={positions.length > 0 ? "选择应聘岗位" : "暂无岗位，请先创建岗位"} />
                  </SelectTrigger>
                  <SelectContent>
                    {positions.length > 0 ? (
                      positions.map((pos) => (
                        <SelectItem key={pos.title} value={pos.title}>
                          {pos.title}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="empty" disabled>
                        暂无可用岗位
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {positions.length === 0 && (
                  <p className="text-sm text-orange-500 mt-1">
                    请先在岗位管理页面创建岗位
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="source">来源</Label>
                <Select
                  value={newCandidate.source}
                  onValueChange={(value) => patchNewCandidate({ source: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择候选人来源" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Boss直聘">Boss直聘</SelectItem>
                    <SelectItem value="猎聘">猎聘</SelectItem>
                    <SelectItem value="拉勾网">拉勾网</SelectItem>
                    <SelectItem value="智联招聘">智联招聘</SelectItem>
                    <SelectItem value="前程无忧">前程无忧</SelectItem>
                    <SelectItem value="其他">其他</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="resume">简历上传</Label>
                
                {/* 拖拽上传区域 */}
                <div
                  onDragOver={handleResumeDragOver}
                  onDragLeave={handleResumeDragLeave}
                  onDrop={handleResumeDrop}
                  onClick={() => resumeInputRef.current?.click()}
                  className={`
                    border-2 border-dashed rounded-lg p-6 transition-all cursor-pointer
                    ${isDragging 
                      ? 'border-primary bg-primary/5' 
                      : 'border-gray-300 hover:border-primary hover:bg-gray-50'
                    }
                  `}
                >
                  <input
                    ref={resumeInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.rtf,.txt,.xml,.jpeg,.jpg,.png,.gif,.bmp,.webp,.svg,.tiff"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        // 验证文件类型
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
                          toast.error("不支持的文件格式，请上传文档或图片文件");
                          e.target.value = "";
                          return;
                        }

                        // 验证文件大小（文档最大10MB，图片最大20MB）
                        const maxSize = file.type.startsWith('image/') ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
                        if (file.size > maxSize) {
                          toast.error(file.type.startsWith('image/') ? "图片文件大小不能超过 20MB" : "文档文件大小不能超过 10MB");
                          e.target.value = "";
                          return;
                        }

                        // 立即更新状态显示文件信息
                        patchNewCandidate({ resumeFile: file });

                        // 异步上传并提取联系信息
                        await prepareResumeForNewCandidate(file);
                      }
                    }}
                    className="hidden"
                  />
                  
                  {!newCandidate.resumeFile && !newCandidate.resumeFileName ? (
                    <div className="flex flex-col items-center justify-center text-center">
                      <Upload className={`h-8 w-8 ${isDragging ? 'text-primary' : 'text-gray-400'} mb-2`} />
                      <p className={`text-sm font-medium ${isDragging ? 'text-primary' : 'text-gray-700'}`}>
                        {isDragging ? '释放鼠标以上传文件' : '点击或拖拽文件到此处上传'}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center">
                      <div className="flex items-center gap-3 bg-white rounded-lg p-3 shadow-sm">
                        <FileText className="h-6 w-6 text-gray-500" />
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium text-gray-900">
                            {newCandidate.resumeFile?.name || newCandidate.resumeFileName}
                          </p>
                          {newCandidate.resumeFile ? (
                            <p className="text-xs text-gray-500">
                              {(newCandidate.resumeFile.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          ) : (
                            <p className="text-xs text-gray-500">
                              已恢复上传状态，解析结果与自动填充内容已保留
                            </p>
                          )}
                        </div>
                        {newCandidate.resumeParsedData?.content && (
                          <Badge variant="outline" className="text-xs">
                            已解析
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateNewCandidate((prev) => ({
                              ...prev,
                              resumeFile: null,
                              resumeFileName: "",
                              resumeFileKey: "",
                              resumeDownloadUrl: "",
                              resumeParsedData: null,
                              resumeUploadedAt: "",
                            }));
                            if (resumeInputRef.current) {
                              resumeInputRef.current.value = '';
                            }
                          }}
                          className="h-8 px-2 text-xs"
                        >
                          更换
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  支持文档（PDF、Word、RTF、TXT、XML）和图片（JPEG、PNG、GIF、BMP、WebP、SVG、TIFF）
                </p>
                {isPreparingResume && (
                  <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>正在上传并解析简历，完成后会自动填充姓名、性别、学校、专业、学历、手机号、邮箱并保存简历元数据</span>
                  </div>
                )}
                {!isPreparingResume && newCandidate.resumeParsedData?.error && (
                  <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                    简历处理失败：{newCandidate.resumeParsedData.error}
                  </div>
                )}
                
                {/* 调试信息显示区域 */}
                {showDebugInfo && debugExtractedText && (
                  <div className="mt-4 p-4 bg-gray-50 border border-gray-300 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-gray-900">🔍 简历文本提取调试信息</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowDebugInfo(false)}
                        className="h-6 text-xs"
                      >
                        关闭
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs">
                        <span className="font-semibold text-gray-700">提取的文本长度：</span>
                        <span className="text-gray-900">{debugExtractedText.length} 字符</span>
                      </div>
                      <div className="text-xs">
                        <span className="font-semibold text-gray-700">提取的姓名：</span>
                        <span className="text-gray-900">{newCandidate.name || "未提取到"}</span>
                      </div>
                      <div className="text-xs">
                        <span className="font-semibold text-gray-700">提取的手机号：</span>
                        <span className="text-gray-900">{newCandidate.phone || "未提取到"}</span>
                      </div>
                      <div className="text-xs">
                        <span className="font-semibold text-gray-700">提取的性别：</span>
                        <span className="text-gray-900">{newCandidate.gender || "未提取到"}</span>
                      </div>
                      <div className="text-xs">
                        <span className="font-semibold text-gray-700">提取的学校：</span>
                        <span className="text-gray-900">{newCandidate.school || "未提取到"}</span>
                      </div>
                      <div className="text-xs">
                        <span className="font-semibold text-gray-700">提取的专业：</span>
                        <span className="text-gray-900">{newCandidate.major || "未提取到"}</span>
                      </div>
                      <div className="text-xs">
                        <span className="font-semibold text-gray-700">提取的学历：</span>
                        <span className="text-gray-900">{newCandidate.education || "未提取到"}</span>
                      </div>
                      <div className="text-xs">
                        <span className="font-semibold text-gray-700">提取的邮箱：</span>
                        <span className="text-gray-900">{newCandidate.email || "未提取到"}</span>
                      </div>
                      <div className="mt-2">
                        <details className="text-xs">
                          <summary className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium">
                            查看提取的文本内容（前500字符）
                          </summary>
                          <pre className="mt-2 p-2 bg-white border rounded text-xs overflow-x-auto whitespace-pre-wrap">
                            {debugExtractedText.substring(0, 500)}
                          </pre>
                        </details>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
            
            {/* 批量上传 Tab */}
            <TabsContent value="batch" className="py-4">
              {candidateDialogTab === "batch" ? (
                <BatchResumeUpload
                  onImportCandidates={handleBatchImportCandidates}
                  positions={positions}
                />
              ) : null}
            </TabsContent>
          </Tabs>
            
            {/* 单个添加的底部按钮 - 只在单个添加Tab显示 */}
            <div className="flex justify-end gap-2 pt-4 border-t" data-tab="single-footer">
              <Button variant="outline" onClick={closeAddDialog} disabled={isAdding || isPreparingResume}>
                取消
              </Button>
              <Button onClick={handleAddCandidate} disabled={isAdding || isPreparingResume}>
                {(isAdding || isPreparingResume) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isPreparingResume ? "解析简历中..." : isAdding ? "添加中..." : "添加"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="mb-6">
        <div className="flex gap-3 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder={searchMode === "basic" 
                ? "搜索候选人姓名、岗位、手机号或邮箱..." 
                : "搜索简历内容（技能、经历、项目、教育等）..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <Button
              variant={searchMode === "basic" ? "default" : "ghost"}
              size="sm"
              onClick={() => setSearchMode("basic")}
              className="text-xs"
            >
              基本信息
            </Button>
            <Button
              variant={searchMode === "resume" ? "default" : "ghost"}
              size="sm"
              onClick={() => setSearchMode("resume")}
              className="text-xs"
            >
              <FileText className="h-3 w-3 mr-1" />
              简历内容
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-gray-600">筛选面试阶段：</span>
          <Button
            variant={filterStage === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStage("all")}
          >
            全部
          </Button>
          <Button
            variant={filterStage === "pending" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStage("pending")}
          >
            待初试（初始）
          </Button>
          <Button
            variant={filterStage === "initial" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStage("initial")}
          >
            待初试
          </Button>
          <Button
            variant={filterStage === "pendingInterview" ? "secondary" : "outline"}
            size="sm"
            onClick={() => setFilterStage("pendingInterview")}
            className="text-orange-600 border-orange-600 hover:bg-orange-50"
          >
            待定
          </Button>
          <Button
            variant={filterStage === "second" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStage("second")}
          >
            待复试
          </Button>
          <Button
            variant={filterStage === "final" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStage("final")}
          >
            待终试
          </Button>
          <Button
            variant={filterStage === "offer" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStage("offer")}
          >
            待入职
          </Button>
          <Button
            variant={filterStage === "hired" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStage("hired")}
          >
            已入职
          </Button>
          <Button
            variant={filterStage === "rejected" ? "outline" : "outline"}
            size="sm"
            onClick={() => setFilterStage("rejected")}
            className="text-red-600 border-red-600 hover:bg-red-50"
          >
            已淘汰
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t">
          <span className="text-gray-600">筛选岗位：</span>
          <Select value={filterPosition} onValueChange={setFilterPosition}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="选择岗位" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部岗位</SelectItem>
              {positions.map((position) => (
                <SelectItem key={position.title} value={position.title}>
                  {position.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* 按匹配度排序按钮 */}
          {filterPosition !== "all" && (
            <Button
              variant={sortByMatchScore !== "none" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                if (sortByMatchScore === "none") {
                  setSortByMatchScore("desc"); // 默认从高到低
                } else if (sortByMatchScore === "desc") {
                  setSortByMatchScore("asc"); // 切换到从低到高
                } else {
                  setSortByMatchScore("none"); // 关闭排序
                }
              }}
              className="ml-2"
            >
              {sortByMatchScore === "desc" && <ArrowDown className="mr-1 h-3 w-3" />}
              {sortByMatchScore === "asc" && <ArrowUp className="mr-1 h-3 w-3" />}
              {sortByMatchScore === "none" && <ArrowUpDown className="mr-1 h-3 w-3" />}
              {sortByMatchScore === "desc" ? "匹配度（高→低）" : 
               sortByMatchScore === "asc" ? "匹配度（低→高）" : "按匹配度排序"}
            </Button>
          )}
        </div>
        {isAdvancedFilterPanelVisible && (
          <div className="mt-3 rounded-xl border bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-900">岗位扩展筛选</p>
                <p className="text-xs text-slate-500">
                  已选岗位：{filterPosition}，以下条件会与现有搜索、阶段、时间、排序联动生效
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">已启用 {hasAdvancedFilterSelection ? "高级筛选" : "默认筛选"}</Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearAdvancedFilters}
                  disabled={!hasAdvancedFilterSelection}
                >
                  清空新增筛选
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="space-y-2 rounded-lg border bg-white p-4">
                <Label className="text-sm font-medium">年龄范围</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="起始年龄"
                    value={filterAgeMin}
                    onChange={(event) => setFilterAgeMin(event.target.value)}
                  />
                  <span className="text-sm text-slate-500">至</span>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="结束年龄"
                    value={filterAgeMax}
                    onChange={(event) => setFilterAgeMax(event.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2 rounded-lg border bg-white p-4">
                <Label className="text-sm font-medium">性别</Label>
                <div className="flex flex-wrap gap-2">
                  {(["all", "男", "女", "不限"] as GenderFilterValue[]).map((gender) => (
                    <Button
                      key={gender}
                      type="button"
                      variant={filterGender === gender ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFilterGender(gender)}
                    >
                      {gender === "all" ? "全部" : gender}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded-lg border bg-white p-4">
                <Label className="text-sm font-medium">学历</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {EDUCATION_FILTER_OPTIONS.map((education) => (
                    <label
                      key={education}
                      className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      <Checkbox
                        checked={filterEducationLevels.includes(education)}
                        onCheckedChange={() => toggleEducationLevel(education)}
                      />
                      <span>{education}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded-lg border bg-white p-4">
                <Label className="text-sm font-medium">学校</Label>
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">学校层次</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {SCHOOL_TIER_OPTIONS.map((tier) => (
                      <label
                        key={tier}
                        className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        <Checkbox
                          checked={filterSchoolTiers.includes(tier)}
                          onCheckedChange={() => toggleSchoolTier(tier)}
                        />
                        <span>{tier}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">学校性质</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {SCHOOL_NATURE_OPTIONS.map((nature) => (
                      <label
                        key={nature}
                        className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
                      >
                        <Checkbox
                          checked={filterSchoolNatures.includes(nature)}
                          onCheckedChange={() => toggleSchoolNature(nature)}
                        />
                        <span>{nature}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-dashed bg-white/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">当前已选条件</p>
                  <p className="text-xs text-slate-500">
                    仅在当前岗位下生效，结果会实时刷新，原有排序、分页与展示逻辑保持不变
                  </p>
                </div>
                <Badge variant={hasAdvancedFilterSelection ? "default" : "outline"}>
                  匹配结果 {filteredCandidates.length} 人
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {advancedFilterSummaryItems.length > 0 ? (
                  advancedFilterSummaryItems.map((item) => (
                    <Badge key={item} variant="secondary" className="px-3 py-1 text-xs">
                      {item}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">
                    暂未设置新增筛选条件，当前仍按原有筛选规则展示该岗位候选人
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-lg border bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Label className="text-sm font-medium">专业</Label>
                  <p className="text-xs text-slate-500">支持关键词模糊搜索和精准匹配，可手动输入或快速选择</p>
                </div>
                <div className="flex items-center gap-2">
                  {canManageMajorLibrary ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsMajorLibraryDialogOpen(true)}
                    >
                      管理专业库
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant={filterMajorMatchMode === "fuzzy" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterMajorMatchMode("fuzzy")}
                  >
                    模糊匹配
                  </Button>
                  <Button
                    type="button"
                    variant={filterMajorMatchMode === "exact" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilterMajorMatchMode("exact")}
                  >
                    精准匹配
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                当前模式：{filterMajorMatchMode === "exact" ? "仅保留专业名称完全一致的候选人" : "保留专业名称包含关键词的候选人"}
              </p>
              <Input
                className="mt-3"
                list={CANDIDATE_MAJOR_DATALIST_ID}
                placeholder="输入专业关键词，例如：计算机科学与技术"
                value={filterMajorKeyword}
                onChange={(event) => setFilterMajorKeyword(event.target.value)}
              />
              <div className="mt-3 flex max-h-32 flex-wrap gap-2 overflow-y-auto pr-1">
                {availableMajorOptions.map((major) => (
                  <Button
                    key={major}
                    type="button"
                    variant={filterMajorKeyword === major ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      setFilterMajorKeyword((currentKeyword) =>
                        currentKeyword === major ? "" : major
                      )
                    }
                    className="h-8"
                  >
                    {major}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t">
          <span className="text-gray-600">按创建时间筛选：</span>
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="选择年份" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部年份</SelectItem>
              {availableYears.map((year) => (
                <SelectItem key={year} value={year}>
                  {year} 年
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="选择月份" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部月份</SelectItem>
              {Array.from({ length: 12 }, (_, index) => {
                const month = String(index + 1).padStart(2, "0");
                return (
                  <SelectItem key={month} value={month}>
                    {month} 月
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          <Select value={filterDay} onValueChange={setFilterDay}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="选择日期" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部日期</SelectItem>
              {Array.from({ length: 31 }, (_, index) => {
                const day = String(index + 1).padStart(2, "0");
                return (
                  <SelectItem key={day} value={day}>
                    {day} 日
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {(filterYear !== "all" || filterMonth !== "all" || filterDay !== "all") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFilterYear("all");
                setFilterMonth("all");
                setFilterDay("all");
              }}
            >
              清空时间筛选
            </Button>
          )}
        </div>
        <div className="flex items-center justify-between text-sm mt-3">
          <span className="text-gray-600">
            共 {candidates.length} 位候选人，显示 {filteredCandidates.length} 位
          </span>
          <div className="flex items-center gap-2">
            <span className="text-gray-600">
              当前可用岗位: <span className="font-semibold">{positions.length}</span> 个
            </span>
            {positions.length === 0 && (
              <Button variant="outline" size="sm" asChild>
                <a href="/positions">
                  <Plus className="mr-1 h-3 w-3" />
                  创建岗位
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 批量操作区域 */}
      {filteredCandidates.length > 0 && (
        <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg border">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isAllSelected && selectedCandidateIds.size > 0}
              onChange={handleToggleSelectAll}
              className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
            />
            <span className="text-sm text-gray-600">
              全选 ({selectedCandidateIds.size}/{filteredCandidates.length})
            </span>
          </div>
          {selectedCandidateIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsBatchDeleteDialogOpen(true)}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              批量删除 ({selectedCandidateIds.size})
            </Button>
          )}
        </div>
      )}

      {/* 候选人列表 */}
      <div className="grid gap-4">
        {filteredCandidates.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            isSelected={selectedCandidateIds.has(candidate.id)}
            onToggleSelect={handleToggleSelect}
            onViewDetail={handleViewDetail}
            canEdit={canEditCandidate(user, candidate)}
          />
        ))}
      </div>

      {/* 查看详情对话框 */}
      {canManageMajorLibrary ? (
        <Dialog
          open={isMajorLibraryDialogOpen}
          onOpenChange={(open) => {
            setIsMajorLibraryDialogOpen(open);
            if (!open) {
              cancelEditMajorLibraryOption();
              setNewMajorLibraryOption("");
            }
          }}
        >
          <DialogContent
            showCloseButton={false}
            className="top-4 left-1/2 min-h-0 !flex h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[640px] -translate-x-1/2 translate-y-0 !flex-col !gap-0 overflow-hidden p-0 sm:top-6 sm:h-[calc(100vh-3rem)] sm:max-h-[calc(100vh-3rem)]"
          >
            <div className="z-10 flex shrink-0 items-start justify-between gap-4 border-b bg-background px-6 py-5 shadow-sm">
              <DialogHeader className="min-w-0 flex-1 gap-2 pr-0 text-left">
                <DialogTitle>管理专业库</DialogTitle>
                <DialogDescription>
                  新增、编辑或删除专业选项后，筛选面板与添加候选人中的专业选项会实时同步更新
                </DialogDescription>
              </DialogHeader>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-[-2px] h-9 w-9 shrink-0 rounded-full"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">关闭</span>
                </Button>
              </DialogClose>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden px-6 py-5">
              <div className="flex h-full min-h-0 flex-col space-y-4">
                <div className="rounded-lg border bg-slate-50 p-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <Label htmlFor="new-major-library-option">新增专业</Label>
                      <Input
                        id="new-major-library-option"
                        value={newMajorLibraryOption}
                        onChange={(event) => setNewMajorLibraryOption(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void handleAddMajorLibraryOption();
                          }
                        }}
                        placeholder="请输入专业名称，例如：计算机科学与技术"
                        disabled={isUpdatingMajorLibrary}
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={() => void handleAddMajorLibraryOption()}
                      disabled={isUpdatingMajorLibrary}
                    >
                      {isUpdatingMajorLibrary ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                      新增专业
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">当前专业选项</p>
                    <p className="text-xs text-slate-500">共 {majorLibraryOptions.length} 项，修改后两端页面立即共享同一数据源</p>
                  </div>
                  <Badge variant="outline">实时同步</Badge>
                </div>

                <div
                  ref={majorLibraryListRef}
                  className="overflow-y-auto overscroll-contain pr-2"
                  style={{
                    height: "clamp(240px, 52vh, 480px)",
                    WebkitOverflowScrolling: "touch",
                    scrollbarGutter: "stable",
                  }}
                  tabIndex={0}
                  onKeyDown={handleMajorLibraryListKeyDown}
                >
                  <div className="space-y-2 pb-1 pr-2">
                    {majorLibraryOptions.length > 0 ? (
                      majorLibraryOptions.map((major) => {
                        const isEditing = editingMajorLibraryOption === major;

                        return (
                          <div
                            key={major}
                            className="flex flex-wrap items-center gap-2 rounded-lg border bg-white px-3 py-3"
                          >
                            {isEditing ? (
                              <Input
                                value={editingMajorLibraryValue}
                                onChange={(event) => setEditingMajorLibraryValue(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    void handleSaveMajorLibraryOption();
                                  }
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    cancelEditMajorLibraryOption();
                                  }
                                }}
                                disabled={isUpdatingMajorLibrary}
                                className="min-w-0 flex-1"
                              />
                            ) : (
                              <span className="min-w-0 flex-1 break-words text-sm text-slate-900">{major}</span>
                            )}

                            {isEditing ? (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => void handleSaveMajorLibraryOption()}
                                  disabled={isUpdatingMajorLibrary}
                                >
                                  保存
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={cancelEditMajorLibraryOption}
                                  disabled={isUpdatingMajorLibrary}
                                >
                                  取消
                                </Button>
                              </>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => startEditMajorLibraryOption(major)}
                                disabled={isUpdatingMajorLibrary}
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                编辑
                              </Button>
                            )}

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => void handleDeleteMajorLibraryOption(major)}
                              disabled={isUpdatingMajorLibrary}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              删除
                            </Button>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-lg border border-dashed bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                        当前专业库为空，可先新增专业选项
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
          <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <DialogTitle>候选人详情</DialogTitle>
              <DialogDescription>
                {isEditMode ? "编辑候选人信息" : "查看候选人的详细信息"}
              </DialogDescription>
            </div>
            {/* 编辑按钮：仅创建者和管理员可见 */}
            {!isEditMode && selectedCandidate && canEditCandidate(user, selectedCandidate) ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsEditMode(true);
                  setEditedCandidate({ ...selectedCandidate });
                }}
              >
                <Edit className="mr-2 h-4 w-4" />
                编辑
              </Button>
            ) : !isEditMode && selectedCandidate && !canEditCandidate(user, selectedCandidate) ? (
              <Badge variant="outline" className="text-muted-foreground">
                仅查看（非创建者）
              </Badge>
            ) : isEditMode ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditMode(false)}
                  disabled={isSaving}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!editedCandidate) return;
                    setIsSaving(true);
                    try {
                      // 如果重新上传了简历，需要先上传并解析
                      if (editResumeFile) {
                        setIsReuploading(true);
                        toast.info("正在上传简历并重新解析，请稍候...");
                        
                        try {
                          await fetchClientJson<CandidateApiResponse<CandidateApiRecord>>(`/api/candidates/${editedCandidate.id}`, {
                            method: 'PUT',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                              name: editedCandidate.name,
                              gender: editedCandidate.gender,
                              school: editedCandidate.school,
                              major: editedCandidate.major,
                              education: editedCandidate.education,
                              phone: editedCandidate.phone,
                              email: editedCandidate.email,
                              position: editedCandidate.position,
                              source: editedCandidate.source,
                              status: editedCandidate.status,
                            }),
                          });

                          // 创建 FormData
                          const formData = new FormData();
                          formData.append('file', editResumeFile);
                          formData.append('candidateId', String(editedCandidate.id));
                          formData.append('position', editedCandidate.position);
                          
                          // 调用重新解析 API
                          const response = await fetch('/api/candidates/reparse-resume', {
                            method: 'POST',
                            body: formData,
                          });
                          
                          if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.error || '简历上传失败');
                          }
                          
                          const result = await response.json();

                          const candidateResponse = await fetchClientJson<CandidateApiResponse<CandidateApiRecord>>(`/api/candidates/${editedCandidate.id}`, {
                            method: 'PUT',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                              name: editedCandidate.name,
                              gender: editedCandidate.gender,
                              school: editedCandidate.school,
                              major: editedCandidate.major,
                              education: editedCandidate.education,
                              phone: editedCandidate.phone,
                              email: editedCandidate.email,
                              source: editedCandidate.source,
                              status: editedCandidate.status,
                              position: editedCandidate.position,
                              resumeUploaded: true,
                              resumeFileName: editResumeFile.name,
                              resumeFileKey: result.fileKey,
                              resumeUploadedAt: new Date().toISOString(),
                              resumeParsedData: result.parsedData,
                            }),
                          });
                          
                          // 更新候选人信息
                          const updatedCandidate = buildCandidateFromApiRecord(
                            candidateResponse.data,
                            {
                              ...editedCandidate,
                              resumeUploaded: true,
                              resumeFileName: editResumeFile.name,
                              resumeFileKey: result.fileKey,
                              resumeUploadedAt: new Date().toISOString(),
                              resumeParsedData: result.parsedData,
                            },
                            editedCandidate.position
                          );
                          
                          const updated = candidates.map(c =>
                            c.id === editedCandidate.id ? updatedCandidate : c
                          );
                          setCandidates(updated);
                          saveCandidatesToStorage(updated);
                          setSelectedCandidate(updatedCandidate);
                          setEditResumeFile(null);
                          setIsEditMode(false);
                          toast.success("简历已重新上传并解析完成");
                        } catch (error) {
                          console.error("简历上传失败:", error);
                          toast.error(error instanceof Error ? error.message : "简历上传失败，请重试");
                          return;
                        } finally {
                          setIsReuploading(false);
                        }
                      } else {
                        const candidateResponse = await fetchClientJson<CandidateApiResponse<CandidateApiRecord>>(`/api/candidates/${editedCandidate.id}`, {
                          method: 'PUT',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            name: editedCandidate.name,
                            gender: editedCandidate.gender,
                            school: editedCandidate.school,
                            major: editedCandidate.major,
                            education: editedCandidate.education,
                            phone: editedCandidate.phone,
                            email: editedCandidate.email,
                            position: editedCandidate.position,
                            source: editedCandidate.source,
                            status: editedCandidate.status,
                          }),
                        });

                        // 更新候选人信息
                        const updated = candidates.map(c =>
                          c.id === editedCandidate.id
                            ? buildCandidateFromApiRecord(candidateResponse.data, c, editedCandidate.position)
                            : c
                        );
                        setCandidates(updated);
                        saveCandidatesToStorage(updated);
                        setSelectedCandidate(updated.find(c => c.id === editedCandidate.id) || editedCandidate);
                        setIsEditMode(false);
                        toast.success("候选人信息已更新");
                      }
                    } catch (error) {
                      console.error("保存失败:", error);
                      toast.error("保存失败，请重试");
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  disabled={isSaving}
                >
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isReuploading ? "上传中..." : "保存"}
                </Button>
              </div>
            ) : null}
          </DialogHeader>
          {selectedCandidate && (
            <div className="grid gap-6 py-4 overflow-y-auto max-h-[calc(90vh-180px)]">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                    {((isEditMode ? editedCandidate?.name : selectedCandidate.name) || "U")[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  {isEditMode ? (
                    <Input
                      value={editedCandidate?.name || ""}
                      onChange={(e) => patchEditedCandidate({ name: e.target.value })}
                      className="text-2xl font-bold"
                    />
                  ) : (
                    <h3 className="text-2xl font-bold">{selectedCandidate.name}</h3>
                  )}
                  <Badge
                    variant={interviewStageMap[(isEditMode ? editedCandidate?.interviewStage : selectedCandidate.interviewStage) as keyof typeof interviewStageMap]?.variant}
                    className={interviewStageMap[(isEditMode ? editedCandidate?.interviewStage : selectedCandidate.interviewStage) as keyof typeof interviewStageMap]?.color || "mt-2"}
                  >
                    {interviewStageMap[(isEditMode ? editedCandidate?.interviewStage : selectedCandidate.interviewStage) as keyof typeof interviewStageMap]?.label}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label className="text-gray-500">应聘岗位</Label>
                  {isEditMode ? (
                    <Input
                      value={editedCandidate?.position || ""}
                      onChange={(e) => patchEditedCandidate({ position: e.target.value })}
                    />
                  ) : (
                    <p className="font-semibold">{selectedCandidate.position}</p>
                  )}
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label className="text-gray-500">性别</Label>
                    {isEditMode ? (
                      <Select
                        value={editedCandidate?.gender || ""}
                        onValueChange={(value) => patchEditedCandidate({ gender: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="请选择性别" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="男">男</SelectItem>
                          <SelectItem value="女">女</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="font-semibold">{selectedCandidate.gender || "-"}</p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-gray-500">学历</Label>
                    {isEditMode ? (
                      <Select
                        value={editedCandidate?.education || ""}
                        onValueChange={(value) => patchEditedCandidate({ education: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="请选择学历" />
                        </SelectTrigger>
                        <SelectContent>
                          {EDUCATION_FILTER_OPTIONS.map((educationOption) => (
                            <SelectItem key={educationOption} value={educationOption}>
                              {educationOption}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="font-semibold">{selectedCandidate.education || "-"}</p>
                    )}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label className="text-gray-500">学校</Label>
                  {isEditMode ? (
                    <Input
                      value={editedCandidate?.school || ""}
                      onChange={(e) => patchEditedCandidate({ school: e.target.value })}
                    />
                  ) : (
                    <p className="font-semibold">{selectedCandidate.school || "-"}</p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label className="text-gray-500">专业</Label>
                  {isEditMode ? (
                    <Input
                      value={editedCandidate?.major || ""}
                      onChange={(e) => patchEditedCandidate({ major: e.target.value })}
                    />
                  ) : (
                    <p className="font-semibold">{selectedCandidate.major || "-"}</p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label className="text-gray-500">联系方式</Label>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      {isEditMode ? (
                        <Input
                          value={editedCandidate?.phone || ""}
                          onChange={(e) => patchEditedCandidate({ phone: e.target.value })}
                          className="flex-1"
                        />
                      ) : (
                        <span>{selectedCandidate.phone}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      {isEditMode ? (
                        <Input
                          value={editedCandidate?.email || ""}
                          onChange={(e) => patchEditedCandidate({ email: e.target.value })}
                          className="flex-1"
                        />
                      ) : (
                        <span>{selectedCandidate.email}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label className="text-gray-500">来源</Label>
                  {isEditMode ? (
                    <Input
                      value={editedCandidate?.source || ""}
                      onChange={(e) => patchEditedCandidate({ source: e.target.value })}
                    />
                  ) : (
                    <p className="font-semibold">{selectedCandidate.source}</p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label className="text-gray-500">创建时间</Label>
                  <p className="font-semibold">{selectedCandidate.createdAt}</p>
                </div>
                <div className="grid gap-2">
                  <Label className="text-gray-500">面试阶段</Label>
                  {isEditMode ? (
                    <Select
                      value={editedCandidate?.interviewStage || "pending"}
                      onValueChange={(value) =>
                        patchEditedCandidate({ interviewStage: value as CandidateInterviewStage })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">待初试（初始）</SelectItem>
                        <SelectItem value="initial">待初试</SelectItem>
                        <SelectItem value="second">待复试</SelectItem>
                        <SelectItem value="final">待终试</SelectItem>
                        <SelectItem value="offer">待入职</SelectItem>
                        <SelectItem value="hired">已入职</SelectItem>
                        <SelectItem value="rejected">已淘汰</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge
                      variant={interviewStageMap[selectedCandidate.interviewStage as keyof typeof interviewStageMap]?.variant}
                      className={interviewStageMap[selectedCandidate.interviewStage as keyof typeof interviewStageMap]?.color || ""}
                    >
                      {interviewStageMap[selectedCandidate.interviewStage as keyof typeof interviewStageMap]?.label}
                    </Badge>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label className="text-gray-500">简历状态</Label>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">
                      {(isEditMode ? editedCandidate : selectedCandidate)?.resumeUploaded ? "已上传" : "未上传"}
                    </p>
                    {(isEditMode ? editedCandidate : selectedCandidate)?.resumeUploaded && (isEditMode ? editedCandidate?.resumeFileName : selectedCandidate.resumeFileName) && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              // 使用后端代理下载，避免跨域问题
                              const fileKey = selectedCandidate.resumeFileKey;
                              const fileName = selectedCandidate.resumeFileName;
                              
                              if (!fileKey) {
                                toast.error("文件标识不存在，无法下载");
                                return;
                              }

                              // 通过后端 API 下载
                              const downloadUrl = `/api/resume/download?fileKey=${encodeURIComponent(fileKey)}&fileName=${encodeURIComponent(fileName)}`;
                              
                              // 使用 fetch + blob 方式下载
                              const response = await fetch(downloadUrl);
                              if (!response.ok) {
                                throw new Error("下载失败");
                              }
                              
                              const blob = await response.blob();
                              const blobUrl = window.URL.createObjectURL(blob);
                              const link = document.createElement("a");
                              link.href = blobUrl;
                              link.download = fileName;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                              window.URL.revokeObjectURL(blobUrl);
                              
                              toast.success("简历下载成功");
                            } catch (error) {
                              console.error("下载简历失败:", error);
                              toast.error("下载简历失败，请重试");
                            }
                          }}
                        >
                          <FileText className="mr-2 h-3 w-3" />
                          下载简历
                        </Button>
                        <span className="text-xs text-gray-400">{selectedCandidate.resumeFileName}</span>
                      </>
                    )}
                    {isEditMode && !editResumeFile && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const input = document.createElement("input");
                          input.type = "file";
                          input.accept = ".pdf,.doc,.docx,.rtf,.txt,.xml,.jpeg,.jpg,.png,.gif,.bmp,.webp,.svg,.tiff";
                          input.onchange = (e) => {
                            const file = (e.target as HTMLInputElement).files?.[0];
                            if (file) {
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
                                toast.error("不支持的文件格式");
                                return;
                              }
                              const maxSize = file.type.startsWith('image/') ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
                              if (file.size > maxSize) {
                                toast.error(file.type.startsWith('image/') ? "图片文件大小不能超过 20MB" : "文档文件大小不能超过 10MB");
                                return;
                              }
                              setEditResumeFile(file);
                            }
                          };
                          input.click();
                        }}
                      >
                        <Upload className="mr-2 h-3 w-3" />
                        重新上传
                      </Button>
                    )}
                    {isEditMode && editResumeFile && (
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          <FileText className="mr-1 h-3 w-3" />
                          {editResumeFile.name}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditResumeFile(null)}
                        >
                          取消
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* 简历解析结果 */}
                {selectedCandidate.resumeUploaded || selectedCandidate.resumeParsedData ? (
                  <div className="grid gap-2">
                    <Label className="text-gray-500">简历解析结果</Label>
                    {selectedCandidate.resumeParsedData ? (
                      <div className="border rounded-lg p-4 space-y-4 bg-white">
                        {/* 简历上传/处理失败，显示错误信息 */}
                        {selectedCandidate.resumeParsedData.parseStatus === "processing" ? (
                          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className="bg-blue-600">后台解析中</Badge>
                              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                            </div>
                            <p className="text-sm text-blue-700 font-medium">
                              简历正在后台持续解析，切换页面不会中断，解析成功后这里会自动更新为详细结果。
                            </p>
                            <p className="text-xs text-gray-600 mt-2">
                              当前将继续补全：工作经历、教育背景、项目经验、岗位匹配度分析等信息。
                            </p>
                            {selectedCandidate.resumeParsedData.processingAt && (
                              <p className="text-xs text-gray-400 mt-2">
                                开始时间：{new Date(selectedCandidate.resumeParsedData.processingAt).toLocaleString('zh-CN')}
                              </p>
                            )}
                          </div>
                        ) : selectedCandidate.resumeParsedData.error ? (
                          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="destructive">❌ 简历处理失败</Badge>
                            </div>
                            <p className="text-sm text-red-700 font-medium mb-1">
                              {selectedCandidate.resumeParsedData.error}
                            </p>
                            <p className="text-xs text-gray-600 mt-2">
                              请检查文件格式是否正确，或尝试重新上传简历。
                            </p>
                            {selectedCandidate.resumeParsedData.errorAt && (
                              <p className="text-xs text-gray-400 mt-2">
                                失败时间：{new Date(selectedCandidate.resumeParsedData.errorAt).toLocaleString('zh-CN')}
                              </p>
                            )}
                          </div>
                        ) : selectedCandidate.resumeParsedData.parsedData ? (
                          /* 解析成功，显示解析数据 */
                          <>
                            {/* 工作经历 */}
                            {selectedCandidate.resumeParsedData.parsedData.workExperience && selectedCandidate.resumeParsedData.parsedData.workExperience.length > 0 && (
                              <div>
                                <h4 className="font-semibold text-gray-900 mb-2">工作经历</h4>
                                <div className="space-y-3">
                                  {selectedCandidate.resumeParsedData.parsedData.workExperience.map((exp: ResumeWorkExperience, idx: number) => (
                                    <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                                      <div className="flex items-center justify-between mb-2">
                                        <p className="font-medium">{exp.company} - {exp.position}</p>
                                        <span className="text-xs text-gray-500">{exp.duration}</span>
                                      </div>
                                      {exp.responsibilities && exp.responsibilities.length > 0 && (
                                        <div className="mt-2">
                                          <p className="text-xs text-gray-600 mb-1">职责：</p>
                                          <ul className="text-sm text-gray-700 list-disc list-inside">
                                            {exp.responsibilities.map((resp: string, rIdx: number) => (
                                              <li key={rIdx}>{resp}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                      {(!exp.responsibilities || exp.responsibilities.length === 0) && (
                                        <div className="mt-2">
                                          <p className="text-xs text-gray-600 mb-1">职责：</p>
                                          <p className="text-sm text-gray-500">当前正在补全该段工作职责，后台解析完成后会自动更新。</p>
                                        </div>
                                      )}
                                      {exp.achievements && exp.achievements.length > 0 && (
                                        <div className="mt-2">
                                          <p className="text-xs text-gray-600 mb-1">成果：</p>
                                          <ul className="text-sm text-green-700 list-disc list-inside">
                                            {exp.achievements.map((ach: string, aIdx: number) => (
                                              <li key={aIdx}>{ach}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                      {(!exp.achievements || exp.achievements.length === 0) && (
                                        <div className="mt-2">
                                          <p className="text-xs text-gray-600 mb-1">成果：</p>
                                          <p className="text-sm text-gray-500">当前正在补全该段工作结果，后台解析完成后会自动更新。</p>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 教育背景 */}
                            {selectedCandidate.resumeParsedData.parsedData.education && (
                              <div>
                                <h4 className="font-semibold text-gray-900 mb-2">教育背景</h4>
                                <div className="p-3 bg-gray-50 rounded-lg">
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="font-medium">{selectedCandidate.resumeParsedData.parsedData.education.school} - {selectedCandidate.resumeParsedData.parsedData.education.major}</p>
                                    <Badge variant="secondary">{selectedCandidate.resumeParsedData.parsedData.education.degree}</Badge>
                                  </div>
                                  {selectedCandidate.resumeParsedData.parsedData.education.gpa && (
                                    <p className="text-sm text-gray-600 mt-1">GPA/重要课程：{selectedCandidate.resumeParsedData.parsedData.education.gpa}</p>
                                  )}
                                  {selectedCandidate.resumeParsedData.parsedData.education.scholarships && selectedCandidate.resumeParsedData.parsedData.education.scholarships.length > 0 && (
                                    <div className="mt-2">
                                      <p className="text-xs text-gray-600 mb-1">奖学金/学术成果：</p>
                                      <ul className="text-sm text-gray-700 list-disc list-inside">
                                        {selectedCandidate.resumeParsedData.parsedData.education.scholarships.map((sch: string, sIdx: number) => (
                                          <li key={sIdx}>{sch}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* 技能 */}
                            {selectedCandidate.resumeParsedData.parsedData.skills && selectedCandidate.resumeParsedData.parsedData.skills.length > 0 && (
                              <div>
                                <h4 className="font-semibold text-gray-900 mb-2">技能</h4>
                                <div className="flex flex-wrap gap-2">
                                  {selectedCandidate.resumeParsedData.parsedData.skills.map((skill: ResumeSkill, idx: number) => (
                                    <Badge key={idx} variant="outline" className="text-sm">
                                      {skill.name}
                                      {skill.level && <span className="ml-1 text-xs text-gray-500">（{skill.level}）</span>}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 证书 */}
                            {selectedCandidate.resumeParsedData.parsedData.certificates && selectedCandidate.resumeParsedData.parsedData.certificates.length > 0 && (
                              <div>
                                <h4 className="font-semibold text-gray-900 mb-2">证书</h4>
                                <div className="space-y-2">
                                  {selectedCandidate.resumeParsedData.parsedData.certificates.map((cert: ResumeCertificate, idx: number) => (
                                    <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                      <p className="text-sm font-medium">{cert.name}</p>
                                      <div className="text-xs text-gray-500">
                                        {cert.level && <span className="mr-2">{cert.level}</span>}
                                        {cert.date && <span>{cert.date}</span>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 项目经验 */}
                            {selectedCandidate.resumeParsedData.parsedData.projects && selectedCandidate.resumeParsedData.parsedData.projects.length > 0 && (
                              <div>
                                <h4 className="font-semibold text-gray-900 mb-2">项目经验</h4>
                                <div className="space-y-3">
                                  {selectedCandidate.resumeParsedData.parsedData.projects.map((project: ResumeProject, idx: number) => (
                                    <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                                      <div className="flex items-center justify-between mb-2">
                                        <p className="font-medium">{project.name}</p>
                                        <span className="text-xs text-gray-500">{project.duration}</span>
                                      </div>
                                      <div className="flex items-center gap-2 mb-2">
                                        <Badge variant="secondary" className="text-xs">{project.role}</Badge>
                                      </div>
                                      {project.tasks && project.tasks.length > 0 && (
                                        <div className="mt-2">
                                          <p className="text-xs text-gray-600 mb-1">任务：</p>
                                          <ul className="text-sm text-gray-700 list-disc list-inside">
                                            {project.tasks.map((task: string, tIdx: number) => (
                                              <li key={tIdx}>{task}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                      {(!project.tasks || project.tasks.length === 0) && (
                                        <div className="mt-2">
                                          <p className="text-xs text-gray-600 mb-1">任务：</p>
                                          <p className="text-sm text-gray-500">当前正在补全该项目的主要工作内容。</p>
                                        </div>
                                      )}
                                      {project.results && project.results.length > 0 && (
                                        <div className="mt-2">
                                          <p className="text-xs text-gray-600 mb-1">成果：</p>
                                          <ul className="text-sm text-green-700 list-disc list-inside">
                                            {project.results.map((result: string, rIdx: number) => (
                                              <li key={rIdx}>{result}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                      {(!project.results || project.results.length === 0) && (
                                        <div className="mt-2">
                                          <p className="text-xs text-gray-600 mb-1">成果：</p>
                                          <p className="text-sm text-gray-500">当前正在补全该项目的结果与产出。</p>
                                        </div>
                                      )}
                                      {project.technologies && project.technologies.length > 0 && (
                                        <div className="mt-2">
                                          <p className="text-xs text-gray-600 mb-1">技术：</p>
                                          <div className="flex flex-wrap gap-1">
                                            {project.technologies.map((tech: string, techIdx: number) => (
                                              <Badge key={techIdx} variant="outline" className="text-xs">{tech}</Badge>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 冲突标记 */}
                            {selectedCandidate.resumeParsedData.parsedData.conflictMarkers && selectedCandidate.resumeParsedData.parsedData.conflictMarkers.length > 0 && (
                              <div>
                                <h4 className="font-semibold text-orange-700 mb-2">⚠️ 潜在问题</h4>
                                <div className="space-y-2">
                                  {selectedCandidate.resumeParsedData.parsedData.conflictMarkers.map((marker: ResumeConflictMarker, idx: number) => (
                                    <div key={idx} className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                                      <div className="flex items-center gap-2 mb-1">
                                        <Badge variant="destructive" className="text-xs">{marker.type}</Badge>
                                      </div>
                                      <p className="text-sm text-gray-700">{marker.description}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 岗位匹配分析 */}
                            {selectedCandidate.resumeParsedData.parsedData.matchAnalysis && (
                              <div>
                                <h4 className="font-semibold text-blue-700 mb-2">📊 岗位匹配分析</h4>
                                {selectedCandidate.resumeParsedData.parsedData.matchAnalysis.vetoCheck?.triggered && (
                                  <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3">
                                    <div className="flex items-center gap-2">
                                      <Badge variant="destructive">一票否决命中</Badge>
                                      <span className="text-sm font-medium text-red-800">筛选分数已强制置为 0</span>
                                    </div>
                                    <div className="mt-3 space-y-2">
                                      {selectedCandidate.resumeParsedData.parsedData.matchAnalysis.vetoCheck?.hits.map((hit, idx) => (
                                        <div key={idx} className="rounded-lg border border-red-100 bg-white p-3">
                                          <div className="font-medium text-red-900">{hit.ruleName}</div>
                                          {hit.description && (
                                            <div className="mt-1 text-xs text-red-700">{hit.description}</div>
                                          )}
                                          {hit.matchedKeywords.length > 0 && (
                                            <div className="mt-2 text-xs text-red-700">
                                              命中关键词：{hit.matchedKeywords.join('、')}
                                            </div>
                                          )}
                                          {hit.matchedEvidence.length > 0 && (
                                            <div className="mt-1 text-xs text-gray-600">
                                              证据：{hit.matchedEvidence.join('；')}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-3">
                                  <div className="flex items-center justify-between">
                                    <p className="font-medium">匹配度</p>
                                    <Badge className="text-base px-3 py-1">
                                      {typeof selectedCandidate.resumeParsedData.parsedData.matchAnalysis.matchScore === "number"
                                        ? `${selectedCandidate.resumeParsedData.parsedData.matchAnalysis.matchScore}%`
                                        : "分析中"}
                                    </Badge>
                                  </div>
                                </div>
                                {selectedCandidate.resumeParsedData.parsedData.matchAnalysis.matchedItems && selectedCandidate.resumeParsedData.parsedData.matchAnalysis.matchedItems.length > 0 && (
                                  <div className="mb-3">
                                    <p className="text-sm font-medium text-green-700 mb-2">✅ 匹配项</p>
                                    <div className="space-y-2">
                                      {selectedCandidate.resumeParsedData.parsedData.matchAnalysis.matchedItems.map((item: ResumeMatchedItem, idx: number) => (
                                        <div key={idx} className="p-2 bg-green-50 rounded">
                                          <p className="text-sm font-medium">{item.requirement}</p>
                                          <p className="text-xs text-gray-600 mt-1">{item.evidence}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {(!selectedCandidate.resumeParsedData.parsedData.matchAnalysis.matchedItems || selectedCandidate.resumeParsedData.parsedData.matchAnalysis.matchedItems.length === 0) && (
                                  <div className="mb-3">
                                    <p className="text-sm font-medium text-green-700 mb-2">✅ 匹配项</p>
                                    <div className="p-2 bg-green-50 rounded text-sm text-gray-500">
                                      当前正在补全岗位已匹配项的详细证据。
                                    </div>
                                  </div>
                                )}
                                {selectedCandidate.resumeParsedData.parsedData.matchAnalysis.unmatchedItems && selectedCandidate.resumeParsedData.parsedData.matchAnalysis.unmatchedItems.length > 0 && (
                                  <div className="mb-3">
                                    <p className="text-sm font-medium text-orange-700 mb-2">⚠️ 待确认项</p>
                                    <div className="space-y-2">
                                      {selectedCandidate.resumeParsedData.parsedData.matchAnalysis.unmatchedItems.map((item: ResumeUnmatchedItem, idx: number) => (
                                        <div key={idx} className="p-2 bg-orange-50 rounded">
                                          <p className="text-sm font-medium">{item.requirement}</p>
                                          <p className="text-xs text-gray-600 mt-1">{item.gap}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {(!selectedCandidate.resumeParsedData.parsedData.matchAnalysis.unmatchedItems || selectedCandidate.resumeParsedData.parsedData.matchAnalysis.unmatchedItems.length === 0) && (
                                  <div className="mb-3">
                                    <p className="text-sm font-medium text-orange-700 mb-2">⚠️ 待确认项</p>
                                    <div className="p-2 bg-orange-50 rounded text-sm text-gray-500">
                                      当前正在补全岗位差距与待确认项分析。
                                    </div>
                                  </div>
                                )}
                                {selectedCandidate.resumeParsedData.parsedData.matchAnalysis.strengths && selectedCandidate.resumeParsedData.parsedData.matchAnalysis.strengths.length > 0 && (
                                  <div className="mb-3">
                                    <p className="text-sm font-medium text-blue-700 mb-2">💪 优势</p>
                                    <ul className="space-y-2">
                                      {selectedCandidate.resumeParsedData.parsedData.matchAnalysis.strengths.map((strength: ResumeStrength, idx: number) => (
                                        <li key={idx} className="text-sm text-gray-700 bg-blue-50 p-2 rounded border border-blue-200">
                                          {!isStrengthObject(strength) ? strength : (
                                            <div>
                                              <div className="font-medium">{strength.area || '优势领域'}</div>
                                              {strength.description && <div className="text-xs text-gray-600 mt-1">{strength.description}</div>}
                                              {strength.evidence && <div className="text-xs text-gray-500 mt-1">证据：{strength.evidence}</div>}
                                            </div>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {(!selectedCandidate.resumeParsedData.parsedData.matchAnalysis.strengths || selectedCandidate.resumeParsedData.parsedData.matchAnalysis.strengths.length === 0) && (
                                  <div className="mb-3">
                                    <p className="text-sm font-medium text-blue-700 mb-2">💪 优势</p>
                                    <div className="p-2 bg-blue-50 rounded text-sm text-gray-500">
                                      当前正在补全候选人优势及对应证据。
                                    </div>
                                  </div>
                                )}
                                {selectedCandidate.resumeParsedData.parsedData.matchAnalysis.weaknesses && selectedCandidate.resumeParsedData.parsedData.matchAnalysis.weaknesses.length > 0 && (
                                  <div>
                                    <p className="text-sm font-medium text-red-700 mb-2">⚠️ 潜在不足</p>
                                    <ul className="space-y-2">
                                      {selectedCandidate.resumeParsedData.parsedData.matchAnalysis.weaknesses.map((weakness: ResumeWeakness, idx: number) => (
                                        <li key={idx} className="text-sm text-gray-700 bg-red-50 p-2 rounded border border-red-200">
                                          {!isWeaknessObject(weakness) ? weakness : (
                                            <div>
                                              <div className="font-medium">{weakness.area || '不足领域'}</div>
                                              {weakness.description && <div className="text-xs text-gray-600 mt-1">{weakness.description}</div>}
                                              {weakness.gap && <div className="text-xs text-gray-500 mt-1">缺失：{weakness.gap}</div>}
                                            </div>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {(!selectedCandidate.resumeParsedData.parsedData.matchAnalysis.weaknesses || selectedCandidate.resumeParsedData.parsedData.matchAnalysis.weaknesses.length === 0) && (
                                  <div>
                                    <p className="text-sm font-medium text-red-700 mb-2">⚠️ 潜在不足</p>
                                    <div className="p-2 bg-red-50 rounded text-sm text-gray-500">
                                      当前正在补全潜在不足与改进建议分析。
                                    </div>
                                  </div>
                                )}
                                {selectedCandidate.resumeParsedData.parsedData.matchAnalysis.jobAspectAnalysis && selectedCandidate.resumeParsedData.parsedData.matchAnalysis.jobAspectAnalysis.length > 0 && (
                                  <div className="mt-4">
                                    <p className="text-sm font-medium text-slate-700 mb-2">📋 岗位详情分析</p>
                                    <div className="space-y-2">
                                      {selectedCandidate.resumeParsedData.parsedData.matchAnalysis.jobAspectAnalysis.map((item: ResumeJobAspectAnalysisItem, idx: number) => (
                                        <div key={idx} className="p-3 bg-slate-50 rounded border border-slate-200">
                                          <p className="text-sm font-medium text-slate-900">{item.aspect || "岗位分析"}</p>
                                          {item.conclusion && (
                                            <p className="text-sm text-slate-700 mt-1">{item.conclusion}</p>
                                          )}
                                          {item.evidence && (
                                            <p className="text-xs text-slate-500 mt-2">证据：{item.evidence}</p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            <p className="text-xs text-gray-400 mt-4">
                              解析时间：{selectedCandidate.resumeParsedData.parsedAt ? new Date(selectedCandidate.resumeParsedData.parsedAt).toLocaleString('zh-CN') : '未知'}
                            </p>
                          </>
                        ) : (
                          /* 解析失败，显示错误信息 */
                          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="destructive">解析失败</Badge>
                            </div>
                            <p className="text-sm text-red-700">
                              简历内容提取成功，但解析失败。请检查简历格式是否正确，或尝试重新上传。
                            </p>
                            <p className="text-xs text-gray-500 mt-2">
                              提取时间：{selectedCandidate.resumeParsedData.parsedAt ? new Date(selectedCandidate.resumeParsedData.parsedAt).toLocaleString('zh-CN') : '未知'}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* 简历已上传但未解析 */
                      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                        <p className="text-sm text-gray-600">
                          简历已上传，但尚未解析。解析功能将在后台自动处理。
                        </p>
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="grid gap-2">
                  <Label className="text-gray-500">面试流程</Label>
                  <div className="border rounded-lg p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">当前阶段</p>
                        <Badge 
                          variant={interviewStageMap[(selectedCandidate.interviewStage || "pending") as keyof typeof interviewStageMap].variant}
                          className={interviewStageMap[(selectedCandidate.interviewStage || "pending") as keyof typeof interviewStageMap].color || ""}
                        >
                          {interviewStageMap[(selectedCandidate.interviewStage || "pending") as keyof typeof interviewStageMap].label}
                        </Badge>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <InterviewRoundSection
                        title="初试"
                        result={selectedCandidate.initialInterviewPassed}
                        time={selectedCandidate.initialInterviewTime}
                        evaluation={selectedCandidate.initialInterviewEvaluation}
                        onTimeChange={(value) => {
                          updateCandidateDraft(selectedCandidate.id, {
                            initialInterviewTime: value,
                          });
                        }}
                        onTimeConfirm={async (value) => {
                          await persistCandidatePatch(selectedCandidate.id, {
                            initialInterviewTime: value,
                          }, '初试时间已保存');
                        }}
                        onEvaluationChange={(value) => {
                          updateCandidateDraft(selectedCandidate.id, {
                            initialInterviewEvaluation: value,
                          });
                        }}
                        onEvaluationBlur={async (value) => {
                          await persistCandidatePatch(selectedCandidate.id, {
                            initialInterviewEvaluation: value || null,
                          });
                        }}
                        onPass={async () => {
                          await persistCandidatePatch(selectedCandidate.id, {
                            initialInterviewPassed: "pass",
                            interviewStage: "second",
                          }, "初试通过");
                        }}
                        onPending={async () => {
                          await persistCandidatePatch(selectedCandidate.id, {
                            initialInterviewPassed: "pending",
                            interviewStage: "pending",
                          }, "已标记为待定");
                        }}
                        onFail={async () => {
                          await persistCandidatePatch(selectedCandidate.id, {
                            initialInterviewPassed: "fail",
                            interviewStage: "rejected",
                          }, "初试未通过");
                        }}
                      />

                      <InterviewRoundSection
                        title="复试"
                        result={selectedCandidate.secondInterviewPassed}
                        time={selectedCandidate.secondInterviewTime}
                        evaluation={selectedCandidate.secondInterviewEvaluation}
                        disabled={selectedCandidate.initialInterviewPassed !== 'pass'}
                        onTimeChange={(value) => {
                          updateCandidateDraft(selectedCandidate.id, {
                            secondInterviewTime: value,
                          });
                        }}
                        onTimeConfirm={async (value) => {
                          await persistCandidatePatch(selectedCandidate.id, {
                            secondInterviewTime: value,
                          }, '复试时间已保存');
                        }}
                        onEvaluationChange={(value) => {
                          updateCandidateDraft(selectedCandidate.id, {
                            secondInterviewEvaluation: value,
                          });
                        }}
                        onEvaluationBlur={async (value) => {
                          await persistCandidatePatch(selectedCandidate.id, {
                            secondInterviewEvaluation: value || null,
                          });
                        }}
                        onPass={async () => {
                          await persistCandidatePatch(selectedCandidate.id, {
                            secondInterviewPassed: "pass",
                            interviewStage: "final",
                          }, "复试通过");
                        }}
                        onPending={async () => {
                          await persistCandidatePatch(selectedCandidate.id, {
                            secondInterviewPassed: "pending",
                            interviewStage: "pending",
                          }, "已标记为待定");
                        }}
                        onFail={async () => {
                          await persistCandidatePatch(selectedCandidate.id, {
                            secondInterviewPassed: "fail",
                            interviewStage: "rejected",
                          }, "复试未通过");
                        }}
                      />

                      <InterviewRoundSection
                        title="终试"
                        result={selectedCandidate.finalInterviewPassed}
                        time={selectedCandidate.finalInterviewTime}
                        evaluation={selectedCandidate.finalInterviewEvaluation}
                        disabled={selectedCandidate.secondInterviewPassed !== 'pass'}
                        onTimeChange={(value) => {
                          updateCandidateDraft(selectedCandidate.id, {
                            finalInterviewTime: value,
                          });
                        }}
                        onTimeConfirm={async (value) => {
                          await persistCandidatePatch(selectedCandidate.id, {
                            finalInterviewTime: value,
                          }, '终试时间已保存');
                        }}
                        onEvaluationChange={(value) => {
                          updateCandidateDraft(selectedCandidate.id, {
                            finalInterviewEvaluation: value,
                          });
                        }}
                        onEvaluationBlur={async (value) => {
                          await persistCandidatePatch(selectedCandidate.id, {
                            finalInterviewEvaluation: value || null,
                          });
                        }}
                        onPass={async () => {
                          await persistCandidatePatch(selectedCandidate.id, {
                            finalInterviewPassed: "pass",
                            interviewStage: "offer",
                          }, "终试通过，进入待入职流程");
                        }}
                        onPending={async () => {
                          await persistCandidatePatch(selectedCandidate.id, {
                            finalInterviewPassed: "pending",
                            interviewStage: "pending",
                          }, "已标记为待定");
                        }}
                        onFail={async () => {
                          await persistCandidatePatch(selectedCandidate.id, {
                            finalInterviewPassed: "fail",
                            interviewStage: "rejected",
                          }, "终试未通过");
                        }}
                      />

                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${
                            selectedCandidate.isHired ? 'bg-green-500' :
                            selectedCandidate.interviewStage === 'offer' ? 'bg-blue-500' :
                            'bg-gray-400'
                          }`} />
                          <span className="font-medium">入职</span>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={selectedCandidate.isHired ? "default" : "outline"}
                            onClick={async () => {
                              await persistCandidatePatch(selectedCandidate.id, {
                                interviewStage: "hired",
                                isHired: true,
                              }, "候选人已入职");
                            }}
                            disabled={selectedCandidate.isHired || selectedCandidate.finalInterviewPassed !== 'pass'}
                          >
                            确认入职
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              await persistCandidatePatch(selectedCandidate.id, {
                                interviewStage: "rejectedOffer",
                                isHired: false,
                              }, "已拒绝入职");
                            }}
                            disabled={selectedCandidate.isHired || selectedCandidate.finalInterviewPassed !== 'pass'}
                            className="text-orange-600 border-orange-600 hover:bg-orange-50"
                          >
                            拒绝入职
                          </Button>
                        </div>
                      </div>
                    </div>

                    {selectedCandidate.isHired && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                        <p className="font-semibold text-green-700">已入职</p>
                        <p className="text-sm text-green-600">恭喜！该候选人已成功入职</p>
                      </div>
                    )}

                    {selectedCandidate.interviewStage === 'rejectedOffer' && (
                      <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                        <p className="font-semibold text-orange-700">拒绝入职</p>
                        <p className="text-sm text-orange-600">该候选人已拒绝入职</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (selectedCandidate) {
                      void handleExportCandidateData(selectedCandidate);
                    }
                  }}
                  disabled={!selectedCandidate}
                >
              <Download className="mr-2 h-4 w-4" />
              导出数据
            </Button>
            {/* 删除按钮：仅创建者和管理员可见 */}
            {canEditCandidate(user, selectedCandidate) && (
              <Button
                variant="destructive"
                onClick={() => setIsDeleteConfirmOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                删除候选人
              </Button>
            )}
            <Button onClick={() => setIsDetailDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>确认删除</DialogTitle>
              <DialogDescription>
              确定要删除候选人 &quot;{selectedCandidate?.name}&quot; 吗？此操作不可撤销。
              </DialogDescription>
            </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteConfirmOpen(false)}
            >
              取消
            </Button>
            <Button variant="destructive" onClick={handleDeleteCandidate}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量删除确认对话框 */}
      <Dialog open={isBatchDeleteDialogOpen} onOpenChange={setIsBatchDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>确认批量删除</DialogTitle>
            <DialogDescription>
              确定要删除 {selectedCandidateIds.size} 位候选人吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsBatchDeleteDialogOpen(false)}
            >
              取消
            </Button>
            <Button variant="destructive" onClick={handleBatchDelete}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
