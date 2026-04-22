"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { SuperAdminGuard } from "@/components/super-admin-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_INTERVIEWER_VOICE_ID,
  INTERVIEWER_VOICE_OPTIONS,
  getInterviewerVoiceOption,
} from "@/lib/interviewer-voice";
import { fetchClientJson } from "@/lib/client-api";
import {
  createDefaultInterviewerVoiceTtsSettings,
  normalizeInterviewerVoiceTtsSettings,
  type InterviewerVoiceTtsSettings,
} from "@/lib/interviewer-voice-tts";

interface InterviewerVoiceSettingsResponse {
  success: boolean;
  data?: {
    voiceId: string;
    ttsSettings?: InterviewerVoiceTtsSettings;
  };
  error?: string;
}

export default function InterviewerVoiceSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [voiceId, setVoiceId] = useState(DEFAULT_INTERVIEWER_VOICE_ID);
  const [ttsSettings, setTtsSettings] = useState<InterviewerVoiceTtsSettings>(
    createDefaultInterviewerVoiceTtsSettings
  );

  const selectedVoice = getInterviewerVoiceOption(voiceId);

  const loadSettings = useCallback(async () => {
    setLoading(true);

    try {
      const result = await fetchClientJson<InterviewerVoiceSettingsResponse>(
        "/api/full-ai-interview/interviewer-voice"
      );

      setVoiceId(result.data?.voiceId || DEFAULT_INTERVIEWER_VOICE_ID);
      const normalizedTtsSettings = normalizeInterviewerVoiceTtsSettings(result.data?.ttsSettings);
      setTtsSettings({
        ...normalizedTtsSettings,
        meloTts: {
          ...normalizedTtsSettings.meloTts,
          enabled: false,
        },
      });
    } catch (error) {
      console.error("[音色设置] 加载失败:", error);
      toast.error("加载 AI 面试官音色设置失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const updateMeloField = useCallback(
    <K extends keyof InterviewerVoiceTtsSettings["meloTts"]>(
      key: K,
      value: InterviewerVoiceTtsSettings["meloTts"][K]
    ) => {
      setTtsSettings((current) => ({
        ...current,
        meloTts: {
          ...current.meloTts,
          [key]: value,
        },
      }));
    },
    []
  );

  const handleSave = useCallback(async () => {
    setSaving(true);

    try {
      const disabledTtsSettings = {
        ...ttsSettings,
        meloTts: {
          ...ttsSettings.meloTts,
          enabled: false,
        },
      };

      const result = await fetchClientJson<InterviewerVoiceSettingsResponse>(
        "/api/full-ai-interview/interviewer-voice",
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            voiceId,
            ttsSettings: disabledTtsSettings,
          }),
        }
      );

      setVoiceId(result.data?.voiceId || voiceId);
      const normalizedTtsSettings = normalizeInterviewerVoiceTtsSettings(
        result.data?.ttsSettings,
        disabledTtsSettings
      );
      setTtsSettings({
        ...normalizedTtsSettings,
        meloTts: {
          ...normalizedTtsSettings.meloTts,
          enabled: false,
        },
      });
      toast.success("AI 面试官音色设置已保存");
    } catch (error) {
      console.error("[音色设置] 保存失败:", error);
      toast.error("保存 AI 面试官音色设置失败");
    } finally {
      setSaving(false);
    }
  }, [ttsSettings, voiceId]);

  return (
    <SuperAdminGuard>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">AI 面试官音色设置</h1>
            <p className="mt-1 text-sm text-gray-600">
              管理全局默认音色。当前不再使用本地 MeloTTS，失败时直接回退到浏览器朗读。
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void loadSettings()} disabled={loading || saving}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              刷新
            </Button>
            <Button onClick={() => void handleSave()} disabled={loading || saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              保存设置
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>全局默认音色</CardTitle>
            <CardDescription>
              这里设置的是创建 AI 面试链接时默认使用的面试官音色风格。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="global-interviewer-voice">默认音色</Label>
              <Select value={voiceId} onValueChange={setVoiceId}>
                <SelectTrigger id="global-interviewer-voice">
                  <SelectValue placeholder="请选择默认音色" />
                </SelectTrigger>
                <SelectContent>
                  {INTERVIEWER_VOICE_OPTIONS.map((voice) => (
                    <SelectItem key={voice.id} value={voice.id}>
                      {voice.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border bg-gray-50 p-4 text-sm text-gray-600">
              <div className="font-medium text-gray-900">{selectedVoice.label}</div>
              <p className="mt-1">{selectedVoice.description}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>本地 TTS 调度顺序</CardTitle>
            <CardDescription>
              当前链路固定为 豆包 TTS 优先，失败后直接回退到浏览器朗读。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              豆包 TTS → 浏览器朗读
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>本地 MeloTTS（已禁用）</CardTitle>
            <CardDescription>
              当前版本不再调用本地 MeloTTS，相关配置仅作为历史信息保留。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="space-y-1">
                <div className="font-medium text-amber-900">已停用 MeloTTS</div>
                <p className="text-sm text-amber-700">系统只保留豆包 TTS 与浏览器朗读兜底，不再调用本地 sidecar。</p>
              </div>
              <Switch
                checked={ttsSettings.meloTts.enabled}
                disabled
                onCheckedChange={(checked) => updateMeloField("enabled", checked)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="melotts-base-url">MeloTTS Base URL</Label>
              <Input
                id="melotts-base-url"
                value={ttsSettings.meloTts.baseUrl}
                disabled
                onChange={(event) => updateMeloField("baseUrl", event.target.value)}
                placeholder="http://127.0.0.1:5001"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </SuperAdminGuard>
  );
}
