"use client";

import { useEffect, useMemo, useState } from "react";
import { SuperAdminGuard } from "@/components/super-admin-guard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { fetchClientJson } from "@/lib/client-api";
import { toast } from "sonner";

type ScoreRuleDimension = {
  code: string;
  name: string;
  weight: number;
  description: string;
  scoringRule: string;
  evidenceHints?: string[];
  mustAsk?: boolean;
  minQuestions?: number;
  maxFollowUps?: number;
  questionTemplates?: string[];
  followUpTemplates?: string[];
  coverageThreshold?: number;
};

type ScoreRuleRequiredQuestion = {
  id: string;
  question: string;
  purpose?: string;
  dimensionCode?: string;
  when?: "early" | "middle" | "late" | "any";
  maxFollowUps?: number;
};

type QuestionBankItem = {
  id: string;
  question: string;
  standardAnswer: string;
  scoringCriteria: string;
  dimensionCode?: string;
};

type ScoreRuleConfig = {
  positionKey: string;
  positionName: string;
  ruleName: string;
  ruleVersion: string;
  status: "draft" | "active" | "archived";
  dimensions: ScoreRuleDimension[];
  thresholds: {
    hire: number;
    consider: number;
    reject: number;
  };
  requiredQuestions: ScoreRuleRequiredQuestion[];
  interviewStrategy: {
    minCoreQuestions: number;
    maxCoreQuestions: number;
    maxFollowUpsPerQuestion: number;
    focusHighWeightDimensions: boolean;
  };
  promptTemplate?: string | null;
  questionBank?: QuestionBankItem[];
  questionBankCount?: number;
};

type PositionOption = {
  key: string;
  name: string;
  source: "builtin" | "position";
  category?: string;
};

const BUILTIN_POSITIONS: PositionOption[] = [
  { key: "ai_management", name: "智能体管培生", source: "builtin", category: "AI技术" },
  { key: "sales_management", name: "销售管培生", source: "builtin", category: "销售" },
  { key: "store_manager", name: "储备店长", source: "builtin", category: "门店管理" },
  { key: "hr", name: "人事", source: "builtin", category: "职能" },
];

const CATEGORY_COLORS: Record<string, string> = {
  "AI技术": "bg-purple-100 text-purple-700 border-purple-200",
  "销售": "bg-blue-100 text-blue-700 border-blue-200",
  "门店管理": "bg-green-100 text-green-700 border-green-200",
  "职能": "bg-orange-100 text-orange-700 border-orange-200",
  "自定义": "bg-gray-100 text-gray-700 border-gray-200",
};

const createEmptyDimension = (): ScoreRuleDimension => ({
  code: "",
  name: "",
  weight: 0.2,
  description: "",
  scoringRule: "",
  evidenceHints: [],
  mustAsk: false,
  minQuestions: 1,
  maxFollowUps: 2,
  questionTemplates: [],
  followUpTemplates: [],
  coverageThreshold: 0.75,
});

const createEmptyRequiredQuestion = (): ScoreRuleRequiredQuestion => ({
  id: "",
  question: "",
  purpose: "",
  dimensionCode: "",
  when: "any",
  maxFollowUps: 1,
});

const createEmptyQuestionBankItem = (): QuestionBankItem => ({
  id: `qb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  question: "",
  standardAnswer: "",
  scoringCriteria: "",
  dimensionCode: "",
});

function WeightBar({ dimensions }: { dimensions: ScoreRuleDimension[] }) {
  const totalWeight = dimensions.reduce((sum, d) => sum + (d.weight || 0), 0);
  const totalPct = Math.round(totalWeight * 100);
  const isValid = totalPct >= 99 && totalPct <= 101;

  const colors = [
    "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
    "bg-pink-500", "bg-cyan-500", "bg-amber-500", "bg-red-400",
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-muted-foreground">权重分布</span>
        <span className={isValid ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
          合计: {totalPct}%{isValid ? "" : " (需要100%)"}
        </span>
      </div>
      <div className="flex h-6 w-full overflow-hidden rounded-lg border bg-gray-50">
        {dimensions.map((d, i) => {
          const pct = Math.round((d.weight || 0) * 100);
          if (pct <= 0) return null;
          return (
            <div
              key={`${d.code}-${i}`}
              className={`${colors[i % colors.length]} flex items-center justify-center text-xs font-medium text-white transition-all`}
              style={{ width: `${pct}%` }}
              title={`${d.name}: ${pct}%`}
            >
              {pct >= 8 ? `${pct}%` : ""}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {dimensions.map((d, i) => (
          <span key={`${d.code}-${i}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${colors[i % colors.length]}`} />
            {d.name} ({Math.round((d.weight || 0) * 100)}%)
          </span>
        ))}
      </div>
    </div>
  );
}

export default function AiScoreRulesPage() {
  const [positions, setPositions] = useState<PositionOption[]>(BUILTIN_POSITIONS);
  const [rules, setRules] = useState<ScoreRuleConfig[]>([]);
  const [selectedPositionKey, setSelectedPositionKey] = useState<string>("ai_management");
  const [form, setForm] = useState<ScoreRuleConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAddPosition, setShowAddPosition] = useState(false);
  const [newPositionKey, setNewPositionKey] = useState("");
  const [newPositionName, setNewPositionName] = useState("");

  const selectedPosition = useMemo(
    () => positions.find((item) => item.key === selectedPositionKey),
    [positions, selectedPositionKey]
  );

  useEffect(() => {
    void loadInitialData();
  }, []);

  useEffect(() => {
    if (!selectedPositionKey) {
      return;
    }

    void loadRule(selectedPositionKey, selectedPosition?.name);
  }, [selectedPositionKey, selectedPosition?.name]);

  async function loadInitialData() {
    try {
      setLoading(true);
      const [positionsResult, rulesResult] = await Promise.allSettled([
        fetchClientJson<{ success: boolean; data: Array<{ id: number; title: string }> }>("/api/positions"),
        fetchClientJson<{ success: boolean; data: ScoreRuleConfig[] }>("/api/admin/ai-score-rules"),
      ]);

      if (positionsResult.status === "fulfilled" && positionsResult.value.success) {
        const customPositions = (positionsResult.value.data || []).map((item) => ({
          key: String(item.id),
          name: item.title,
          source: "position" as const,
          category: "自定义",
        }));
        const merged = [...BUILTIN_POSITIONS];
        customPositions.forEach((item) => {
          if (!merged.some((existing) => existing.key === item.key)) {
            merged.push(item);
          }
        });
        setPositions(merged);
      }

      if (rulesResult.status === "fulfilled" && rulesResult.value.success) {
        setRules(rulesResult.value.data || []);
      } else if (rulesResult.status === "rejected") {
        console.error("加载评分规则列表失败:", rulesResult.reason);
        toast.error("加载评分规则列表失败");
      }
    } catch (error) {
      console.error("加载评分规则页面失败:", error);
      toast.error("加载评分规则失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadRule(positionKey: string, positionName?: string) {
    try {
      setLoadError(null);
      const result = await fetchClientJson<{ success: boolean; data: ScoreRuleConfig }>(
        `/api/admin/ai-score-rules/${encodeURIComponent(positionKey)}?positionName=${encodeURIComponent(positionName || "")}`
      );
      if (result.success) {
        setForm(result.data);
      }
    } catch (error: any) {
      console.error("加载单个规则失败:", error);
      const message = error?.message || "加载岗位规则失败";
      setLoadError(message);
      toast.error("加载岗位规则失败");
    }
  }

  function updateDimension(index: number, field: keyof ScoreRuleDimension, value: string | boolean) {
    if (!form) {
      return;
    }

    const nextDimensions = [...form.dimensions];
    const current = { ...nextDimensions[index] };
    if (field === "weight") {
      current.weight = Number(value || 0);
    } else if (field === "mustAsk") {
      current.mustAsk = Boolean(value);
    } else if (field === "minQuestions" || field === "maxFollowUps" || field === "coverageThreshold") {
      current[field] = Number(value || 0) as never;
    } else if (field === "evidenceHints") {
      current.evidenceHints = String(value).split(/[\n,，]/).map((item) => item.trim()).filter(Boolean);
    } else if (field === "questionTemplates" || field === "followUpTemplates") {
      current[field] = String(value).split(/\n/).map((item) => item.trim()).filter(Boolean) as never;
    } else {
      current[field] = value as never;
    }
    nextDimensions[index] = current;
    setForm({ ...form, dimensions: nextDimensions });
  }

  function updateRequiredQuestion(index: number, field: keyof ScoreRuleRequiredQuestion, value: string) {
    if (!form) {
      return;
    }

    const nextQuestions = [...form.requiredQuestions];
    const current = { ...nextQuestions[index] };
    if (field === "maxFollowUps") {
      current.maxFollowUps = Number(value || 0);
    } else {
      current[field] = value as never;
    }
    nextQuestions[index] = current;
    setForm({ ...form, requiredQuestions: nextQuestions });
  }

  function updateQuestionBankItem(index: number, field: keyof QuestionBankItem, value: string) {
    if (!form) {
      return;
    }

    const nextBank = [...(form.questionBank || [])];
    const current = { ...nextBank[index] };
    current[field] = value as never;
    nextBank[index] = current;
    setForm({ ...form, questionBank: nextBank });
  }

  async function handleSave() {
    if (!form) {
      return;
    }

    try {
      setSaving(true);
      const payload = {
        ...form,
        positionKey: form.positionKey,
        positionName: form.positionName,
      };

      const result = await fetchClientJson<{ success: boolean; data: ScoreRuleConfig }>(
        `/api/admin/ai-score-rules/${encodeURIComponent(form.positionKey)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (result.success) {
        setForm(result.data);
        setRules((prev) => {
          const next = prev.filter((item) => item.positionKey !== result.data.positionKey);
          return [result.data, ...next];
        });
        toast.success("评分规则已保存，后续该岗位的AI面试将使用新规则");
      } else {
        toast.error("保存失败");
      }
    } catch (error) {
      console.error("保存评分规则失败:", error);
      toast.error("保存评分规则失败");
    } finally {
      setSaving(false);
    }
  }

  function handleAddPosition() {
    if (!newPositionKey.trim() || !newPositionName.trim()) {
      toast.error("请填写岗位标识和岗位名称");
      return;
    }

    if (positions.some((p) => p.key === newPositionKey.trim())) {
      toast.error("该岗位标识已存在");
      return;
    }

    const newPosition: PositionOption = {
      key: newPositionKey.trim(),
      name: newPositionName.trim(),
      source: "position",
      category: "自定义",
    };
    setPositions((prev) => [...prev, newPosition]);
    setSelectedPositionKey(newPosition.key);
    setNewPositionKey("");
    setNewPositionName("");
    setShowAddPosition(false);
    toast.success(`已添加岗位"${newPosition.name}"，请配置评分规则后保存`);
  }

  const activeRuleMap = useMemo(() => {
    const map = new Map<string, ScoreRuleConfig>();
    rules.forEach((item) => {
      map.set(item.positionKey, item);
    });
    return map;
  }, [rules]);

  // 按分类分组
  const groupedPositions = useMemo(() => {
    const groups = new Map<string, PositionOption[]>();
    positions.forEach((p) => {
      const category = p.category || (p.source === "builtin" ? "内置" : "自定义");
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(p);
    });
    return groups;
  }, [positions]);

  return (
    <SuperAdminGuard>
      <div className="space-y-6 p-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>AI岗位评分规则管理</CardTitle>
                <CardDescription className="mt-1.5">
                  只有超级管理员可以查看和维护。不同岗位拥有独立的评分维度、评分标准和权重配比，互不通用。
                  <br />
                  修改保存后，AI面试系统将自动识别候选人应聘岗位，精准匹配对应的评分规则，生成标准化量化评分报告。
                </CardDescription>
              </div>
              <Badge variant="outline" className="shrink-0">
                共 {positions.length} 个岗位
              </Badge>
            </div>
          </CardHeader>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* 左侧岗位列表 */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">岗位列表</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => setShowAddPosition(!showAddPosition)}>
                    {showAddPosition ? "取消" : "新增岗位"}
                  </Button>
                </div>
                <CardDescription>选择岗位后编辑其独立的评分维度、权重和阈值。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {showAddPosition && (
                  <div className="space-y-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">岗位标识 (英文或数字)</Label>
                      <Input
                        placeholder="如: marketing_manager"
                        value={newPositionKey}
                        onChange={(e) => setNewPositionKey(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">岗位名称</Label>
                      <Input
                        placeholder="如: 市场经理"
                        value={newPositionName}
                        onChange={(e) => setNewPositionName(e.target.value)}
                      />
                    </div>
                    <Button size="sm" className="w-full" onClick={handleAddPosition}>
                      确认新增
                    </Button>
                  </div>
                )}

                {Array.from(groupedPositions.entries()).map(([category, categoryPositions]) => (
                  <div key={category} className="space-y-1.5">
                    <div className="flex items-center gap-2 px-1">
                      <span
                        className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium ${
                          CATEGORY_COLORS[category] || CATEGORY_COLORS["自定义"]
                        }`}
                      >
                        {category}
                      </span>
                      <span className="text-xs text-muted-foreground">{categoryPositions.length} 个岗位</span>
                    </div>
                    <div className="space-y-1">
                      {categoryPositions.map((item) => {
                        const hasRule = activeRuleMap.has(item.key);
                        const isSelected = selectedPositionKey === item.key;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => setSelectedPositionKey(item.key)}
                            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                              isSelected
                                ? "border-primary bg-primary/5 font-medium"
                                : "border-transparent hover:border-border hover:bg-muted/40"
                            }`}
                          >
                            <span className="truncate">{item.name}</span>
                            <Badge variant={hasRule ? "default" : "secondary"} className="shrink-0 ml-2">
                              {hasRule ? "已配置" : "内置默认"}
                            </Badge>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* 右侧规则编辑区 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{selectedPosition?.name || "岗位规则"}</CardTitle>
                  <CardDescription>
                    修改后保存即可立即影响后续该岗位的 AI 面试评分与报告生成。该岗位的评分体系与其他岗位完全独立。
                  </CardDescription>
                </div>
                {selectedPosition?.category && (
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${
                      CATEGORY_COLORS[selectedPosition.category] || CATEGORY_COLORS["自定义"]
                    }`}
                  >
                    {selectedPosition.category}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-sm text-muted-foreground">加载中...</div>
              ) : loadError ? (
                <div className="space-y-3">
                  <div className="text-sm text-red-600">加载失败：{loadError}</div>
                  <Button variant="outline" onClick={() => void loadRule(selectedPositionKey, selectedPosition?.name)}>
                    重试
                  </Button>
                </div>
              ) : !form ? (
                <div className="text-sm text-muted-foreground">暂无数据</div>
              ) : (
                <div className="space-y-6">
                  {/* 基本信息 */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>规则名称</Label>
                      <Input value={form.ruleName} onChange={(e) => setForm({ ...form, ruleName: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>规则版本</Label>
                      <Input value={form.ruleVersion} onChange={(e) => setForm({ ...form, ruleVersion: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>岗位名称</Label>
                      <Input value={form.positionName} onChange={(e) => setForm({ ...form, positionName: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>状态</Label>
                      <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value as ScoreRuleConfig["status"] })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">active (启用)</SelectItem>
                          <SelectItem value="draft">draft (草稿)</SelectItem>
                          <SelectItem value="archived">archived (归档)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* 阈值设置 */}
                  <div className="space-y-2">
                    <Label className="text-base">结果判定阈值</Label>
                    <p className="text-xs text-muted-foreground">面试结束后，系统依据加权总分与阈值自动判定录用 / 待定 / 淘汰</p>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">{"录用阈值 (>=)"}</Label>
                        <Input
                          type="number"
                          value={form.thresholds.hire}
                          onChange={(e) => setForm({ ...form, thresholds: { ...form.thresholds, hire: Number(e.target.value || 0) } })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">{"待定阈值 (>=)"}</Label>
                        <Input
                          type="number"
                          value={form.thresholds.consider}
                          onChange={(e) => setForm({ ...form, thresholds: { ...form.thresholds, consider: Number(e.target.value || 0) } })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">{"淘汰下限 (>=)"}</Label>
                        <Input
                          type="number"
                          value={form.thresholds.reject}
                          onChange={(e) => setForm({ ...form, thresholds: { ...form.thresholds, reject: Number(e.target.value || 0) } })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 面试策略 */}
                  <div className="space-y-2">
                    <Label className="text-base">面试策略</Label>
                    <div className="grid gap-4 md:grid-cols-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs">最少核心问题数</Label>
                        <Input
                          type="number"
                          value={form.interviewStrategy.minCoreQuestions}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              interviewStrategy: {
                                ...form.interviewStrategy,
                                minCoreQuestions: Number(e.target.value || 0),
                              },
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">最多核心问题数</Label>
                        <Input
                          type="number"
                          value={form.interviewStrategy.maxCoreQuestions}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              interviewStrategy: {
                                ...form.interviewStrategy,
                                maxCoreQuestions: Number(e.target.value || 0),
                              },
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">单题最多追问</Label>
                        <Input
                          type="number"
                          value={form.interviewStrategy.maxFollowUpsPerQuestion}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              interviewStrategy: {
                                ...form.interviewStrategy,
                                maxFollowUpsPerQuestion: Number(e.target.value || 0),
                              },
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">高权重优先</Label>
                        <Select
                          value={form.interviewStrategy.focusHighWeightDimensions ? "true" : "false"}
                          onValueChange={(value) =>
                            setForm({
                              ...form,
                              interviewStrategy: {
                                ...form.interviewStrategy,
                                focusHighWeightDimensions: value === "true",
                              },
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">开启</SelectItem>
                            <SelectItem value="false">关闭</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* 权重分布可视化 */}
                  {form.dimensions.length > 0 && (
                    <div className="rounded-lg border bg-muted/30 p-4">
                      <WeightBar dimensions={form.dimensions} />
                    </div>
                  )}

                  {/* 评分维度 */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-base">评分维度</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          每个维度独立评分，最终按权重加权得出总分。所有维度权重之和应为 100%。
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setForm({ ...form, dimensions: [...form.dimensions, createEmptyDimension()] })}
                      >
                        新增维度
                      </Button>
                    </div>

                    {form.dimensions.map((dimension, index) => (
                      <div key={`${dimension.code}-${index}`} className="space-y-4 rounded-xl border p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            维度 {index + 1}: {dimension.name || "(未命名)"}
                            <span className="ml-2 text-xs text-muted-foreground">
                              权重 {Math.round((dimension.weight || 0) * 100)}%
                            </span>
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() =>
                              setForm({
                                ...form,
                                dimensions: form.dimensions.filter((_, dimensionIndex) => dimensionIndex !== index),
                              })
                            }
                          >
                            删除
                          </Button>
                        </div>
                        <div className="grid gap-4 md:grid-cols-3">
                          <div className="space-y-2">
                            <Label>维度编码</Label>
                            <Input value={dimension.code} onChange={(e) => updateDimension(index, "code", e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label>维度名称</Label>
                            <Input value={dimension.name} onChange={(e) => updateDimension(index, "name", e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label>权重</Label>
                            <Input type="number" step="0.01" value={dimension.weight} onChange={(e) => updateDimension(index, "weight", e.target.value)} />
                          </div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-4">
                          <div className="space-y-2">
                            <Label>是否必考</Label>
                            <Select value={dimension.mustAsk ? "true" : "false"} onValueChange={(value) => updateDimension(index, "mustAsk", value === "true")}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="true">是</SelectItem>
                                <SelectItem value="false">否</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>最少题数</Label>
                            <Input type="number" value={dimension.minQuestions || 1} onChange={(e) => updateDimension(index, "minQuestions", e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label>最多追问</Label>
                            <Input type="number" value={dimension.maxFollowUps || 2} onChange={(e) => updateDimension(index, "maxFollowUps", e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label>覆盖阈值</Label>
                            <Input type="number" step="0.05" value={dimension.coverageThreshold || 0.75} onChange={(e) => updateDimension(index, "coverageThreshold", e.target.value)} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>维度说明</Label>
                          <Textarea value={dimension.description} onChange={(e) => updateDimension(index, "description", e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>评分规则</Label>
                          <Textarea value={dimension.scoringRule} onChange={(e) => updateDimension(index, "scoringRule", e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>证据提示</Label>
                          <Textarea
                            value={(dimension.evidenceHints || []).join("，")}
                            onChange={(e) => updateDimension(index, "evidenceHints", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>主问题模板</Label>
                          <Textarea
                            value={(dimension.questionTemplates || []).join("\n")}
                            onChange={(e) => updateDimension(index, "questionTemplates", e.target.value)}
                            placeholder="每行一条主问题模板"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>追问模板</Label>
                          <Textarea
                            value={(dimension.followUpTemplates || []).join("\n")}
                            onChange={(e) => updateDimension(index, "followUpTemplates", e.target.value)}
                            placeholder="每行一条追问模板"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 必问题库 */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-base">必问题库</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">面试过程中必须问到的题目，可指定插入时机和关联维度。</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setForm({ ...form, requiredQuestions: [...form.requiredQuestions, createEmptyRequiredQuestion()] })}
                      >
                        新增必问题
                      </Button>
                    </div>

                    {form.requiredQuestions.map((requiredQuestion, index) => (
                      <div key={`${requiredQuestion.id || "required"}-${index}`} className="space-y-4 rounded-xl border p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            必问题 {index + 1}: {requiredQuestion.question?.slice(0, 30) || "(未填写)"}
                            {requiredQuestion.question && requiredQuestion.question.length > 30 ? "..." : ""}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() =>
                              setForm({
                                ...form,
                                requiredQuestions: form.requiredQuestions.filter((_, questionIndex) => questionIndex !== index),
                              })
                            }
                          >
                            删除
                          </Button>
                        </div>
                        <div className="grid gap-4 md:grid-cols-4">
                          <div className="space-y-2">
                            <Label>问题ID</Label>
                            <Input value={requiredQuestion.id} onChange={(e) => updateRequiredQuestion(index, "id", e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label>关联维度</Label>
                            <Input value={requiredQuestion.dimensionCode || ""} onChange={(e) => updateRequiredQuestion(index, "dimensionCode", e.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label>插入时机</Label>
                            <Select value={requiredQuestion.when || "any"} onValueChange={(value) => updateRequiredQuestion(index, "when", value)}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="any">any (任意时机)</SelectItem>
                                <SelectItem value="early">early (前期)</SelectItem>
                                <SelectItem value="middle">middle (中期)</SelectItem>
                                <SelectItem value="late">late (后期)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>最多追问</Label>
                            <Input type="number" value={requiredQuestion.maxFollowUps || 1} onChange={(e) => updateRequiredQuestion(index, "maxFollowUps", e.target.value)} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>问题内容</Label>
                          <Textarea value={requiredQuestion.question} onChange={(e) => updateRequiredQuestion(index, "question", e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>提问目的</Label>
                          <Textarea value={requiredQuestion.purpose || ""} onChange={(e) => updateRequiredQuestion(index, "purpose", e.target.value)} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 随机提问题库 */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-base">随机提问题库</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          面试过程中从题库随机抽取题目提问，每道题配有标准答案和评分标准，系统评分时作为参考依据。不追问。
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setForm({ ...form, questionBank: [...(form.questionBank || []), createEmptyQuestionBankItem()] })}
                      >
                        新增题目
                      </Button>
                    </div>

                    <div className="rounded-lg border bg-muted/30 p-3">
                      <div className="flex items-center gap-4">
                        <Label className="shrink-0 text-sm font-medium">每次面试随机抽取</Label>
                        <Input
                          type="number"
                          className="w-24"
                          min={0}
                          max={(form.questionBank || []).length}
                          value={form.questionBankCount || 0}
                          onChange={(e) => setForm({ ...form, questionBankCount: Number(e.target.value || 0) })}
                        />
                        <span className="text-sm text-muted-foreground">
                          道题（题库共 {(form.questionBank || []).length} 题）
                        </span>
                      </div>
                    </div>

                    {(form.questionBank || []).map((bankItem, index) => (
                      <div key={`qb-${bankItem.id || index}`} className="space-y-3 rounded-xl border p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            题目 {index + 1}: {bankItem.question?.slice(0, 30) || "(未填写)"}
                            {bankItem.question && bankItem.question.length > 30 ? "..." : ""}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() =>
                              setForm({
                                ...form,
                                questionBank: (form.questionBank || []).filter((_, i) => i !== index),
                              })
                            }
                          >
                            删除
                          </Button>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">题目内容</Label>
                          <Textarea
                            value={bankItem.question}
                            onChange={(e) => updateQuestionBankItem(index, "question", e.target.value)}
                            placeholder="输入面试题目"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">标准答案要点</Label>
                          <Textarea
                            value={bankItem.standardAnswer}
                            onChange={(e) => updateQuestionBankItem(index, "standardAnswer", e.target.value)}
                            placeholder="输入标准答案要点，用于AI评分时参考"
                            rows={3}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">评分标准</Label>
                          <Textarea
                            value={bankItem.scoringCriteria}
                            onChange={(e) => updateQuestionBankItem(index, "scoringCriteria", e.target.value)}
                            placeholder="如: 5分：完整回答定义+举例&#10;4分：基本理解概念&#10;3分：知道概念但深度不够&#10;2分：概念模糊&#10;1分：不了解"
                            rows={4}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* AI评分补充提示词 */}
                  <div className="space-y-2">
                    <Label>AI评分补充提示词</Label>
                    <Textarea
                      value={form.promptTemplate || ""}
                      onChange={(e) => setForm({ ...form, promptTemplate: e.target.value })}
                      placeholder="可选：补充该岗位的特殊评分提示，例如必须关注行业经验、是否能接受轮班等。"
                    />
                  </div>

                  {/* 保存按钮 */}
                  <div className="flex items-center justify-between border-t pt-4">
                    <p className="text-xs text-muted-foreground">保存后，后续该岗位的 AI 面试将自动使用新的评分规则生成量化评分报告</p>
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? "保存中..." : "保存规则"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </SuperAdminGuard>
  );
}
