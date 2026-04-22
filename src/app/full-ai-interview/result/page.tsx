"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Star, Loader2, Video, Download } from "lucide-react";

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
  error?: string;
}

interface InterviewResult {
  id: string;
  linkId: string;
  interviewId: string;
  candidateName: string;
  position: string;
  evaluation: Evaluation;
  recordingKey: string;
  recordingUrl: string;
  completedAt: string;
  createdAt: string;
}

export default function FullAiInterviewResultPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const interviewId = searchParams.get("id") || searchParams.get("interviewId") || "";

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<InterviewResult | null>(null);
  const [error, setError] = useState("");
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [loadingRecording, setLoadingRecording] = useState(false);

  useEffect(() => {
    loadInterviewResult();
  }, [interviewId]);

  const loadInterviewResult = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/full-ai-interview/save-result?id=${interviewId}`);

      const data = await response.json();

      if (data.success && data.result) {
        setResult(data.result);

        // 如果有录屏，获取录屏的签名 URL
        if (data.result.recordingKey) {
          loadRecordingUrl(data.result.recordingKey, data.result.interviewId);
        }
      } else {
        setError(data.error || "面试结果不存在");
      }
    } catch (err) {
      console.error("加载面试结果失败:", err);
      setError("加载面试结果失败");
    } finally {
      setLoading(false);
    }
  };

  const loadRecordingUrl = async (recordingKey: string, interviewId: string) => {
    try {
      setLoadingRecording(true);
      const response = await fetch(`/api/full-ai-interview/recording-url?interviewId=${encodeURIComponent(interviewId)}&key=${encodeURIComponent(recordingKey)}`);
      const data = await response.json();

      if (data.success && data.data?.url) {
        setRecordingUrl(data.data.url);
      }
    } catch (err) {
      console.error("加载录屏 URL 失败:", err);
    } finally {
      setLoadingRecording(false);
    }
  };

  const handleDownloadRecording = async () => {
    if (!result?.recordingKey) {
      return;
    }

    try {
      // 使用后端下载 API，确保正确的 Content-Type
      const downloadUrl = `/api/full-ai-interview/download-recording?interviewId=${encodeURIComponent(result.interviewId)}&key=${encodeURIComponent(result.recordingKey)}`;
      const response = await fetch(downloadUrl);

      if (!response.ok) {
        throw new Error(`下载失败: ${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `面试录屏-${result?.candidateName || 'unknown'}-${new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, ' ')}.webm`;
      link.click();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("下载录屏失败:", err);
      alert("下载录屏失败，请稍后重试");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-600" />
          <p className="text-gray-600">正在加载面试结果...</p>
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-8">
        <div className="max-w-2xl w-full">
          <Card className="shadow-2xl border-0">
            <CardContent className="pt-12 pb-12 text-center">
              <p className="text-gray-600 mb-6">{error || "面试结果不存在"}</p>
              <Button onClick={() => router.back()}>
                返回
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        <Card className="shadow-2xl border-0">
          <CardContent className="pt-16 pb-16 px-12 text-center">
            {/* 成功图标 */}
            <div className="mb-8 flex justify-center">
              <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="h-16 w-16 text-green-600" />
              </div>
            </div>

            {/* 标题 */}
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              面试已结束
            </h1>

            {/* 说明文字 */}
            <p className="text-gray-600 text-lg mb-12 leading-relaxed">
              感谢您完成本次AI面试。您的面试记录和评估报告已生成，面试官将尽快查看并反馈结果。
            </p>

            {/* 温馨提示 */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 mb-8 text-left">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-600" />
                温馨提示
              </h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-3 text-gray-700">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>您的面试视频已录制并保存</span>
                </li>
                <li className="flex items-start gap-3 text-gray-700">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>AI面试官已根据您的表现生成评估报告</span>
                </li>
                <li className="flex items-start gap-3 text-gray-700">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>HR将在 1-3 个工作日内联系您反馈结果</span>
                </li>
              </ul>
            </div>

            {/* 录屏预览和下载 */}
            {result.recordingKey && (
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 mb-8 text-left">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Video className="h-5 w-5 text-purple-600" />
                  面试录屏
                </h3>

                {recordingUrl ? (
                  <div className="space-y-4">
                    {/* 录屏预览 */}
                    <div className="rounded-lg overflow-hidden bg-black">
                      <video
                        controls
                        className="w-full max-h-96"
                        preload="metadata"
                      >
                        <source src={recordingUrl} type="video/webm" />
                        您的浏览器不支持视频播放。
                      </video>
                    </div>

                    {/* 下载按钮 */}
                    <Button
                      onClick={handleDownloadRecording}
                      variant="outline"
                      className="w-full"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      下载录屏
                    </Button>
                  </div>
                ) : loadingRecording ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-purple-600 mr-2" />
                    <span className="text-gray-600">正在加载录屏...</span>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    录屏加载失败，请稍后重试
                  </div>
                )}
              </div>
            )}

            {/* 按钮 */}
            <Button
              size="lg"
              onClick={() => router.back()}
              className="px-12"
            >
              返回
            </Button>
          </CardContent>
        </Card>

        {/* 页脚信息 */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>面试ID: {result.interviewId}</p>
          <p className="mt-1">
            面试时间: {new Date(result.completedAt).toLocaleString('zh-CN')}
          </p>
        </div>
      </div>
    </div>
  );
}
