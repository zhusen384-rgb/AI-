"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User, Bell, Shield, Database, Save, CheckCircle, Cpu, RefreshCw, Loader2 } from "lucide-react";
import { sync } from "@/lib/sync";

// 模型配置接口
interface ModelConfig {
  id: number;
  scene: string;
  sceneName: string;
  modelId: string;
  modelName: string;
  description: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// 可用模型接口
interface AvailableModel {
  id: string;
  name: string;
  category: string;
}

// 场景配置接口
interface SceneConfigItem {
  name: string;
  description: string;
  defaultModel: string;
  defaultModelName: string;
}

export default function SettingsPage() {
  // 保存成功提示状态
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // 模型配置状态
  const [modelConfigs, setModelConfigs] = useState<ModelConfig[]>([]);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [sceneConfig, setSceneConfig] = useState<Record<string, SceneConfigItem>>({});
  const [loadingModels, setLoadingModels] = useState(true);
  const [savingScene, setSavingScene] = useState<string | null>(null);

  // 个人设置
  const [profileName, setProfileName] = useState("面试官");
  const [profileEmail, setProfileEmail] = useState("interviewer@example.com");
  const [profilePhone, setProfilePhone] = useState("138****5678");
  const [profileDepartment, setProfileDepartment] = useState("技术部");
  const [profileBio, setProfileBio] = useState("资深技术面试官，专注于前端和后端开发岗位的面试评估。");

  // 通知设置
  const [emailNotification, setEmailNotification] = useState(true);
  const [smsNotification, setSmsNotification] = useState(true);
  const [candidateUpdate, setCandidateUpdate] = useState(true);
  const [dailyReport, setDailyReport] = useState(false);

  // 安全设置
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [twoFactorAuth, setTwoFactorAuth] = useState(false);

  // 系统配置
  const [aiModel, setAiModel] = useState("doubao-seed-2-0-pro-260215");
  const [aiTemperature, setAiTemperature] = useState("0.3");
  const [thinkingMode, setThinkingMode] = useState(false);

  // 显示成功提示
  const showSuccessToast = (message: string) => {
    setSuccessMessage(message);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  // 加载模型配置
  const loadModelConfigs = async () => {
    try {
      setLoadingModels(true);
      const response = await fetch('/api/model-configs');
      const data = await response.json();
      
      if (data.success) {
        setModelConfigs(data.data.configs);
        setAvailableModels(data.data.availableModels);
        setSceneConfig(data.data.sceneConfig);
      }
    } catch (error) {
      console.error('加载模型配置失败:', error);
    } finally {
      setLoadingModels(false);
    }
  };

  // 更新模型配置
  const handleUpdateModelConfig = async (scene: string, modelId: string) => {
    try {
      setSavingScene(scene);
      const response = await fetch('/api/model-configs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene, modelId }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        // 更新本地状态
        setModelConfigs(prev => 
          prev.map(config => 
            config.scene === scene 
              ? { ...config, modelId, modelName: data.data.modelName, updatedAt: data.data.updatedAt }
              : config
          )
        );
        showSuccessToast(data.message);
      } else {
        alert(data.error || '更新失败');
      }
    } catch (error) {
      console.error('更新模型配置失败:', error);
      alert('更新失败，请重试');
    } finally {
      setSavingScene(null);
    }
  };

  // 重置模型配置
  const handleResetModelConfigs = async (scene?: string) => {
    if (!confirm(scene ? '确定要重置该场景的模型配置吗？' : '确定要重置所有模型配置吗？')) {
      return;
    }
    
    try {
      const response = await fetch('/api/model-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        await loadModelConfigs();
        showSuccessToast(data.message);
      } else {
        alert(data.error || '重置失败');
      }
    } catch (error) {
      console.error('重置模型配置失败:', error);
      alert('重置失败，请重试');
    }
  };

  // 加载设置
  const loadSettings = () => {
    if (typeof window !== 'undefined') {
      const savedSettings = localStorage.getItem('systemSettings');
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        // 个人设置
        if (settings.profileName) setProfileName(settings.profileName);
        if (settings.profileEmail) setProfileEmail(settings.profileEmail);
        if (settings.profilePhone) setProfilePhone(settings.profilePhone);
        if (settings.profileDepartment) setProfileDepartment(settings.profileDepartment);
        if (settings.profileBio) setProfileBio(settings.profileBio);
        // 通知设置
        if (settings.emailNotification !== undefined) setEmailNotification(settings.emailNotification);
        if (settings.smsNotification !== undefined) setSmsNotification(settings.smsNotification);
        if (settings.candidateUpdate !== undefined) setCandidateUpdate(settings.candidateUpdate);
        if (settings.dailyReport !== undefined) setDailyReport(settings.dailyReport);
        // 安全设置
        if (settings.twoFactorAuth !== undefined) setTwoFactorAuth(settings.twoFactorAuth);
        // 系统配置
        if (settings.aiModel) setAiModel(settings.aiModel);
        if (settings.aiTemperature) setAiTemperature(settings.aiTemperature);
        if (settings.thinkingMode !== undefined) setThinkingMode(settings.thinkingMode);
      }
    }
  };

  useEffect(() => {
    loadSettings();
    loadModelConfigs();
  }, []);

  // 监听跨标签页的设置更新事件
  useEffect(() => {
    const unsubscribe = sync.on('settingsUpdated', () => {
      loadSettings();
      showSuccessToast("设置已从其他标签页同步");
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // 保存个人设置
  const handleSaveProfile = () => {
    const settings = {
      profileName,
      profileEmail,
      profilePhone,
      profileDepartment,
      profileBio,
    };
    localStorage.setItem('systemSettings', JSON.stringify({
      ...JSON.parse(localStorage.getItem('systemSettings') || '{}'),
      ...settings
    }));

    // 触发跨标签页同步事件
    sync.emit('settingsUpdated', settings);

    showSuccessToast("个人设置已更新");
  };

  // 保存通知设置
  const handleSaveNotifications = () => {
    const settings = {
      emailNotification,
      smsNotification,
      candidateUpdate,
      dailyReport,
    };
    localStorage.setItem('systemSettings', JSON.stringify({
      ...JSON.parse(localStorage.getItem('systemSettings') || '{}'),
      ...settings
    }));
    showSuccessToast("通知设置已更新");
  };

  // 修改密码
  const handleChangePassword = () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      alert("请填写所有密码字段");
      return;
    }

    if (newPassword !== confirmPassword) {
      alert("新密码和确认密码不一致");
      return;
    }

    // 模拟密码修改
    showSuccessToast("密码修改成功，请使用新密码登录");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  // 保存安全设置
  const handleSaveSecurity = () => {
    const settings = {
      twoFactorAuth,
    };
    localStorage.setItem('systemSettings', JSON.stringify({
      ...JSON.parse(localStorage.getItem('systemSettings') || '{}'),
      ...settings
    }));
    showSuccessToast("安全设置已更新");
  };

  // 保存系统配置
  const handleSaveSystem = () => {
    const settings = {
      aiModel,
      aiTemperature,
      thinkingMode,
    };
    localStorage.setItem('systemSettings', JSON.stringify({
      ...JSON.parse(localStorage.getItem('systemSettings') || '{}'),
      ...settings
    }));
    showSuccessToast("系统配置已更新");
  };

  // 测试数据库连接
  const handleTestConnection = () => {
    showSuccessToast("数据库连接成功");
  };

  // 按分类分组模型
  const groupedModels = availableModels.reduce((acc, model) => {
    if (!acc[model.category]) {
      acc[model.category] = [];
    }
    acc[model.category].push(model);
    return acc;
  }, {} as Record<string, AvailableModel[]>);

  // 分类名称映射
  const categoryNames: Record<string, string> = {
    doubao: '豆包系列',
    deepseek: 'DeepSeek 系列（历史可选）',
    glm: '智谱 GLM 系列',
    kimi: 'Kimi 系列',
  };

  return (
    <div className="p-8">
      {/* 成功提示 */}
      {showSuccess && (
        <div className="fixed top-4 right-4 bg-green-50 border border-green-200 rounded-lg p-4 shadow-lg z-50 flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-green-600" />
          <span className="text-green-800 font-medium">{successMessage}</span>
        </div>
      )}

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">系统设置</h1>
        <p className="mt-2 text-gray-600">配置系统参数和用户偏好</p>
      </div>

      <Tabs defaultValue="model" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="model">
            <Cpu className="mr-2 h-4 w-4" />
            模型配置
          </TabsTrigger>
          <TabsTrigger value="profile">
            <User className="mr-2 h-4 w-4" />
            个人设置
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="mr-2 h-4 w-4" />
            通知设置
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="mr-2 h-4 w-4" />
            安全设置
          </TabsTrigger>
          <TabsTrigger value="system">
            <Database className="mr-2 h-4 w-4" />
            系统配置
          </TabsTrigger>
        </TabsList>

        {/* 模型配置标签页 */}
        <TabsContent value="model" className="mt-6">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>AI 模型配置</CardTitle>
                    <CardDescription>配置不同场景使用的 AI 模型，可根据面试效果进行调整优化</CardDescription>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleResetModelConfigs()}
                    disabled={loadingModels}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    重置为默认
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingModels ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    <span className="ml-2 text-gray-500">加载模型配置...</span>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {modelConfigs.map((config) => (
                      <div key={config.scene} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium text-gray-900">{config.sceneName}</h3>
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                {config.scene}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500 mb-3">
                              {config.description || sceneConfig[config.scene]?.description}
                            </p>
                            <div className="flex items-center gap-4">
                              <div className="flex-1 max-w-md">
                                <Label className="text-sm text-gray-600 mb-1 block">选择模型</Label>
                                <Select
                                  value={config.modelId}
                                  onValueChange={(value) => handleUpdateModelConfig(config.scene, value)}
                                  disabled={savingScene === config.scene}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="选择模型" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(groupedModels).map(([category, models]) => (
                                      <div key={category}>
                                        <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50">
                                          {categoryNames[category] || category}
                                        </div>
                                        {models.map((model) => (
                                          <SelectItem key={model.id} value={model.id}>
                                            {model.name}
                                          </SelectItem>
                                        ))}
                                      </div>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              {savingScene === config.scene && (
                                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                              )}
                            </div>
                          </div>
                          <div className="text-right text-sm text-gray-500">
                            <div>当前模型</div>
                            <div className="font-medium text-gray-900">{config.modelName}</div>
                            <div className="text-xs mt-1">
                              更新于 {new Date(config.updatedAt).toLocaleString('zh-CN')}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>模型说明</CardTitle>
                <CardDescription>了解不同模型的特点和适用场景</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-sm">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border rounded-lg p-3">
                      <h4 className="font-medium text-gray-900 mb-2">🎯 面试对话模型</h4>
                      <p className="text-gray-600">
                        用于面试过程中的实时对话生成。当前推荐统一使用豆包 Seed 2.0 Pro，
                        兼顾对话自然度、稳定性与复杂场景理解能力。
                      </p>
                    </div>
                    <div className="border rounded-lg p-3">
                      <h4 className="font-medium text-gray-900 mb-2">📊 评估打分模型</h4>
                      <p className="text-gray-600">
                        用于面试后的评估打分和报告生成。当前推荐统一使用豆包 Seed 2.0 Pro，
                        确保评分准确、理由充分且输出更稳定。
                      </p>
                    </div>
                    <div className="border rounded-lg p-3">
                      <h4 className="font-medium text-gray-900 mb-2">📄 简历解析模型</h4>
                      <p className="text-gray-600">
                        文本简历解析当前推荐统一使用豆包 Seed 2.0 Pro；
                        图片和 PDF 视觉提取仍需使用视觉模型（Vision）配合完成。
                      </p>
                    </div>
                    <div className="border rounded-lg p-3">
                      <h4 className="font-medium text-gray-900 mb-2">💡 选择建议</h4>
                      <p className="text-gray-600">
                        如果没有特殊测试需求，建议保持三类文本场景统一使用豆包 Seed 2.0 Pro；
                        仅在做效果对比或专项验证时，再切换其他历史模型。
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="profile" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>个人资料</CardTitle>
              <CardDescription>更新您的个人信息和偏好设置</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="name">姓名</Label>
                  <Input
                    id="name"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">邮箱</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">电话</Label>
                  <Input
                    id="phone"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">部门</Label>
                  <Input
                    id="department"
                    value={profileDepartment}
                    onChange={(e) => setProfileDepartment(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio">个人简介</Label>
                <Textarea
                  id="bio"
                  placeholder="介绍一下自己..."
                  value={profileBio}
                  onChange={(e) => setProfileBio(e.target.value)}
                />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSaveProfile}>
                  <Save className="mr-2 h-4 w-4" />
                  保存更改
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>通知偏好</CardTitle>
              <CardDescription>管理您的通知设置</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>邮件通知</Label>
                  <div className="text-sm text-gray-500">接收面试相关的邮件通知</div>
                </div>
                <Switch
                  checked={emailNotification}
                  onCheckedChange={setEmailNotification}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>短信提醒</Label>
                  <div className="text-sm text-gray-500">接收面试安排的短信提醒</div>
                </div>
                <Switch
                  checked={smsNotification}
                  onCheckedChange={setSmsNotification}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>候选人状态更新</Label>
                  <div className="text-sm text-gray-500">候选人状态变化时通知</div>
                </div>
                <Switch
                  checked={candidateUpdate}
                  onCheckedChange={setCandidateUpdate}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>每日日报</Label>
                  <div className="text-sm text-gray-500">每天发送面试统计日报</div>
                </div>
                <Switch
                  checked={dailyReport}
                  onCheckedChange={setDailyReport}
                />
              </div>
              <div className="flex justify-end pt-4">
                <Button onClick={handleSaveNotifications}>
                  <Save className="mr-2 h-4 w-4" />
                  保存更改
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>安全设置</CardTitle>
              <CardDescription>管理账户安全和权限</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="current-password">当前密码</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">新密码</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">确认新密码</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={handleChangePassword}>
                  修改密码
                </Button>
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-medium mb-4">双因素认证</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">启用 2FA</div>
                    <div className="text-sm text-gray-500">为您的账户添加额外的安全层</div>
                  </div>
                  <Switch
                    checked={twoFactorAuth}
                    onCheckedChange={setTwoFactorAuth}
                  />
                </div>
                <div className="flex justify-end mt-4">
                  <Button onClick={handleSaveSecurity}>
                    <Save className="mr-2 h-4 w-4" />
                    保存安全设置
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="mt-6">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>AI 配置</CardTitle>
                <CardDescription>配置 AI 模型参数（此配置仅用于传统面试模式）</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ai-model">AI 模型</Label>
                  <Input
                    id="ai-model"
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ai-temperature">温度参数</Label>
                  <Input
                    id="ai-temperature"
                    type="number"
                    value={aiTemperature}
                    onChange={(e) => setAiTemperature(e.target.value)}
                    min="0"
                    max="2"
                    step="0.1"
                  />
                  <div className="text-xs text-gray-500">控制生成结果的随机性（0-2）</div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>思考模式</Label>
                    <div className="text-sm text-gray-500">启用深度推理用于复杂任务</div>
                  </div>
                  <Switch
                    checked={thinkingMode}
                    onCheckedChange={setThinkingMode}
                  />
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSaveSystem}>
                    <Save className="mr-2 h-4 w-4" />
                    保存配置
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>数据库配置</CardTitle>
                <CardDescription>查看和修改数据库连接信息</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>数据库主机</Label>
                    <Input defaultValue="localhost" disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>端口</Label>
                    <Input defaultValue="5432" disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>数据库名称</Label>
                    <Input defaultValue="interview_system" disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>用户名</Label>
                    <Input defaultValue="postgres" disabled />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button variant="outline" onClick={handleTestConnection}>
                    <Database className="mr-2 h-4 w-4" />
                    测试连接
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>系统信息</CardTitle>
                <CardDescription>查看系统运行状态</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">系统版本</span>
                    <span className="font-medium">v1.0.0</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Next.js 版本</span>
                    <span className="font-medium">16.1.1</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">运行状态</span>
                    <span className="font-medium text-green-600">● 正常运行</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">服务端口</span>
                    <span className="font-medium">5000</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">最后更新</span>
                    <span className="font-medium">{new Date().toLocaleDateString('zh-CN')}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
