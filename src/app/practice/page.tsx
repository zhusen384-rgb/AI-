"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Brain, Play, MessageSquare, Lightbulb, CheckCircle, TrendingUp, User, Bot, ArrowRight, FileText, Briefcase } from "lucide-react";

interface Message {
  id: string;
  role: "interviewer" | "candidate";
  content: string;
  timestamp: Date;
}

interface Tip {
  id: string;
  type: "technique" | "improvement" | "good";
  content: string;
}

interface Position {
  id: number;
  title: string;
  department: string;
  status: string;
  education: string;
  experience: string;
  jobDescription: string;
  interviewerPreferences?: {
    focusAreas: string[];
    questionStyle: string;
    additionalNotes: string;
  };
  createdAt: string;
}

// 从岗位数据中动态提取部门列表
const getDepartmentsFromPositions = (positions: Position[]): string[] => {
  const departments = new Set<string>();
  positions.forEach(pos => {
    if (pos.department) {
      departments.add(pos.department);
    }
  });
  return Array.from(departments).sort();
};

export default function PracticePage() {
  const [selectedMode, setSelectedMode] = useState<string>("");
  const [selectedDepartment, setSelectedDepartment] = useState<string>("");
  const [selectedPosition, setSelectedPosition] = useState<string>("");
  const [isStarted, setIsStarted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [tips, setTips] = useState<Tip[]>([]);
  const [showTips, setShowTips] = useState(true);
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [evaluation, setEvaluation] = useState<any>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedPositionData, setSelectedPositionData] = useState<{ title: string; description: string } | null>(null);
  const [candidateResume, setCandidateResume] = useState<any>(null);
  const [showResume, setShowResume] = useState(false);

  // 从岗位数据中动态获取部门列表
  const departments = getDepartmentsFromPositions(positions);

  // 根据选择的部门筛选岗位
  const filteredPositions = selectedDepartment
    ? positions.filter(pos => pos.department === selectedDepartment && pos.status === 'active')
    : positions.filter(pos => pos.status === 'active');

  const practiceModes = [
    {
      id: "junior",
      title: "初级面试",
      description: "针对1-3年经验候选人",
      difficulty: "简单",
      icon: "🌱",
    },
    {
      id: "senior",
      title: "中级面试",
      description: "针对3-5年经验候选人",
      difficulty: "中等",
      icon: "🚀",
    },
    {
      id: "expert",
      title: "高级面试",
      description: "针对5年以上经验候选人",
      difficulty: "困难",
      icon: "🏆",
    },
  ];

  const predefinedQuestions = [
    "请简单介绍一下你自己。",
    "你为什么选择我们公司？",
    "你遇到过什么技术难题？是如何解决的？",
    "你未来3-5年的职业规划是什么？",
    "你对加班有什么看法？",
  ];

  const predefinedTips = [
    {
      id: "1",
      type: "technique" as const,
      content: "提问时使用开放式问题，避免简单的'是/否'回答",
    },
    {
      id: "2",
      type: "improvement" as const,
      content: "注意观察候选人的肢体语言和表情变化",
    },
    {
      id: "3",
      type: "good" as const,
      content: "给候选人足够的思考时间，不要急于打断",
    },
    {
      id: "4",
      type: "technique" as const,
      content: "使用STAR法则追问具体经历（情境、任务、行动、结果）",
    },
    {
      id: "5",
      type: "improvement" as const,
      content: "避免引导性问题，保持中立和客观",
    },
  ];

  // 从 localStorage 加载岗位数据
  useEffect(() => {
    const loadPositions = () => {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('positions');
        if (stored) {
          const positionsData = JSON.parse(stored);
          setPositions(positionsData);
        } else {
          // 如果没有存储数据，使用默认岗位
          const defaultPositions: Position[] = [
            {
              id: 1,
              title: "Java开发工程师",
              department: "技术部",
              status: "active",
              education: "本科及以上",
              experience: "3年",
              jobDescription: "负责Java后端系统开发和维护，熟悉SpringBoot、MyBatis等框架。",
              createdAt: "2024-01-15",
            },
            {
              id: 2,
              title: "前端开发工程师",
              department: "技术部",
              status: "active",
              education: "本科及以上",
              experience: "2年",
              jobDescription: "负责前端页面开发，熟悉React/Vue。",
              createdAt: "2024-01-15",
            },
            {
              id: 3,
              title: "产品经理",
              department: "产品部",
              status: "active",
              education: "本科及以上",
              experience: "3年",
              jobDescription: "负责产品规划和设计。",
              createdAt: "2024-01-15",
            },
          ];
          setPositions(defaultPositions);
        }
      }
    };

    loadPositions();

    // 监听岗位数据更新事件
    const handlePositionsUpdate = () => {
      loadPositions();
    };

    window.addEventListener('positionsUpdated', handlePositionsUpdate);

    return () => {
      window.removeEventListener('positionsUpdated', handlePositionsUpdate);
    };
  }, []);

  const handleStartPractice = async () => {
    if (!selectedMode || !selectedPosition) {
      alert("请选择陪练模式和岗位");
      return;
    }

    // 保存选中的岗位信息
    const position = positions.find(p => String(p.id) === selectedPosition);
    if (position) {
      setSelectedPositionData({ title: position.title, description: position.jobDescription || '' });
    }

    // 重置之前的状态
    setMessages([]);
    setTips([]);
    setEvaluation(null);
    setShowEvaluation(false);
    setShowResume(false);
    setCandidateResume(null);

    setIsLoading(true);
    try {
      // 生成候选人简历
      const response = await fetch("/api/practice/generate-resume", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          positionTitle: position?.title,
          positionDescription: position?.jobDescription,
          mode: selectedMode,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setCandidateResume(result.resume);
        setIsStarted(true);
        setMessages([
          {
            id: "1",
            role: "candidate",
            content: `您好，我是${position?.title}候选人${result.resume?.name || ""}，很高兴能参加这次面试。`,
            timestamp: new Date(),
          },
        ]);
        setTips([predefinedTips[Math.floor(Math.random() * predefinedTips.length)]]);
      } else {
        alert(result.error || "生成简历失败");
      }
    } catch (error) {
      console.error("生成简历失败:", error);
      alert("网络错误，无法生成简历");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!currentQuestion.trim()) return;

    const interviewerMessage: Message = {
      id: Date.now().toString(),
      role: "interviewer",
      content: currentQuestion,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, interviewerMessage]);
    setCurrentQuestion("");
    setIsLoading(true);

    try {
      // 调用 API 获取 AI 回答
      const response = await fetch("/api/practice/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: currentQuestion,
          position: selectedPosition,
          positionTitle: selectedPositionData?.title || "",
          positionDescription: selectedPositionData?.description || "",
          mode: selectedMode,
          conversationHistory: messages,
          resume: candidateResume,
        }),
      });

      const result = await response.json();

      if (result.success) {
        const candidateResponse: Message = {
          id: (Date.now() + 1).toString(),
          role: "candidate",
          content: result.answer,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, candidateResponse]);

        // 随机添加新的技巧提示
        const newTip = predefinedTips[Math.floor(Math.random() * predefinedTips.length)];
        setTips([newTip, ...tips.slice(0, 2)]);
      } else {
        alert(result.error || "获取回答失败");
      }
    } catch (error) {
      console.error("发送消息失败:", error);
      alert("网络错误，请稍后重试");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEndPractice = async () => {
    // 移除对话轮数限制，允许随时结束陪练
    if (confirm("确定要结束这次陪练吗？结束后将显示评估报告。")) {
      setIsLoading(true);
      try {
        // 调用评估 API
        const response = await fetch("/api/practice/evaluate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            conversationHistory: messages,
            position: selectedPosition,
            mode: selectedMode,
          }),
        });

        const result = await response.json();

        if (result.success) {
          setEvaluation(result.data.evaluation);
          setShowEvaluation(true);
        } else {
          alert(result.error || "评估失败");
        }
      } catch (error) {
        console.error("评估失败:", error);
        alert("网络错误，无法生成评估报告");
      } finally {
        setIsLoading(false);
      }
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "简单": return "bg-green-100 text-green-800";
      case "中等": return "bg-yellow-100 text-yellow-800";
      case "困难": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getTipIcon = (type: string) => {
    switch (type) {
      case "technique": return <Lightbulb className="h-4 w-4 text-yellow-500" />;
      case "improvement": return <TrendingUp className="h-4 w-4 text-blue-500" />;
      case "good": return <CheckCircle className="h-4 w-4 text-green-500" />;
      default: return <Lightbulb className="h-4 w-4" />;
    }
  };

  const getTipBgColor = (type: string) => {
    switch (type) {
      case "technique": return "bg-yellow-50 border-yellow-200";
      case "improvement": return "bg-blue-50 border-blue-200";
      case "good": return "bg-green-50 border-green-200";
      default: return "bg-gray-50";
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Brain className="h-8 w-8 text-blue-600" />
          AI 面试陪练
        </h1>
        <p className="mt-2 text-gray-600">
          通过模拟真实面试场景，提升您的面试技巧和评估能力
        </p>
      </div>

      {!isStarted ? (
        <div className="space-y-8">
          <Tabs defaultValue="mode" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="mode">选择模式</TabsTrigger>
              <TabsTrigger value="position">选择岗位</TabsTrigger>
            </TabsList>

            <TabsContent value="mode" className="mt-6">
              <div className="grid md:grid-cols-3 gap-6">
                {practiceModes.map((mode) => (
                  <Card
                    key={mode.id}
                    className={`cursor-pointer transition-all hover:shadow-lg ${
                      selectedMode === mode.id
                        ? "ring-2 ring-blue-500 border-blue-500"
                        : ""
                    }`}
                    onClick={() => setSelectedMode(mode.id)}
                  >
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="text-4xl">{mode.icon}</div>
                        <Badge className={getDifficultyColor(mode.difficulty)}>
                          {mode.difficulty}
                        </Badge>
                      </div>
                      <CardTitle className="mt-4">{mode.title}</CardTitle>
                      <CardDescription>{mode.description}</CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="position" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Briefcase className="h-5 w-5" />
                    选择岗位
                  </CardTitle>
                  <CardDescription>先选择部门，再选择对应的岗位</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* 部门选择 */}
                  <div>
                    <Label htmlFor="department-select">所属部门</Label>
                    <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                      <SelectTrigger id="department-select">
                        <SelectValue placeholder="请选择部门" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments.length > 0 ? (
                          departments.map((dept) => (
                            <SelectItem key={dept} value={dept}>
                              {dept}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" disabled>
                            暂无部门数据
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 岗位选择 */}
                  <div>
                    <Label htmlFor="position-select">
                      岗位名称
                      {selectedDepartment && (
                        <span className="ml-2 text-sm text-gray-500">
                          ({filteredPositions.length} 个岗位)
                        </span>
                      )}
                    </Label>
                    <Select
                      value={selectedPosition}
                      onValueChange={setSelectedPosition}
                      disabled={!selectedDepartment}
                    >
                      <SelectTrigger id="position-select">
                        <SelectValue placeholder={selectedDepartment ? "请选择岗位" : "请先选择部门"} />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredPositions.length > 0 ? (
                          filteredPositions.map((position) => (
                            <SelectItem key={position.id} value={String(position.id)}>
                              <div className="flex flex-col">
                                <span className="font-medium">{position.title}</span>
                                {position.experience && (
                                  <span className="text-xs text-gray-500">{position.experience}</span>
                                )}
                              </div>
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="none" disabled>
                            该部门暂无招聘岗位
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 已选择的岗位信息展示 */}
                  {selectedPosition && (
                    <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                      <div className="flex items-center gap-2 mb-2">
                        <Briefcase className="h-4 w-4 text-blue-600" />
                        <span className="font-medium">已选择岗位</span>
                      </div>
                      {positions.find(p => String(p.id) === selectedPosition) && (
                        <div className="text-sm space-y-1">
                          <div>
                            <span className="text-gray-600">岗位名称：</span>
                            <span className="font-medium">
                              {positions.find(p => String(p.id) === selectedPosition)?.title}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-600">所属部门：</span>
                            <span>
                              {positions.find(p => String(p.id) === selectedPosition)?.department}
                            </span>
                          </div>
                          {positions.find(p => String(p.id) === selectedPosition)?.experience && (
                            <div>
                              <span className="text-gray-600">经验要求：</span>
                              <span>
                                {positions.find(p => String(p.id) === selectedPosition)?.experience}
                              </span>
                            </div>
                          )}
                          {positions.find(p => String(p.id) === selectedPosition)?.education && (
                            <div>
                              <span className="text-gray-600">学历要求：</span>
                              <span>
                                {positions.find(p => String(p.id) === selectedPosition)?.education}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Card>
            <CardHeader>
              <CardTitle>陪练说明</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-gray-700">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>AI 将模拟真实候选人，根据您的提问回答问题</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>实时提供面试技巧提示，帮助您改进提问方式</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>支持多种岗位和难度级别的陪练模式</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>面试结束后提供详细的评估报告和改进建议</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={handleStartPractice}
              disabled={!selectedMode || !selectedPosition}
              className="px-8"
            >
              <Play className="mr-2 h-5 w-5" />
              开始陪练
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* 左侧：对话区域 */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>面试对话</CardTitle>
                  <div className="flex items-center gap-4">
                    {candidateResume && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowResume(true)}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        查看简历
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowTips(!showTips)}
                    >
                      <Lightbulb className="mr-2 h-4 w-4" />
                      {showTips ? "隐藏" : "显示"}技巧
                    </Button>
                    <Button variant="destructive" size="sm" onClick={handleEndPractice}>
                      结束陪练
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-[500px] overflow-y-auto space-y-4 mb-4 p-4 bg-gray-50 rounded-lg">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${
                        message.role === "interviewer" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {message.role === "candidate" && (
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
                      {message.role === "interviewer" && (
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

                <div className="space-y-3">
                  <Label>预设问题（点击快速发送）</Label>
                  <div className="flex flex-wrap gap-2">
                    {predefinedQuestions.map((question) => (
                      <Button
                        key={question}
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentQuestion(question)}
                      >
                        {question}
                      </Button>
                    ))}
                  </div>

                  <div className="flex gap-3">
                    <Input
                      placeholder="输入您的问题..."
                      value={currentQuestion}
                      onChange={(e) => setCurrentQuestion(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                      disabled={isLoading}
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={isLoading || !currentQuestion.trim()}
                    >
                      <ArrowRight className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 右侧：技巧提示 */}
          {showTips && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5 text-yellow-500" />
                    实时技巧提示
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {tips.map((tip) => (
                      <div
                        key={tip.id}
                        className={`p-4 rounded-lg border ${getTipBgColor(tip.type)}`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5">{getTipIcon(tip.type)}</div>
                          <p className="text-sm">{tip.content}</p>
                        </div>
                      </div>
                    ))}
                    {tips.length === 0 && (
                      <p className="text-sm text-gray-500 text-center py-4">
                        开始对话后将显示技巧提示
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>面试统计</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">对话轮数</span>
                      <span className="font-medium">{Math.floor(messages.length / 2)} 轮</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">已用时间</span>
                      <span className="font-medium">0 分钟</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">技巧提示</span>
                      <span className="font-medium">{tips.length} 条</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* 评估结果弹窗 */}
      {showEvaluation && evaluation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.8)" }}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b sticky top-0 bg-white">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">陪练评估报告</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowEvaluation(false);
                    setIsStarted(false);
                    setMessages([]);
                    setTips([]);
                    setEvaluation(null);
                  }}
                >
                  ✕
                </Button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              {/* 综合得分 */}
              <div className="flex items-center justify-center py-8">
                <div className="relative">
                  <div className="w-40 h-40 rounded-full bg-blue-100 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-6xl font-bold text-blue-600">
                        {evaluation.overallScore}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">总分</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 分项得分 */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: "提问质量", score: evaluation.questionQuality },
                  { label: "倾听能力", score: evaluation.listeningSkill },
                  { label: "追问技巧", score: evaluation.followUpTechnique },
                  { label: "沟通引导", score: evaluation.communicationGuidance },
                  { label: "时间控制", score: evaluation.timeControl },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={`p-4 rounded-lg ${
                      item.score >= 8 ? "bg-green-100" : item.score >= 6 ? "bg-yellow-100" : "bg-red-100"
                    }`}
                  >
                    <div className="text-sm text-gray-600 mb-2">{item.label}</div>
                    <div className={`text-2xl font-bold ${
                      item.score >= 8 ? "text-green-600" : item.score >= 6 ? "text-yellow-600" : "text-red-600"
                    }`}>
                      {item.score}
                    </div>
                  </div>
                ))}
              </div>

              {/* 优势 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-green-600">✓ 您的优势</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {evaluation.strengths?.map((strength: string, index: number) => (
                      <li key={index} className="flex items-start gap-2">
                        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-700">{strength}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* 改进建议 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-blue-600">→ 改进建议</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {evaluation.improvements?.map((improvement: string, index: number) => (
                      <li key={index} className="flex items-start gap-2">
                        <TrendingUp className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-700">{improvement}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* 具体建议 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-yellow-600">💡 具体建议</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {evaluation.recommendations?.map((recommendation: string, index: number) => (
                      <li key={index} className="flex items-start gap-2">
                        <Lightbulb className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-700">{recommendation}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* 操作按钮 */}
              <div className="flex justify-center gap-4 pt-6">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowEvaluation(false);
                    setIsStarted(false);
                    setMessages([]);
                    setTips([]);
                    setEvaluation(null);
                  }}
                >
                  返回首页
                </Button>
                <Button
                  onClick={() => {
                    setShowEvaluation(false);
                    setIsStarted(false);
                    setMessages([]);
                    setTips([]);
                    setEvaluation(null);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  再来一次
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 简历弹窗 */}
      {showResume && candidateResume && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.8)" }}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b sticky top-0 bg-white">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <FileText className="h-6 w-6 text-blue-600" />
                  候选人简历
                </h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowResume(false)}
                >
                  ✕
                </Button>
              </div>
            </div>
            <div className="p-6 space-y-6">
              {/* 基本信息 */}
              <div>
                <h3 className="text-lg font-semibold mb-3 text-gray-900">基本信息</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-gray-600">姓名：</span>
                    <span className="font-medium">{candidateResume.name || "候选人"}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">年龄：</span>
                    <span className="font-medium">{candidateResume.age || 28}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">学历：</span>
                    <span className="font-medium">{candidateResume.education || "本科"}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">工作经验：</span>
                    <span className="font-medium">{candidateResume.experience || "3-5年"}</span>
                  </div>
                </div>
              </div>

              {/* 技能 */}
              <div>
                <h3 className="text-lg font-semibold mb-3 text-gray-900">专业技能</h3>
                <div className="flex flex-wrap gap-2">
                  {(candidateResume.skills || []).map((skill: string, index: number) => (
                    <Badge key={index} variant="secondary" className="text-sm">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* 项目经验 */}
              <div>
                <h3 className="text-lg font-semibold mb-3 text-gray-900">项目经验</h3>
                <div className="space-y-4">
                  {(candidateResume.projects || []).map((project: any, index: number) => (
                    <Card key={index} className="border-l-4 border-l-blue-500">
                      <CardContent className="pt-4">
                        <div className="font-semibold mb-1">{project.name}</div>
                        <div className="text-sm text-gray-600 mb-2">
                          担任角色：{project.role}
                        </div>
                        <p className="text-sm text-gray-700 mb-2">{project.description}</p>
                        <div className="text-sm text-green-600 font-medium">
                          主要成就：{project.achievements}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* 工作经历 */}
              <div>
                <h3 className="text-lg font-semibold mb-3 text-gray-900">工作经历</h3>
                <div className="space-y-4">
                  {(candidateResume.workHistory || []).map((work: any, index: number) => (
                    <Card key={index} className="border-l-4 border-l-green-500">
                      <CardContent className="pt-4">
                        <div className="flex justify-between items-start mb-1">
                          <div className="font-semibold">{work.company}</div>
                          <Badge variant="outline">{work.duration}</Badge>
                        </div>
                        <div className="text-sm text-gray-600 mb-2">
                          职位：{work.position}
                        </div>
                        <p className="text-sm text-gray-700">{work.responsibilities}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* 个人优势 */}
              <div>
                <h3 className="text-lg font-semibold mb-3 text-gray-900">个人优势</h3>
                <div className="flex flex-wrap gap-2">
                  {(candidateResume.strengths || []).map((strength: string, index: number) => (
                    <Badge key={index} className="bg-green-100 text-green-800 text-sm">
                      {strength}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* 职业目标 */}
              <div>
                <h3 className="text-lg font-semibold mb-3 text-gray-900">职业目标</h3>
                <p className="text-gray-700 bg-gray-50 p-4 rounded-lg">
                  {candidateResume.careerGoal || "成为技术专家"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
