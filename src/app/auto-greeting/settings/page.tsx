'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchClient } from '@/lib/client-api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChevronLeft } from 'lucide-react';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

/**
 * 系统配置页面
 */
export default function SettingsPage() {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // 通用配置
  const [generalSettings, setGeneralSettings] = useState({
    autoGreetingEnabled: true,
    autoReplyEnabled: true,
    maxDailyGreetings: 100,
    // 打招呼间隔区间（秒）
    greetingIntervalMin: 25,
    greetingIntervalMax: 45,
    // 回复延迟区间（秒）
    replyDelayMin: 30,
    replyDelayMax: 90,
    workingHoursStart: '09:00',
    workingHoursEnd: '18:00',
    weekendEnabled: false,
  });

  // 风控配置
  const [riskSettings, setRiskSettings] = useState({
    maxDailyGreetingsPerAccount: 50,
    maxHourlyGreetings: 10,
    // 最小打招呼间隔区间（秒）
    minGreetingIntervalMin: 20,
    minGreetingIntervalMax: 40,
    maxRetryCount: 3,
    riskThreshold: 80,
    autoBlacklistEnabled: true,
    sensitiveWordsEnabled: true,
  });

  // 匹配配置
  const [matchingSettings, setMatchingSettings] = useState({
    matchThreshold: 60,
    skillWeight: 40,
    experienceWeight: 30,
    locationWeight: 20,
    salaryWeight: 10,
  });

  // 对话配置
  const [conversationSettings, setConversationSettings] = useState({
    maxConversationRounds: 20,
    intentThreshold: 70,
    sentimentThreshold: 30,
    maxFollowUpDays: 7,
    secondGreetingEnabled: true,
    secondGreetingDays: 3,
  });

  // 平台配置
  const [platformConfigs, setPlatformConfigs] = useState([
    {
      id: 'boss',
      name: 'BOSS直聘',
      enabled: true,
      config: {
        cookie: '',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        dailyLimit: 100,
      },
    },
    {
      id: 'liepin',
      name: '猎聘',
      enabled: false,
      config: {
        cookie: '',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        dailyLimit: 50,
      },
    },
    {
      id: 'zhilian',
      name: '智联招聘',
      enabled: false,
      config: {
        cookie: '',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        dailyLimit: 50,
      },
    },
  ]);

  // 敏感词配置
  const [sensitiveWords, setSensitiveWords] = useState<string[]>([
    '微信',
    '电话',
    '加我',
    '私聊',
    '直接面试',
  ]);

  // 通知配置
  const [notificationSettings, setNotificationSettings] = useState({
    interviewNotify: true,
    blacklistNotify: true,
    errorNotify: true,
    dailyReport: true,
    notifyEmail: '',
    notifyWebhook: '',
  });

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetchClient('/api/auto-greeting/settings');
        const data = await response.json();
        if (!data.success || !data.data) {
          return;
        }

        const config = data.data as Record<string, any>;

        if (config.general) {
          setGeneralSettings(current => ({ ...current, ...config.general }));
        }
        if (config.risk) {
          setRiskSettings(current => ({ ...current, ...config.risk }));
        }
        if (config.matching) {
          setMatchingSettings(current => ({ ...current, ...config.matching }));
        }
        if (config.conversation) {
          setConversationSettings(current => ({ ...current, ...config.conversation }));
        }
        if (config.notification) {
          setNotificationSettings(current => ({ ...current, ...config.notification }));
        }
        if (Array.isArray(config.sensitiveWords)) {
          setSensitiveWords(config.sensitiveWords.map(item => String(item)).filter(Boolean));
        }
        if (config.platforms && typeof config.platforms === 'object') {
          setPlatformConfigs(Object.values(config.platforms));
        }
      } catch (error) {
        console.error('加载配置失败:', error);
      }
    };

    void loadSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      // 保存所有配置
      const response = await fetchClient('/api/auto-greeting/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          general: generalSettings,
          risk: riskSettings,
          matching: matchingSettings,
          conversation: conversationSettings,
          platforms: platformConfigs,
          sensitiveWords,
          notification: notificationSettings,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (error) {
      console.error('保存配置失败:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleExportLogs = async () => {
    try {
      const response = await fetchClient('/api/auto-greeting/logs?pageSize=1000');
      const data = await response.json();
      if (data.success) {
        const blob = new Blob([JSON.stringify(data.data.list, null, 2)], { 
          type: 'application/json' 
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `operation_logs_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('导出日志失败:', error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航 */}
      <nav className="border-b bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link 
                href="/auto-greeting" 
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors mr-4"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="text-sm">返回</span>
              </Link>
              <div className="w-px h-6 bg-border mx-2" />
              <Link 
                href="/auto-greeting" 
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                自动打招呼
              </Link>
              <span className="text-muted-foreground mx-2">/</span>
              <span className="text-sm font-medium">系统配置</span>
            </div>
            <div className="flex items-center gap-4">
              {saved && (
                <Badge variant="default" className="bg-green-500">
                  已保存
                </Badge>
              )}
              <Button onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存配置'}
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="general" className="space-y-6">
          <TabsList>
            <TabsTrigger value="general">通用配置</TabsTrigger>
            <TabsTrigger value="risk">风控配置</TabsTrigger>
            <TabsTrigger value="matching">匹配配置</TabsTrigger>
            <TabsTrigger value="conversation">对话配置</TabsTrigger>
            <TabsTrigger value="platform">平台配置</TabsTrigger>
            <TabsTrigger value="notification">通知配置</TabsTrigger>
          </TabsList>

          {/* 通用配置 */}
          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>通用配置</CardTitle>
                <CardDescription>配置自动打招呼的基本行为</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>自动打招呼</Label>
                    <p className="text-sm text-muted-foreground">
                      开启后系统将自动向匹配的候选人发送打招呼消息
                    </p>
                  </div>
                  <Switch
                    checked={generalSettings.autoGreetingEnabled}
                    onCheckedChange={(checked) => 
                      setGeneralSettings({ ...generalSettings, autoGreetingEnabled: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>自动回复</Label>
                    <p className="text-sm text-muted-foreground">
                      开启后系统将自动回复候选人的消息
                    </p>
                  </div>
                  <Switch
                    checked={generalSettings.autoReplyEnabled}
                    onCheckedChange={(checked) => 
                      setGeneralSettings({ ...generalSettings, autoReplyEnabled: checked })
                    }
                  />
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>每日最大打招呼数</Label>
                    <Input
                      type="number"
                      value={generalSettings.maxDailyGreetings}
                      onChange={(e) => 
                        setGeneralSettings({ 
                          ...generalSettings, 
                          maxDailyGreetings: parseInt(e.target.value) 
                        })
                      }
                    />
                  </div>
                </div>

                <div>
                  <Label>打招呼间隔（秒）</Label>
                  <p className="text-sm text-muted-foreground mb-2">
                    系统将在此区间内随机选择等待时间，模拟真人行为
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      placeholder="最小值"
                      value={generalSettings.greetingIntervalMin}
                      onChange={(e) => 
                        setGeneralSettings({ 
                          ...generalSettings, 
                          greetingIntervalMin: parseInt(e.target.value) 
                        })
                      }
                    />
                    <span className="text-muted-foreground">~</span>
                    <Input
                      type="number"
                      placeholder="最大值"
                      value={generalSettings.greetingIntervalMax}
                      onChange={(e) => 
                        setGeneralSettings({ 
                          ...generalSettings, 
                          greetingIntervalMax: parseInt(e.target.value) 
                        })
                      }
                    />
                    <span className="text-muted-foreground text-sm whitespace-nowrap">秒</span>
                  </div>
                </div>

                <div>
                  <Label>回复延迟（秒）</Label>
                  <p className="text-sm text-muted-foreground mb-2">
                    收到消息后延迟回复的时间区间，模拟真人思考时间
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      placeholder="最小值"
                      value={generalSettings.replyDelayMin}
                      onChange={(e) => 
                        setGeneralSettings({ 
                          ...generalSettings, 
                          replyDelayMin: parseInt(e.target.value) 
                        })
                      }
                    />
                    <span className="text-muted-foreground">~</span>
                    <Input
                      type="number"
                      placeholder="最大值"
                      value={generalSettings.replyDelayMax}
                      onChange={(e) => 
                        setGeneralSettings({ 
                          ...generalSettings, 
                          replyDelayMax: parseInt(e.target.value) 
                        })
                      }
                    />
                    <span className="text-muted-foreground text-sm whitespace-nowrap">秒</span>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>工作开始时间</Label>
                    <Input
                      type="time"
                      value={generalSettings.workingHoursStart}
                      onChange={(e) => 
                        setGeneralSettings({ 
                          ...generalSettings, 
                          workingHoursStart: e.target.value 
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>工作结束时间</Label>
                    <Input
                      type="time"
                      value={generalSettings.workingHoursEnd}
                      onChange={(e) => 
                        setGeneralSettings({ 
                          ...generalSettings, 
                          workingHoursEnd: e.target.value 
                        })
                      }
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>周末执行</Label>
                    <p className="text-sm text-muted-foreground">
                      开启后周末也会自动执行打招呼和回复
                    </p>
                  </div>
                  <Switch
                    checked={generalSettings.weekendEnabled}
                    onCheckedChange={(checked) => 
                      setGeneralSettings({ ...generalSettings, weekendEnabled: checked })
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 风控配置 */}
          <TabsContent value="risk">
            <Card>
              <CardHeader>
                <CardTitle>风控配置</CardTitle>
                <CardDescription>配置账号安全保护策略</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Alert>
                  <AlertDescription>
                    合理的风控配置可以有效保护账号安全，避免被平台检测为机器人
                  </AlertDescription>
                </Alert>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>单账号每日最大打招呼数</Label>
                    <Input
                      type="number"
                      value={riskSettings.maxDailyGreetingsPerAccount}
                      onChange={(e) => 
                        setRiskSettings({ 
                          ...riskSettings, 
                          maxDailyGreetingsPerAccount: parseInt(e.target.value) 
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>每小时最大打招呼数</Label>
                    <Input
                      type="number"
                      value={riskSettings.maxHourlyGreetings}
                      onChange={(e) => 
                        setRiskSettings({ 
                          ...riskSettings, 
                          maxHourlyGreetings: parseInt(e.target.value) 
                        })
                      }
                    />
                  </div>
                </div>

                <div>
                  <Label>最小打招呼间隔（秒）</Label>
                  <p className="text-sm text-muted-foreground mb-2">
                    两次打招呼之间的最小等待时间区间，用于风控保护
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      placeholder="最小值"
                      value={riskSettings.minGreetingIntervalMin}
                      onChange={(e) => 
                        setRiskSettings({ 
                          ...riskSettings, 
                          minGreetingIntervalMin: parseInt(e.target.value) 
                        })
                      }
                    />
                    <span className="text-muted-foreground">~</span>
                    <Input
                      type="number"
                      placeholder="最大值"
                      value={riskSettings.minGreetingIntervalMax}
                      onChange={(e) => 
                        setRiskSettings({ 
                          ...riskSettings, 
                          minGreetingIntervalMax: parseInt(e.target.value) 
                        })
                      }
                    />
                    <span className="text-muted-foreground text-sm whitespace-nowrap">秒</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>最大重试次数</Label>
                    <Input
                      type="number"
                      value={riskSettings.maxRetryCount}
                      onChange={(e) => 
                        setRiskSettings({ 
                          ...riskSettings, 
                          maxRetryCount: parseInt(e.target.value) 
                        })
                      }
                    />
                  </div>
                </div>

                <div>
                  <Label>风险阈值（0-100）</Label>
                  <p className="text-sm text-muted-foreground mb-2">
                    当风险分数超过此阈值时，系统将暂停操作
                  </p>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={riskSettings.riskThreshold}
                    onChange={(e) => 
                      setRiskSettings({ 
                        ...riskSettings, 
                        riskThreshold: parseInt(e.target.value) 
                      })
                    }
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label>自动拉黑</Label>
                    <p className="text-sm text-muted-foreground">
                      自动拉黑发送敏感信息的候选人
                    </p>
                  </div>
                  <Switch
                    checked={riskSettings.autoBlacklistEnabled}
                    onCheckedChange={(checked) => 
                      setRiskSettings({ ...riskSettings, autoBlacklistEnabled: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>敏感词检测</Label>
                    <p className="text-sm text-muted-foreground">
                      检测并过滤敏感词
                    </p>
                  </div>
                  <Switch
                    checked={riskSettings.sensitiveWordsEnabled}
                    onCheckedChange={(checked) => 
                      setRiskSettings({ ...riskSettings, sensitiveWordsEnabled: checked })
                    }
                  />
                </div>

                {riskSettings.sensitiveWordsEnabled && (
                  <div>
                    <Label>敏感词列表</Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      每行一个敏感词
                    </p>
                    <Textarea
                      rows={5}
                      value={sensitiveWords.join('\n')}
                      onChange={(e) => setSensitiveWords(e.target.value.split('\n').filter(Boolean))}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 匹配配置 */}
          <TabsContent value="matching">
            <Card>
              <CardHeader>
                <CardTitle>匹配配置</CardTitle>
                <CardDescription>配置候选人匹配规则和权重</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label>匹配阈值（0-100）</Label>
                  <p className="text-sm text-muted-foreground mb-2">
                    只有匹配分数超过此阈值的候选人才会被打招呼
                  </p>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={matchingSettings.matchThreshold}
                    onChange={(e) => 
                      setMatchingSettings({ 
                        ...matchingSettings, 
                        matchThreshold: parseInt(e.target.value) 
                      })
                    }
                  />
                </div>

                <Separator />

                <div>
                  <Label>匹配权重配置</Label>
                  <p className="text-sm text-muted-foreground mb-4">
                    各维度权重之和应为 100
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>技能匹配权重 (%)</Label>
                      <Input
                        type="number"
                        value={matchingSettings.skillWeight}
                        onChange={(e) => 
                          setMatchingSettings({ 
                            ...matchingSettings, 
                            skillWeight: parseInt(e.target.value) 
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>经验匹配权重 (%)</Label>
                      <Input
                        type="number"
                        value={matchingSettings.experienceWeight}
                        onChange={(e) => 
                          setMatchingSettings({ 
                            ...matchingSettings, 
                            experienceWeight: parseInt(e.target.value) 
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>地域匹配权重 (%)</Label>
                      <Input
                        type="number"
                        value={matchingSettings.locationWeight}
                        onChange={(e) => 
                          setMatchingSettings({ 
                            ...matchingSettings, 
                            locationWeight: parseInt(e.target.value) 
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>薪资匹配权重 (%)</Label>
                      <Input
                        type="number"
                        value={matchingSettings.salaryWeight}
                        onChange={(e) => 
                          setMatchingSettings({ 
                            ...matchingSettings, 
                            salaryWeight: parseInt(e.target.value) 
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 对话配置 */}
          <TabsContent value="conversation">
            <Card>
              <CardHeader>
                <CardTitle>对话配置</CardTitle>
                <CardDescription>配置对话策略和行为</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>最大对话轮数</Label>
                    <Input
                      type="number"
                      value={conversationSettings.maxConversationRounds}
                      onChange={(e) => 
                        setConversationSettings({ 
                          ...conversationSettings, 
                          maxConversationRounds: parseInt(e.target.value) 
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>意向识别阈值 (%)</Label>
                    <Input
                      type="number"
                      value={conversationSettings.intentThreshold}
                      onChange={(e) => 
                        setConversationSettings({ 
                          ...conversationSettings, 
                          intentThreshold: parseInt(e.target.value) 
                        })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>情感阈值 (%)</Label>
                    <p className="text-sm text-muted-foreground">
                      情感分数低于此值时将转人工
                    </p>
                    <Input
                      type="number"
                      value={conversationSettings.sentimentThreshold}
                      onChange={(e) => 
                        setConversationSettings({ 
                          ...conversationSettings, 
                          sentimentThreshold: parseInt(e.target.value) 
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>最大跟进天数</Label>
                    <Input
                      type="number"
                      value={conversationSettings.maxFollowUpDays}
                      onChange={(e) => 
                        setConversationSettings({ 
                          ...conversationSettings, 
                          maxFollowUpDays: parseInt(e.target.value) 
                        })
                      }
                    />
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <Label>二次打招呼</Label>
                    <p className="text-sm text-muted-foreground">
                      对未回复的候选人发送二次打招呼
                    </p>
                  </div>
                  <Switch
                    checked={conversationSettings.secondGreetingEnabled}
                    onCheckedChange={(checked) => 
                      setConversationSettings({ 
                        ...conversationSettings, 
                        secondGreetingEnabled: checked 
                      })
                    }
                  />
                </div>

                {conversationSettings.secondGreetingEnabled && (
                  <div>
                    <Label>二次打招呼间隔（天）</Label>
                    <Input
                      type="number"
                      value={conversationSettings.secondGreetingDays}
                      onChange={(e) => 
                        setConversationSettings({ 
                          ...conversationSettings, 
                          secondGreetingDays: parseInt(e.target.value) 
                        })
                      }
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 平台配置 */}
          <TabsContent value="platform">
            <Card>
              <CardHeader>
                <CardTitle>平台配置</CardTitle>
                <CardDescription>配置各招聘平台的连接参数</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {platformConfigs.map((platform, index) => (
                  <div key={platform.id} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{platform.name}</h4>
                        <Badge variant={platform.enabled ? 'default' : 'secondary'}>
                          {platform.enabled ? '已启用' : '未启用'}
                        </Badge>
                      </div>
                      <Switch
                        checked={platform.enabled}
                        onCheckedChange={(checked) => {
                          const newConfigs = [...platformConfigs];
                          newConfigs[index].enabled = checked;
                          setPlatformConfigs(newConfigs);
                        }}
                      />
                    </div>

                    {platform.enabled && (
                      <div className="grid grid-cols-2 gap-4 pl-4">
                        <div>
                          <Label>Cookie</Label>
                          <Input
                            type="password"
                            placeholder="输入平台Cookie"
                            value={platform.config.cookie}
                            onChange={(e) => {
                              const newConfigs = [...platformConfigs];
                              newConfigs[index].config.cookie = e.target.value;
                              setPlatformConfigs(newConfigs);
                            }}
                          />
                        </div>
                        <div>
                          <Label>每日限额</Label>
                          <Input
                            type="number"
                            value={platform.config.dailyLimit}
                            onChange={(e) => {
                              const newConfigs = [...platformConfigs];
                              newConfigs[index].config.dailyLimit = parseInt(e.target.value);
                              setPlatformConfigs(newConfigs);
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {index < platformConfigs.length - 1 && <Separator />}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 通知配置 */}
          <TabsContent value="notification">
            <Card>
              <CardHeader>
                <CardTitle>通知配置</CardTitle>
                <CardDescription>配置系统通知和报告</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>面试通知</Label>
                      <p className="text-sm text-muted-foreground">
                        候选人确认面试时发送通知
                      </p>
                    </div>
                    <Switch
                      checked={notificationSettings.interviewNotify}
                      onCheckedChange={(checked) => 
                        setNotificationSettings({ 
                          ...notificationSettings, 
                          interviewNotify: checked 
                        })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>拉黑通知</Label>
                      <p className="text-sm text-muted-foreground">
                        候选人被自动拉黑时发送通知
                      </p>
                    </div>
                    <Switch
                      checked={notificationSettings.blacklistNotify}
                      onCheckedChange={(checked) => 
                        setNotificationSettings({ 
                          ...notificationSettings, 
                          blacklistNotify: checked 
                        })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>错误通知</Label>
                      <p className="text-sm text-muted-foreground">
                        系统发生错误时发送通知
                      </p>
                    </div>
                    <Switch
                      checked={notificationSettings.errorNotify}
                      onCheckedChange={(checked) => 
                        setNotificationSettings({ 
                          ...notificationSettings, 
                          errorNotify: checked 
                        })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>每日报告</Label>
                      <p className="text-sm text-muted-foreground">
                        每日发送运营报告
                      </p>
                    </div>
                    <Switch
                      checked={notificationSettings.dailyReport}
                      onCheckedChange={(checked) => 
                        setNotificationSettings({ 
                          ...notificationSettings, 
                          dailyReport: checked 
                        })
                      }
                    />
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>通知邮箱</Label>
                    <Input
                      type="email"
                      placeholder="example@company.com"
                      value={notificationSettings.notifyEmail}
                      onChange={(e) => 
                        setNotificationSettings({ 
                          ...notificationSettings, 
                          notifyEmail: e.target.value 
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>Webhook URL</Label>
                    <Input
                      type="url"
                      placeholder="https://your-webhook-url"
                      value={notificationSettings.notifyWebhook}
                      onChange={(e) => 
                        setNotificationSettings({ 
                          ...notificationSettings, 
                          notifyWebhook: e.target.value 
                        })
                      }
                    />
                  </div>
                </div>

                <Separator />

                <div className="flex gap-4">
                  <Button variant="outline" onClick={handleExportLogs}>
                    导出操作日志
                  </Button>
                  <Button variant="outline">
                    导出配置
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
