"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Upload,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle,
  Download,
  Briefcase,
  X,
  Files,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Merge,
  UserPlus,
  Sheet as SheetIcon,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ClientApiError, fetchClient, fetchClientJson, fetchClientJsonCached } from "@/lib/client-api";
import { sync } from "@/lib/sync";
import type { PositionVetoCheck } from "@/lib/position-veto-rules";

// ==================== Types ====================

  interface ParsedData {
  matchAnalysis?: {
    matchScore?: number;
    matchedItems?: Array<{ requirement: string; evidence: string }>;
    unmatchedItems?: Array<{ requirement: string; gap: string }>;
    strengths?: any[];
    weaknesses?: any[];
    jobAspectAnalysis?: Array<{ aspect?: string; conclusion?: string; evidence?: string }>;
    vetoCheck?: PositionVetoCheck;
  };
  conflictMarkers?: Array<{ type: string; description: string }>;
  workExperience?: any[];
  education?: any;
  skills?: Array<{ name: string; level: string }>;
  projects?: any[];
  certificates?: any[];
  // 新增：基本信息字段
  basicInfo?: {
    name?: string;
    phone?: string;
    email?: string;
    age?: number;
    gender?: string;
    location?: string;
    workYears?: number;
    currentCompany?: string;
    currentPosition?: string;
    education?: string;
    major?: string;
    school?: string;
  };
}

interface Position {
  id: number;
  title: string;
  department: string;
  jobDescription: string;
  education: string;
  experience: string;
}

interface ResumeParseResult {
  id: string;
  fileName: string;
  fileKey?: string;
  downloadUrl?: string;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'duplicate';
  extractedInfo?: {
    name: string;
    phone: string;
    email: string;
  };
  parsedData?: ParsedData;
  extractedContent?: string;
  errorMessage?: string;
  duplicateInfo?: {
    existingCandidateId: number;
    existingCandidateName: string;
    existingCandidatePhone: string;
    matchFields?: string[];
  };
  processedAt?: string;
  importedAt?: string;
}

interface ResumeParseTask {
  id: number;
  userId: string;
  tenantId: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  totalCount: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  results: ResumeParseResult[];
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}

interface CandidateApiRecord {
  id: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  status?: string | null;
  createdAt?: string;
  createdById?: string | null;
  createdByName?: string | null;
  createdByUsername?: string | null;
}

interface UploadedFileMeta {
  name: string;
  size: number;
  type: string;
}

interface SingleUploadDraft {
  resumeContent: string;
  uploadedFileMeta: UploadedFileMeta | null;
  parsedData: ParsedData | null;
  error: string | null;
  imagePreview: string | null;
  selectedPositionId: string;
  resumeParseTaskId?: number | null;
  parseTaskActive?: boolean;
  parseRequestedAt?: string | null;
}

const SINGLE_UPLOAD_STORAGE_KEY = "resume_single_upload_draft";

// 批量上传的文件状态
interface BatchFile {
  id: string;
  file: File;
  status: 'pending' | 'extracting' | 'parsing' | 'completed' | 'error' | 'duplicate';
  progress: number;
  extractedContent?: string;
  parsedData?: ParsedData;
  error?: string;
  duplicateInfo?: {
    existingCandidateId: number;
    existingCandidateName: string;
    matchFields: string[];
  };
  selectedPositionId?: string;
  savedToCandidates?: boolean;  // 是否已保存到候选人管理
}

// 重复候选人检测结果
interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingCandidateId?: number;
  existingCandidateName?: string;
  matchFields?: string[];
}

function mirrorCandidateToLocalStorage(params: {
  candidate: CandidateApiRecord;
  fileName: string;
  positionTitle: string;
  parsedData?: ParsedData;
  extractedContent?: string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const { candidate, fileName, positionTitle, parsedData, extractedContent } = params;
  const stored = window.localStorage.getItem("candidates");
  const existingCandidates = stored ? (JSON.parse(stored) as Array<Record<string, unknown>>) : [];
  const nextCandidate = {
    id: candidate.id,
    name: candidate.name,
    phone: candidate.phone || "",
    email: candidate.email || "",
    position: positionTitle,
    status: candidate.status || "pending",
    source: candidate.source || "批量上传",
    createdAt: candidate.createdAt?.split("T")[0] || new Date().toISOString().split("T")[0],
    resumeUploaded: true,
    resumeFileName: fileName,
    resumeFileKey: "",
    resumeDownloadUrl: "",
    resumeParsedData: parsedData || extractedContent
      ? {
          content: extractedContent || "",
          parsedData: parsedData || null,
          parsedAt: new Date().toISOString(),
        }
      : null,
    interviewStage: "pending",
    initialInterviewPassed: null,
    secondInterviewPassed: null,
    finalInterviewPassed: null,
    isHired: false,
    initialInterviewTime: null,
    secondInterviewTime: null,
    finalInterviewTime: null,
    createdById: candidate.createdById || null,
    createdByName: candidate.createdByName || null,
    createdByUsername: candidate.createdByUsername || null,
  };

  const updatedCandidates = [
    ...existingCandidates.filter((item) => item.id !== candidate.id),
    nextCandidate,
  ];

  window.localStorage.setItem("candidates", JSON.stringify(updatedCandidates));
  window.dispatchEvent(new Event("candidatesUpdated"));
}

// ==================== Single Upload Component ====================

function SingleUploadTab() {

  const [resumeContent, setResumeContent] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileMeta, setUploadedFileMeta] = useState<UploadedFileMeta | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState("");
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedPositionId, setSelectedPositionId] = useState<string>("");
  const [resumeParseTaskId, setResumeParseTaskId] = useState<number | null>(null);
  const [isParseTaskActive, setIsParseTaskActive] = useState(false);
  const [isAwaitingParseTask, setIsAwaitingParseTask] = useState(false);
  const [parseRequestedAt, setParseRequestedAt] = useState<string | null>(null);
  const [singleParseTask, setSingleParseTask] = useState<ResumeParseTask | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const parseTaskPollRef = useRef<number | null>(null);

  const selectedPosition = positions.find((p) => p.id.toString() === selectedPositionId);
  const activeUploadedFile = uploadedFileMeta || (uploadedFile
    ? {
        name: uploadedFile.name,
        size: uploadedFile.size,
        type: uploadedFile.type,
      }
    : null);
  const isImageUpload = Boolean((uploadedFile?.type || uploadedFileMeta?.type || "").startsWith("image/"));

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const rawDraft = window.sessionStorage.getItem(SINGLE_UPLOAD_STORAGE_KEY);
    if (!rawDraft) {
      return;
    }

    try {
      const draft = JSON.parse(rawDraft) as SingleUploadDraft;
      setResumeContent(draft.resumeContent || "");
      setUploadedFileMeta(draft.uploadedFileMeta || null);
      setParsedData(draft.parsedData || null);
      setError(draft.error || null);
      setImagePreview(draft.imagePreview || null);
      setSelectedPositionId(draft.selectedPositionId || "");
      setResumeParseTaskId(draft.resumeParseTaskId ?? null);
      setIsParseTaskActive(Boolean(draft.parseTaskActive));
      setParseRequestedAt(draft.parseRequestedAt || null);
    } catch (error) {
      console.error("[简历解析] 恢复单文件草稿失败:", error);
      window.sessionStorage.removeItem(SINGLE_UPLOAD_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!resumeContent && !uploadedFileMeta && !parsedData && !error && !imagePreview && !selectedPositionId) {
      window.sessionStorage.removeItem(SINGLE_UPLOAD_STORAGE_KEY);
      return;
    }

    const draft: SingleUploadDraft = {
      resumeContent,
      uploadedFileMeta,
      parsedData,
      error,
      imagePreview,
      selectedPositionId,
      resumeParseTaskId,
      parseTaskActive: isParseTaskActive,
      parseRequestedAt,
    };

    window.sessionStorage.setItem(SINGLE_UPLOAD_STORAGE_KEY, JSON.stringify(draft));
  }, [error, imagePreview, isParseTaskActive, parsedData, parseRequestedAt, resumeContent, resumeParseTaskId, selectedPositionId, uploadedFileMeta]);

  const syncSingleParseTaskState = useCallback((task: ResumeParseTask | null) => {
    setSingleParseTask(task);

    if (!task) {
      return;
    }

    setResumeParseTaskId(task.id);
    setParseRequestedAt(task.createdAt);

    const firstResult = task.results[0];
    if (firstResult?.extractedContent) {
      setResumeContent((current) => current.trim().length > 0 ? current : firstResult.extractedContent || current);
    }

    if (firstResult?.fileName) {
      setUploadedFileMeta((current) => current || {
        name: firstResult.fileName,
        size: firstResult.extractedContent?.length || 0,
        type: "text/plain",
      });
    }

    if (task.status === "pending" || task.status === "processing") {
      setIsParseTaskActive(true);
      setIsParsing(true);
      setParseProgress(task.status === "pending" ? "后台任务已提交，等待解析..." : "正在后台解析简历...");
      setError(null);
      return;
    }

    setIsParseTaskActive(false);
    setIsParsing(false);
    setParseProgress("");

    const completedResult = task.results.find((result) => result.status === "success" && result.parsedData) || task.results[0];
    if (task.status === "completed" && completedResult?.parsedData) {
      setParsedData(completedResult.parsedData);
      setError(null);
    } else if (task.status === "failed") {
      setError(task.errorMessage || completedResult?.errorMessage || "解析失败");
    }
  }, []);

  const loadSingleParseTask = useCallback(async (taskId?: number | null) => {
    try {
      const url = taskId ? `/api/resume-parse-tasks?taskId=${taskId}` : "/api/resume-parse-tasks";
      const result = await fetchClientJson<ApiResponse<ResumeParseTask | null>>(url);

      if (result.success && result.data) {
        if (!taskId && parseRequestedAt) {
          const createdAtTime = Date.parse(result.data.createdAt);
          const requestedAtTime = Date.parse(parseRequestedAt);
          const ageDelta = requestedAtTime - createdAtTime;

          if (
            Number.isFinite(createdAtTime) &&
            Number.isFinite(requestedAtTime) &&
            ageDelta > 30_000
          ) {
            return null;
          }
        }

        syncSingleParseTaskState(result.data);
        return result.data;
      }

      return null;
    } catch (err) {
      console.error("[简历解析] 加载后台解析任务失败:", err);
      return null;
    }
  }, [parseRequestedAt, syncSingleParseTaskState]);

  const startSingleParseTask = useCallback(async () => {
    if (!resumeContent.trim()) {
      toast.error("请输入简历内容");
      return;
    }

    setIsParseTaskActive(true);
    setIsParsing(true);
    setParseProgress("正在提交后台解析任务...");
    setError(null);
    setParsedData(null);
    setResumeParseTaskId(null);
    setSingleParseTask(null);
    setIsAwaitingParseTask(true);
    setParseRequestedAt(new Date().toISOString());

    try {
      const position = selectedPosition
        ? {
            ...selectedPosition,
            positionId: selectedPosition.id,
          }
        : selectedPositionId
          ? {
              positionId: Number(selectedPositionId),
            }
          : undefined;

      const response = await fetchClientJson<ApiResponse<ResumeParseTask>>("/api/resume-parse-tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resumeContent,
          fileName: uploadedFileMeta?.name || uploadedFile?.name || "手动输入简历",
          position,
        }),
      });

      if (!response.success || !response.data) {
        throw new Error(response.error || "创建解析任务失败");
      }

      setIsAwaitingParseTask(false);
      setParseRequestedAt(response.data.createdAt || new Date().toISOString());
      syncSingleParseTaskState(response.data);
      toast.success("已启动后台解析", {
        description: "页面刷新后会自动恢复进度",
      });
    } catch (err) {
      setIsAwaitingParseTask(false);
      setIsParseTaskActive(false);
      setIsParsing(false);
      setParseProgress("");
      const message = err instanceof Error ? err.message : "创建解析任务失败";
      setError(message);
      toast.error("启动解析失败", {
        description: message,
      });
    }
  }, [resumeContent, selectedPosition, uploadedFileMeta, uploadedFile?.name, syncSingleParseTaskState]);

  useEffect(() => {
    if (!isParseTaskActive || singleParseTask || isAwaitingParseTask) {
      return;
    }

    void loadSingleParseTask(resumeParseTaskId);
  }, [isAwaitingParseTask, isParseTaskActive, loadSingleParseTask, resumeParseTaskId, singleParseTask]);

  useEffect(() => {
    const taskStatus = singleParseTask?.status;
    const shouldPoll = isParseTaskActive && !isAwaitingParseTask && (!taskStatus || taskStatus === "pending" || taskStatus === "processing");

    if (!shouldPoll) {
      if (parseTaskPollRef.current !== null) {
        window.clearInterval(parseTaskPollRef.current);
        parseTaskPollRef.current = null;
      }
      return;
    }

    if (parseTaskPollRef.current !== null) {
      return;
    }

    parseTaskPollRef.current = window.setInterval(() => {
      void loadSingleParseTask(resumeParseTaskId);
    }, 2000);

    return () => {
      if (parseTaskPollRef.current !== null) {
        window.clearInterval(parseTaskPollRef.current);
        parseTaskPollRef.current = null;
      }
    };
  }, [isAwaitingParseTask, isParseTaskActive, loadSingleParseTask, resumeParseTaskId, singleParseTask?.status]);

  const applyPositions = useCallback((nextPositions: Position[]) => {
    setPositions(nextPositions);
    setSelectedPositionId((current) =>
      current && !nextPositions.some((position) => position.id.toString() === current)
        ? ""
        : current
    );
  }, []);

  const fetchPositions = useCallback(async (forceRefresh: boolean = false) => {
    try {
      const data = await fetchClientJsonCached<ApiResponse<Position[]>>(
        "/api/positions",
        {},
        {
          forceRefresh,
          ttlMs: 15_000,
        }
      );
      if (data.success) {
        applyPositions(data.data || []);
      }
    } catch (err) {
      console.error("加载岗位列表失败:", err);
    }
  }, [applyPositions]);

  // 加载岗位列表
  useEffect(() => {
    void fetchPositions(false);
  }, [fetchPositions]);

  // 监听岗位变更，确保简历解析中的岗位选择与岗位管理同步
  useEffect(() => {
    const unsubscribe = sync.on("positionsUpdated", () => {
      void fetchPositions(true);
    });

    return unsubscribe;
  }, [fetchPositions]);

  // 提取文件内容
  const extractContent = async (file: File) => {
    setIsExtracting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/resume/extract", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "内容提取失败");
      }

      setResumeContent(data.content);
      toast.success("提取成功", {
        description: "简历内容已成功提取",
      });
    } catch (err) {
      toast.error("提取失败", {
        description: err instanceof Error ? err.message : "未知错误",
      });
    } finally {
      setIsExtracting(false);
    }
  };

  // 处理文件上传
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 支持的文件类型
    const supportedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/xml",
      "application/xml",
      "application/rtf",
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/gif",
      "image/webp",
      "image/bmp",
      "image/tiff",
    ];

    const fileName = file.name.toLowerCase();
    const isSupported =
      supportedTypes.includes(file.type) ||
      fileName.endsWith(".pdf") ||
      fileName.endsWith(".doc") ||
      fileName.endsWith(".docx") ||
      fileName.endsWith(".txt") ||
      fileName.endsWith(".xml") ||
      fileName.endsWith(".rtf") ||
      fileName.endsWith(".png") ||
      fileName.endsWith(".jpg") ||
      fileName.endsWith(".jpeg") ||
      fileName.endsWith(".gif") ||
      fileName.endsWith(".webp") ||
      fileName.endsWith(".bmp") ||
      fileName.endsWith(".tiff") ||
      fileName.endsWith(".tif");

    if (!isSupported) {
      toast.error("不支持的文件格式", {
        description: "请上传 PDF、Word、图片或文本文件",
      });
      return;
    }

    setResumeParseTaskId(null);
    setIsParseTaskActive(false);
    setIsAwaitingParseTask(false);
    setParseRequestedAt(null);
    setSingleParseTask(null);
    setIsParsing(false);
    setParseProgress("");

    setUploadedFile(file);
    setUploadedFileMeta({
      name: file.name,
      size: file.size,
      type: file.type,
    });
    setParsedData(null);
    setError(null);
    setResumeContent("");

    // 如果是图片，创建预览
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }

    // 自动提取内容
    await extractContent(file);
  };

  // 解析简历
  const handleParse = async () => {
    await startSingleParseTask();
  };

  // 导出PDF
  const handleExportPDF = async () => {
    if (!parsedData) return;

    try {
      const response = await fetch("/api/resumes/export-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parsedData,
          selectedPosition: selectedPosition
            ? {
                title: selectedPosition.title,
                department: selectedPosition.department,
              }
            : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("导出失败");
      }

      const htmlContent = await response.text();

      // 打开新窗口进行打印
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.print();
      }

      toast.success("导出成功", {
        description: "报告已在新窗口打开",
      });
    } catch (err) {
      toast.error("导出失败", {
        description: err instanceof Error ? err.message : "未知错误",
      });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 左侧：上传和输入 */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              上传简历
            </CardTitle>
            <CardDescription>
              支持 PDF、Word、图片（PNG/JPG/GIF/WebP/BMP/TIFF）、文本文件
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 文件上传区域 */}
            <div
              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt,.xml,.rtf,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tiff,.tif"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm text-gray-500">
                点击或拖拽文件到此处上传
              </p>
              <p className="text-xs text-gray-400 mt-1">
                支持 PDF、Word、图片、文本文件
              </p>
            </div>

            {/* 已上传文件 */}
            {activeUploadedFile && (
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium text-sm">{activeUploadedFile.name}</p>
                    <p className="text-xs text-gray-500">
                      {(activeUploadedFile.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPreview(true)}
                  >
                    预览
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setUploadedFile(null);
                      setUploadedFileMeta(null);
                      setResumeContent("");
                      setImagePreview(null);
                      setParsedData(null);
                      setError(null);
                      setResumeParseTaskId(null);
                      setIsParseTaskActive(false);
                      setIsAwaitingParseTask(false);
                      setParseRequestedAt(null);
                      setSingleParseTask(null);
                      setIsParsing(false);
                      setParseProgress("");
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* 提取中状态 */}
            {isExtracting && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在提取简历内容...
              </div>
            )}

            {/* 岗位选择器 */}
            <div>
              <Label htmlFor="position-select" className="flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                选择岗位（可选）
              </Label>
              <Select
                value={selectedPositionId}
                onValueChange={setSelectedPositionId}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="选择应聘岗位，系统将进行岗位匹配分析" />
                </SelectTrigger>
                <SelectContent>
                  {positions.length === 0 ? (
                    <div className="p-3 text-sm text-gray-500 text-center">
                      暂无岗位数据，请先在岗位管理中创建岗位
                    </div>
                  ) : (
                    positions.map((position) => (
                      <SelectItem key={position.id} value={position.id.toString()}>
                        {position.title} - {position.department}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {selectedPosition && (
                <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm font-medium text-blue-900 mb-1">{selectedPosition.title}</p>
                  <p className="text-xs text-blue-700 line-clamp-2">
                    {selectedPosition.jobDescription}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Badge variant="outline" className="text-xs bg-blue-50 border-blue-300">
                      学历：{selectedPosition.education}
                    </Badge>
                    <Badge variant="outline" className="text-xs bg-blue-50 border-blue-300">
                      经验：{selectedPosition.experience}
                    </Badge>
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-500">或直接粘贴简历内容</span>
              </div>
            </div>

            <div>
              <Label htmlFor="resume-content">简历内容</Label>
              <Textarea
                id="resume-content"
                placeholder="在此粘贴简历内容..."
                value={resumeContent}
                onChange={(e) => setResumeContent(e.target.value)}
                className="min-h-[300px] mt-2"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <Button
              onClick={handleParse}
              disabled={isParsing || !resumeContent.trim()}
              className="w-full"
            >
              {isParsing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {parseProgress || "解析中..."}
                </>
              ) : (
                <>
                  <FileText className="mr-2 h-4 w-4" />
                  开始解析
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* 右侧：解析结果 */}
      <div className="space-y-6">
        {parsedData && (
          <>
            {/* 导出按钮 */}
            <div className="flex justify-end">
              <Button
                onClick={handleExportPDF}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                导出PDF
              </Button>
            </div>

            {/* 岗位匹配分析 */}
            {parsedData.matchAnalysis && (
              <Card className="border-blue-200 bg-blue-50/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-blue-900">
                    <Briefcase className="h-5 w-5" />
                    岗位匹配分析
                    {typeof parsedData.matchAnalysis.matchScore === "number" && (
                      <Badge variant="secondary" className="ml-auto">
                        匹配度：{parsedData.matchAnalysis.matchScore}%
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {parsedData.matchAnalysis.vetoCheck?.triggered && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive">一票否决命中</Badge>
                        <span className="text-sm font-medium text-red-800">筛选分数已强制置为 0</span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {parsedData.matchAnalysis.vetoCheck?.hits.map((hit, index) => (
                          <div key={index} className="rounded-lg border border-red-100 bg-white p-3">
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

                  {/* 候选人优势 */}
                  {parsedData.matchAnalysis.strengths && parsedData.matchAnalysis.strengths.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        <h4 className="font-semibold text-green-900">候选人优势</h4>
                      </div>
                      <ul className="space-y-2">
                        {parsedData.matchAnalysis.strengths.map((strength: any, index) => (
                          <li key={index} className="text-sm text-gray-700 bg-green-50 p-2 rounded border border-green-200">
                            {typeof strength === 'string' ? strength : (
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

                  {/* 潜在不足 */}
                  {parsedData.matchAnalysis.weaknesses && parsedData.matchAnalysis.weaknesses.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="h-4 w-4 text-orange-600" />
                        <h4 className="font-semibold text-orange-900">潜在不足</h4>
                      </div>
                      <ul className="space-y-2">
                        {parsedData.matchAnalysis.weaknesses.map((weakness: any, index) => (
                          <li key={index} className="text-sm text-gray-700 bg-orange-50 p-2 rounded border border-orange-200">
                            {typeof weakness === 'string' ? weakness : (
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

                  {/* 匹配项 */}
                  {parsedData.matchAnalysis.matchedItems && parsedData.matchAnalysis.matchedItems.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="h-4 w-4 text-blue-600" />
                        <h4 className="font-semibold text-blue-900">已匹配项</h4>
                      </div>
                      <div className="space-y-2">
                        {parsedData.matchAnalysis.matchedItems.map((item, index) => (
                          <div key={index} className="bg-blue-50 p-3 rounded border border-blue-200">
                            <div className="text-sm font-medium text-blue-900 mb-1">
                              {item.requirement}
                            </div>
                            <div className="text-xs text-gray-700">{item.evidence}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 未匹配项 */}
                  {parsedData.matchAnalysis.unmatchedItems && parsedData.matchAnalysis.unmatchedItems.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        <h4 className="font-semibold text-red-900">未匹配项</h4>
                      </div>
                      <div className="space-y-2">
                        {parsedData.matchAnalysis.unmatchedItems.map((item, index) => (
                          <div key={index} className="bg-red-50 p-3 rounded border border-red-200">
                            <div className="text-sm font-medium text-red-900 mb-1">
                              {item.requirement}
                            </div>
                            <div className="text-xs text-gray-700">{item.gap}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 岗位详情分析 */}
                  {parsedData.matchAnalysis.jobAspectAnalysis && parsedData.matchAnalysis.jobAspectAnalysis.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Briefcase className="h-4 w-4 text-slate-600" />
                        <h4 className="font-semibold text-slate-900">岗位详情分析</h4>
                      </div>
                      <div className="space-y-2">
                        {parsedData.matchAnalysis.jobAspectAnalysis.map((item, index) => (
                          <div key={index} className="bg-slate-50 p-3 rounded border border-slate-200">
                            <div className="text-sm font-medium text-slate-900">
                              {item.aspect || "岗位分析"}
                            </div>
                            {item.conclusion && (
                              <div className="text-sm text-slate-700 mt-1">{item.conclusion}</div>
                            )}
                            {item.evidence && (
                              <div className="text-xs text-slate-500 mt-2">证据：{item.evidence}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </CardContent>
              </Card>
            )}

            {/* 冲突信息标记 */}
            {parsedData.conflictMarkers && parsedData.conflictMarkers.length > 0 && (
              <Card className="border-orange-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-orange-700">
                    <AlertCircle className="h-5 w-5" />
                    冲突信息标记
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {parsedData.conflictMarkers.map((marker, index) => (
                      <div
                        key={index}
                        className="rounded-lg bg-orange-50 p-3 border border-orange-200"
                      >
                        <Badge variant="outline" className="mb-2">
                          {marker.type}
                        </Badge>
                        <p className="text-sm text-gray-700">{marker.description}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 技能特长 */}
            {parsedData.skills && parsedData.skills.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>技能特长</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {parsedData.skills.map((skill, index) => (
                      <Badge key={index} variant="secondary">
                        {skill.name} ({skill.level})
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {!parsedData && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Upload className="h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-500 text-center">
                请在左侧上传或粘贴简历内容<br />解析结果将显示在此处
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 简历预览模态框 */}
      {showPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={() => setShowPreview(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden m-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 模态框头部 */}
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="text-lg font-semibold">简历预览</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(false)}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* 模态框内容 */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              {imagePreview && isImageUpload ? (
                // 图片预览
                <div className="flex items-center justify-center">
                  <img
                    src={imagePreview}
                    alt="简历预览"
                    className="max-w-full h-auto"
                  />
                </div>
              ) : (
                // 文本预览
                <div className="space-y-4">
                  <div className="flex items-center gap-3 pb-4 border-b">
                    <FileText className="h-8 w-8 text-gray-500" />
                    <div>
                      <p className="font-medium text-gray-900">{activeUploadedFile?.name}</p>
                      <p className="text-sm text-gray-500">
                        {(activeUploadedFile?.size ? (activeUploadedFile.size / 1024).toFixed(2) : '0')} KB
                      </p>
                    </div>
                  </div>

                  {resumeContent ? (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono">
                        {resumeContent}
                      </pre>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-12 text-center">
                      <div className="space-y-2">
                        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                        <p className="text-sm text-gray-500">
                          {isExtracting ? '正在提取简历内容...' : '暂无简历内容'}
                        </p>
                      </div>
                    </div>
                  )}

                  {!resumeContent && !isExtracting && (
                    <div className="flex justify-center">
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (uploadedFile) {
                            extractContent(uploadedFile);
                          }
                        }}
                        disabled={!uploadedFile}
                      >
                        重新提取内容
                      </Button>
                    </div>
                  )}

                  {!uploadedFile && activeUploadedFile && !resumeContent && (
                    <div className="flex justify-center">
                      <p className="text-xs text-gray-500">
                        已恢复上次上传状态；如需重新提取，请重新选择原文件
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== Batch Upload Component ====================

// 可序列化的文件状态（用于持久化存储）
interface SerializedBatchFile {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  status: 'pending' | 'extracting' | 'parsing' | 'completed' | 'error' | 'duplicate';
  progress: number;
  extractedContent?: string;
  parsedData?: ParsedData;
  error?: string;
  duplicateInfo?: {
    existingCandidateId: number;
    existingCandidateName: string;
    matchFields: string[];
  };
  selectedPositionId?: string;
  savedToCandidates?: boolean;
  processedAt?: string; // 处理完成时间
}

const BATCH_PARSE_STORAGE_KEY = 'batch_parse_state';

function BatchUploadTab() {

  const [files, setFiles] = useState<BatchFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [positions, setPositions] = useState<Position[]>([]);
  const [globalPositionId, setGlobalPositionId] = useState<string>("");
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [currentDuplicateFile, setCurrentDuplicateFile] = useState<BatchFile | null>(null);
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [restoredFromStorage, setRestoredFromStorage] = useState(false); // 是否从存储恢复了状态

  const applyPositions = useCallback((nextPositions: Position[]) => {
    setPositions(nextPositions);
    setGlobalPositionId((current) =>
      current && !nextPositions.some((position) => position.id.toString() === current)
        ? ""
        : current
    );
    setFiles((prev) =>
      prev.map((file) => {
        if (!file.selectedPositionId) {
          return file;
        }

        const stillExists = nextPositions.some(
          (position) => position.id.toString() === file.selectedPositionId
        );

        return stillExists ? file : { ...file, selectedPositionId: undefined };
      })
    );
  }, []);

  const fetchPositions = useCallback(async (forceRefresh: boolean = false) => {
    try {
      const data = await fetchClientJsonCached<ApiResponse<Position[]>>(
        "/api/positions",
        {},
        {
          forceRefresh,
          ttlMs: 15_000,
        }
      );
      if (data.success) {
        applyPositions(data.data || []);
      }
    } catch (err) {
      console.error("加载岗位列表失败:", err);
    }
  }, [applyPositions]);

  // 加载岗位列表
  useEffect(() => {
    void fetchPositions(false);
  }, [fetchPositions]);

  useEffect(() => {
    const unsubscribe = sync.on("positionsUpdated", () => {
      void fetchPositions(true);
    });

    return unsubscribe;
  }, [fetchPositions]);

  // 从 localStorage 加载保存的状态
  const loadSavedState = useCallback(() => {
    try {
      const saved = localStorage.getItem(BATCH_PARSE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { files: SerializedBatchFile[]; savedAt: string };
        if (parsed.files && parsed.files.length > 0) {
          // 只恢复已处理的文件（completed, error, duplicate）
          // pending 状态的文件需要重新上传，因为 File 对象无法序列化
          const processedFiles = parsed.files.filter(f => 
            f.status === 'completed' || f.status === 'error' || f.status === 'duplicate'
          );
          
          if (processedFiles.length > 0) {
            // 将序列化的数据转换回 BatchFile 格式
            const restoredFiles: BatchFile[] = processedFiles.map(sf => ({
              id: sf.id,
              file: { name: sf.fileName, size: sf.fileSize, type: sf.fileType } as File,
              status: sf.status,
              progress: sf.progress,
              extractedContent: sf.extractedContent,
              parsedData: sf.parsedData,
              error: sf.error,
              duplicateInfo: sf.duplicateInfo,
              selectedPositionId: sf.selectedPositionId,
              savedToCandidates: sf.savedToCandidates,
            }));
            
            setFiles(restoredFiles);
            setRestoredFromStorage(true);
            console.log('[批量解析] 从 localStorage 恢复了', restoredFiles.length, '个文件状态');
          }
        }
      }
    } catch (err) {
      console.error('加载保存的状态失败:', err);
    }
  }, []);

  // 保存状态到 localStorage
  const saveState = useCallback((filesToSave: BatchFile[]) => {
    try {
      // 只保存已处理的文件（不保存 pending 状态，因为 File 对象无法恢复）
      const processedFiles = filesToSave.filter(f => 
        f.status === 'completed' || f.status === 'error' || f.status === 'duplicate'
      );
      
      if (processedFiles.length > 0) {
        const serialized: { files: SerializedBatchFile[]; savedAt: string } = {
          files: processedFiles.map(f => ({
            id: f.id,
            fileName: f.file.name,
            fileSize: f.file.size,
            fileType: f.file.type,
            status: f.status,
            progress: f.progress,
            extractedContent: f.extractedContent,
            parsedData: f.parsedData,
            error: f.error,
            duplicateInfo: f.duplicateInfo,
            selectedPositionId: f.selectedPositionId,
            savedToCandidates: f.savedToCandidates,
            processedAt: new Date().toISOString(),
          })),
          savedAt: new Date().toISOString(),
        };
        
        localStorage.setItem(BATCH_PARSE_STORAGE_KEY, JSON.stringify(serialized));
        console.log('[批量解析] 已保存', processedFiles.length, '个文件状态到 localStorage');
      } else {
        // 如果没有已处理的文件，清除存储
        localStorage.removeItem(BATCH_PARSE_STORAGE_KEY);
      }
    } catch (err) {
      console.error('保存状态失败:', err);
    }
  }, []);

  // 组件挂载时加载保存的状态
  useEffect(() => {
    loadSavedState();
  }, [loadSavedState]);

  // 当文件状态变化时保存状态（排除 pending 和 processing 状态）
  useEffect(() => {
    // 只在有已处理的文件时保存
    const hasProcessedFiles = files.some(f => 
      f.status === 'completed' || f.status === 'error' || f.status === 'duplicate'
    );
    
    if (hasProcessedFiles) {
      saveState(files);
    }
  }, [files, saveState]);

  // 清除保存的状态
  const clearSavedState = useCallback(() => {
    localStorage.removeItem(BATCH_PARSE_STORAGE_KEY);
    setRestoredFromStorage(false);
    console.log('[批量解析] 已清除 localStorage 中的状态');
  }, []);

  // 生成唯一ID
  const generateId = () => Math.random().toString(36).substring(2, 15);

  // 支持的文件类型
  const supportedExtensions = [
    ".pdf", ".doc", ".docx", ".txt", ".xml", ".rtf",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".tif",
    ".odt", ".fodt", ".ott", // OpenDocument 文本
    ".xls", ".xlsx", ".csv", // Excel 文件（可能包含简历数据）
    ".ppt", ".pptx", // PowerPoint（可能包含简历信息）
    ".pages", ".numbers", ".keynote", // iWork 文档
    ".htm", ".html", ".mhtml", // 网页格式
    ".epub", ".mobi", // 电子书格式
    ".wps", ".et", ".dps", // WPS Office 文档
  ];

  const isFileSupported = (fileName: string) => {
    const ext = fileName.toLowerCase();
    return supportedExtensions.some(e => ext.endsWith(e));
  };

  // 处理文件选择
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const newFiles: BatchFile[] = [];

    for (const file of selectedFiles) {
      if (!isFileSupported(file.name)) {
        toast.error(`不支持的文件格式: ${file.name}`, {
          description: "已跳过该文件",
        });
        continue;
      }

      // 检查是否已存在
      if (files.some(f => f.file.name === file.name && f.file.size === file.size)) {
        continue;
      }

      newFiles.push({
        id: generateId(),
        file,
        status: 'pending',
        progress: 0,
        selectedPositionId: globalPositionId || undefined,
      });
    }

    if (newFiles.length > 0) {
      setFiles(prev => [...prev, ...newFiles]);
      toast.success(`已添加 ${newFiles.length} 个文件`, {
        description: "点击「开始批量解析」进行处理",
      });
    }

    // 清空 input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // 删除文件
  const handleRemoveFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  // 清空所有文件
  const handleClearAll = () => {
    setFiles([]);
    clearSavedState();
    toast.success("已清空所有文件");
  };

  // 更新文件的岗位选择
  const handlePositionChange = (id: string, positionId: string) => {
    setFiles(prev => prev.map(f => 
      f.id === id ? { ...f, selectedPositionId: positionId } : f
    ));
  };

  // 检测重复候选人
  const checkDuplicate = async (parsedData: ParsedData): Promise<DuplicateCheckResult> => {
    const { basicInfo } = parsedData;
    if (!basicInfo || (!basicInfo.name && !basicInfo.phone && !basicInfo.email)) {
      return { isDuplicate: false };
    }

    try {
      const data = await fetchClientJson<DuplicateCheckResult>("/api/resumes/check-duplicate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: basicInfo.name,
          phone: basicInfo.phone,
          email: basicInfo.email,
        }),
      });

      return data;
    } catch (err) {
      console.error("重复检测失败:", err);
      return { isDuplicate: false };
    }
  };

  // 处理单个文件
  const processFile = async (batchFile: BatchFile): Promise<BatchFile> => {
    try {
      // Step 1: 提取内容
      setFiles(prev => prev.map(f => 
        f.id === batchFile.id ? { ...f, status: 'extracting', progress: 20 } : f
      ));

      const formData = new FormData();
      formData.append("file", batchFile.file);

      const extractResponse = await fetch("/api/resume/extract", {
        method: "POST",
        body: formData,
      });

      const extractData = await extractResponse.json();

      if (!extractResponse.ok || !extractData.success) {
        throw new Error(extractData.error || "内容提取失败");
      }

      // Step 2: 解析简历
      setFiles(prev => prev.map(f => 
        f.id === batchFile.id ? { ...f, status: 'parsing', progress: 50, extractedContent: extractData.content } : f
      ));

      const position = batchFile.selectedPositionId
        ? positions.find(p => p.id.toString() === batchFile.selectedPositionId)
        : undefined;

      const parseResponse = await fetch("/api/resume/parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resumeContent: extractData.content,
          position: position ? { ...position, positionId: position.id } : undefined,
        }),
      });

      const parseData = await parseResponse.json();

      if (!parseResponse.ok || !parseData.success) {
        throw new Error(parseData.error || "解析失败");
      }

      // Step 3: 检测重复
      setFiles(prev => prev.map(f => 
        f.id === batchFile.id ? { ...f, progress: 80 } : f
      ));

      const candidateName = parseData.data.basicInfo?.name;
      const candidatePhone = parseData.data.basicInfo?.phone;
      const duplicateResult = await checkDuplicate(parseData.data);

      if (duplicateResult.isDuplicate) {
        return {
          ...batchFile,
          status: 'duplicate',
          progress: 100,
          parsedData: parseData.data,
          duplicateInfo: {
            existingCandidateId: duplicateResult.existingCandidateId || 0,
            existingCandidateName: duplicateResult.existingCandidateName || candidateName || '未知',
            matchFields: duplicateResult.matchFields || ['姓名', '手机号'],
          },
        };
      }

      // Step 4: 保存候选人到后端，并镜像到本地缓存
      setFiles(prev => prev.map(f => 
        f.id === batchFile.id ? { ...f, progress: 90 } : f
      ));

      try {
        // 获取岗位名称
        const position = batchFile.selectedPositionId
          ? positions.find(p => p.id.toString() === batchFile.selectedPositionId)
          : undefined;

        const response = await fetchClientJson<ApiResponse<CandidateApiRecord>>("/api/candidates", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: candidateName || batchFile.file.name,
            phone: candidatePhone || undefined,
            email: parseData.data.basicInfo?.email || undefined,
            source: "批量上传",
          }),
        });

        mirrorCandidateToLocalStorage({
          candidate: response.data,
          fileName: batchFile.file.name,
          positionTitle: position?.title || "",
          parsedData: parseData.data,
          extractedContent: extractData.content,
        });
      } catch (saveError) {
        if (saveError instanceof ClientApiError && saveError.status === 409) {
          const existingCandidate = (saveError.details as { existingCandidate?: CandidateApiRecord } | undefined)?.existingCandidate;
          return {
            ...batchFile,
            status: 'duplicate',
            progress: 100,
            parsedData: parseData.data,
            duplicateInfo: {
              existingCandidateId: existingCandidate?.id || 0,
              existingCandidateName: existingCandidate?.name || candidateName || '未知',
              matchFields: ['姓名', '手机号/邮箱'],
            },
          };
        }

        console.error("保存候选人失败:", saveError);
        throw saveError;
      }

      return {
        ...batchFile,
        status: 'completed',
        progress: 100,
        parsedData: parseData.data,
        savedToCandidates: true,
      };
    } catch (err) {
      return {
        ...batchFile,
        status: 'error',
        progress: 0,
        error: err instanceof Error ? err.message : "处理失败",
      };
    }
  };

  // 批量处理
  const handleProcessAll = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) {
      toast.error("没有待处理的文件", {
        description: "请先添加文件",
      });
      return;
    }

    setIsProcessing(true);
    const processedResults: BatchFile[] = [];

    for (const file of pendingFiles) {
      const result = await processFile(file);
      processedResults.push(result);
      setFiles(prev => prev.map(f => f.id === result.id ? result : f));
    }

    setIsProcessing(false);

    const completedCount = processedResults.filter(f => f.status === 'completed').length;
    const duplicateCount = processedResults.filter(f => f.status === 'duplicate').length;
    const errorCount = processedResults.filter(f => f.status === 'error').length;

    toast.success("批量处理完成", {
      description: `成功: ${completedCount}, 重复: ${duplicateCount}, 失败: ${errorCount}`,
    });
  };

  // 重试失败的文件
  const handleRetry = async (id: string) => {
    const file = files.find(f => f.id === id);
    if (!file || file.status !== 'error') return;

    // 重置状态
    setFiles(prev => prev.map(f => 
      f.id === id ? { ...f, status: 'pending', progress: 0, error: undefined } : f
    ));

    // 自动重新处理
    setIsProcessing(true);
    try {
      const result = await processFile(file);
      setFiles(prev => prev.map(f => f.id === result.id ? result : f));
      
      if (result.status === 'completed') {
        toast.success("重试成功", {
          description: `${result.parsedData?.basicInfo?.name || file.file.name} 已成功解析`,
        });
      } else if (result.status === 'error') {
        toast.error("重试失败", {
          description: result.error || "处理失败",
        });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // 手动导入到候选人管理
  const handleImportToCandidates = async (id: string) => {
    const file = files.find(f => f.id === id);
    if (!file || !file.parsedData) return;

    try {
      // 获取岗位名称
      const position = file.selectedPositionId
        ? positions.find(p => p.id.toString() === file.selectedPositionId)
        : undefined;

      const candidateName = file.parsedData.basicInfo?.name || file.file.name;
      const candidatePhone = file.parsedData.basicInfo?.phone || "";
      const response = await fetchClientJson<ApiResponse<CandidateApiRecord>>("/api/candidates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: candidateName,
          phone: candidatePhone || undefined,
          email: file.parsedData.basicInfo?.email || undefined,
          source: "批量上传",
        }),
      });

      mirrorCandidateToLocalStorage({
        candidate: response.data,
        fileName: file.file.name,
        positionTitle: position?.title || "",
        parsedData: file.parsedData,
        extractedContent: file.extractedContent,
      });

      // 更新状态为已保存
      setFiles(prev => prev.map(f => 
        f.id === id ? { ...f, savedToCandidates: true } : f
      ));

      toast.success("导入成功", {
        description: `已将 ${candidateName} 添加到候选人管理`,
      });
    } catch (err) {
      if (err instanceof ClientApiError && err.status === 409) {
        toast.warning("候选人已存在", {
          description: `${file.parsedData.basicInfo?.name || file.file.name} 已在候选人管理中`,
        });
        return;
      }

      toast.error("导入失败", {
        description: err instanceof Error ? err.message : "未知错误",
      });
    }
  };

  // 合并重复候选人
  const handleMerge = async (id: string) => {
    const file = files.find(f => f.id === id);
    if (!file || file.status !== 'duplicate') return;

    try {
      const response = await fetchClientJson<ApiResponse<unknown>>(`/api/candidates/${file.duplicateInfo?.existingCandidateId}/merge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          newResumeData: file.parsedData,
          newFileName: file.file.name,
        }),
      });
      if (!response.success) {
        throw new Error(response.error || "合并失败");
      }

      setFiles(prev => prev.map(f => 
        f.id === id ? { ...f, status: 'completed', duplicateInfo: undefined } : f
      ));

      toast.success("合并成功", {
        description: `已将简历信息合并到 ${file.duplicateInfo?.existingCandidateName}`,
      });
    } catch (err) {
      toast.error("合并失败", {
        description: err instanceof Error ? err.message : "未知错误",
      });
    }
  };

  // 创建新候选人（不合并）
  const handleCreateNew = async (id: string) => {
    const file = files.find(f => f.id === id);
    if (!file || file.status !== 'duplicate') return;

    try {
      const response = await fetch("/api/candidates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: file.parsedData?.basicInfo?.name || file.file.name,
          phone: file.parsedData?.basicInfo?.phone,
          email: file.parsedData?.basicInfo?.email,
          source: "批量上传",
          resumeData: file.parsedData,
          positionId: file.selectedPositionId,
          forceCreate: true,
        }),
      });

      if (!response.ok) {
        throw new Error("创建失败");
      }

      const result = await response.json() as ApiResponse<CandidateApiRecord>;
      const position = file.selectedPositionId
        ? positions.find(p => p.id.toString() === file.selectedPositionId)
        : undefined;

      if (result.success && result.data) {
        mirrorCandidateToLocalStorage({
          candidate: result.data,
          fileName: file.file.name,
          positionTitle: position?.title || "",
          parsedData: file.parsedData,
          extractedContent: file.extractedContent,
        });
      }

      setFiles(prev => prev.map(f => 
        f.id === id ? { ...f, status: 'completed', duplicateInfo: undefined, savedToCandidates: true } : f
      ));

      toast.success("创建成功", {
        description: "已创建新的候选人记录",
      });
    } catch (err) {
      toast.error("创建失败", {
        description: err instanceof Error ? err.message : "未知错误",
      });
    }
  };

  // 导出Excel
  const handleExportExcel = async () => {
    const completedFiles = files.filter(f => f.status === 'completed' || f.status === 'duplicate');
    if (completedFiles.length === 0) {
      toast.error("没有可导出的数据", {
        description: "请先完成简历解析",
      });
      return;
    }

    try {
      const response = await fetchClient("/api/resumes/export-excel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          files: completedFiles.map(f => {
            // 根据岗位ID获取岗位名称
            const position = f.selectedPositionId 
              ? positions.find(p => p.id.toString() === f.selectedPositionId)
              : null;
            return {
              fileName: f.file.name,
              parsedData: f.parsedData,
              selectedPositionId: f.selectedPositionId,
              selectedPositionName: position?.title || '',
            };
          }),
        }),
      });

      if (!response.ok) {
        let message = "导出失败";
        try {
          const data = await response.json() as { error?: string };
          message = data.error || message;
        } catch {}
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `简历解析结果_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success("导出成功", {
        description: `已导出 ${completedFiles.length} 条简历数据`,
      });
    } catch (err) {
      toast.error("导出失败", {
        description: err instanceof Error ? err.message : "未知错误",
      });
    }
  };

  // 获取状态图标
  const getStatusIcon = (status: BatchFile['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-gray-400" />;
      case 'extracting':
      case 'parsing':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'duplicate':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  // 获取状态文本
  const getStatusText = (status: BatchFile['status']) => {
    switch (status) {
      case 'pending':
        return '等待处理';
      case 'extracting':
        return '提取内容中...';
      case 'parsing':
        return '解析简历中...';
      case 'completed':
        return '已完成';
      case 'duplicate':
        return '检测到重复';
      case 'error':
        return '处理失败';
    }
  };

  // 统计信息
  const stats = {
    total: files.length,
    pending: files.filter(f => f.status === 'pending').length,
    processing: files.filter(f => ['extracting', 'parsing'].includes(f.status)).length,
    completed: files.filter(f => f.status === 'completed').length,
    duplicate: files.filter(f => f.status === 'duplicate').length,
    error: files.filter(f => f.status === 'error').length,
  };

  return (
    <div className="space-y-6">
      {/* 批量上传控制区 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Files className="h-5 w-5" />
            批量上传简历
          </CardTitle>
          <CardDescription>
            支持多种文档格式，自动解析并检测重复候选人
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 全局岗位选择 */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label htmlFor="global-position" className="flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                统一应用岗位（可选）
              </Label>
              <Select
                value={globalPositionId}
                onValueChange={setGlobalPositionId}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="选择岗位，将应用于所有新上传的简历" />
                </SelectTrigger>
                <SelectContent>
                  {positions.length === 0 ? (
                    <div className="p-3 text-sm text-gray-500 text-center">
                      暂无岗位数据
                    </div>
                  ) : (
                    positions.map((position) => (
                      <SelectItem key={position.id} value={position.id.toString()}>
                        {position.title} - {position.department}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 文件上传区域 */}
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={supportedExtensions.join(",")}
              onChange={handleFileSelect}
              className="hidden"
            />
            <Upload className="h-10 w-10 mx-auto mb-3 text-gray-400" />
            <p className="text-base font-medium text-gray-600 mb-1">
              点击或拖拽文件到此处上传
            </p>
            <p className="text-sm text-gray-400">
              支持 PDF、Word、图片、Excel、HTML 等多种格式
            </p>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              已选择 {files.length} 个文件
            </div>
            <div className="flex items-center gap-2">
              {files.length > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearAll}
                    disabled={isProcessing}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    清空
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportExcel}
                    disabled={stats.completed + stats.duplicate === 0}
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-1" />
                    导出Excel
                  </Button>
                </>
              )}
              <Button
                onClick={handleProcessAll}
                disabled={isProcessing || stats.pending === 0}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    处理中...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    开始批量解析
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 处理进度统计 */}
      {files.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="grid grid-cols-6 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-xs text-gray-500">总计</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-400">{stats.pending}</div>
                <div className="text-xs text-gray-500">待处理</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-500">{stats.processing}</div>
                <div className="text-xs text-gray-500">处理中</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-500">{stats.completed}</div>
                <div className="text-xs text-gray-500">已完成</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-500">{stats.duplicate}</div>
                <div className="text-xs text-gray-500">重复</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-500">{stats.error}</div>
                <div className="text-xs text-gray-500">失败</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 恢复状态提示 */}
      {restoredFromStorage && files.length > 0 && (
        <Alert className="bg-blue-50 border-blue-200">
          <CheckCircle className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            已恢复上次的解析记录（{files.length} 个文件）。如需解析新文件，请点击「上传简历」。
          </AlertDescription>
        </Alert>
      )}

      {/* 文件列表 */}
      {files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>文件列表</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="border rounded-lg p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      {getStatusIcon(file.status)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{file.file.name}</p>
                          <span className="text-xs text-gray-400">
                            ({(file.file.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-500">
                            {getStatusText(file.status)}
                          </span>
                          {file.progress > 0 && file.progress < 100 && (
                            <span className="text-xs text-gray-400">
                              ({file.progress}%)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* 岗位选择 */}
                      <Select
                        value={file.selectedPositionId || ""}
                        onValueChange={(value) => handlePositionChange(file.id, value)}
                        disabled={file.status !== 'pending'}
                      >
                        <SelectTrigger className="w-[200px] h-8">
                          <SelectValue placeholder="选择岗位" />
                        </SelectTrigger>
                        <SelectContent>
                          {positions.map((position) => (
                            <SelectItem key={position.id} value={position.id.toString()}>
                              {position.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {/* 重复提示 */}
                      {file.status === 'duplicate' && file.duplicateInfo && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleMerge(file.id)}
                          >
                            <Merge className="h-3 w-3 mr-1" />
                            合并
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCreateNew(file.id)}
                          >
                            <UserPlus className="h-3 w-3 mr-1" />
                            新建
                          </Button>
                        </div>
                      )}

                      {/* 已完成的文件 - 导入到候选人管理 */}
                      {file.status === 'completed' && (
                        <div className="flex items-center gap-2">
                          {file.savedToCandidates ? (
                            <span className="text-xs text-green-600 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              已导入
                            </span>
                          ) : (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleImportToCandidates(file.id)}
                            >
                              <UserPlus className="h-3 w-3 mr-1" />
                              导入到候选人管理
                            </Button>
                          )}
                        </div>
                      )}

                      {/* 重试按钮 */}
                      {file.status === 'error' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRetry(file.id)}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          重试
                        </Button>
                      )}

                      {/* 展开/收起 */}
                      {(file.parsedData || file.error) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedFileId(
                            expandedFileId === file.id ? null : file.id
                          )}
                        >
                          {expandedFileId === file.id ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      )}

                      {/* 删除按钮 */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveFile(file.id)}
                        disabled={isProcessing && ['extracting', 'parsing'].includes(file.status)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* 进度条 */}
                  {file.progress > 0 && file.progress < 100 && (
                    <Progress value={file.progress} className="mt-2 h-1" />
                  )}

                  {/* 展开详情 */}
                  {expandedFileId === file.id && (
                    <div className="mt-3 pt-3 border-t">
                      {file.error && (
                        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                          {file.error}
                        </div>
                      )}
                      {file.duplicateInfo && (
                        <div className="text-sm text-orange-600 bg-orange-50 p-2 rounded mb-2">
                          检测到重复候选人：<strong>{file.duplicateInfo.existingCandidateName}</strong>
                          <br />
                          匹配字段：{file.duplicateInfo.matchFields.join('、')}
                        </div>
                      )}
                      {file.parsedData && (
                        <div className="text-sm text-gray-600">
                          <div className="font-medium mb-2">解析结果：</div>
                          {file.parsedData.basicInfo && (
                            <div className="grid grid-cols-2 gap-2 bg-gray-50 p-2 rounded">
                              {file.parsedData.basicInfo.name && (
                                <div>姓名：{file.parsedData.basicInfo.name}</div>
                              )}
                              {file.parsedData.basicInfo.phone && (
                                <div>电话：{file.parsedData.basicInfo.phone}</div>
                              )}
                              {file.parsedData.basicInfo.email && (
                                <div>邮箱：{file.parsedData.basicInfo.email}</div>
                              )}
                              {file.parsedData.basicInfo.currentCompany && (
                                <div>当前公司：{file.parsedData.basicInfo.currentCompany}</div>
                              )}
                              {file.parsedData.basicInfo.currentPosition && (
                                <div>当前职位：{file.parsedData.basicInfo.currentPosition}</div>
                              )}
                            </div>
                          )}
                          {file.parsedData.matchAnalysis && (
                            <div className="mt-2 text-xs text-gray-500">
                              匹配度：{file.parsedData.matchAnalysis.matchScore ?? '-'}%
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ==================== Main Page Component ====================

export default function ResumeParserPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("single");

  return (
    <div className="container mx-auto py-6 px-4">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">简历解析</h1>
        <p className="text-gray-500 mt-1">
          上传简历文件，自动解析提取关键信息，支持单份和批量处理
        </p>
      </div>

      {/* Tab 布局 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="single" className="gap-2">
            <FileText className="h-4 w-4" />
            单份上传
          </TabsTrigger>
          <TabsTrigger value="batch" className="gap-2">
            <Files className="h-4 w-4" />
            批量上传
          </TabsTrigger>
        </TabsList>

        <TabsContent value="single">
          <SingleUploadTab />
        </TabsContent>

        <TabsContent value="batch">
          <BatchUploadTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
