'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2, Clock, ArrowRight } from 'lucide-react';

interface LogEntry {
  time: string;
  step: string;
  status: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

// 检查是否在浏览器环境中
const isBrowser = typeof window !== 'undefined';

export default function LoginPage() {
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const hasRedirected = useRef(false);

  // 添加日志 - 直接更新 state，不依赖闭包
  const addLog = (step: string, status: LogEntry['status'], message: string) => {
    if (!isBrowser) return;
    
    const time = new Date().toLocaleTimeString('en-US', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0');
    
    setLogs(prev => {
      const newLogs = [...prev, { time, step, status, message }];
      return newLogs;
    });
    
    console.log(`[LOGIN] [${step}] ${status.toUpperCase()}: ${message}`);
  };

  // 状态变化日志
  useEffect(() => {
    if (!authLoading && isAuthenticated && !hasRedirected.current) {
      hasRedirected.current = true;
      setTimeout(() => {
        window.location.href = '/';
      }, 100);
    }
  }, [isAuthenticated, authLoading]);

  // 处理登录
  const handleLogin = async () => {
    addLog('CLICK', 'info', '登录按钮被点击');
    
    if (isLoading) {
      addLog('CLICK', 'warning', '已在加载中，忽略点击');
      return;
    }
    
    setIsLoading(true);
    setError('');
    addLog('FORM', 'info', `开始登录, 用户名: ${username}`);

    try {
      const startTime = Date.now();

      addLog('STEP1', 'info', '调用统一登录流程...');
      await login(username, password);

      const elapsed = Date.now() - startTime;
      addLog('STEP2', 'success', `登录成功 (${elapsed}ms)`);
      hasRedirected.current = true;
      
      addLog('REDIRECT', 'info', '300ms 后跳转到 /');
      setTimeout(() => {
        addLog('REDIRECT', 'info', '执行跳转...');
        window.location.href = '/';
      }, 300);
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '未知错误';
      addLog('ERROR', 'error', `错误: ${errorMsg}`);
      setError(errorMsg);
      setIsLoading(false);
    }
  };

  const getLogIcon = (status: LogEntry['status']) => {
    switch (status) {
      case 'info': return <Clock className="h-3 w-3 text-blue-500 flex-shrink-0" />;
      case 'success': return <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />;
      case 'error': return <AlertCircle className="h-3 w-3 text-red-500 flex-shrink-0" />;
      case 'warning': return <AlertCircle className="h-3 w-3 text-orange-500 flex-shrink-0" />;
    }
  };

  const getLogColor = (status: LogEntry['status']) => {
    switch (status) {
      case 'info': return 'text-blue-400';
      case 'success': return 'text-green-400';
      case 'error': return 'text-red-400';
      case 'warning': return 'text-orange-400';
    }
  };

  // AuthProvider 正在加载时
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardContent className="pt-6">
            <div className="text-center">
              <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-600" />
              <p className="text-lg font-medium mb-2">检查认证状态...</p>
              <p className="text-muted-foreground text-sm">请稍候...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 已登录，显示跳转中
  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="w-full max-w-lg shadow-xl">
          <CardContent className="pt-6">
            <div className="text-center mb-4">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p className="text-lg font-medium mb-2">登录成功!</p>
              <p className="text-muted-foreground text-sm">正在跳转到仪表盘...</p>
            </div>
            
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-100 px-3 py-2 border-b">
                <span className="text-sm font-medium text-gray-700">登录日志 ({logs.length} 条)</span>
              </div>
              <div ref={logContainerRef} className="bg-gray-900 text-gray-100 p-3 text-xs font-mono max-h-48 overflow-y-auto">
                {logs.map((log, i) => (
                  <div key={i} className="flex items-start gap-2 mb-1">
                    <span className="text-gray-500 flex-shrink-0">{log.time}</span>
                    <span className="text-yellow-400 flex-shrink-0">[{log.step}]</span>
                    {getLogIcon(log.status)}
                    <span className={getLogColor(log.status)}>{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="space-y-1">
          <CardTitle className="text-3xl font-bold text-center bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            面试官系统
          </CardTitle>
          <CardDescription className="text-center">登录以继续</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                type="text"
                placeholder="输入用户名"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError('');
                }}
                disabled={isLoading}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                placeholder="输入密码"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                disabled={isLoading}
                required
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>登录失败!</strong><br />{error}
                </AlertDescription>
              </Alert>
            )}

            {/* 日志面板 */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-100 px-3 py-2 border-b flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">登录过程日志</span>
                <span className="text-xs text-gray-500">{logs.length} 条</span>
              </div>
              <div ref={logContainerRef} className="bg-gray-900 text-gray-100 p-3 text-xs font-mono h-48 overflow-y-auto">
                {logs.length === 0 ? (
                  <div className="text-gray-500 italic">点击 &quot;登录&quot; 按钮开始...</div>
                ) : (
                  logs.map((log, i) => (
                    <div key={i} className="flex items-start gap-2 mb-1">
                      <span className="text-gray-500 flex-shrink-0">{log.time}</span>
                      <span className="text-yellow-400 flex-shrink-0">[{log.step}]</span>
                      {getLogIcon(log.status)}
                      <span className={getLogColor(log.status)}>{log.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <Button
              type="button"
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
              disabled={isLoading}
              onClick={handleLogin}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  登录中...
                </>
              ) : (
                <>
                  登录
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
        <CardFooter className="text-center text-sm text-muted-foreground">
          如有账号问题，请联系管理员
        </CardFooter>
      </Card>
    </div>
  );
}
