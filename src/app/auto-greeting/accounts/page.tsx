'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { fetchClient } from '@/lib/client-api';
import {
  getBossExtensionTabs,
  pingBossExtension,
  runBossExtensionCommand,
} from '@/lib/auto-greeting/extension-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  ChevronLeft, Plus, Trash2, RefreshCw, CheckCircle, XCircle, 
  AlertCircle, Loader2, ExternalLink 
} from 'lucide-react';
import { toast } from 'sonner';

interface PlatformAccount {
  id: string;
  platform: string;
  accountId: string;
  nickname: string;
  loginStatus: 'valid' | 'expired' | 'unknown';
  status: 'active' | 'paused' | 'banned';
  lastLoginTime: string;
  lastActiveTime: string;
  createdAt: string;
  hasCookies: boolean;
}

interface InteractiveLoginSnapshot {
  currentUrl?: string;
  title?: string;
  pageTextSnippet?: string;
  screenshotDataUrl?: string;
}

const platformLabels: Record<string, { name: string; color: string }> = {
  boss: { name: 'BOSS直聘', color: 'bg-green-500' },
  zhilian: { name: '智联招聘', color: 'bg-blue-500' },
  liepin: { name: '猎聘', color: 'bg-orange-500' },
  '51job': { name: '前程无忧', color: 'bg-purple-500' },
};

export default function AccountsPage() {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [interactiveLoginLoading, setInteractiveLoginLoading] = useState(false);
  const [interactiveLoginSessionId, setInteractiveLoginSessionId] = useState<string | null>(null);
  const [interactiveLoginMessage, setInteractiveLoginMessage] = useState('');
  const [interactiveLoginSnapshot, setInteractiveLoginSnapshot] = useState<InteractiveLoginSnapshot | null>(null);
  const autoInteractiveTriggeredRef = useRef(false);
  const [extensionChecking, setExtensionChecking] = useState(false);
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const [extensionVersion, setExtensionVersion] = useState('');
  const [bossTabs, setBossTabs] = useState<Array<{ id?: number; active: boolean; title: string; url: string }>>([]);
  const [selectedBossTabId, setSelectedBossTabId] = useState<number | null>(null);
  const [extensionDebugOutput, setExtensionDebugOutput] = useState<Record<string, unknown> | null>(null);

  // 表单状态
  const [formData, setFormData] = useState({
    platform: 'boss',
    cookies: '',
    nickname: '',
    accountId: '',
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    void refreshExtensionState();
  }, []);

  useEffect(() => {
    const interactive = searchParams.get('interactive');
    if (interactive !== 'boss') {
      autoInteractiveTriggeredRef.current = false;
      return;
    }

    if (autoInteractiveTriggeredRef.current || interactiveLoginLoading || interactiveLoginSessionId) {
      return;
    }

    autoInteractiveTriggeredRef.current = true;
    void handleInteractiveBossLogin();
  }, [interactiveLoginLoading, interactiveLoginSessionId, searchParams]);

  useEffect(() => {
    if (!interactiveLoginSessionId) {
      return;
    }

    let stopped = false;
    const timer = window.setInterval(async () => {
      if (stopped) return;

      try {
        const response = await fetchClient(`/api/auto-greeting/accounts/interactive-login?sessionId=${interactiveLoginSessionId}`);
        const result = await response.json();
        if (!result.success) {
          return;
        }

        const status = result.data?.status;
        const nickname = result.data?.nickname ? `（${result.data.nickname}）` : '';
        setInteractiveLoginSnapshot({
          currentUrl: result.data?.currentUrl,
          title: result.data?.title,
          pageTextSnippet: result.data?.pageTextSnippet,
          screenshotDataUrl: result.data?.screenshotDataUrl,
        });

        if (status === 'launching' || status === 'waiting_login') {
          setInteractiveLoginMessage(
            result.data?.currentUrl
              ? `正在等待人工登录${nickname}，当前页面：${result.data.currentUrl}`
              : `正在等待人工登录${nickname}，请在弹出的浏览器中完成 Boss 登录。`
          );
          return;
        }

        if (status === 'completed') {
          stopped = true;
          window.clearInterval(timer);
          setInteractiveLoginSessionId(null);
          setInteractiveLoginLoading(false);
          setInteractiveLoginMessage('');
          setInteractiveLoginSnapshot(null);
          toast.success(`Boss 账号${nickname}已登录并保存`);
          fetchAccounts();
          return;
        }

        if (status === 'error' || status === 'cancelled') {
          stopped = true;
          window.clearInterval(timer);
          setInteractiveLoginSessionId(null);
          setInteractiveLoginLoading(false);
          setInteractiveLoginMessage('');
          setInteractiveLoginSnapshot({
            currentUrl: result.data?.currentUrl,
            title: result.data?.title,
            pageTextSnippet: result.data?.pageTextSnippet,
            screenshotDataUrl: result.data?.screenshotDataUrl,
          });
          toast.error(result.data?.error || '交互式登录失败');
        }
      } catch (error) {
        console.error('轮询交互式登录状态失败:', error);
      }
    }, 2000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [interactiveLoginSessionId]);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const response = await fetchClient('/api/auto-greeting/accounts');
      const result = await response.json();
      if (result.success) {
        setAccounts(result.data);
      }
    } catch (error) {
      console.error('获取账号列表失败:', error);
      toast.error('获取账号列表失败');
    } finally {
      setLoading(false);
    }
  };

  const refreshExtensionState = async () => {
    setExtensionChecking(true);
    try {
      const ping = await pingBossExtension();
      if (!ping.ok) {
        setExtensionInstalled(false);
        setExtensionVersion('');
        setBossTabs([]);
        setSelectedBossTabId(null);
        return;
      }

      setExtensionInstalled(true);
      setExtensionVersion(ping.data?.version || '');

      const tabsResponse = await getBossExtensionTabs();
      const nextTabs = tabsResponse.ok && Array.isArray(tabsResponse.data) ? tabsResponse.data : [];
      setBossTabs(nextTabs);
      const activeTab = nextTabs.find((tab) => tab.active) || nextTabs[0];
      setSelectedBossTabId(activeTab?.id ?? null);
    } catch (error) {
      console.error('检测 Boss 扩展失败:', error);
      setExtensionInstalled(false);
      setExtensionVersion('');
      setBossTabs([]);
      setSelectedBossTabId(null);
    } finally {
      setExtensionChecking(false);
    }
  };

  const handleInspectBossPage = async () => {
    if (!selectedBossTabId) {
      toast.error('未找到可用的 Boss 标签页');
      return;
    }

    try {
      const result = await runBossExtensionCommand('boss.getPageInfo', {
        tabId: selectedBossTabId,
      });
      if (!result.ok || !result.data?.response?.ok) {
        toast.error(result.error || result.data?.response?.error || '读取 Boss 页面失败');
        return;
      }

      setExtensionDebugOutput(result.data.response.data as Record<string, unknown>);
      toast.success('已读取当前 Boss 页面信息');
    } catch (error) {
      console.error('读取 Boss 页面失败:', error);
      toast.error('读取 Boss 页面失败');
    }
  };

  const handleAddAccount = async () => {
    try {
      // 解析 Cookies
      let cookies;
      try {
        cookies = JSON.parse(formData.cookies);
      } catch {
        toast.error('Cookie 格式错误，请输入有效的 JSON 数组');
        return;
      }

      const response = await fetchClient('/api/auto-greeting/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: formData.platform,
          cookies,
          nickname: formData.nickname,
          accountId: formData.accountId,
        }),
      });

      const result = await response.json();
      if (result.success) {
        toast.success(result.message);
        setAddDialogOpen(false);
        setFormData({ platform: 'boss', cookies: '', nickname: '', accountId: '' });
        fetchAccounts();
      } else {
        toast.error(result.error || '添加失败');
      }
    } catch (error) {
      console.error('添加账号失败:', error);
      toast.error('添加账号失败');
    }
  };

  const handleInteractiveBossLogin = async () => {
    try {
      setInteractiveLoginLoading(true);
      setInteractiveLoginMessage('正在打开可见浏览器并模拟进入 Boss 登录流程...');

      const response = await fetchClient('/api/auto-greeting/accounts/interactive-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'boss' }),
      });

      const result = await response.json();
      if (!result.success) {
        setInteractiveLoginLoading(false);
        setInteractiveLoginMessage('');
        setInteractiveLoginSnapshot(null);
        toast.error(result.error || '启动交互式登录失败');
        return;
      }

      setInteractiveLoginSessionId(result.data.id);
      setInteractiveLoginMessage('浏览器已打开，正在等待你在 Boss 页面中扫码/登录。若页面短暂跳转，请稍等不要关闭窗口。');
      setInteractiveLoginSnapshot({
        currentUrl: result.data?.currentUrl,
        title: result.data?.title,
        pageTextSnippet: result.data?.pageTextSnippet,
        screenshotDataUrl: result.data?.screenshotDataUrl,
      });
      toast.success('已打开交互式登录窗口，请完成人工登录');
    } catch (error) {
      console.error('启动交互式登录失败:', error);
      setInteractiveLoginLoading(false);
      setInteractiveLoginMessage('');
      setInteractiveLoginSnapshot(null);
      toast.error('启动交互式登录失败');
    }
  };

  const handleCancelInteractiveLogin = async () => {
    if (!interactiveLoginSessionId) {
      return;
    }

    try {
      await fetchClient(`/api/auto-greeting/accounts/interactive-login?sessionId=${interactiveLoginSessionId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('取消交互式登录失败:', error);
    } finally {
      setInteractiveLoginSessionId(null);
      setInteractiveLoginLoading(false);
      setInteractiveLoginMessage('');
      setInteractiveLoginSnapshot(null);
    }
  };

  const handleCheckLogin = async (account: PlatformAccount) => {
    try {
      setChecking(account.id);
      const response = await fetchClient('/api/auto-greeting/accounts/check-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: account.id }),
      });

      const result = await response.json();
      if (result.success) {
        if (result.data.isLoggedIn) {
          toast.success(`账号 ${account.nickname || account.accountId} 登录状态正常`);
        } else {
          toast.error(`账号 ${account.nickname || account.accountId} 登录已过期`);
        }
        fetchAccounts();
      } else {
        toast.error(result.error || '检测失败');
      }
    } catch (error) {
      console.error('检测登录状态失败:', error);
      toast.error('检测登录状态失败');
    } finally {
      setChecking(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个账号吗？')) return;

    try {
      const response = await fetchClient(`/api/auto-greeting/accounts?id=${id}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (result.success) {
        toast.success('删除成功');
        fetchAccounts();
      } else {
        toast.error(result.error || '删除失败');
      }
    } catch (error) {
      console.error('删除账号失败:', error);
      toast.error('删除账号失败');
    }
  };

  const handleToggleStatus = async (account: PlatformAccount) => {
    const newStatus = account.status === 'active' ? 'paused' : 'active';
    try {
      const response = await fetchClient('/api/auto-greeting/accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: account.id, status: newStatus }),
      });
      const result = await response.json();
      if (result.success) {
        toast.success(newStatus === 'active' ? '已激活' : '已暂停');
        fetchAccounts();
      }
    } catch (error) {
      console.error('更新状态失败:', error);
      toast.error('更新状态失败');
    }
  };

  const getLoginStatusBadge = (status: string) => {
    switch (status) {
      case 'valid':
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />有效</Badge>;
      case 'expired':
        return <Badge className="bg-red-500"><XCircle className="w-3 h-3 mr-1" />已过期</Badge>;
      default:
        return <Badge className="bg-gray-500"><AlertCircle className="w-3 h-3 mr-1" />未知</Badge>;
    }
  };

  const getAccountStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500">正常</Badge>;
      case 'paused':
        return <Badge className="bg-yellow-500">已暂停</Badge>;
      case 'banned':
        return <Badge className="bg-red-500">已封禁</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航 */}
      <nav className="border-b bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
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
            <span className="text-sm font-medium">平台账号</span>
          </div>
        </div>
      </nav>

      <div className="container mx-auto py-6 space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">平台账号管理</h1>
            <p className="text-muted-foreground">管理招聘平台账号，配置登录凭证</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleInteractiveBossLogin}
              disabled={interactiveLoginLoading || Boolean(interactiveLoginSessionId)}
            >
              {interactiveLoginLoading || interactiveLoginSessionId ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  人工登录中
                </>
              ) : (
                <>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  人工登录 Boss
                </>
              )}
            </Button>
            <Button variant="outline" onClick={fetchAccounts}>
              <RefreshCw className="mr-2 h-4 w-4" />
              刷新
            </Button>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  手动导入 Cookie
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>手动导入平台账号</DialogTitle>
                  <DialogDescription>
                    高级模式：手动导入登录后的 Cookie 信息。一般情况下，优先使用上方的「人工登录 Boss」按钮即可。
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>平台</Label>
                      <select 
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={formData.platform}
                        onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                      >
                        <option value="boss">BOSS直聘</option>
                        <option value="zhilian">智联招聘</option>
                        <option value="liepin">猎聘</option>
                        <option value="51job">前程无忧</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>账号昵称（可选）</Label>
                      <Input
                        placeholder="方便识别"
                        value={formData.nickname}
                        onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Cookie（JSON 数组格式）</Label>
                    <Textarea
                      rows={8}
                      placeholder={`[
  {
    "name": "cookie_name",
    "value": "cookie_value",
    "domain": ".zhipin.com"
  }
]`}
                      value={formData.cookies}
                      onChange={(e) => setFormData({ ...formData, cookies: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      登录平台后，打开浏览器开发者工具（F12）→ Application → Cookies，复制所需 Cookie
                    </p>
                  </div>

                  <div className="bg-muted p-4 rounded-lg space-y-2">
                    <h4 className="font-medium">如何获取 Cookie？</h4>
                    <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>登录 {platformLabels[formData.platform]?.name || '招聘平台'}</li>
                      <li>按 F12 打开开发者工具</li>
                      <li>切换到 Application（应用）标签</li>
                      <li>在左侧找到 Cookies → 点击平台域名</li>
                      <li>复制关键 Cookie（如 _uab, _bl_uid, wt2 等）</li>
                    </ol>
                    <a 
                      href={formData.platform === 'boss' ? 'https://www.zhipin.com' : '#'}
                      target="_blank"
                      className="inline-flex items-center text-sm text-primary hover:underline"
                    >
                      打开 {platformLabels[formData.platform]?.name}
                      <ExternalLink className="ml-1 h-3 w-3" />
                    </a>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                      取消
                    </Button>
                    <Button onClick={handleAddAccount}>
                      添加并验证
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {interactiveLoginSessionId && (
          <Card className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium">交互式 Boss 登录进行中</div>
                  <div className="text-sm text-muted-foreground">
                    {interactiveLoginMessage || '请在弹出的浏览器窗口中完成人工登录。'}
                  </div>
                </div>
                <Button variant="outline" onClick={handleCancelInteractiveLogin}>
                  取消
                </Button>
              </div>

              {(interactiveLoginSnapshot?.currentUrl ||
                interactiveLoginSnapshot?.title ||
                interactiveLoginSnapshot?.pageTextSnippet ||
                interactiveLoginSnapshot?.screenshotDataUrl) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium">当前地址：</span>
                      <span className="text-muted-foreground break-all">
                        {interactiveLoginSnapshot?.currentUrl || '-'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">页面标题：</span>
                      <span className="text-muted-foreground">
                        {interactiveLoginSnapshot?.title || '-'}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium mb-1">页面文本摘要：</div>
                      <div className="text-muted-foreground whitespace-pre-wrap rounded-md border bg-background/70 p-3 max-h-56 overflow-auto">
                        {interactiveLoginSnapshot?.pageTextSnippet || '暂无内容'}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="font-medium text-sm">当前截图：</div>
                    {interactiveLoginSnapshot?.screenshotDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={interactiveLoginSnapshot.screenshotDataUrl}
                        alt="Boss 登录页截图"
                        className="w-full rounded-md border bg-white"
                      />
                    ) : (
                      <div className="text-sm text-muted-foreground rounded-md border bg-background/70 p-3">
                        暂无截图
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="border-cyan-200 bg-cyan-50 dark:bg-cyan-950 dark:border-cyan-800">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-medium">同浏览器 Boss 扩展模式</div>
                <div className="text-sm text-muted-foreground">
                  推荐方案：在同一个 Chrome 中手动登录 Boss 直聘，再由浏览器扩展协同面试官系统执行操作，不需要手动找 Cookie。
                </div>
              </div>
              <Button variant="outline" onClick={refreshExtensionState} disabled={extensionChecking}>
                {extensionChecking ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    检测中
                  </>
                ) : (
                  '检测扩展'
                )}
              </Button>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <Badge className={extensionInstalled ? 'bg-green-500' : 'bg-gray-500'}>
                {extensionInstalled ? '扩展已连接' : '扩展未连接'}
              </Badge>
              {extensionVersion && <span className="text-muted-foreground">版本：{extensionVersion}</span>}
            </div>

            <div className="text-sm text-muted-foreground">
              扩展目录：
              <span className="ml-2 font-mono text-foreground">
                browser-extension/boss-connector
              </span>
            </div>

            {extensionInstalled && (
              <div className="space-y-3">
                <div className="text-sm font-medium">已发现的 Boss 标签页</div>
                {bossTabs.length === 0 ? (
                  <div className="text-sm text-muted-foreground rounded-md border bg-background/70 p-3">
                    当前没有检测到 Boss 直聘标签页，请先在同一个 Chrome 中手动打开并登录 Boss。
                  </div>
                ) : (
                  <div className="space-y-2">
                    {bossTabs.map((tab) => (
                      <label
                        key={tab.id || `${tab.title}-${tab.url}`}
                        className="flex items-start gap-3 rounded-md border bg-background/70 p-3 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="boss-tab"
                          checked={selectedBossTabId === tab.id}
                          onChange={() => setSelectedBossTabId(tab.id || null)}
                        />
                        <div className="min-w-0">
                          <div className="font-medium flex items-center gap-2">
                            <span>{tab.title || '未命名 Boss 标签页'}</span>
                            {tab.active && <Badge variant="secondary">当前活动</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground break-all">{tab.url}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleInspectBossPage} disabled={!selectedBossTabId}>
                    读取当前 Boss 页面
                  </Button>
                </div>
              </div>
            )}

            {extensionDebugOutput && (
              <div className="space-y-2">
                <div className="font-medium text-sm">Boss 页面调试信息</div>
                <pre className="rounded-md border bg-background/70 p-3 text-xs overflow-auto max-h-72">
                  {JSON.stringify(extensionDebugOutput, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 说明卡片 */}
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-500 mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-medium">使用说明</h3>
                <p className="text-sm text-muted-foreground">
                  1. 推荐优先使用上方「人工登录 Boss」按钮，系统会打开可见浏览器并等待你手动登录<br/>
                  2. 登录完成后，系统会自动提取并保存 Boss 账号，不需要你手动找 Cookie<br/>
                  3. 只有在特殊情况下，才需要使用「手动导入 Cookie」方式补录账号<br/>
                  4. 登录成功后，可在岗位管理中启动自动化任务
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 账号列表 */}
        <Card>
          <CardHeader>
            <CardTitle>账号列表</CardTitle>
            <CardDescription>已添加的平台账号</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                加载中...
              </div>
            ) : accounts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                暂无账号，点击上方按钮添加
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>平台</TableHead>
                    <TableHead>昵称/账号</TableHead>
                    <TableHead>登录状态</TableHead>
                    <TableHead>账号状态</TableHead>
                    <TableHead>最后活跃</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell>
                        <Badge className={platformLabels[account.platform]?.color || 'bg-gray-500'}>
                          {platformLabels[account.platform]?.name || account.platform}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{account.nickname || '-'}</div>
                          {account.accountId && (
                            <div className="text-xs text-muted-foreground">{account.accountId}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getLoginStatusBadge(account.loginStatus)}
                      </TableCell>
                      <TableCell>
                        {getAccountStatusBadge(account.status)}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {account.lastActiveTime 
                            ? new Date(account.lastActiveTime).toLocaleString('zh-CN')
                            : '-'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleCheckLogin(account)}
                            disabled={checking === account.id}
                            title="检测登录状态"
                          >
                            {checking === account.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleToggleStatus(account)}
                            title={account.status === 'active' ? '暂停' : '激活'}
                          >
                            {account.status === 'active' ? '⏸️' : '▶️'}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDelete(account.id)}
                            title="删除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
