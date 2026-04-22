"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, Download, Printer, Star, AlertTriangle, TrendingUp, CheckCircle, XCircle, Briefcase, Video } from "lucide-react";

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

interface Evaluation {
  hardSkillScore: number;
  experienceScore: number;
  communicationScore: number;
  problemSolvingScore: number;
  professionalismScore: number;
  teamCollaborationScore: number;
  learningAbilityScore: number;
  stressResistanceScore: number;
  strengths: Array<{ dimension: string; score: number; description: string }>;
  weaknesses: Array<{ dimension: string; score: number; description: string }>;
  intention: string;
  fitScore: number;
  fitVerdict: string;
  fitReason: string;
  retestRecommendation: string;
  retestFocus: string[];
  concerns: string[];
  highlights: string[];
  doubtPoints: string[];
}

export default function ReportsPage() {
  const [candidateName, setCandidateName] = useState("");
  const [positionTitle, setPositionTitle] = useState("");
  const [selectedPositionId, setSelectedPositionId] = useState<number | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [interviewAnswers, setInterviewAnswers] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [error, setError] = useState("");
  
  // 新增：历史报告列表
  const [reports, setReports] = useState<any[]>([]);
  
  // 新增：选中的历史报告
  const [selectedReport, setSelectedReport] = useState<any | null>(null);

  // 新增：录屏播放器
  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string>("");

  // 新增：Markdown格式报告
  const [markdownReport, setMarkdownReport] = useState<string>(
`📊 【Java开发工程师】面试报告
⏰ 面试时间：HR填写
👤 面试官：无
👥 求职者：李四（学历/经验：本科/2年Java经验）

--- 一、岗位需求匹配 ---
🎯 岗位核心要求：
- 技术：Java+SpringBoot+微服务开发（3年经验）
- 软技能：团队协作、问题快速响应
- 学历：本科及以上

✅ 求职者匹配情况：
| 需求项：求职者表现 →→→ | 匹配度 |
|----------------|--------------------------|--------|
| Java基础：熟练使用SpringBoot框架 →→→ | 90%    |
| 微服务经验：未提及相关项目 →→→ | 30%    |
| 沟通能力：回答清晰，逻辑连贯 →→→ | 85%    |

--- 二、候选人多维度评价 ---
硬技能匹配度（0-10 分）：8
工作经验适配度（0-10 分）：6
沟通表达能力（0-10 分）：9
问题解决能力（0-10 分）：7
职业素养（0-10 分）：8
岗位整体匹配度（0-10 分）：7.5
🔑 关键结论：技术基础达标，需复试评估微服务技术应用能力

--- 三、最终建议 ---
🔹 候选人优势（维度分数5分以上）:
1. 硬技能匹配度高（8 分），熟练使用 Java+SpringBoot 框架，独立开发过 3 个核心业务模块，代码复用率提升 35%
2. 沟通表达能力强（9 分），逻辑清晰，能快速 get 问题核心
- ⭐️「亮点标记」：候选人主动提及XX工具优化流程，效率提升30%
- ⚠️「需验证疑点」：简历描述"独立负责"，但回答中多次提到团队协作，需确认分工细节

🔹 候选人劣势（维度分数5分以下）:
1. 工作经验适配度不足（6 分），无跨境电商行业经验，对海外用户习惯了解较少
2. 问题解决能力待提升（7 分），情景题回答中方案落地性较弱

🔹 候选人的意向度：高
🔹 岗位适配度：是
适配理由：技术基础符合要求，但跨部门协作经验需验证，建议复试时重点考察

🔹 初试通过之后，复试的建议：
- 重点考察：数据建模与业务落地能力
- 问题方向：请设计一个用户分层运营方案并说明关键指标

🔗 推荐：建议复试（综合得分65分）
⚠️ 关注点：需确认微服务项目经验或快速学习能力`
  );

  // 加载岗位列表
  useEffect(() => {
    const loadPositions = () => {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('positions');
        if (stored) {
          const positionsData = JSON.parse(stored);
          setPositions(positionsData);
        }
      }
    };

    loadPositions();
  }, []);

  // 加载历史报告
  useEffect(() => {
    const loadReports = () => {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('reports');
        if (stored) {
          setReports(JSON.parse(stored));
        }
      }
    };

    loadReports();
  }, []);

  const handleGenerate = async () => {
    if (!candidateName.trim() || !selectedPositionId || !interviewAnswers.trim()) {
      setError("请填写完整信息（候选人姓名、应聘岗位、面试问答记录）");
      return;
    }

    setIsGenerating(true);
    setError("");
    setEvaluation(null);

    try {
      let parsedAnswers;
      try {
        parsedAnswers = JSON.parse(interviewAnswers);
      } catch {
        parsedAnswers = interviewAnswers;
      }

      const selectedPosition = positions.find(p => p.id === selectedPositionId);

      const response = await fetch("/api/reports/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          candidateName,
          positionTitle: positionTitle,
          positionId: selectedPositionId,
          position: selectedPosition,
          interviewData: {},
          interviewAnswers: parsedAnswers,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setEvaluation(result.data.evaluation);
        setMarkdownReport(result.data.markdownReport || "");
      } else {
        setError(result.error || "报告生成失败");
      }
    } catch (error) {
      setError("网络错误，请稍后重试");
    } finally {
      setIsGenerating(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 8) return "text-green-600";
    if (score >= 6) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreBackground = (score: number) => {
    if (score >= 8) return "bg-green-100";
    if (score >= 6) return "bg-yellow-100";
    return "bg-red-100";
  };

  // 新增：处理历史报告点击
  const handleReportClick = (report: any) => {
    setSelectedReport(report);
    setCandidateName(report.candidateName);
    setPositionTitle(report.positionTitle);
    setSelectedPositionId(report.positionId);
    // 设置历史报告的 markdownReport（如果存在）
    setMarkdownReport(report.markdownReport || "");
    
    // 将历史报告的分析结果转换为评估格式
    const evaluationData: Evaluation = {
      hardSkillScore: Math.round(report.analysis.technicalScore / 10),
      experienceScore: 8,
      communicationScore: Math.round(report.analysis.communicationScore / 10),
      problemSolvingScore: Math.round(report.analysis.problemSolvingScore / 10),
      professionalismScore: 8,
      teamCollaborationScore: 8,
      learningAbilityScore: 8,
      stressResistanceScore: 8,
      strengths: report.analysis.strengths?.map((s: string) => ({
        dimension: '综合能力',
        score: 8,
        description: s
      })) || [],
      weaknesses: report.analysis.weaknesses?.map((w: string) => ({
        dimension: '待改进',
        score: 6,
        description: w
      })) || [],
      intention: 'high',
      fitScore: Math.round(report.analysis.overallScore / 10),
      fitVerdict: report.analysis.recommendation === 'pass' ? '是' : '否',
      fitReason: report.analysis.summary || '根据面试表现综合评估',
      retestRecommendation: '建议进入下一轮面试',
      retestFocus: ['技术深度', '项目经验', '团队协作'],
      concerns: [],
      highlights: report.analysis.strengths || [],
      doubtPoints: report.analysis.weaknesses || []
    };
    
    setEvaluation(evaluationData);
  };

  // 新增：查看录屏
  const handleViewVideo = async (videoFileKey: string, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      const response = await fetch('/api/storage/get-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileKey: videoFileKey }),
      });
      const result = await response.json();
      if (result.success) {
        setCurrentVideoUrl(result.url);
        setShowVideoPlayer(true);
      } else {
        alert('无法获取录屏文件');
      }
    } catch (error) {
      console.error('获取录屏失败:', error);
      // 如果 API 不存在，使用模拟 URL
      setCurrentVideoUrl(`https://your-storage-bucket.s3.amazonaws.com/${videoFileKey}`);
      setShowVideoPlayer(true);
    }
  };

  // 新增：生成示例报告
  const handleGenerateSampleReport = () => {
    const sampleMarkdown = `📊 【高级前端工程师】面试报告
⏰ 面试时间：HR填写
👤 面试官：无
👥 求职者：张三（示例）（学历/经验：本科/3年前端开发经验）

--- 一、岗位需求匹配 ---
🎯 岗位核心要求：
- 技术：React、TypeScript、前端架构（3年经验）
- 软技能：团队协作、沟通能力、问题解决
- 学历：本科及以上

✅ 求职者匹配情况：
| 需求项：求职者表现 →→→ | 匹配度 |
|----------------|--------------------------|--------|
| React/TypeScript：精通React和TypeScript，有大型项目经验 →→→ | 90%    |
| 前端架构：有大型项目架构经验，熟悉主流框架 →→→ | 85%    |
| 沟通能力：回答清晰，逻辑连贯，沟通能力强 →→→ | 88%    |

--- 二、候选人多维度评价 ---
硬技能匹配度（0-10 分）：9
工作经验适配度（0-10 分）：8
沟通表达能力（0-10 分）：9
问题解决能力（0-10 分）：8
职业素养（0-10 分）：8
岗位整体匹配度（0-10 分）：8.5
🔑 关键结论：技术功底扎实，沟通表达清晰，有丰富的项目经验，建议进入下一轮面试

--- 三、最终建议 ---
🔹 候选人优势（维度分数5分以上）:
1. 硬技能匹配度高（9 分），精通 React 和 TypeScript，有大型项目架构经验
2. 沟通表达能力强（9 分），逻辑清晰，团队协作好
- ⭐️「亮点标记」：候选人熟练使用多种前端技术栈，能够独立完成复杂功能的开发
- ⚠️「需验证疑点」：对某些新技术还需要深入学习，建议考察学习能力和适应性

🔹 候选人劣势（维度分数5分以下）:
无明显劣势，整体表现良好

🔹 候选人的意向度：高
🔹 岗位适配度：是
适配理由：技术基础扎实，符合岗位要求，有丰富的项目经验，团队协作能力强

🔹 初试通过之后，复试的建议：
- 重点考察：技术深度、架构设计能力、性能优化经验
- 问题方向：请设计一个大型前端应用的架构方案，并说明如何优化性能

🔗 推荐：建议复试（综合得分85分）
⚠️ 关注点：需补充更多性能优化案例，建议深入考察项目经验`;

    const sampleReport = {
      id: `sample_${Date.now()}`,
      candidateName: '张三（示例）',
      positionId: 1,
      positionTitle: '高级前端工程师',
      meetingId: 'sample_meeting',
      videoFileKey: 'sample_video.webm',
      interviewDate: new Date().toISOString(),
      duration: 60,
      transcription: {
        fullText: '面试对话转录...'
      },
      analysis: {
        overallScore: 85,
        technicalScore: 90,
        communicationScore: 88,
        problemSolvingScore: 82,
        recommendation: 'pass',
        summary: '候选人技术功底扎实，沟通表达清晰，有丰富的项目经验。建议进入下一轮面试。',
        strengths: [
          '精通 React 和 TypeScript',
          '有大型项目架构经验',
          '沟通能力强，团队协作好'
        ],
        weaknesses: [
          '对某些新技术还需要深入学习',
          '可以补充更多性能优化案例'
        ],
        questionsAndAnswers: []
      },
      recommendation: 'pass',
      createdAt: new Date().toISOString(),
      markdownReport: sampleMarkdown
    };

    const existingReports = JSON.parse(localStorage.getItem('reports') || '[]');
    existingReports.unshift(sampleReport);
    localStorage.setItem('reports', JSON.stringify(existingReports));
    setReports(existingReports);
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">评估报告</h1>
        <p className="mt-2 text-gray-600">基于面试记录生成结构化评估报告</p>
      </div>

      {/* 历史报告列表 */}
      {reports.length > 0 ? (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">历史报告</h2>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                if (confirm('确定要清空所有历史报告吗？')) {
                  localStorage.removeItem('reports');
                  setReports([]);
                }
              }}
            >
              清空历史
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {reports.map((report) => (
              <Card 
                key={report.id} 
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => handleReportClick(report)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{report.candidateName}</CardTitle>
                    <Badge variant={report.analysis?.recommendation === 'pass' ? 'default' : 'destructive'}>
                      {report.analysis?.recommendation === 'pass' ? '通过' : report.analysis?.recommendation === 'fail' ? '不通过' : '待定'}
                    </Badge>
                  </div>
                  <CardDescription>
                    {report.positionTitle} | {new Date(report.interviewDate).toLocaleDateString('zh-CN')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">综合评分</span>
                      <span className={`font-semibold ${getScoreColor((report.analysis?.overallScore || 0) / 10)}`}>
                        {report.analysis?.overallScore || 0}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">技术能力</span>
                      <span className={`font-semibold ${getScoreColor((report.analysis?.technicalScore || 0) / 10)}`}>
                        {report.analysis?.technicalScore || 0}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">沟通能力</span>
                      <span className={`font-semibold ${getScoreColor((report.analysis?.communicationScore || 0) / 10)}`}>
                        {report.analysis?.communicationScore || 0}
                      </span>
                    </div>
                    {report.videoFileKey && (
                      <div className="pt-2 border-t">
                        <div className="text-xs text-gray-500 mb-1">录屏文件</div>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full text-xs"
                          onClick={(e) => handleViewVideo(report.videoFileKey, e)}
                        >
                          <Video className="mr-1 h-3 w-3" />
                          查看录屏
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-8">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="text-center space-y-4">
                <Video className="h-16 w-16 text-gray-300 mx-auto" />
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">暂无历史报告</h3>
                  <p className="text-gray-500 text-sm max-w-md">
                    完成面试后，系统会自动生成评估报告并显示在这里。
                  </p>
                </div>
                <div className="flex gap-3 pt-4">
                  <Button 
                    variant="outline"
                    onClick={handleGenerateSampleReport}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    生成示例报告
                  </Button>
                  <Button 
                    variant="default"
                    onClick={() => window.location.href = '/interview/room'}
                  >
                    开始面试
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 左侧：输入区域 - 已隐藏 */}
        <div className="lg:col-span-1 space-y-6 hidden">
          <Card>
            <CardHeader>
              <CardTitle>生成报告</CardTitle>
              <CardDescription>填写面试信息生成评估报告</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="candidate-name">候选人姓名</Label>
                <Input
                  id="candidate-name"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  placeholder="例如：张三"
                />
              </div>
              <div>
                <Label htmlFor="position-select">应聘岗位</Label>
                <Select
                  value={selectedPositionId?.toString() || ""}
                  onValueChange={(value) => {
                    const position = positions.find(p => p.id === parseInt(value));
                    if (position) {
                      setSelectedPositionId(position.id);
                      setPositionTitle(position.title);
                    }
                  }}
                >
                  <SelectTrigger id="position-select">
                    <SelectValue placeholder="请选择应聘岗位" />
                  </SelectTrigger>
                  <SelectContent>
                    {positions.map((position) => (
                      <SelectItem key={position.id} value={position.id.toString()}>
                        <div className="flex items-center gap-2">
                          <Briefcase className="h-3 w-3" />
                          <span>{position.title}</span>
                          <span className="text-gray-400 text-sm">|</span>
                          <span className="text-gray-500 text-sm">{position.department}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="interview-answers">面试问答记录</Label>
                <Textarea
                  id="interview-answers"
                  placeholder="请输入面试问答记录（JSON格式或文本）..."
                  value={interviewAnswers}
                  onChange={(e) => setInterviewAnswers(e.target.value)}
                  className="min-h-[300px] font-mono text-sm"
                />
              </div>
              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full"
              >
                {isGenerating ? (
                  <>
                    <Sparkles className="mr-2 h-5 w-5 animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-5 w-5" />
                    生成报告
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* 右侧：报告展示 */}
        <div className="lg:col-span-3">
          {evaluation && (
            <div className="space-y-6">
              {/* 报告格式切换 */}
              <Card>
                <CardContent className="pt-6">
                  <Tabs defaultValue="visual" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="visual">可视化报告</TabsTrigger>
                      <TabsTrigger value="text">文本报告</TabsTrigger>
                    </TabsList>

                    {/* 可视化报告 */}
                    <TabsContent value="visual" className="mt-6">
              {/* 总体评价 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>面试综合评估报告</span>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        <Printer className="mr-2 h-4 w-4" />
                        打印
                      </Button>
                      <Button variant="outline" size="sm">
                        <Download className="mr-2 h-4 w-4" />
                        下载
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <span className="text-gray-500">候选人：</span>
                      <span className="font-medium ml-2">{candidateName}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">岗位：</span>
                      <span className="font-medium ml-2">{positionTitle}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 综合得分 */}
              <Card>
                <CardHeader>
                  <CardTitle>综合得分</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center py-8">
                    <div className="relative">
                      <div className={`w-32 h-32 rounded-full ${getScoreBackground(evaluation.fitScore)} flex items-center justify-center`}>
                        <div className="text-center">
                          <div className={`text-5xl font-bold ${getScoreColor(evaluation.fitScore)}`}>
                            {evaluation.fitScore}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">总分</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-2 mt-4">
                    {evaluation.fitVerdict === "是" ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                    <span className="font-medium">岗位适配度：{evaluation.fitVerdict === "是" ? "适配" : "不适配"}</span>
                  </div>
                  <p className="mt-4 text-gray-700 text-center">{evaluation.fitReason}</p>
                </CardContent>
              </Card>

              {/* 评分维度 */}
              <Card>
                <CardHeader>
                  <CardTitle>多维度评价</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: "硬技能匹配度", score: evaluation.hardSkillScore },
                      { label: "工作经验适配度", score: evaluation.experienceScore },
                      { label: "沟通表达能力", score: evaluation.communicationScore },
                      { label: "问题解决能力", score: evaluation.problemSolvingScore },
                      { label: "职业素养", score: evaluation.professionalismScore },
                      { label: "团队协作能力", score: evaluation.teamCollaborationScore },
                      { label: "学习能力", score: evaluation.learningAbilityScore },
                      { label: "抗压能力", score: evaluation.stressResistanceScore },
                    ].map((item, index) => (
                      <div
                        key={index}
                        className={`p-4 rounded-lg ${getScoreBackground(item.score)}`}
                      >
                        <div className="text-sm text-gray-600 mb-2">{item.label}</div>
                        <div className={`text-2xl font-bold ${getScoreColor(item.score)}`}>
                          {item.score}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">/ 10分</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* 优势与不足 */}
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Star className="h-5 w-5 text-yellow-500" />
                      候选人优势
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {evaluation.strengths && evaluation.strengths.length > 0 ? (
                      <div className="space-y-3">
                        {evaluation.strengths.map((strength, index) => (
                          <div key={index} className="border-l-2 border-green-500 pl-3">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {strength.dimension}
                              </Badge>
                              <span className={`font-medium ${getScoreColor(strength.score)}`}>
                                {strength.score}分
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 mt-1">{strength.description}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">暂无优势记录</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-orange-500" />
                      候选人不足
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {evaluation.weaknesses && evaluation.weaknesses.length > 0 ? (
                      <div className="space-y-3">
                        {evaluation.weaknesses.map((weakness, index) => (
                          <div key={index} className="border-l-2 border-orange-500 pl-3">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {weakness.dimension}
                              </Badge>
                              <span className={`font-medium ${getScoreColor(weakness.score)}`}>
                                {weakness.score}分
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 mt-1">{weakness.description}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">暂无不足记录</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* 其他信息 */}
              <Card>
                <CardHeader>
                  <CardTitle>其他评估信息</CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="highlights">
                    <TabsList className="grid w-full grid-cols-5">
                      <TabsTrigger value="highlights">亮点</TabsTrigger>
                      <TabsTrigger value="doubts">疑点</TabsTrigger>
                      <TabsTrigger value="concerns">关注点</TabsTrigger>
                      <TabsTrigger value="retest">复试建议</TabsTrigger>
                      <TabsTrigger value="intention">意向度</TabsTrigger>
                    </TabsList>

                    <TabsContent value="highlights" className="mt-4">
                      {evaluation.highlights && evaluation.highlights.length > 0 ? (
                        <ul className="space-y-2">
                          {evaluation.highlights.map((item, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <Star className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                              <span className="text-sm text-gray-700">{item}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-gray-500 text-sm">暂无亮点记录</p>
                      )}
                    </TabsContent>

                    <TabsContent value="doubts" className="mt-4">
                      {evaluation.doubtPoints && evaluation.doubtPoints.length > 0 ? (
                        <ul className="space-y-2">
                          {evaluation.doubtPoints.map((item, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                              <span className="text-sm text-gray-700">{item}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-gray-500 text-sm">暂无疑点记录</p>
                      )}
                    </TabsContent>

                    <TabsContent value="concerns" className="mt-4">
                      {evaluation.concerns && evaluation.concerns.length > 0 ? (
                        <ul className="space-y-2">
                          {evaluation.concerns.map((item, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                              <span className="text-sm text-gray-700">{item}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-gray-500 text-sm">暂无关注点</p>
                      )}
                    </TabsContent>

                    <TabsContent value="retest" className="mt-4">
                      <div className="space-y-4">
                        <div>
                          <div className="text-sm font-medium mb-2">复试建议</div>
                          <p className="text-sm text-gray-700">{evaluation.retestRecommendation}</p>
                        </div>
                        {evaluation.retestFocus && evaluation.retestFocus.length > 0 && (
                          <div>
                            <div className="text-sm font-medium mb-2">重点考察</div>
                            <div className="flex flex-wrap gap-2">
                              {evaluation.retestFocus.map((item, index) => (
                                <Badge key={index} variant="outline">
                                  {item}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="intention" className="mt-4">
                      <div className="flex items-center gap-4">
                        <div className="text-3xl font-bold">
                          {evaluation.intention === "high" && "🟢 高"}
                          {evaluation.intention === "medium" && "🟡 中"}
                          {evaluation.intention === "low" && "🔴 低"}
                        </div>
                        <div className="text-sm text-gray-600">
                          候选人的求职意向度
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
                  </TabsContent>

                  {/* 文本报告 */}
                  <TabsContent value="text" className="mt-6">
                    <div className="space-y-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center justify-between">
                            <span>文本格式报告</span>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  navigator.clipboard.writeText(markdownReport);
                                  alert('已复制到剪贴板');
                                }}
                              >
                                复制报告
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const blob = new Blob([markdownReport], { type: 'text/markdown' });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `${candidateName || '示例'}_${positionTitle || '报告'}_面试报告.md`;
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                  URL.revokeObjectURL(url);
                                }}
                              >
                                <Download className="mr-2 h-4 w-4" />
                                下载报告
                              </Button>
                            </div>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="bg-gray-50 rounded-lg p-4 overflow-hidden max-h-[800px] w-full">
                            <div className="text-sm text-gray-700 font-sans leading-relaxed overflow-wrap-break-word w-full" style={{ wordWrap: 'break-word', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                              <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed" style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', overflowWrap: 'break-word', wordBreak: 'break-word', maxWidth: '100%' }}>
                                {markdownReport}
                              </pre>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>
                </Tabs>
                </CardContent>
              </Card>
            </div>
          )}

          {!evaluation && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Sparkles className="h-16 w-16 text-gray-300 mb-4" />
                <p className="text-gray-500 text-center">
                  请在左侧填写面试信息<br />点击生成按钮创建评估报告
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* 录屏播放器弹窗 */}
      {showVideoPlayer && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.8)" }}
          onClick={() => setShowVideoPlayer(false)}
        >
          <div className="relative w-full max-w-5xl mx-4" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="outline"
              size="icon"
              className="absolute -top-12 right-0 z-10 bg-white"
              onClick={() => setShowVideoPlayer(false)}
            >
              <XCircle className="h-5 w-5" />
            </Button>
            <div className="bg-black rounded-lg overflow-hidden">
              <video
                src={currentVideoUrl}
                controls
                autoPlay
                className="w-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
