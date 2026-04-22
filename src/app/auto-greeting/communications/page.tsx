'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { fetchClient } from '@/lib/client-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Eye, User, MessageSquare, Clock, CheckCircle, ChevronLeft } from 'lucide-react';

interface CommunicationStats {
  hrMessageCount: number;
  candidateMessageCount: number;
  effectiveRounds: number;
}

interface Communication {
  id: string;
  jobId: string;
  jobName?: string;
  name?: string;
  platform: string;
  platformNickname?: string;
  candidateInfo?: {
    currentCompany?: string;
    experience?: number;
    skills?: string[];
  };
  status: string;
  intentLevel?: string;
  matchScore?: number;
  firstGreetingTime?: string;
  lastMessageTime?: string;
  communicationStats: CommunicationStats;
  tags: string[];
  createdAt: string;
}

interface MessageRecord {
  id: string;
  sender: string;
  content: string;
  sendTime?: string;
  isAuto: boolean;
  status?: string;
  messageType?: string;
}

interface CommunicationsResponse {
  success: boolean;
  error?: string;
  data?: {
    communications?: Communication[];
    total?: number;
  };
}

interface CommunicationDetailResponse {
  success: boolean;
  error?: string;
  data?: {
    communication: Communication;
    messages: MessageRecord[];
  };
}

const platformLabels: Record<string, string> = {
  boss: 'Boss直聘',
  zhilian: '智联招聘',
  liepin: '猎聘',
  '51job': '前程无忧',
};

const statusLabels: Record<string, { label: string; color: string }> = {
  '待打招呼': { label: '待打招呼', color: 'bg-gray-500' },
  '已打招呼': { label: '已打招呼', color: 'bg-blue-500' },
  '沟通中': { label: '沟通中', color: 'bg-yellow-500' },
  '高意向': { label: '高意向', color: 'bg-green-500' },
  '已获取简历': { label: '已获取简历', color: 'bg-purple-500' },
  '已获取联系方式': { label: '已获取联系方式', color: 'bg-indigo-500' },
  '已拒绝': { label: '已拒绝', color: 'bg-red-500' },
  '无效沟通': { label: '无效沟通', color: 'bg-gray-400' },
};

const intentLabels: Record<string, { label: string; color: string }> = {
  A: { label: 'A级-高意向', color: 'bg-green-500 text-white' },
  B: { label: 'B级-中意向', color: 'bg-yellow-500 text-white' },
  C: { label: 'C级-低意向', color: 'bg-orange-500 text-white' },
  D: { label: 'D级-无意向', color: 'bg-red-500 text-white' },
};

function normalizeStats(value: Partial<CommunicationStats> | undefined): CommunicationStats {
  return {
    hrMessageCount: Number(value?.hrMessageCount || 0),
    candidateMessageCount: Number(value?.candidateMessageCount || 0),
    effectiveRounds: Number(value?.effectiveRounds || 0),
  };
}

function formatTime(time?: string) {
  if (!time) return '-';
  const date = new Date(time);
  return Number.isNaN(date.getTime()) ? time : date.toLocaleString('zh-CN');
}

export default function CommunicationsPage() {
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [intentFilter, setIntentFilter] = useState('all');
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedCommunication, setSelectedCommunication] = useState<Communication | null>(null);

  const fetchCommunications = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('pageSize', '100');

      if (searchKeyword) params.set('keyword', searchKeyword);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (intentFilter !== 'all') params.set('intent', intentFilter);

      const response = await fetchClient(`/api/auto-greeting/communications?${params.toString()}`);
      const result = (await response.json()) as CommunicationsResponse;

      if (result.success) {
        const nextCommunications = (result.data?.communications || []).map(item => ({
          ...item,
          communicationStats: normalizeStats(item.communicationStats),
          tags: Array.isArray(item.tags) ? item.tags : [],
        }));
        setCommunications(nextCommunications);
        return;
      }

      setCommunications([]);
    } catch (error) {
      console.error('获取沟通记录失败:', error);
      setCommunications([]);
    } finally {
      setLoading(false);
    }
  }, [intentFilter, searchKeyword, statusFilter]);

  useEffect(() => {
    void fetchCommunications();
  }, [fetchCommunications]);

  const openDetailDialog = useCallback(async (communication: Communication) => {
    setSelectedCommunication(communication);
    setMessages([]);
    setDetailLoading(true);
    setDetailDialogOpen(true);

    try {
      const response = await fetchClient(
        `/api/auto-greeting/communications?communicationId=${communication.id}`
      );
      const result = (await response.json()) as CommunicationDetailResponse;

      if (result.success && result.data) {
        setSelectedCommunication({
          ...result.data.communication,
          communicationStats: normalizeStats(result.data.communication.communicationStats),
          tags: Array.isArray(result.data.communication.tags) ? result.data.communication.tags : [],
        });
        setMessages(result.data.messages || []);
        return;
      }

      setMessages([]);
    } catch (error) {
      console.error('获取沟通详情失败:', error);
      setMessages([]);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
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
            <span className="text-sm font-medium">沟通记录</span>
          </div>
        </div>
      </nav>

      <div className="container mx-auto py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">沟通记录</h1>
          <p className="text-muted-foreground">查看和管理候选人的沟通记录</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 rounded-full">
                  <MessageSquare className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{communications.length}</div>
                  <div className="text-sm text-muted-foreground">总沟通数</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-full">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {communications.filter(item => item.intentLevel === 'A').length}
                  </div>
                  <div className="text-sm text-muted-foreground">高意向</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-yellow-100 rounded-full">
                  <Clock className="h-6 w-6 text-yellow-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {communications.filter(item => item.status === '沟通中').length}
                  </div>
                  <div className="text-sm text-muted-foreground">沟通中</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-100 rounded-full">
                  <User className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {communications.filter(
                      item => item.status === '已获取简历' || item.status === '已获取联系方式'
                    ).length}
                  </div>
                  <div className="text-sm text-muted-foreground">已转化</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-10"
                  placeholder="搜索候选人姓名、公司..."
                  value={searchKeyword}
                  onChange={event => setSearchKeyword(event.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-32">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={intentFilter} onValueChange={setIntentFilter}>
                <SelectTrigger className="w-full md:w-32">
                  <SelectValue placeholder="意向" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部意向</SelectItem>
                  {Object.entries(intentLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>沟通记录列表</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">加载中...</div>
            ) : communications.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">暂无沟通记录</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>候选人</TableHead>
                    <TableHead>平台</TableHead>
                    <TableHead>匹配度</TableHead>
                    <TableHead>沟通状态</TableHead>
                    <TableHead>意向等级</TableHead>
                    <TableHead>沟通统计</TableHead>
                    <TableHead>最后活跃</TableHead>
                    <TableHead>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {communications.map(communication => (
                    <TableRow key={communication.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>{communication.name?.[0] || '匿'}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{communication.name || '匿名'}</div>
                            <div className="text-xs text-muted-foreground">
                              {communication.candidateInfo?.currentCompany || '未知公司'}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {platformLabels[communication.platform] || communication.platform}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                (communication.matchScore || 0) >= 80
                                  ? 'bg-green-500'
                                  : (communication.matchScore || 0) >= 60
                                    ? 'bg-yellow-500'
                                    : 'bg-red-500'
                              }`}
                              style={{ width: `${communication.matchScore || 0}%` }}
                            />
                          </div>
                          <span className="text-sm">{communication.matchScore || 0}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`${statusLabels[communication.status]?.color || 'bg-gray-500'} text-white`}
                        >
                          {communication.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {communication.intentLevel ? (
                          <Badge className={intentLabels[communication.intentLevel]?.color}>
                            {communication.intentLevel}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <span>HR: {communication.communicationStats.hrMessageCount}</span>
                          <span className="mx-1">|</span>
                          <span>候选人: {communication.communicationStats.candidateMessageCount}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{formatTime(communication.lastMessageTime)}</div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => void openDetailDialog(communication)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>沟通详情</DialogTitle>
            </DialogHeader>
            {selectedCommunication && (
              <div className="flex-1 overflow-hidden flex flex-col gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="text-lg">
                          {selectedCommunication.name?.[0] || '匿'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-lg">{selectedCommunication.name || '匿名'}</span>
                          <Badge variant="outline">
                            {platformLabels[selectedCommunication.platform] || selectedCommunication.platform}
                          </Badge>
                          {selectedCommunication.intentLevel && (
                            <Badge className={intentLabels[selectedCommunication.intentLevel]?.color}>
                              {selectedCommunication.intentLevel}级意向
                            </Badge>
                          )}
                        </div>
                        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground">
                          <div>岗位: {selectedCommunication.jobName || '-'}</div>
                          <div>公司: {selectedCommunication.candidateInfo?.currentCompany || '-'}</div>
                          <div>经验: {selectedCommunication.candidateInfo?.experience || '-'}年</div>
                          <div className="md:col-span-2">
                            技能: {selectedCommunication.candidateInfo?.skills?.join('、') || '-'}
                          </div>
                        </div>
                        {selectedCommunication.tags.length > 0 && (
                          <div className="mt-2 flex gap-1 flex-wrap">
                            {selectedCommunication.tags.map(tag => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="text-center p-2 bg-muted rounded">
                    <div className="text-lg font-bold">{selectedCommunication.communicationStats.hrMessageCount}</div>
                    <div className="text-xs text-muted-foreground">HR消息</div>
                  </div>
                  <div className="text-center p-2 bg-muted rounded">
                    <div className="text-lg font-bold">
                      {selectedCommunication.communicationStats.candidateMessageCount}
                    </div>
                    <div className="text-xs text-muted-foreground">候选人消息</div>
                  </div>
                  <div className="text-center p-2 bg-muted rounded">
                    <div className="text-lg font-bold">{selectedCommunication.communicationStats.effectiveRounds}</div>
                    <div className="text-xs text-muted-foreground">有效轮数</div>
                  </div>
                  <div className="text-center p-2 bg-muted rounded">
                    <div className="text-lg font-bold">{selectedCommunication.matchScore || 0}%</div>
                    <div className="text-xs text-muted-foreground">匹配度</div>
                  </div>
                </div>

                <Card className="flex-1 min-h-0">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">消息记录</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-64">
                      <div className="p-4 space-y-3">
                        {detailLoading ? (
                          <div className="text-center py-8 text-sm text-muted-foreground">
                            加载消息中...
                          </div>
                        ) : messages.length === 0 ? (
                          <div className="text-center py-8 text-sm text-muted-foreground">
                            暂无消息记录
                          </div>
                        ) : (
                          messages.map(message => (
                            <div
                              key={message.id}
                              className={`flex ${message.sender === 'hr' ? 'justify-end' : 'justify-start'}`}
                            >
                              <div
                                className={`max-w-[70%] p-3 rounded-lg ${
                                  message.sender === 'hr'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted'
                                }`}
                              >
                                <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                                <div className="flex items-center gap-2 mt-1 text-xs opacity-70">
                                  <span>{formatTime(message.sendTime)}</span>
                                  {message.sender === 'hr' && message.isAuto && (
                                    <Badge variant="outline" className="text-xs py-0">
                                      自动
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
