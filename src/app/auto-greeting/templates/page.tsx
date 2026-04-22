'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { fetchClient } from '@/lib/client-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Search, Edit, Trash2, Copy, ChevronLeft, BookOpen } from 'lucide-react';

interface Template {
  id: string;
  jobId: string;
  type: string;
  platform: string;
  template: string;
  variables: Array<{ name: string; description: string; required: boolean }>;
  isActive: boolean;
  useCount: number;
  createdAt: string;
}

interface Job {
  id: string;
  name: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  // 表单状态
  const [formData, setFormData] = useState({
    jobId: '',
    type: 'first',
    platform: 'boss',
    template: '',
    variables: '',
  });

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (platformFilter !== 'all') params.append('platform', platformFilter);
      if (typeFilter !== 'all') params.append('type', typeFilter);
      if (searchKeyword) params.append('keyword', searchKeyword);

      const response = await fetchClient(`/api/auto-greeting/templates?${params}`);
      const result = await response.json();

      if (result.success) {
        setTemplates(result.data.templates);
      }
    } catch (error) {
      console.error('获取话术列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, [platformFilter, searchKeyword, typeFilter]);

  const fetchJobs = useCallback(async () => {
    try {
      const response = await fetchClient('/api/auto-greeting/jobs?pageSize=100');
      const result = await response.json();

      if (result.success) {
        setJobs(result.data.jobs);
      }
    } catch (error) {
      console.error('获取岗位列表失败:', error);
    }
  }, []);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  const handleSubmit = async () => {
    try {
      const payload = {
        jobId: formData.jobId,
        type: formData.type,
        platform: formData.platform,
        template: formData.template,
        variables: formData.variables
          ? formData.variables.split(',').map((v) => ({
              name: v.trim(),
              description: v.trim(),
              required: false,
            }))
          : [],
      };

      let response;
      if (editingTemplate) {
        response = await fetchClient(`/api/auto-greeting/templates/${editingTemplate.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        response = await fetchClient('/api/auto-greeting/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const result = await response.json();
      if (result.success) {
        setDialogOpen(false);
        resetForm();
        fetchTemplates();
      } else {
        alert(result.error || '操作失败');
      }
    } catch (error) {
      console.error('保存话术失败:', error);
      alert('保存失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个话术吗？')) return;

    try {
      const response = await fetchClient(`/api/auto-greeting/templates/${id}`, {
        method: 'DELETE',
      });
      const result = await response.json();

      if (result.success) {
        fetchTemplates();
      } else {
        alert(result.error || '删除失败');
      }
    } catch (error) {
      console.error('删除话术失败:', error);
    }
  };

  const handleCopy = (template: string) => {
    navigator.clipboard.writeText(template);
    alert('已复制到剪贴板');
  };

  const resetForm = () => {
    setFormData({
      jobId: '',
      type: 'first',
      platform: 'boss',
      template: '',
      variables: '',
    });
    setEditingTemplate(null);
  };

  const openEditDialog = (template: Template) => {
    setEditingTemplate(template);
    setFormData({
      jobId: template.jobId,
      type: template.type,
      platform: template.platform,
      template: template.template,
      variables: template.variables.map((v) => v.name).join(', '),
    });
    setDialogOpen(true);
  };

  const platformLabels: Record<string, string> = {
    boss: 'Boss直聘',
    zhilian: '智联招聘',
    liepin: '猎聘',
    '51job': '前程无忧',
    all: '通用',
  };

  const typeLabels: Record<string, { label: string; color: string }> = {
    first: { label: '首次打招呼', color: 'bg-blue-500' },
    second: { label: '二次打招呼', color: 'bg-purple-500' },
  };

  // 变量模板示例
  const templateExamples = [
    {
      name: '技能匹配型',
      template: '您好！看到您的简历，发现您有{技能}方面的经验，非常匹配我们的{岗位名称}岗位。我们公司在{公司介绍}，有兴趣聊聊吗？',
    },
    {
      name: '稀缺性钩子',
      template: '你这段{经历}挺少见的，我们团队刚好在做{相关项目}，觉得很匹配，有空聊聊吗？',
    },
    {
      name: '简单直接型',
      template: '您好，我们正在招聘{岗位名称}，工作地点在{工作地点}，薪资{薪资范围}，有兴趣了解一下吗？',
    },
  ];

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
            <span className="text-sm font-medium">话术管理</span>
          </div>
        </div>
      </nav>

      <div className="container mx-auto py-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">话术管理</h1>
          <p className="text-muted-foreground">管理自动打招呼的话术模板</p>
        </div>
        <div className="flex gap-2">
          <Link href="/auto-greeting/qa-library">
            <Button variant="outline">
              <BookOpen className="mr-2 h-4 w-4" />
              问答库
            </Button>
          </Link>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" />
                新建话术
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingTemplate ? '编辑话术' : '新建话术'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>关联岗位 *</Label>
                  <Select
                    value={formData.jobId}
                    onValueChange={(value) => setFormData({ ...formData, jobId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择岗位" />
                    </SelectTrigger>
                    <SelectContent>
                      {jobs.map((job) => (
                        <SelectItem key={job.id} value={job.id}>
                          {job.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>话术类型 *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first">首次打招呼</SelectItem>
                      <SelectItem value="second">二次打招呼</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>目标平台 *</Label>
                <Select
                  value={formData.platform}
                  onValueChange={(value) => setFormData({ ...formData, platform: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择平台" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">通用</SelectItem>
                    {Object.entries(platformLabels)
                      .filter(([key]) => key !== 'all')
                      .map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>话术内容 *</Label>
                <Textarea
                  className="min-h-32"
                  value={formData.template}
                  onChange={(e) => setFormData({ ...formData, template: e.target.value })}
                  placeholder="输入话术内容，使用 {变量名} 表示可替换变量"
                />
                <p className="text-xs text-muted-foreground">
                  可用变量：{'{候选人姓名}'}、{'{岗位名称}'}、{'{技能}'}、{'{工作地点}'}、{'{薪资范围}'}
                </p>
              </div>

              <div className="space-y-2">
                <Label>变量列表（逗号分隔）</Label>
                <Input
                  value={formData.variables}
                  onChange={(e) => setFormData({ ...formData, variables: e.target.value })}
                  placeholder="如：候选人姓名, 岗位名称, 技能"
                />
              </div>

              {/* 模板示例 */}
              <div className="space-y-2">
                <Label>模板示例</Label>
                <div className="grid gap-2">
                  {templateExamples.map((example) => (
                    <div
                      key={example.name}
                      className="p-3 border rounded-md cursor-pointer hover:bg-muted/50"
                      onClick={() => setFormData({ ...formData, template: example.template })}
                    >
                      <div className="font-medium text-sm">{example.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">{example.template}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleSubmit}>
                  {editingTemplate ? '保存' : '创建'}
                </Button>
              </div>
            </div>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 筛选和搜索 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10"
                placeholder="搜索话术内容..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
              />
            </div>
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="平台" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部平台</SelectItem>
                {Object.entries(platformLabels)
                  .filter(([key]) => key !== 'all')
                  .map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="first">首次打招呼</SelectItem>
                <SelectItem value="second">二次打招呼</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 话术列表 */}
      <Card>
        <CardHeader>
          <CardTitle>话术列表</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">加载中...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              暂无话术数据，点击上方按钮新建
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>类型</TableHead>
                  <TableHead>平台</TableHead>
                  <TableHead className="w-1/3">话术内容</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>使用次数</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell>
                      <Badge className={`${typeLabels[template.type]?.color || 'bg-gray-500'} text-white`}>
                        {typeLabels[template.type]?.label || template.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{platformLabels[template.platform] || template.platform}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm line-clamp-2">{template.template}</div>
                      {template.variables.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          变量: {template.variables.map((v) => v.name).join(', ')}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={template.isActive ? 'default' : 'secondary'}>
                        {template.isActive ? '启用' : '禁用'}
                      </Badge>
                    </TableCell>
                    <TableCell>{template.useCount}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleCopy(template.template)}
                          title="复制"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEditDialog(template)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(template.id)}
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
