"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, CheckCircle, Loader2, Shield } from "lucide-react";
import { toast } from "sonner";

export default function InitializePage() {
  const [isInitializing, setIsInitializing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [initToken, setInitToken] = useState("");

  const buildInitHeaders = (): HeadersInit => {
    const headers: HeadersInit = {};

    if (initToken.trim()) {
      headers["x-init-token"] = initToken.trim();
    }

    return headers;
  };

  const handleInitialize = async () => {
    setIsInitializing(true);
    setStatus("idle");
    setMessage("");

    try {
      const response = await fetch("/api/init", {
        method: "POST",
        headers: buildInitHeaders(),
      });

      const result = await response.json();

      if (result.success) {
        setStatus("success");
        setMessage(result.message || "数据库初始化成功！");
        toast.success("数据库初始化成功！");

        // 3秒后自动跳转到登录页
        setTimeout(() => {
          window.location.href = "/login";
        }, 3000);
      } else {
        setStatus("error");
        setMessage(result.error || "初始化失败");
        toast.error(result.error || "初始化失败");
      }
    } catch {
      setStatus("error");
      setMessage("网络错误，请稍后重试");
      toast.error("网络错误，请稍后重试");
    } finally {
      setIsInitializing(false);
    }
  };

  const handleResetPassword = async () => {
    setIsResetting(true);
    setStatus("idle");
    setMessage("");

    try {
      const response = await fetch("/api/reset-admin", {
        method: "POST",
        headers: buildInitHeaders(),
      });

      const result = await response.json();

      if (result.success) {
        setStatus("success");
        setMessage(result.message || "密码重置成功！");
        toast.success("密码重置成功！");

        // 3秒后自动跳转到登录页
        setTimeout(() => {
          window.location.href = "/login";
        }, 3000);
      } else {
        setStatus("error");
        setMessage(result.error || "密码重置失败");
        toast.error(result.error || "密码重置失败");
      }
    } catch {
      setStatus("error");
      setMessage("网络错误，请稍后重试");
      toast.error("网络错误，请稍后重试");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <Shield className="w-8 h-8 text-blue-600" />
          </div>
          <CardTitle className="text-2xl font-bold">数据库初始化</CardTitle>
          <CardDescription>
            首次部署或无法登录时，请使用此页面初始化或重置管理员账户
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 状态提示 */}
          {status !== "idle" && (
            <div
              className={`p-4 rounded-lg flex items-start gap-3 ${
                status === "success"
                  ? "bg-green-50 border border-green-200"
                  : "bg-red-50 border border-red-200"
              }`}
            >
              {status === "success" ? (
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
              )}
              <div>
                <p
                  className={`font-medium ${
                    status === "success" ? "text-green-800" : "text-red-800"
                  }`}
                >
                  {status === "success" ? "成功" : "错误"}
                </p>
                <p
                  className={`text-sm mt-1 ${
                    status === "success" ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {message}
                </p>
                {status === "success" && (
                  <p className="text-sm mt-2 text-green-600">
                    3秒后自动跳转到登录页...
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="init-token" className="text-sm font-medium text-gray-700">
              初始化令牌（生产环境必填）
            </label>
            <Input
              id="init-token"
              type="password"
              value={initToken}
              onChange={(event) => setInitToken(event.target.value)}
              placeholder="请输入 INIT_API_TOKEN"
            />
            <p className="text-xs text-gray-500">
              开发环境可留空；生产环境请配置服务端环境变量 <code>INIT_API_TOKEN</code> 后再操作。
            </p>
          </div>

          {/* 初始化按钮 */}
          <div className="space-y-3">
            <Button
              onClick={handleInitialize}
              disabled={isInitializing || isResetting}
              className="w-full"
              size="lg"
            >
              {isInitializing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              初始化数据库（首次部署）
            </Button>
            <p className="text-xs text-gray-500 text-center">
              创建默认管理员账户：用户名 admin。初始化完成后请立即登录并修改管理员密码。
            </p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-500">或者</span>
            </div>
          </div>

          {/* 重置密码按钮 */}
          <div className="space-y-3">
            <Button
              onClick={handleResetPassword}
              disabled={isInitializing || isResetting}
              variant="outline"
              className="w-full"
              size="lg"
            >
              {isResetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              重置管理员密码
            </Button>
            <p className="text-xs text-gray-500 text-center">
              重置现有 admin 账户密码。完成后请立即登录并修改管理员密码。
            </p>
          </div>

          {/* 提示信息 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>说明：</strong>
            </p>
            <ul className="text-xs text-blue-700 mt-2 space-y-1 list-disc list-inside">
              <li>首次部署请点击&quot;初始化数据库&quot;</li>
              <li>如果忘记密码或无法登录，请点击&quot;重置管理员密码&quot;</li>
              <li>初始化后请立即登录并修改默认密码</li>
              <li>生产环境建议配置 INIT_API_TOKEN，并通过令牌保护初始化接口</li>
            </ul>
          </div>

          {/* 直接跳转 */}
          <div className="text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => (window.location.href = "/login")}
            >
              已有账户？直接登录
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
