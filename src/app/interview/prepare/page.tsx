"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Sparkles, FileText, Briefcase } from "lucide-react";
import { fetchClientJson } from "@/lib/client-api";

interface Question {
  type: string;
  category: string;
  question: string;
  followUpQuestions: string[];
  targetSkill: string;
  difficulty: string;
  order: number;
}

interface GeneratedQuestions {
  questions: Question[];
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  questions?: Question[];
  error?: string;
}

export default function InterviewPreparePage() {
  const [candidateName, setCandidateName] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [resumeData, setResumeData] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [questions, setQuestions] = useState<GeneratedQuestions | null>(null);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    if (!jobDescription.trim() || !resumeData.trim()) {
      setError("岗位描述和简历数据不能为空");
      return;
    }

    setIsGenerating(true);
    setError("");
    setQuestions(null);

    try {
      // 解析简历数据为JSON格式
      let parsedResume;
      try {
        parsedResume = JSON.parse(resumeData);
      } catch {
        // 如果不是JSON格式，使用原始文本
        parsedResume = resumeData;
      }

      const result = await fetchClientJson<ApiResponse<GeneratedQuestions>>("/api/interview/questions/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          resumeData: parsedResume,
          jobDescription: {
            title: candidateName ? `${candidateName} 候选人面试` : "面试准备",
            jobDescription,
            education: "",
            experience: "",
          },
          level: "mid",
          coreRequirements: [],
        }),
      });

      if (result.success) {
        setQuestions(result.data ?? { questions: result.questions ?? [] });
      } else {
        setError(result.error || "问题库生成失败");
      }
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setIsGenerating(false);
    }
  };

  const groupedQuestions = questions?.questions.reduce((acc, q) => {
    if (!acc[q.type]) {
      acc[q.type] = [];
    }
    acc[q.type].push(q);
    return acc;
  }, {} as Record<string, Question[]>) || {};

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">面试准备</h1>
        <p className="mt-2 text-gray-600">基于简历和岗位需求生成智能问题库</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 左侧：输入区域 */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>候选人信息</CardTitle>
              <CardDescription>填写候选人基本信息和面试材料</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="candidate-name">候选人姓名</Label>
                <Input
                  id="candidate-name"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  placeholder="请输入候选人姓名"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                岗位描述
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="请输入岗位描述（JD）..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                className="min-h-[150px]"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                简历数据
              </CardTitle>
              <CardDescription>
                从简历解析页面复制粘贴，或直接输入简历JSON数据
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="请输入简历数据（JSON格式或原始文本）..."
                value={resumeData}
                onChange={(e) => setResumeData(e.target.value)}
                className="min-h-[200px] font-mono text-sm"
              />
            </CardContent>
          </Card>

          {error && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !jobDescription.trim() || !resumeData.trim()}
            className="w-full"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                生成问题库中...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" />
                生成智能问题库
              </>
            )}
          </Button>
        </div>

        {/* 右侧：问题库展示 */}
        <div className="space-y-6">
          {questions && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-yellow-500" />
                  智能问题库
                </CardTitle>
                <CardDescription>
                  共生成 {questions.questions.length} 个面试问题
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="all" className="w-full">
                  <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="all">全部</TabsTrigger>
                    <TabsTrigger value="basic">基础</TabsTrigger>
                    <TabsTrigger value="skill">能力</TabsTrigger>
                    <TabsTrigger value="gap">缺口</TabsTrigger>
                    <TabsTrigger value="scenario">情景</TabsTrigger>
                  </TabsList>

                  <TabsContent value="all" className="mt-4 space-y-4">
                    {questions.questions.map((q, index) => (
                      <QuestionCard key={index} question={q} />
                    ))}
                  </TabsContent>

                  {Object.entries(groupedQuestions).map(([type, qs]) => (
                    <TabsContent key={type} value={type} className="mt-4 space-y-4">
                      {qs.map((q, index) => (
                        <QuestionCard key={index} question={q} />
                      ))}
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          )}

          {!questions && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Sparkles className="h-16 w-16 text-gray-300 mb-4" />
                <p className="text-gray-500 text-center">
                  请在左侧填写岗位描述和简历数据<br />点击生成按钮创建智能问题库
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function QuestionCard({ question }: { question: Question }) {
  const questionTypeMap: Record<string, string> = {
    basic: "基础验证题",
    skill: "能力考察题",
    gap: "缺口补全题",
    scenario: "情景模拟题",
    other: "其他题",
  };

  const difficultyMap: Record<string, string> = {
    easy: "简单",
    medium: "中等",
    hard: "困难",
  };

  const difficultyColors: Record<string, string> = {
    easy: "bg-green-100 text-green-800",
    medium: "bg-yellow-100 text-yellow-800",
    hard: "bg-red-100 text-red-800",
  };

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline">{questionTypeMap[question.type]}</Badge>
          <Badge variant="secondary">{question.category}</Badge>
          <Badge className={difficultyColors[question.difficulty]}>
            {difficultyMap[question.difficulty]}
          </Badge>
        </div>
        <span className="text-sm text-gray-500">#{question.order}</span>
      </div>

      <div className="space-y-2">
        <div className="font-medium text-gray-900">{question.question}</div>
        <div className="text-sm text-gray-600">考察目标：{question.targetSkill}</div>
      </div>

      {question.followUpQuestions && question.followUpQuestions.length > 0 && (
        <div className="border-l-2 border-gray-200 pl-4">
          <div className="text-sm font-medium text-gray-700 mb-2">追问：</div>
          <ul className="space-y-1">
            {question.followUpQuestions.map((followUp, i) => (
              <li key={i} className="text-sm text-gray-600">
                {i + 1}. {followUp}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
