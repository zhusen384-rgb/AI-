"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Eye, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { sync } from "@/lib/sync";
import { useAuth } from "@/lib/auth-provider";
import { ClientApiError, fetchClientJson, fetchClientJsonCached } from "@/lib/client-api";
import {
  normalizePositionVetoRules,
  splitVetoRuleKeywords,
  type PositionVetoRule,
} from "@/lib/position-veto-rules";

// 部门列表（按拼音首字母排序）
const DEPARTMENTS = [
  "北京技术",
  "采购",
  "财务",
  "订单",
  "旅游",
  "品控",
  "企划",
  "人事",
  "商学院",
  "售后",
  "生鲜采购",
  "石家庄技术",
  "市场一线",
  "市场二线",
  "物流",
  "运营部",
  "直播运营",
  "其他",
];

// 岗位状态映射
const STATUS_MAP = {
  active: {
    label: "招聘中",
    variant: "default" as const,
    color: "bg-green-500"
  },
  paused: {
    label: "暂停招聘",
    variant: "secondary" as const,
    color: "bg-orange-500"
  },
  inactive: {
    label: "已关闭",
    variant: "secondary" as const,
    color: "bg-gray-500"
  },
};

type PositionStatus = keyof typeof STATUS_MAP;

type QuestionStyle = "标准" | "深入" | "灵活";

interface InterviewerPreferences {
  focusAreas: string[];
  questionStyle: QuestionStyle;
  additionalNotes: string;
}

interface PositionVetoRuleForm {
  id: string;
  ruleName: string;
  description: string;
  keywordsText: string;
  enabled: boolean;
}

interface PositionRecord {
  id: number;
  title: string;
  department: string;
  status: PositionStatus;
  education: string;
  experience: string;
  jobDescription: string;
  interviewerPreferences: InterviewerPreferences;
  vetoRules?: PositionVetoRule[];
  createdAt: string;
  userId?: string;
}

interface CreatePositionPayload {
  title: string;
  department: string;
  jobDescription: string;
  education: string;
  experience: string;
  status: "active";
  coreRequirements: string[];
  softSkills: string[];
  interviewerPreferences: InterviewerPreferences;
  vetoRules: PositionVetoRule[];
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

function createEmptyVetoRuleForm(overrides: Partial<PositionVetoRuleForm> = {}): PositionVetoRuleForm {
  return {
    id: globalThis.crypto?.randomUUID?.() || `veto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ruleName: "",
    description: "",
    keywordsText: "",
    enabled: true,
    ...overrides,
  };
}

function toVetoRuleForms(vetoRules: unknown): PositionVetoRuleForm[] {
  return normalizePositionVetoRules(vetoRules).map((rule) =>
    createEmptyVetoRuleForm({
      id: rule.id,
      ruleName: rule.ruleName,
      description: rule.description,
      keywordsText: rule.keywords.join("、"),
      enabled: rule.enabled,
    })
  );
}

function serializeVetoRuleForms(
  vetoRules: PositionVetoRuleForm[]
): { rules: PositionVetoRule[]; error?: string } {
  const rules: PositionVetoRule[] = [];

  for (let index = 0; index < vetoRules.length; index += 1) {
    const rule = vetoRules[index];
    const ruleName = rule.ruleName.trim();
    const description = rule.description.trim();
    const keywords = splitVetoRuleKeywords(rule.keywordsText);
    const hasContent = Boolean(ruleName || description || keywords.length > 0);

    if (!hasContent) {
      continue;
    }

    if (!ruleName || keywords.length === 0) {
      return {
        rules: [],
        error: `第 ${index + 1} 条一票否决规则需要填写名称和至少一个关键词，或删除该条空规则`,
      };
    }

    rules.push({
      id: rule.id,
      ruleName,
      description,
      keywords,
      enabled: rule.enabled,
    });
  }

  return { rules };
}

// 学历要求列表
const EDUCATION_REQUIREMENTS = [
  "大专及以上",
  "本科及以上",
  "硕士及以上学历",
  "985/211",
  "不限",
  "其他",
];

const initialPositions: PositionRecord[] = [];

// 从 localStorage 加载数据
const loadPositionsFromStorage = (): PositionRecord[] => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('positions');
    if (stored) {
      try {
        return (JSON.parse(stored) as PositionRecord[]).map((position) => ({
          ...position,
          vetoRules: Array.isArray(position.vetoRules) ? position.vetoRules : [],
        }));
      } catch (error) {
        console.error('解析岗位缓存失败:', error);
      }
    }
  }
  return initialPositions;
};

// 保存数据到 localStorage
const savePositionsToStorage = (positions: PositionRecord[]) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('positions', JSON.stringify(positions));
  }
};

export default function PositionsPage() {
  const { user } = useAuth(); // 获取当前用户信息
  const [positions, setPositions] = useState<PositionRecord[]>(() => loadPositionsFromStorage());
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSyncConfirmDialogOpen, setIsSyncConfirmDialogOpen] = useState(false); // 同步确认弹窗
  const [selectedPosition, setSelectedPosition] = useState<PositionRecord | null>(null);
  const [pendingPosition, setPendingPosition] = useState<CreatePositionPayload | null>(null); // 待确认的岗位数据

  // 搜索和筛选状态
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedUserId, setSelectedUserId] = useState<string>("all"); // 用户筛选
  const [usersList, setUsersList] = useState<{id: string; name: string; username: string}[]>([]); // 用户列表

  const [formData, setFormData] = useState({
    title: "",
    department: "",
    customDepartment: "",
    jobDescription: "",
    education: "",
    customEducation: "",
    experience: "",
    interviewerPreferences: {
      focusAreas: [] as string[],
      questionStyle: "标准" as "标准" | "深入" | "灵活",
      additionalNotes: "",
    },
    vetoRules: [] as PositionVetoRuleForm[],
  });

  // 获取用户列表（用于筛选）
  const fetchUsersList = useCallback(async (forceRefresh: boolean = false) => {
    try {
      const data = await fetchClientJsonCached<ApiResponse<{id: string; name: string; username: string}[]>>(
        '/api/admin/users-list',
        {},
        {
          forceRefresh,
          ttlMs: 30_000,
        }
      );
      if (data.success) {
        setUsersList(data.data);
      }
    } catch (error) {
      console.error('获取用户列表失败:', error);
    }
  }, []);

  // 从 API 获取岗位列表
  const fetchPositions = useCallback(async (forceRefresh: boolean = false) => {
    try {
      const data = await fetchClientJsonCached<ApiResponse<PositionRecord[]>>(
        '/api/positions',
        {},
        {
          forceRefresh,
          ttlMs: 15_000,
        }
      );
      if (data.success) {
        setPositions(data.data);
        savePositionsToStorage(data.data);
      }
    } catch (error) {
      console.error('获取岗位列表失败:', error);
      // 出错时使用 localStorage 数据
      const storedPositions = loadPositionsFromStorage();
      setPositions(storedPositions);
    }
  }, []);

  // 组件挂载时从 API 加载数据
  useEffect(() => {
    const hydrateRemoteData = () => {
      void fetchPositions(false);
      void fetchUsersList(false); // 获取用户列表
    };

    const idleCallback = globalThis.requestIdleCallback;
    if (typeof idleCallback === "function") {
      const handle = idleCallback(hydrateRemoteData, { timeout: 1200 });
      return () => globalThis.cancelIdleCallback?.(handle);
    }

    const timer = window.setTimeout(hydrateRemoteData, 120);
    return () => window.clearTimeout(timer);
  }, [fetchPositions, fetchUsersList]);

  useEffect(() => {
    const unsubscribe = sync.on('positionsUpdated', () => {
      void fetchPositions(true);
    });

    return unsubscribe;
  }, [fetchPositions]);

  // 根据搜索关键词和部门筛选岗位
  const filteredPositions = positions.filter((position) => {
    // 部门筛选
    const departmentMatch = selectedDepartment === "all" || position.department === selectedDepartment;

    // 状态筛选
    const statusMatch = selectedStatus === "all" || position.status === selectedStatus;

    // 用户筛选（仅超级管理员/管理员可用）
    const userMatch = selectedUserId === "all" || position.userId === selectedUserId;

    // 搜索关键词筛选（搜索岗位名称、部门或岗位描述）
    const searchMatch =
      searchKeyword === "" ||
      position.title.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      position.department.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      position.jobDescription.toLowerCase().includes(searchKeyword.toLowerCase());

    return departmentMatch && statusMatch && userMatch && searchMatch;
  });

  // 获取筛选后的岗位数量
  const filteredCount = filteredPositions.length;



  const handleCreate = () => {
    if (!formData.title || !formData.department || !formData.education || !formData.jobDescription) {
      toast.error("请填写所有必填字段");
      return;
    }

    // 如果选择"其他"，需要填写自定义部门
    if (formData.department === "其他" && !formData.customDepartment) {
      toast.error("请填写自定义部门");
      return;
    }

    // 如果选择"其他"，需要填写自定义学历
    if (formData.education === "其他" && !formData.customEducation) {
      toast.error("请填写自定义学历要求");
      return;
    }

    const vetoRulePayload = serializeVetoRuleForms(formData.vetoRules);
    if (vetoRulePayload.error) {
      toast.error(vetoRulePayload.error);
      return;
    }

    // 准备岗位数据
    const newPosition = {
      title: formData.title,
      department: formData.department === "其他" ? formData.customDepartment : formData.department,
      jobDescription: formData.jobDescription,
      education: formData.education === "其他" ? formData.customEducation : formData.education,
      experience: formData.experience,
      status: "active" as const,
      coreRequirements: [],
      softSkills: [],
      interviewerPreferences: formData.interviewerPreferences,
      vetoRules: vetoRulePayload.rules,
    };

    // 检查用户角色，如果是超级管理员，弹出同步确认弹窗
    if (user?.role === 'super_admin') {
      // 保存待确认的岗位数据
      setPendingPosition(newPosition);
      setIsCreateDialogOpen(false);
      setIsSyncConfirmDialogOpen(true);
      return;
    }

    // 非超级管理员，直接创建（不同步）
    createPosition(newPosition, false);
  };

  // 创建岗位（调用 API）
  const createPosition = async (positionData: CreatePositionPayload, isGlobal: boolean) => {
    try {
      const data = await fetchClientJson<ApiResponse<PositionRecord>>('/api/positions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...positionData,
          isGlobal,
        }),
      });
      
      if (data.success) {
        toast.success("创建成功", {
          description: isGlobal 
            ? `岗位"${positionData.title}"已创建并同步给所有用户`
            : `岗位"${positionData.title}"已创建`,
        });
        
        // 刷新列表
        await fetchPositions(true);
        sync.emit('positionsUpdated');
        
        setIsSyncConfirmDialogOpen(false);
        setPendingPosition(null);
        resetForm();
      } else {
        toast.error(data.error || "创建失败");
      }
    } catch (error) {
      console.error('创建岗位失败:', error);
      toast.error(error instanceof ClientApiError ? error.message : "创建失败，请稍后重试");
    }
  };

  const handleView = (position: PositionRecord) => {
    setSelectedPosition(position);
    setIsViewDialogOpen(true);
  };

  const handleEdit = (position: PositionRecord) => {
    setSelectedPosition(position);
    // 检查学历是否在预定义列表中
    const educationValue = position.education || "";
    const experienceValue = position.experience || "";
    // 检查部门是否在预定义列表中
    const departmentValue = position.department || "";
    const departmentInList = DEPARTMENTS.includes(departmentValue);
    const educationInList = EDUCATION_REQUIREMENTS.includes(educationValue);
    const interviewerPreferences = position.interviewerPreferences || {
      focusAreas: [],
      questionStyle: "标准",
      additionalNotes: "",
    };
    setFormData({
      title: position.title,
      department: departmentInList ? departmentValue : "其他",
      customDepartment: departmentInList ? "" : departmentValue,
      jobDescription: position.jobDescription || "",
      education: educationInList ? educationValue : "其他",
      customEducation: educationInList ? "" : educationValue,
      experience: experienceValue,
      interviewerPreferences,
      vetoRules: toVetoRuleForms(position.vetoRules),
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!formData.title || !formData.department || !formData.education || !formData.jobDescription) {
      toast.error("请填写所有必填字段");
      return;
    }

    // 如果选择"其他"，需要填写自定义部门
    if (formData.department === "其他" && !formData.customDepartment) {
      toast.error("请填写自定义部门");
      return;
    }

    // 如果选择"其他"，需要填写自定义学历
    if (formData.education === "其他" && !formData.customEducation) {
      toast.error("请填写自定义学历要求");
      return;
    }

    if (!selectedPosition) return;

    const vetoRulePayload = serializeVetoRuleForms(formData.vetoRules);
    if (vetoRulePayload.error) {
      toast.error(vetoRulePayload.error);
      return;
    }

    try {
      const updatedPosition = {
        ...selectedPosition,
        ...formData,
        // 如果选择"其他"，使用自定义部门；否则使用选择的部门
        department: formData.department === "其他" ? formData.customDepartment : formData.department,
        // 如果选择"其他"，使用自定义学历；否则使用选择的学历
        education: formData.education === "其他" ? formData.customEducation : formData.education,
        vetoRules: vetoRulePayload.rules,
      };

      await fetchClientJson<ApiResponse<PositionRecord>>(`/api/positions/${selectedPosition.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedPosition)
      });

      // 更新本地状态
      setSelectedPosition(updatedPosition); // 同步更新 selectedPosition
      setIsEditDialogOpen(false);
      resetForm();
      await fetchPositions(true);
      toast.success("更新成功", {
        description: `岗位"${formData.title}"已更新`,
      });

      // 触发跨标签页同步事件
      sync.emit('positionsUpdated');
    } catch (error) {
      console.error('更新岗位失败:', error);
      toast.error("更新失败", {
        description: error instanceof ClientApiError ? error.message : "请稍后重试",
      });
    }
  };

  const handleDelete = (position: PositionRecord) => {
    setSelectedPosition(position);
    setIsDeleteDialogOpen(true);
  };

  const handleToggleStatus = async (position: PositionRecord) => {
    let newStatus: PositionStatus;

    // 状态切换逻辑：active -> paused -> inactive -> active
    if (position.status === "active") {
      newStatus = "paused";
    } else if (position.status === "paused") {
      newStatus = "inactive";
    } else {
      newStatus = "active";
    }

    try {
      await fetchClientJson<ApiResponse<PositionRecord>>(`/api/positions/${position.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus })
      });

      // 更新本地状态
      await fetchPositions(true);

      const statusLabel = STATUS_MAP[newStatus as keyof typeof STATUS_MAP]?.label;
      toast.success("状态已更新", {
        description: `岗位"${position.title}"已${statusLabel}`,
      });

      // 触发跨标签页同步事件
      sync.emit('positionsUpdated');
    } catch (error) {
      console.error('更新岗位状态失败:', error);
      toast.error("状态更新失败", {
        description: error instanceof ClientApiError ? error.message : "请稍后重试",
      });
    }
  };

  const confirmDelete = async () => {
    if (!selectedPosition) return;

    try {
      await fetchClientJson<ApiResponse<null>>(`/api/positions/${selectedPosition.id}`, {
        method: 'DELETE',
      });

      // 从本地状态中移除
      await fetchPositions(true);
      setIsDeleteDialogOpen(false);
      
      toast.success("删除成功", {
        description: `岗位"${selectedPosition.title}"已删除`,
      });
      setSelectedPosition(null);

      // 触发跨标签页同步事件
      sync.emit('positionsUpdated');
    } catch (error) {
      console.error('删除岗位失败:', error);
      toast.error("删除失败", {
        description: error instanceof ClientApiError ? error.message : "请稍后重试",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      department: "",
      customDepartment: "",
      jobDescription: "",
      education: "",
      customEducation: "",
      experience: "",
      interviewerPreferences: {
        focusAreas: [] as string[],
        questionStyle: "标准",
        additionalNotes: "",
      },
      vetoRules: [],
    });
  };

  const addVetoRule = () => {
    setFormData((current) => ({
      ...current,
      vetoRules: [...current.vetoRules, createEmptyVetoRuleForm()],
    }));
  };

  const updateVetoRule = (
    ruleId: string,
    field: keyof PositionVetoRuleForm,
    value: string | boolean
  ) => {
    setFormData((current) => ({
      ...current,
      vetoRules: current.vetoRules.map((rule) =>
        rule.id === ruleId ? { ...rule, [field]: value } : rule
      ),
    }));
  };

  const removeVetoRule = (ruleId: string) => {
    setFormData((current) => ({
      ...current,
      vetoRules: current.vetoRules.filter((rule) => rule.id !== ruleId),
    }));
  };

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">岗位管理</h1>
          <p className="mt-2 text-gray-600">管理招聘岗位和需求</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              创建岗位
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>创建新岗位</DialogTitle>
              <DialogDescription>
                填写岗位信息，发布新的招聘需求
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 overflow-y-auto max-h-[calc(90vh-140px)]">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="create-title">岗位名称</Label>
                    <Input
                      id="create-title"
                      value={formData.title}
                      onChange={(e) =>
                        setFormData({ ...formData, title: e.target.value })
                      }
                      placeholder="例如：Java开发工程师"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-department">所属部门</Label>
                    <Select
                      value={formData.department}
                      onValueChange={(value) =>
                        setFormData({ ...formData, department: value, customDepartment: value === "其他" ? "" : "" })
                      }
                    >
                      <SelectTrigger id="create-department">
                        <SelectValue placeholder="请选择部门" />
                      </SelectTrigger>
                      <SelectContent>
                        {DEPARTMENTS.map((dept) => (
                          <SelectItem key={dept} value={dept}>
                            {dept}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formData.department === "其他" && (
                      <Input
                        id="create-custom-department"
                        value={formData.customDepartment}
                        onChange={(e) =>
                          setFormData({ ...formData, customDepartment: e.target.value })
                        }
                        placeholder="请输入部门名称"
                        className="mt-2"
                      />
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="create-education">学历要求</Label>
                    <Select
                      value={formData.education}
                      onValueChange={(value) =>
                        setFormData({ ...formData, education: value, customEducation: value === "其他" ? "" : "" })
                      }
                    >
                      <SelectTrigger id="create-education">
                        <SelectValue placeholder="请选择学历要求" />
                      </SelectTrigger>
                      <SelectContent>
                        {EDUCATION_REQUIREMENTS.map((edu) => (
                          <SelectItem key={edu} value={edu}>
                            {edu}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formData.education === "其他" && (
                      <Input
                        id="create-custom-education"
                        value={formData.customEducation}
                        onChange={(e) =>
                          setFormData({ ...formData, customEducation: e.target.value })
                        }
                        placeholder="请输入学历要求"
                        className="mt-2"
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-experience">经验要求 <span className="text-gray-500 font-normal">(选填)</span></Label>
                    <Input
                      id="create-experience"
                      value={formData.experience}
                      onChange={(e) =>
                        setFormData({ ...formData, experience: e.target.value })
                      }
                      placeholder="例如：3年"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-jobDescription">岗位描述 (JD)</Label>
                  <Textarea
                    id="create-jobDescription"
                    value={formData.jobDescription}
                    onChange={(e) =>
                      setFormData({ ...formData, jobDescription: e.target.value })
                    }
                    placeholder="请输入岗位详细描述，包括岗位职责、任职要求等"
                    className="min-h-[200px]"
                  />
                </div>

                {/* 面试官偏好模块 */}
                <div className="space-y-4 border-t pt-4">
                  <div>
                    <h4 className="font-semibold mb-3">面试官偏好 <span className="text-gray-500 font-normal text-sm">(选填)</span></h4>
                  </div>

                  <div className="space-y-2">
                    <Label>重点考察领域 <span className="text-gray-500 font-normal">(可多选)</span></Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {["技术深度", "项目经验", "问题解决", "沟通能力", "学习能力", "团队协作", "产品思维", "用户体验", "性能优化", "代码质量", "架构设计", "业务理解"].map((area) => (
                        <div key={area} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={`create-focus-${area}`}
                            checked={formData.interviewerPreferences.focusAreas.includes(area)}
                            onChange={(e) => {
                              const newFocusAreas = e.target.checked
                                ? [...formData.interviewerPreferences.focusAreas, area]
                                : formData.interviewerPreferences.focusAreas.filter((a) => a !== area);
                              setFormData({
                                ...formData,
                                interviewerPreferences: {
                                  ...formData.interviewerPreferences,
                                  focusAreas: newFocusAreas,
                                },
                              });
                            }}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <Label htmlFor={`create-focus-${area}`} className="text-sm cursor-pointer">
                            {area}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>提问风格</Label>
                    <div className="flex gap-3">
                      {["标准", "深入", "灵活"].map((style) => (
                        <div key={style} className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id={`create-style-${style}`}
                            name="questionStyle"
                            value={style}
                            checked={formData.interviewerPreferences.questionStyle === style}
                            onChange={(e) => {
                              setFormData({
                                ...formData,
                                interviewerPreferences: {
                                  ...formData.interviewerPreferences,
                                  questionStyle: e.target.value as "标准" | "深入" | "灵活",
                                },
                              });
                            }}
                            className="h-4 w-4 border-gray-300 text-primary focus:ring-primary"
                          />
                          <Label htmlFor={`create-style-${style}`} className="text-sm cursor-pointer">
                            {style}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="create-additionalNotes">补充说明 <span className="text-gray-500 font-normal">(选填)</span></Label>
                    <Textarea
                      id="create-additionalNotes"
                      value={formData.interviewerPreferences.additionalNotes}
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          interviewerPreferences: {
                            ...formData.interviewerPreferences,
                            additionalNotes: e.target.value,
                          },
                        });
                      }}
                      placeholder="例如：优先考察实际项目经验，注重代码质量和架构设计"
                      className="min-h-[80px]"
                    />
                  </div>
                </div>

                {/* 一票否决规则 */}
                <div className="space-y-4 border-t pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-semibold">一票否决规则 <span className="text-gray-500 font-normal text-sm">(选填)</span></h4>
                      <p className="mt-1 text-sm text-gray-500">
                        命中任意规则后，简历筛选分数将强制置为 0。
                      </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={addVetoRule}>
                      <Plus className="mr-2 h-4 w-4" />
                      添加规则
                    </Button>
                  </div>

                  {formData.vetoRules.length === 0 ? (
                    <div className="rounded-lg border border-dashed bg-gray-50 px-4 py-5 text-sm text-gray-500">
                      当前未配置一票否决规则，点击“添加规则”即可新增。
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {formData.vetoRules.map((rule, index) => (
                        <div key={rule.id} className="rounded-xl border bg-white p-4 shadow-sm">
                          <div className="mb-4 flex items-center justify-between gap-3">
                            <div className="text-sm font-medium text-gray-900">
                              规则 {index + 1}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => removeVetoRule(rule.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              删除
                            </Button>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label htmlFor={`create-veto-name-${rule.id}`}>规则名称</Label>
                              <Input
                                id={`create-veto-name-${rule.id}`}
                                value={rule.ruleName}
                                onChange={(e) => updateVetoRule(rule.id, "ruleName", e.target.value)}
                                placeholder="例如：学历低于大专"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor={`create-veto-enabled-${rule.id}`}>启用状态</Label>
                              <div className="flex h-10 items-center rounded-md border bg-white px-3">
                                <input
                                  id={`create-veto-enabled-${rule.id}`}
                                  type="checkbox"
                                  checked={rule.enabled}
                                  onChange={(e) => updateVetoRule(rule.id, "enabled", e.target.checked)}
                                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                <Label htmlFor={`create-veto-enabled-${rule.id}`} className="ml-2 text-sm cursor-pointer">
                                  规则启用
                                </Label>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 space-y-2">
                            <Label htmlFor={`create-veto-desc-${rule.id}`}>规则说明</Label>
                            <Textarea
                              id={`create-veto-desc-${rule.id}`}
                              value={rule.description}
                              onChange={(e) => updateVetoRule(rule.id, "description", e.target.value)}
                              placeholder="例如：学历未达到最低要求时直接淘汰"
                              className="min-h-[80px]"
                            />
                          </div>

                          <div className="mt-4 space-y-2">
                            <Label htmlFor={`create-veto-keywords-${rule.id}`}>触发关键词 / 短语</Label>
                            <Textarea
                              id={`create-veto-keywords-${rule.id}`}
                              value={rule.keywordsText}
                              onChange={(e) => updateVetoRule(rule.id, "keywordsText", e.target.value)}
                              placeholder="例如：大专以下, 中专, 高中"
                              className="min-h-[80px]"
                            />
                            <p className="text-xs text-gray-500">
                              支持逗号、顿号或换行分隔多个关键词，命中任意一个即触发该规则。
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleCreate}>创建岗位</Button>
              </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* 搜索和筛选栏 */}
      <div className="mb-6 flex gap-4 items-center bg-white p-4 rounded-lg border">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="搜索岗位名称、部门或描述..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        {/* 用户筛选 - 仅管理员可见 */}
        {user?.role === 'super_admin' && usersList.length > 0 && (
          <div className="w-48">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="按用户筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有用户</SelectItem>
                {usersList.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name || u.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="w-48">
          <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
            <SelectTrigger>
              <SelectValue placeholder="按部门筛选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有部门</SelectItem>
              {DEPARTMENTS.map((dept) => (
                <SelectItem key={dept} value={dept}>
                  {dept}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger>
              <SelectValue placeholder="按状态筛选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有状态</SelectItem>
              <SelectItem value="active">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  招聘中
                </span>
              </SelectItem>
              <SelectItem value="paused">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                  暂停招聘
                </span>
              </SelectItem>
              <SelectItem value="inactive">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                  已关闭
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-sm text-gray-500">
          共 {filteredCount} 个岗位
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredPositions.map((position) => (
          <Card key={position.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg">{position.title}</CardTitle>
                  <CardDescription className="mt-1">
                    {position.department}
                  </CardDescription>
                </div>
                <Badge
                  variant={STATUS_MAP[position.status as keyof typeof STATUS_MAP]?.variant}
                  className={STATUS_MAP[position.status as keyof typeof STATUS_MAP]?.color || ""}
                >
                  {STATUS_MAP[position.status as keyof typeof STATUS_MAP]?.label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">学历要求：</span>
                  <span>{position.education}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">经验要求：</span>
                  <span>{position.experience}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">创建时间：</span>
                  <span>{position.createdAt}</span>
                </div>
                {position.vetoRules && position.vetoRules.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">一票否决：</span>
                    <Badge variant="outline">已配置 {position.vetoRules.length} 条</Badge>
                  </div>
                )}
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleView(position)}
                >
                  <Eye className="mr-2 h-3 w-3" />
                  查看
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleEdit(position)}
                >
                  <Edit className="mr-2 h-3 w-3" />
                  编辑
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(position)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <div className="mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => handleToggleStatus(position)}
                >
                  切换状态：{STATUS_MAP[position.status as keyof typeof STATUS_MAP]?.label}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 查看详情弹窗 */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>岗位详情</DialogTitle>
          </DialogHeader>
          {selectedPosition && (
            <div className="space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-500">岗位名称</Label>
                  <p className="font-medium">{selectedPosition.title}</p>
                </div>
                <div>
                  <Label className="text-gray-500">所属部门</Label>
                  <p className="font-medium">{selectedPosition.department}</p>
                </div>
                <div>
                  <Label className="text-gray-500">学历要求</Label>
                  <p className="font-medium">{selectedPosition.education}</p>
                </div>
                <div>
                  <Label className="text-gray-500">经验要求</Label>
                  <p className="font-medium">{selectedPosition.experience}</p>
                </div>
                <div>
                  <Label className="text-gray-500">状态</Label>
                  <Badge
                    variant={STATUS_MAP[selectedPosition.status as keyof typeof STATUS_MAP]?.variant}
                    className={STATUS_MAP[selectedPosition.status as keyof typeof STATUS_MAP]?.color || ""}
                  >
                    {STATUS_MAP[selectedPosition.status as keyof typeof STATUS_MAP]?.label}
                  </Badge>
                </div>
                <div>
                  <Label className="text-gray-500">创建时间</Label>
                  <p className="font-medium">{selectedPosition.createdAt}</p>
                </div>
              </div>
              <div>
                <Label className="text-gray-500">岗位描述</Label>
                <p className="mt-2 text-sm leading-relaxed bg-gray-50 p-4 rounded-lg">
                  {selectedPosition.jobDescription}
                </p>
              </div>
              {selectedPosition.interviewerPreferences && (
                <div>
                  <Label className="text-gray-500">面试官偏好</Label>
                  <div className="mt-2 space-y-3 bg-gray-50 p-4 rounded-lg">
                    <div>
                      <div className="text-sm font-medium mb-2">重点考察领域</div>
                      <div className="flex flex-wrap gap-2">
                        {selectedPosition.interviewerPreferences.focusAreas?.map((area, index) => (
                          <Badge key={index} variant="secondary">{area}</Badge>
                        )) || <span className="text-sm text-gray-400">未设置</span>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm font-medium mb-2">提问风格</div>
                        <Badge variant="outline">{selectedPosition.interviewerPreferences.questionStyle || "标准"}</Badge>
                      </div>
                    </div>
                    {selectedPosition.interviewerPreferences.additionalNotes && (
                      <div>
                        <div className="text-sm font-medium mb-2">补充说明</div>
                        <p className="text-sm">{selectedPosition.interviewerPreferences.additionalNotes}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div>
                <Label className="text-gray-500">一票否决规则</Label>
                {selectedPosition.vetoRules && selectedPosition.vetoRules.length > 0 ? (
                  <div className="mt-2 space-y-3">
                    {selectedPosition.vetoRules.map((rule, index) => (
                      <div key={rule.id || index} className="rounded-lg border bg-gray-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium">{rule.ruleName}</div>
                          <Badge variant={rule.enabled ? "default" : "secondary"}>
                            {rule.enabled ? "启用" : "停用"}
                          </Badge>
                        </div>
                        {rule.description && (
                          <p className="mt-2 text-sm text-gray-600">{rule.description}</p>
                        )}
                        <div className="mt-2 text-sm text-gray-500">
                          关键词：{rule.keywords.join("、")}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 rounded-lg border border-dashed bg-gray-50 p-4 text-sm text-gray-500">
                    未配置一票否决规则
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 编辑弹窗 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>编辑岗位</DialogTitle>
            <DialogDescription>
              修改岗位信息
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-title">岗位名称</Label>
                  <Input
                    id="edit-title"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-department">所属部门</Label>
                  <Select
                    value={formData.department}
                    onValueChange={(value) =>
                      setFormData({ ...formData, department: value, customDepartment: value === "其他" ? "" : "" })
                    }
                  >
                    <SelectTrigger id="edit-department">
                      <SelectValue placeholder="请选择部门" />
                    </SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map((dept) => (
                        <SelectItem key={dept} value={dept}>
                          {dept}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.department === "其他" && (
                    <Input
                      id="edit-custom-department"
                      value={formData.customDepartment}
                      onChange={(e) =>
                        setFormData({ ...formData, customDepartment: e.target.value })
                      }
                      placeholder="请输入部门名称"
                      className="mt-2"
                    />
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-education">学历要求</Label>
                  <Select
                    value={formData.education}
                    onValueChange={(value) =>
                      setFormData({ ...formData, education: value, customEducation: value === "其他" ? "" : "" })
                    }
                  >
                    <SelectTrigger id="edit-education">
                      <SelectValue placeholder="请选择学历要求" />
                    </SelectTrigger>
                    <SelectContent>
                      {EDUCATION_REQUIREMENTS.map((edu) => (
                        <SelectItem key={edu} value={edu}>
                          {edu}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.education === "其他" && (
                    <Input
                      id="edit-custom-education"
                      value={formData.customEducation}
                      onChange={(e) =>
                        setFormData({ ...formData, customEducation: e.target.value })
                      }
                      placeholder="请输入学历要求"
                      className="mt-2"
                    />
                  )}
                </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-experience">经验要求 <span className="text-gray-500 font-normal">(选填)</span></Label>
                    <Input
                      id="edit-experience"
                      value={formData.experience ?? ""}
                      onChange={(e) =>
                        setFormData({ ...formData, experience: e.target.value })
                      }
                    />
                  </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-jobDescription">岗位描述 (JD)</Label>
                <Textarea
                  id="edit-jobDescription"
                  value={formData.jobDescription}
                  onChange={(e) =>
                    setFormData({ ...formData, jobDescription: e.target.value })
                  }
                  className="min-h-[200px]"
                />
              </div>

              {/* 面试官偏好模块 */}
              <div className="space-y-4 border-t pt-4">
                <div>
                  <h4 className="font-semibold mb-3">面试官偏好 <span className="text-gray-500 font-normal text-sm">(选填)</span></h4>
                </div>

                <div className="space-y-2">
                  <Label>重点考察领域 <span className="text-gray-500 font-normal">(可多选)</span></Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {["技术深度", "项目经验", "问题解决", "沟通能力", "学习能力", "团队协作", "产品思维", "用户体验", "性能优化", "代码质量", "架构设计", "业务理解"].map((area) => (
                      <div key={area} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`edit-focus-${area}`}
                          checked={formData.interviewerPreferences.focusAreas.includes(area)}
                          onChange={(e) => {
                            const newFocusAreas = e.target.checked
                              ? [...formData.interviewerPreferences.focusAreas, area]
                              : formData.interviewerPreferences.focusAreas.filter((a) => a !== area);
                            setFormData({
                              ...formData,
                              interviewerPreferences: {
                                ...formData.interviewerPreferences,
                                focusAreas: newFocusAreas,
                              },
                            });
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <Label htmlFor={`edit-focus-${area}`} className="text-sm cursor-pointer">
                          {area}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>提问风格</Label>
                  <div className="flex gap-3">
                    {["标准", "深入", "灵活"].map((style) => (
                      <div key={style} className="flex items-center space-x-2">
                        <input
                          type="radio"
                          id={`edit-style-${style}`}
                          name="edit-questionStyle"
                          value={style}
                          checked={formData.interviewerPreferences.questionStyle === style}
                          onChange={(e) => {
                            setFormData({
                              ...formData,
                              interviewerPreferences: {
                                ...formData.interviewerPreferences,
                                questionStyle: e.target.value as "标准" | "深入" | "灵活",
                              },
                            });
                          }}
                          className="h-4 w-4 border-gray-300 text-primary focus:ring-primary"
                        />
                        <Label htmlFor={`edit-style-${style}`} className="text-sm cursor-pointer">
                          {style}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-additionalNotes">补充说明 <span className="text-gray-500 font-normal">(选填)</span></Label>
                  <Textarea
                    id="edit-additionalNotes"
                    value={formData.interviewerPreferences.additionalNotes}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        interviewerPreferences: {
                          ...formData.interviewerPreferences,
                          additionalNotes: e.target.value,
                        },
                      });
                    }}
                    placeholder="例如：优先考察实际项目经验，注重代码质量和架构设计"
                    className="min-h-[80px]"
                  />
                </div>
              </div>

              {/* 一票否决规则 */}
              <div className="space-y-4 border-t pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold">一票否决规则 <span className="text-gray-500 font-normal text-sm">(选填)</span></h4>
                    <p className="mt-1 text-sm text-gray-500">
                      命中任意规则后，简历筛选分数将强制置为 0。
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addVetoRule}>
                    <Plus className="mr-2 h-4 w-4" />
                    添加规则
                  </Button>
                </div>

                {formData.vetoRules.length === 0 ? (
                  <div className="rounded-lg border border-dashed bg-gray-50 px-4 py-5 text-sm text-gray-500">
                    当前未配置一票否决规则，点击“添加规则”即可新增。
                  </div>
                ) : (
                  <div className="space-y-4">
                    {formData.vetoRules.map((rule, index) => (
                      <div key={rule.id} className="rounded-xl border bg-white p-4 shadow-sm">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-gray-900">
                            规则 {index + 1}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => removeVetoRule(rule.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            删除
                          </Button>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor={`edit-veto-name-${rule.id}`}>规则名称</Label>
                            <Input
                              id={`edit-veto-name-${rule.id}`}
                              value={rule.ruleName}
                              onChange={(e) => updateVetoRule(rule.id, "ruleName", e.target.value)}
                              placeholder="例如：学历低于大专"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`edit-veto-enabled-${rule.id}`}>启用状态</Label>
                            <div className="flex h-10 items-center rounded-md border bg-white px-3">
                              <input
                                id={`edit-veto-enabled-${rule.id}`}
                                type="checkbox"
                                checked={rule.enabled}
                                onChange={(e) => updateVetoRule(rule.id, "enabled", e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                              />
                              <Label htmlFor={`edit-veto-enabled-${rule.id}`} className="ml-2 text-sm cursor-pointer">
                                规则启用
                              </Label>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 space-y-2">
                          <Label htmlFor={`edit-veto-desc-${rule.id}`}>规则说明</Label>
                          <Textarea
                            id={`edit-veto-desc-${rule.id}`}
                            value={rule.description}
                            onChange={(e) => updateVetoRule(rule.id, "description", e.target.value)}
                            placeholder="例如：学历未达到最低要求时直接淘汰"
                            className="min-h-[80px]"
                          />
                        </div>

                        <div className="mt-4 space-y-2">
                          <Label htmlFor={`edit-veto-keywords-${rule.id}`}>触发关键词 / 短语</Label>
                          <Textarea
                            id={`edit-veto-keywords-${rule.id}`}
                            value={rule.keywordsText}
                            onChange={(e) => updateVetoRule(rule.id, "keywordsText", e.target.value)}
                            placeholder="例如：大专以下, 中专, 高中"
                            className="min-h-[80px]"
                          />
                          <p className="text-xs text-gray-500">
                            支持逗号、顿号或换行分隔多个关键词，命中任意一个即触发该规则。
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleUpdate}>保存更改</Button>
            </DialogFooter>
          </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除岗位 &quot;{selectedPosition?.title}&quot; 吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 岗位同步确认弹窗 */}
      <Dialog open={isSyncConfirmDialogOpen} onOpenChange={setIsSyncConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>岗位同步确认</DialogTitle>
            <DialogDescription className="text-base pt-2">
              您即将完成新岗位创建，是否将该新建岗位，统一同步至系统内所有管理员账号、普通用户账号的个人岗位管理列表中？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => {
                // 点击"否"，仅保存到自己的账号
                if (pendingPosition) {
                  createPosition(pendingPosition, false);
                }
              }}
            >
              否
            </Button>
            <Button 
              onClick={() => {
                // 点击"是"，同步给所有用户
                if (pendingPosition) {
                  createPosition(pendingPosition, true);
                }
              }}
            >
              是
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
