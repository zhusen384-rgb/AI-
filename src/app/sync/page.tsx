"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, CheckCircle, Download, Upload, Loader2, Database, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";

export default function DataSyncPage() {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importData, setImportData] = useState("");
  const [exportResult, setExportResult] = useState<any>(null);
  const [importResult, setImportResult] = useState<any>(null);

  // 导出数据
  const handleExport = async () => {
    setIsExporting(true);
    setExportResult(null);

    try {
      const response = await fetch("/api/sync/export", {
        method: "GET",
      });

      const result = await response.json();

      if (result.success) {
        setExportResult(result.summary);
        
        // 创建下载链接
        const dataStr = JSON.stringify(result.data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `backup-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);

        toast.success("数据导出成功！");
      } else {
        toast.error(result.error || "导出失败");
      }
    } catch (error) {
      toast.error("网络错误，请稍后重试");
    } finally {
      setIsExporting(false);
    }
  };

  // 导入数据
  const handleImport = async () => {
    if (!importData.trim()) {
      toast.error("请先粘贴或上传导出的数据");
      return;
    }

    setIsImporting(true);
    setImportResult(null);

    try {
      let jsonData;
      try {
        jsonData = JSON.parse(importData);
      } catch {
        toast.error("数据格式错误，请确保是有效的JSON格式");
        setIsImporting(false);
        return;
      }

      const response = await fetch("/api/sync/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: jsonData,
          options: {
            skipExisting: true,
            overwrite: false,
          },
        }),
      });

      const result = await response.json();

      if (result.success) {
        setImportResult(result.results);
        toast.success("数据导入成功！");
      } else {
        setImportResult(result.results);
        toast.error(result.error || "导入失败");
      }
    } catch (error) {
      toast.error("网络错误，请稍后重试");
    } finally {
      setIsImporting(false);
    }
  };

  // 上传文件
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setImportData(event.target?.result as string);
      toast.success("文件上传成功");
    };
    reader.onerror = () => {
      toast.error("文件读取失败");
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
            <Database className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">数据同步</h1>
          <p className="text-gray-600">
            在预览环境和生产环境之间同步数据
          </p>
        </div>

        <Tabs defaultValue="export" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="export">导出数据</TabsTrigger>
            <TabsTrigger value="import">导入数据</TabsTrigger>
          </TabsList>

          {/* 导出数据 */}
          <TabsContent value="export">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Download className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle>导出数据</CardTitle>
                    <CardDescription>
                      从当前环境导出所有数据为JSON文件
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 导出结果 */}
                {exportResult && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium text-green-900 mb-2">导出成功</p>
                        <div className="space-y-1 text-sm text-green-700">
                          <p>导出时间: {exportResult.exportTime}</p>
                          <p>总表数: {exportResult.totalTables}</p>
                          <p>总记录数: {exportResult.totalRecords}</p>
                          <div className="mt-2">
                            <p className="font-medium mb-1">各表记录数:</p>
                            <ul className="list-disc list-inside space-y-1">
                              {exportResult.tables.map((table: any) => (
                                <li key={table.name}>
                                  {table.name}: {table.count} 条
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 导出按钮 */}
                <Button
                  onClick={handleExport}
                  disabled={isExporting}
                  size="lg"
                  className="w-full"
                >
                  {isExporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isExporting ? "导出中..." : "导出所有数据"}
                </Button>

                {/* 说明 */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800 font-medium mb-2">
                    📋 导出说明
                  </p>
                  <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                    <li>导出包含租户、用户、候选人、面试配置等所有数据</li>
                    <li>导出的数据会自动下载为 JSON 文件</li>
                    <li>请妥善保管导出的数据文件，避免泄露敏感信息</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 导入数据 */}
          <TabsContent value="import">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Upload className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <CardTitle>导入数据</CardTitle>
                    <CardDescription>
                      从JSON文件导入数据到当前环境
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 导入结果 */}
                {importResult && (
                  <div className={`p-4 border rounded-lg ${
                    importResult.success ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
                  }`}>
                    <div className="flex items-start gap-3">
                      {importResult.success ? (
                        <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <p className={`font-medium mb-2 ${
                          importResult.success ? 'text-green-900' : 'text-yellow-900'
                        }`}>
                          {importResult.success ? '导入成功' : '导入部分成功'}
                        </p>
                        <div className="space-y-1 text-sm">
                          <p>总记录数: {importResult.totalRecords}</p>
                          <p>成功导入: {importResult.imported}</p>
                          <p>跳过: {importResult.skipped}</p>
                          {importResult.failed > 0 && (
                            <p className="text-red-600">失败: {importResult.failed}</p>
                          )}
                          {Object.keys(importResult.tables).length > 0 && (
                            <div className="mt-2">
                              <p className="font-medium mb-1">各表导入结果:</p>
                              <ul className="list-disc list-inside space-y-1">
                                {Object.entries(importResult.tables).map(([name, result]: [string, any]) => (
                                  <li key={name} className={
                                    result.status === 'success' ? 'text-green-700' : 'text-yellow-700'
                                  }>
                                    {name}: 导入{result.imported}条, 跳过{result.skipped}条, 失败{result.failed}条
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 文件上传 */}
                <div className="space-y-2">
                  <Label htmlFor="file-upload">上传JSON文件</Label>
                  <Input
                    id="file-upload"
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                  />
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-gray-500">或者</span>
                  </div>
                </div>

                {/* 文本粘贴 */}
                <div className="space-y-2">
                  <Label htmlFor="data-input">粘贴JSON数据</Label>
                  <Textarea
                    id="data-input"
                    placeholder='{"exportTime": "2026-03-27T...", "tables": {...}}'
                    value={importData}
                    onChange={(e) => setImportData(e.target.value)}
                    rows={10}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-gray-500">
                    可以直接粘贴JSON数据，或者使用上面的文件上传功能
                  </p>
                </div>

                {/* 导入按钮 */}
                <Button
                  onClick={handleImport}
                  disabled={isImporting || !importData.trim()}
                  size="lg"
                  className="w-full"
                >
                  {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isImporting ? "导入中..." : "导入数据"}
                </Button>

                {/* 说明 */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800 font-medium mb-2">
                    ⚠️ 导入说明
                  </p>
                  <ul className="text-xs text-yellow-700 space-y-1 list-disc list-inside">
                    <li>导入数据会自动跳过已存在的记录</li>
                    <li>建议先备份数据，再执行导入操作</li>
                    <li>导入过程不可逆，请谨慎操作</li>
                    <li>如果导入失败，可以重新尝试</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 操作指南 */}
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <ArrowRightLeft className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <CardTitle>操作指南</CardTitle>
                <CardDescription>
                  如何在预览环境和生产环境之间同步数据
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center font-bold text-blue-600">
                  1
                </div>
                <div>
                  <p className="font-medium">在预览环境导出数据</p>
                  <p className="text-sm text-gray-600">
                    访问预览环境的 /sync 页面，点击&quot;导出所有数据&quot;按钮，下载数据文件
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center font-bold text-green-600">
                  2
                </div>
                <div>
                  <p className="font-medium">在生产环境导入数据</p>
                  <p className="text-sm text-gray-600">
                    访问生产环境的 /sync 页面，上传或粘贴导出的数据，点击&quot;导入数据&quot;
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center font-bold text-purple-600">
                  3
                </div>
                <div>
                  <p className="font-medium">验证数据同步</p>
                  <p className="text-sm text-gray-600">
                    登录生产环境，检查数据是否正确导入
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
