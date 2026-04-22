"use client";

import { Fragment, useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  Upload, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Trash2, 
  UserPlus,
  RefreshCw,
  Download,
  ChevronDown,
  ChevronUp,
  Pencil
} from "lucide-react";
import { toast } from "sonner";
import { fetchClient, fetchClientJson } from "@/lib/client-api";

// 解析结果类型
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
  parsedData?: Record<string, unknown>;
  extractedContent?: string;
  errorMessage?: string;
  duplicateInfo?: {
    existingCandidateId: number;
    existingCandidateName: string;
    existingCandidatePhone: string;
  };
  processedAt?: string;
  importedAt?: string;
}

interface BatchParsedBasicInfo {
  name?: string;
  phone?: string;
  email?: string;
  gender?: string;
}

interface BatchParsedEducation {
  school?: string;
  major?: string;
  degree?: string;
}

interface BatchParsedMatchAnalysis {
  matchScore?: number;
  matchedItems?: unknown[];
  unmatchedItems?: unknown[];
  strengths?: unknown[];
  weaknesses?: unknown[];
  jobAspectAnalysis?: unknown[];
}

interface BatchParsedData {
  basicInfo?: BatchParsedBasicInfo;
  education?: BatchParsedEducation;
  workExperience?: unknown[];
  skills?: unknown[];
  projects?: unknown[];
  matchAnalysis?: BatchParsedMatchAnalysis;
  [key: string]: unknown;
}

interface EditableBatchCandidateDraft {
  name: string;
  gender: string;
  school: string;
  major: string;
  education: string;
  phone: string;
  email: string;
}

// 解析任务类型
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
  data?: T;
  error?: string;
}

interface BatchResumeUploadProps {
  onImportCandidates: (candidates: Array<{
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
    parsedData?: Record<string, unknown>;
    extractedContent?: string;
  }>) => Promise<string[]> | string[] | void;
  positions: Array<{ title: string }>;
}

const EDUCATION_OPTIONS = [
  "博士",
  "硕士",
  "本科",
  "大专",
  "高中",
  "中专 / 中技",
  "初中及以下",
] as const;

function readBatchString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBatchGender(value: unknown): string {
  const resolved = readBatchString(value);
  return resolved === "男" || resolved === "女" ? resolved : "";
}

function normalizeBatchEducation(value: unknown): string {
  const normalized = readBatchString(value).toLowerCase().replace(/\s+/g, "");

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

function getParsedData(result: ResumeParseResult): BatchParsedData | undefined {
  return result.parsedData as BatchParsedData | undefined;
}

function createDraftFromResult(result: ResumeParseResult): EditableBatchCandidateDraft {
  const parsedData = getParsedData(result);
  return {
    name: readBatchString(result.extractedInfo?.name) || readBatchString(parsedData?.basicInfo?.name),
    gender: normalizeBatchGender(parsedData?.basicInfo?.gender),
    school: readBatchString(parsedData?.education?.school),
    major: readBatchString(parsedData?.education?.major),
    education: normalizeBatchEducation(parsedData?.education?.degree),
    phone: readBatchString(result.extractedInfo?.phone) || readBatchString(parsedData?.basicInfo?.phone),
    email: readBatchString(result.extractedInfo?.email) || readBatchString(parsedData?.basicInfo?.email),
  };
}

function mergeDraftWithAutoFilledData(
  currentDraft: EditableBatchCandidateDraft | undefined,
  autoDraft: EditableBatchCandidateDraft
): EditableBatchCandidateDraft {
  if (!currentDraft) {
    return autoDraft;
  }

  return {
    name: currentDraft.name.trim() || autoDraft.name,
    gender: currentDraft.gender.trim() || autoDraft.gender,
    school: currentDraft.school.trim() || autoDraft.school,
    major: currentDraft.major.trim() || autoDraft.major,
    education: currentDraft.education.trim() || autoDraft.education,
    phone: currentDraft.phone.trim() || autoDraft.phone,
    email: currentDraft.email.trim() || autoDraft.email,
  };
}

function getDraftMissingFields(draft: EditableBatchCandidateDraft, position: string): string[] {
  return [
    !draft.name.trim() ? "姓名" : "",
    !draft.gender.trim() ? "性别" : "",
    !draft.school.trim() ? "学校" : "",
    !draft.major.trim() ? "专业" : "",
    !draft.education.trim() ? "学历" : "",
    !draft.phone.trim() ? "手机号" : "",
    !position.trim() ? "应聘岗位" : "",
  ].filter(Boolean);
}

function getParsedSummary(result: ResumeParseResult): string[] {
  const parsedData = getParsedData(result);
  if (!parsedData) {
    return [];
  }

  const summary: string[] = [];
  if ((parsedData.workExperience?.length || 0) > 0) {
    summary.push(`工作经历 ${parsedData.workExperience!.length}`);
  }
  if (parsedData.education?.school || parsedData.education?.major || parsedData.education?.degree) {
    summary.push("教育背景 已提取");
  }
  if ((parsedData.skills?.length || 0) > 0) {
    summary.push(`技能 ${parsedData.skills!.length}`);
  }
  if ((parsedData.projects?.length || 0) > 0) {
    summary.push(`项目经验 ${parsedData.projects!.length}`);
  }
  if (parsedData.matchAnalysis) {
    summary.push("岗位匹配分析 已生成");
  }

  return summary;
}

export function BatchResumeUpload({ onImportCandidates, positions }: BatchResumeUploadProps) {
  const [task, setTask] = useState<ResumeParseTask | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<string>("");
  const [isImportingAll, setIsImportingAll] = useState(false);
  const [importingResultIds, setImportingResultIds] = useState<string[]>([]);
  const [editableDrafts, setEditableDrafts] = useState<Record<string, EditableBatchCandidateDraft>>({});
  const [expandedResultIds, setExpandedResultIds] = useState<string[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 加载当前任务
  const loadTask = useCallback(async () => {
    try {
      const result = await fetchClientJson<ApiResponse<ResumeParseTask>>('/api/resume-parse-tasks');
      if (result.success && result.data) {
        setTask(result.data);
      } else {
        setTask(null);
      }
    } catch (error) {
      console.error('加载任务失败:', error);
    }
  }, []);

  // 组件挂载时加载任务
  useEffect(() => {
    loadTask();
  }, [loadTask]);

  useEffect(() => {
    if (!task) {
      setEditableDrafts({});
      setExpandedResultIds([]);
      return;
    }

    setEditableDrafts((prev) => {
      const nextDrafts = { ...prev };
      for (const result of task.results) {
        const autoDraft = createDraftFromResult(result);
        nextDrafts[result.id] = mergeDraftWithAutoFilledData(
          nextDrafts[result.id],
          autoDraft
        );
      }

      return nextDrafts;
    });
  }, [task]);

  // 轮询机制：当任务正在处理中时，定时刷新状态
  useEffect(() => {
    if (!task || (task.status !== 'pending' && task.status !== 'processing')) {
      return;
    }

    // 每2秒刷新一次任务状态
    pollIntervalRef.current = setInterval(() => {
      loadTask();
    }, 2000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [task, loadTask]);

  // 处理文件上传
  const handleFilesUpload = async (files: FileList) => {
    if (!selectedPosition) {
      toast.error("请先选择应聘岗位");
      return;
    }

    const fileArray = Array.from(files);
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/rtf",
      "text/plain",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/bmp",
      "image/webp",
    ];

    const validFiles = fileArray.filter(file => allowedTypes.includes(file.type));
    if (validFiles.length === 0) {
      toast.error("没有支持的文件类型");
      return;
    }

    setIsUploading(true);

    try {
      const uploadedFiles: Array<{ fileName: string; fileKey: string; downloadUrl: string }> = [];

      // 上传文件
      for (const file of validFiles) {
        const formData = new FormData();
        formData.append('file', file);

        const uploadResponse = await fetch('/api/resume/upload', {
          method: 'POST',
          body: formData
        });

        if (uploadResponse.ok) {
          const uploadResult = await uploadResponse.json();
          uploadedFiles.push({
            fileName: file.name,
            fileKey: uploadResult.fileKey,
            downloadUrl: uploadResult.downloadUrl
          });
        } else {
          console.error(`文件 ${file.name} 上传失败`);
        }
      }

      if (uploadedFiles.length === 0) {
        toast.error("所有文件上传失败");
        return;
      }

      // 创建解析任务（后端会自动启动后台处理）
      const taskResult = await fetchClientJson<ApiResponse<ResumeParseTask>>('/api/resume-parse-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: uploadedFiles,
          position: selectedPosition,
        })
      });
      if (!taskResult.success || !taskResult.data) {
        throw new Error(taskResult.error || "创建解析任务失败");
      }

      setTask(taskResult.data);
      toast.success(`已上传 ${uploadedFiles.length} 个文件，正在后台解析...`);
      
      // 立即开始轮询
      loadTask();
    } catch (error) {
      console.error('上传失败:', error);
      toast.error(error instanceof Error ? error.message : "上传失败");
    } finally {
      setIsUploading(false);
    }
  };

  // 拖放处理
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFilesUpload(e.dataTransfer.files);
    }
  };

  // 清除任务
  const handleClearTask = async () => {
    if (!task) return;
    
    try {
      const response = await fetchClient(`/api/resume-parse-tasks?taskId=${task.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error("清除解析记录失败");
      }
      setTask(null);
      toast.success("已清除解析记录");
    } catch (error) {
      console.error('清除任务失败:', error);
      toast.error(error instanceof Error ? error.message : "清除解析记录失败");
    }
  };

  // 导出解析结果为 Excel
  const handleExportExcel = async () => {
    console.log('[导出Excel] 按钮被点击');
    console.log('[导出Excel] task:', task ? '存在' : '不存在');
    console.log('[导出Excel] task.results:', task?.results ? `存在，数量: ${task.results.length}` : '不存在');
    
    if (!task) {
      toast.error("没有可导出的数据");
      return;
    }

    if (!task.results || task.results.length === 0) {
      toast.error("没有可导出的数据");
      return;
    }

    try {
      const XLSX = await import("xlsx");
      console.log('[导出Excel] 开始导出，结果数量:', task.results.length);
      
      // 准备导出数据
      const exportData = task.results.map((result, index) => ({
        '序号': index + 1,
        '文件名': result.fileName,
        '姓名': result.extractedInfo?.name || '',
        '手机号': result.extractedInfo?.phone || '',
        '邮箱': result.extractedInfo?.email || '',
        '状态': result.status === 'success' ? '解析成功' :
                result.status === 'failed' ? '解析失败' :
                result.status === 'duplicate' ? '重复' :
                result.status === 'processing' ? '处理中' : '等待中',
        '错误信息': result.errorMessage || (result.duplicateInfo ? 
          `已存在候选人: ${result.duplicateInfo.existingCandidateName} (${result.duplicateInfo.existingCandidatePhone})` : ''),
      }));

      console.log('[导出Excel] 导出数据准备完成:', exportData.length, '条');

      // 创建工作簿
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);

      // 设置列宽
      ws['!cols'] = [
        { wch: 6 },   // 序号
        { wch: 30 },  // 文件名
        { wch: 12 },  // 姓名
        { wch: 15 },  // 手机号
        { wch: 25 },  // 邮箱
        { wch: 10 },  // 状态
        { wch: 40 },  // 错误信息
      ];

      XLSX.utils.book_append_sheet(wb, ws, "简历解析结果");

      // 生成文件名
      const fileName = `简历解析结果_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.xlsx`;
      
      console.log('[导出Excel] 文件名:', fileName);

      // 使用 XLSX.writeFile 直接导出（最简单可靠的方式）
      XLSX.writeFile(wb, fileName);

      console.log('[导出Excel] 导出成功');
      toast.success(`导出成功！文件名：${fileName}`);
    } catch (error) {
      console.error('[导出Excel] 导出失败:', error);
      toast.error(`导出失败: ${error instanceof Error ? error.message : '请重试'}`);
    }
  };

  const markImportedResults = useCallback((resultIds: string[]) => {
    if (resultIds.length === 0) {
      return;
    }

    const importedAt = new Date().toISOString();
    setTask((prevTask) => {
      if (!prevTask) {
        return prevTask;
      }

      return {
        ...prevTask,
        results: prevTask.results.map((result) =>
          resultIds.includes(result.id)
            ? { ...result, importedAt }
            : result
        ),
      };
    });
  }, []);

  const getResultDraft = useCallback((result: ResumeParseResult): EditableBatchCandidateDraft => {
    return editableDrafts[result.id] || createDraftFromResult(result);
  }, [editableDrafts]);

  const updateResultDraft = useCallback((
    result: ResumeParseResult,
    patch: Partial<EditableBatchCandidateDraft>
  ) => {
    setEditableDrafts((prev) => ({
      ...prev,
      [result.id]: {
        ...(prev[result.id] || createDraftFromResult(result)),
        ...patch,
      },
    }));
  }, []);

  const toggleExpandedResult = useCallback((resultId: string) => {
    setExpandedResultIds((prev) =>
      prev.includes(resultId)
        ? prev.filter((id) => id !== resultId)
        : [...prev, resultId]
    );
  }, []);

  // 导入单个候选人
  const handleImportSingle = async (result: ResumeParseResult) => {
    if (!selectedPosition) {
      toast.error("请先选择应聘岗位");
      return;
    }

    if (result.importedAt || importingResultIds.includes(result.id)) {
      toast.info("该简历已导入候选人管理");
      return;
    }

    const draft = getResultDraft(result);
    const missingFields = getDraftMissingFields(draft, selectedPosition);
    if (missingFields.length > 0) {
      setExpandedResultIds((prev) =>
        prev.includes(result.id) ? prev : [...prev, result.id]
      );
      toast.error(`请先补全：${missingFields.join("、")}`);
      return;
    }

    const candidateToImport = {
      sourceResultId: result.id,
      name: draft.name.trim(),
      gender: draft.gender.trim(),
      school: draft.school.trim(),
      major: draft.major.trim(),
      education: draft.education.trim(),
      phone: draft.phone.trim(),
      email: draft.email.trim(),
      position: selectedPosition,
      fileName: result.fileName,
      fileKey: result.fileKey || '',
      downloadUrl: result.downloadUrl || '',
      parsedData: result.parsedData,
      extractedContent: result.extractedContent,
    };

    setImportingResultIds((prev) => [...prev, result.id]);

    try {
      const importedResultIds = (await onImportCandidates([candidateToImport])) || [];
      const succeededIds = importedResultIds.length > 0 ? importedResultIds : [];

      if (succeededIds.includes(result.id)) {
        markImportedResults([result.id]);
        toast.success(`已导入候选人: ${draft.name}`);
        return;
      }

      toast.warning(`未能导入候选人: ${draft.name}`);
    } catch (error) {
      console.error('导入单个候选人失败:', error);
      toast.error(error instanceof Error ? error.message : "导入候选人失败");
    } finally {
      setImportingResultIds((prev) => prev.filter((id) => id !== result.id));
    }
  };

  // 导入候选人
  const handleImport = async () => {
    if (!task) return;
    
    if (!selectedPosition) {
      toast.error("请先选择应聘岗位");
      return;
    }

    const successResults = task.results.filter((result) => result.status === 'success' && !result.importedAt);
    const incompleteResults = successResults.filter((result) => getDraftMissingFields(getResultDraft(result), selectedPosition).length > 0);
    const readyResults = successResults.filter((result) => getDraftMissingFields(getResultDraft(result), selectedPosition).length === 0);

    const candidatesToImport = readyResults.map((result) => {
      const draft = getResultDraft(result);
      return {
        sourceResultId: result.id,
        name: draft.name.trim(),
        gender: draft.gender.trim(),
        school: draft.school.trim(),
        major: draft.major.trim(),
        education: draft.education.trim(),
        phone: draft.phone.trim(),
        email: draft.email.trim(),
        position: selectedPosition,
        fileName: result.fileName,
        fileKey: result.fileKey || '',
        downloadUrl: result.downloadUrl || '',
        parsedData: result.parsedData,
        extractedContent: result.extractedContent,
      };
    });

    if (candidatesToImport.length === 0) {
      if (incompleteResults.length > 0) {
        setExpandedResultIds((prev) => [
          ...new Set([...prev, ...incompleteResults.map((result) => result.id)]),
        ]);
        toast.warning("请先补全缺失信息后再导入");
        return;
      }

      toast.error("没有可导入的候选人");
      return;
    }

    const importingIds = readyResults.map((result) => result.id);

    setIsImportingAll(true);
    setImportingResultIds((prev) => [...new Set([...prev, ...importingIds])]);

    try {
      const importedResultIds = (await onImportCandidates(candidatesToImport)) || [];
      const succeededIds = importingIds.filter((id) => importedResultIds.includes(id));

      if (succeededIds.length > 0) {
        markImportedResults(succeededIds);
        toast.success(`已导入 ${succeededIds.length} 位候选人`);
      }

      if (succeededIds.length === importingIds.length && incompleteResults.length === 0) {
        await handleClearTask();
      } else if (succeededIds.length === 0) {
        toast.warning("本次没有成功导入候选人");
      } else {
        toast.warning(`部分导入成功：${succeededIds.length}/${importingIds.length}${incompleteResults.length > 0 ? `，另有 ${incompleteResults.length} 份待补全` : ""}`);
      }
    } catch (error) {
      console.error('批量导入候选人失败:', error);
      toast.error(error instanceof Error ? error.message : "导入候选人失败");
    } finally {
      setIsImportingAll(false);
      setImportingResultIds((prev) => prev.filter((id) => !importingIds.includes(id)));
    }
  };

  // 计算进度
  const progress = task ? Math.round((task.processedCount / task.totalCount) * 100) : 0;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>简历批量上传</span>
          {task && (
            <Button variant="outline" size="sm" onClick={handleClearTask}>
              <Trash2 className="h-4 w-4 mr-2" />
              清除记录
            </Button>
          )}
        </CardTitle>
        <CardDescription>
          支持批量上传简历文件，自动解析并导入候选人
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 岗位选择 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">应聘岗位 *</label>
          <select
            className="w-full px-3 py-2 border rounded-md"
            value={selectedPosition}
            onChange={(e) => setSelectedPosition(e.target.value)}
          >
            <option value="">请选择岗位</option>
            {positions.map((pos) => (
              <option key={pos.title} value={pos.title}>
                {pos.title}
              </option>
            ))}
          </select>
        </div>

        {/* 上传区域 */}
        {!task ? (
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.rtf,.txt,.jpg,.jpeg,.png,.gif,.bmp,.webp"
              className="hidden"
              onChange={(e) => e.target.files && handleFilesUpload(e.target.files)}
            />
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground mb-2">
              拖放简历文件到此处，或
            </p>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || !selectedPosition}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  上传中...
                </>
              ) : (
                '选择文件'
              )}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              支持 PDF、Word、图片等格式
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 进度显示 */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>解析进度</span>
                <span>{task.processedCount} / {task.totalCount}</span>
              </div>
              <Progress value={progress} />
              <div className="flex gap-4 text-sm">
                <span className="text-green-600">
                  <CheckCircle2 className="h-4 w-4 inline mr-1" />
                  成功: {task.successCount}
                </span>
                <span className="text-red-600">
                  <XCircle className="h-4 w-4 inline mr-1" />
                  失败: {task.failedCount}
                </span>
              </div>
            </div>

            {/* 状态提示 */}
            {(task.status === 'pending' || task.status === 'processing') && (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertDescription>
                  正在后台解析简历，您可以离开此页面，解析将持续进行...
                </AlertDescription>
              </Alert>
            )}

            {task.status === 'completed' && (
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  解析完成！共 {task.successCount} 份简历可导入
                </AlertDescription>
              </Alert>
            )}

            {/* 结果列表 */}
            <div className="max-h-[300px] overflow-y-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">文件名</th>
                    <th className="px-3 py-2 text-left">姓名</th>
                    <th className="px-3 py-2 text-left">手机号</th>
                    <th className="px-3 py-2 text-center">状态</th>
                    <th className="px-3 py-2 text-center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {task.results.map((result) => {
                    const draft = getResultDraft(result);
                    const missingFields = getDraftMissingFields(draft, selectedPosition);
                    const parsedSummary = getParsedSummary(result);
                    const isExpanded = expandedResultIds.includes(result.id);

                    return (
                      <Fragment key={result.id}>
                        <tr className="border-t">
                          <td className="px-3 py-2 align-top">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="truncate max-w-[150px]" title={result.fileName}>
                                {result.fileName}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top">{draft.name || '-'}</td>
                          <td className="px-3 py-2 align-top">{draft.phone || '-'}</td>
                          <td className="px-3 py-2 text-center align-top">
                            <div className="flex flex-col items-center gap-1">
                              {result.status === 'pending' && (
                                <Badge variant="secondary">等待中</Badge>
                              )}
                              {result.status === 'processing' && (
                                <Badge variant="default">
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  处理中
                                </Badge>
                              )}
                              {result.status === 'success' && (
                                <>
                                  <Badge variant="default" className="bg-green-600">成功</Badge>
                                  {missingFields.length > 0 && (
                                    <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                                      待补全
                                    </Badge>
                                  )}
                                </>
                              )}
                              {result.status === 'failed' && (
                                <Badge variant="destructive" title={result.errorMessage}>
                                  失败
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center align-top">
                            {result.status === 'success' ? (
                              <div className="flex flex-wrap items-center justify-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleImportSingle(result)}
                                  disabled={
                                    !selectedPosition ||
                                    Boolean(result.importedAt) ||
                                    importingResultIds.includes(result.id) ||
                                    isImportingAll ||
                                    missingFields.length > 0
                                  }
                                  title={
                                    result.importedAt
                                      ? "该候选人已导入"
                                      : !selectedPosition
                                        ? "请先选择应聘岗位"
                                        : missingFields.length > 0
                                          ? `请先补全：${missingFields.join("、")}`
                                          : "导入此候选人"
                                  }
                                >
                                  {importingResultIds.includes(result.id) ? (
                                    <>
                                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                      导入中
                                    </>
                                  ) : result.importedAt ? (
                                    <>
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      已导入
                                    </>
                                  ) : (
                                    <>
                                      <UserPlus className="h-3 w-3 mr-1" />
                                      导入
                                    </>
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => toggleExpandedResult(result.id)}
                                >
                                  <Pencil className="h-3 w-3 mr-1" />
                                  {missingFields.length > 0 ? "补全信息" : "编辑信息"}
                                  {isExpanded ? (
                                    <ChevronUp className="ml-1 h-3 w-3" />
                                  ) : (
                                    <ChevronDown className="ml-1 h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                            ) : result.status === 'failed' ? (
                              <span className="text-xs text-red-500" title={result.errorMessage}>
                                解析失败
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                        {result.status === 'success' && isExpanded && (
                          <tr className="border-t bg-slate-50/60">
                            <td colSpan={5} className="px-4 py-4">
                              <div className="space-y-4 rounded-lg border bg-white p-4">
                                <div className="flex flex-wrap items-center gap-2">
                                  {parsedSummary.length > 0 ? (
                                    parsedSummary.map((item) => (
                                      <Badge key={item} variant="outline">
                                        {item}
                                      </Badge>
                                    ))
                                  ) : (
                                    <Badge variant="outline">基础解析已完成</Badge>
                                  )}
                                  {missingFields.length > 0 ? (
                                    <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                                      待补全：{missingFields.join("、")}
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary">可直接导入</Badge>
                                  )}
                                </div>
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                  <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-600">姓名 *</label>
                                    <Input
                                      value={draft.name}
                                      onChange={(event) => updateResultDraft(result, { name: event.target.value })}
                                      disabled={Boolean(result.importedAt)}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-600">手机号 *</label>
                                    <Input
                                      value={draft.phone}
                                      onChange={(event) => updateResultDraft(result, { phone: event.target.value })}
                                      disabled={Boolean(result.importedAt)}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-600">邮箱</label>
                                    <Input
                                      value={draft.email}
                                      onChange={(event) => updateResultDraft(result, { email: event.target.value })}
                                      disabled={Boolean(result.importedAt)}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-600">性别 *</label>
                                    <select
                                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                      value={draft.gender}
                                      onChange={(event) => updateResultDraft(result, { gender: event.target.value })}
                                      disabled={Boolean(result.importedAt)}
                                    >
                                      <option value="">请选择性别</option>
                                      <option value="男">男</option>
                                      <option value="女">女</option>
                                    </select>
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-600">学历 *</label>
                                    <select
                                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                      value={draft.education}
                                      onChange={(event) => updateResultDraft(result, { education: event.target.value })}
                                      disabled={Boolean(result.importedAt)}
                                    >
                                      <option value="">请选择学历</option>
                                      {EDUCATION_OPTIONS.map((option) => (
                                        <option key={option} value={option}>
                                          {option}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-600">学校 *</label>
                                    <Input
                                      value={draft.school}
                                      onChange={(event) => updateResultDraft(result, { school: event.target.value })}
                                      disabled={Boolean(result.importedAt)}
                                    />
                                  </div>
                                  <div className="space-y-2 md:col-span-2 xl:col-span-1">
                                    <label className="text-xs font-medium text-slate-600">专业 *</label>
                                    <Input
                                      value={draft.major}
                                      onChange={(event) => updateResultDraft(result, { major: event.target.value })}
                                      disabled={Boolean(result.importedAt)}
                                    />
                                  </div>
                                </div>
                                <p className="text-xs text-slate-500">
                                  解析后的基础信息支持手动修正。补全缺失项后，可再次点击“导入”或“批量导入”。
                                </p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 操作按钮 */}
            {task.status === 'completed' && (
              <div className="space-y-2">
                {/* 统计信息 */}
                <div className="text-sm text-muted-foreground">
                  解析完成：成功 {task.successCount} 个，失败 {task.failedCount} 个
                </div>
                
                <div className="flex gap-2">
                  {task.successCount > 0 && (
                    <Button
                      onClick={handleImport}
                      className="flex-1"
                      disabled={isImportingAll || task.results.every((result) => result.status !== 'success' || Boolean(result.importedAt) || getDraftMissingFields(getResultDraft(result), selectedPosition).length > 0)}
                    >
                      {isImportingAll ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          导入中...
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4 mr-2" />
                          导入 {
                            task.results.filter((result) => result.status === 'success' && !result.importedAt && getDraftMissingFields(getResultDraft(result), selectedPosition).length === 0).length
                          } 位新候选人
                        </>
                      )}
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    onClick={handleExportExcel} 
                    className={task.successCount > 0 ? "" : "flex-1"}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    导出Excel
                  </Button>
                </div>
                
                {/* 如果全部失败，显示提示 */}
                {task.successCount === 0 && task.failedCount > 0 && (
                  <Alert className="bg-red-50 border-red-200">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-800">
                      所有简历解析失败，请检查文件格式是否正确。
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* 重新上传 */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  上传中...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  重新上传（将覆盖当前任务）
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
