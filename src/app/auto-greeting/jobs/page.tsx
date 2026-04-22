'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { fetchClient, fetchClientJsonCached } from '@/lib/client-api';
import {
  getBossExtensionTabs,
  pingBossExtension,
  runBossExtensionCommand,
} from '@/lib/auto-greeting/extension-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
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
import { Plus, Search, Edit, Trash2, Play, Pause, ChevronLeft, Download, ExternalLink, Loader2, Rocket } from 'lucide-react';
import { toast } from 'sonner';

interface Job {
  id: string;
  name: string;
  department?: string;
  location: string;
  salaryMin?: number;
  salaryMax?: number;
  requirements: {
    skills: string[];
    experience?: { min: number };
    education?: string[];
  };
  highlights: string[];
  targetPlatforms: string[];
  matchThreshold: number;
  status: string;
  stats: {
    totalGreeted: number;
    totalReplied: number;
    totalHighIntent: number;
  };
  createdAt: string;
}

// 面试官系统岗位类型
interface InterviewerPosition {
  id: number;
  title: string;
  department: string;
  jobDescription: string;
  education: string;
  experience: string | null;
  status: string;
  coreRequirements: Array<{ type: string; name: string; required: boolean }> | null;
  softSkills: string[] | null;
  isGlobal: boolean;
  createdAt: string;
}

// 平台账号类型
interface PlatformAccount {
  id: string;
  platform: string;
  nickname: string;
  accountId?: string;
  loginStatus: string;
  status: string;
}

const SUPPORTED_TASK_PLATFORMS = ['boss'] as const;

interface BossTabOption {
  id?: number;
  active: boolean;
  title: string;
  url: string;
}

interface ExtensionAutomationSettings {
  maxGreetings: number;
  resumeReadMinSeconds: number;
  resumeReadMaxSeconds: number;
  gapMinSeconds: number;
  gapMaxSeconds: number;
  replyDelayMinSeconds: number;
  replyDelayMaxSeconds: number;
  greetingPhaseMinMinutes: number;
  greetingPhaseMaxMinutes: number;
  replyPhaseMinMinutes: number;
  replyPhaseMaxMinutes: number;
}

type TaskLaunchMode = 'playwright' | 'extension';

const DEFAULT_EXTENSION_AUTOMATION_SETTINGS: ExtensionAutomationSettings = {
  maxGreetings: 100,
  resumeReadMinSeconds: 10,
  resumeReadMaxSeconds: 30,
  gapMinSeconds: 25,
  gapMaxSeconds: 45,
  replyDelayMinSeconds: 30,
  replyDelayMaxSeconds: 90,
  greetingPhaseMinMinutes: 60,
  greetingPhaseMaxMinutes: 90,
  replyPhaseMinMinutes: 30,
  replyPhaseMaxMinutes: 60,
};

function normalizeExtensionAutomationSettings(
  settings: Partial<ExtensionAutomationSettings>
): ExtensionAutomationSettings {
  const maxGreetings = Math.max(1, Number(settings.maxGreetings ?? DEFAULT_EXTENSION_AUTOMATION_SETTINGS.maxGreetings));
  const resumeReadMinSeconds = Math.max(
    1,
    Number(settings.resumeReadMinSeconds ?? DEFAULT_EXTENSION_AUTOMATION_SETTINGS.resumeReadMinSeconds)
  );
  const resumeReadMaxSeconds = Math.max(
    resumeReadMinSeconds,
    Number(settings.resumeReadMaxSeconds ?? DEFAULT_EXTENSION_AUTOMATION_SETTINGS.resumeReadMaxSeconds)
  );
  const gapMinSeconds = Math.max(
    1,
    Number(settings.gapMinSeconds ?? DEFAULT_EXTENSION_AUTOMATION_SETTINGS.gapMinSeconds)
  );
  const gapMaxSeconds = Math.max(
    gapMinSeconds,
    Number(settings.gapMaxSeconds ?? DEFAULT_EXTENSION_AUTOMATION_SETTINGS.gapMaxSeconds)
  );
  const replyDelayMinSeconds = Math.max(
    1,
    Number(settings.replyDelayMinSeconds ?? DEFAULT_EXTENSION_AUTOMATION_SETTINGS.replyDelayMinSeconds)
  );
  const replyDelayMaxSeconds = Math.max(
    replyDelayMinSeconds,
    Number(settings.replyDelayMaxSeconds ?? DEFAULT_EXTENSION_AUTOMATION_SETTINGS.replyDelayMaxSeconds)
  );
  const greetingPhaseMinMinutes = Math.max(
    1,
    Number(settings.greetingPhaseMinMinutes ?? DEFAULT_EXTENSION_AUTOMATION_SETTINGS.greetingPhaseMinMinutes)
  );
  const greetingPhaseMaxMinutes = Math.max(
    greetingPhaseMinMinutes,
    Number(settings.greetingPhaseMaxMinutes ?? DEFAULT_EXTENSION_AUTOMATION_SETTINGS.greetingPhaseMaxMinutes)
  );
  const replyPhaseMinMinutes = Math.max(
    1,
    Number(settings.replyPhaseMinMinutes ?? DEFAULT_EXTENSION_AUTOMATION_SETTINGS.replyPhaseMinMinutes)
  );
  const replyPhaseMaxMinutes = Math.max(
    replyPhaseMinMinutes,
    Number(settings.replyPhaseMaxMinutes ?? DEFAULT_EXTENSION_AUTOMATION_SETTINGS.replyPhaseMaxMinutes)
  );

  return {
    maxGreetings,
    resumeReadMinSeconds,
    resumeReadMaxSeconds,
    gapMinSeconds,
    gapMaxSeconds,
    replyDelayMinSeconds,
    replyDelayMaxSeconds,
    greetingPhaseMinMinutes,
    greetingPhaseMaxMinutes,
    replyPhaseMinMinutes,
    replyPhaseMaxMinutes,
  };
}

function randomInteger(min: number, max: number) {
  const normalizedMin = Math.min(min, max);
  const normalizedMax = Math.max(min, max);
  return Math.floor(Math.random() * (normalizedMax - normalizedMin + 1)) + normalizedMin;
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function hashString(input: string): string {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

function buildExtensionPlatformMessageId(
  candidateId: string,
  sender: string,
  content: string,
  rawTime: string,
  index: number
) {
  return `boss-ext-${hashString(`${candidateId}|${sender}|${content}|${rawTime}|${index}`)}`;
}

function isBossRecommendUrl(url: string): boolean {
  return url.includes('/web/chat/recommend') || url.includes('/web/frame/recommend/');
}

function buildJobsCacheKey(status: string, keyword: string) {
  return `auto_greeting_jobs_cache:${status}:${keyword.trim().toLowerCase()}`;
}

function loadJobsCache(status: string, keyword: string): Job[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(buildJobsCacheKey(status, keyword));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as Job[] : [];
  } catch {
    return [];
  }
}

function saveJobsCache(status: string, keyword: string, jobs: Job[]) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(buildJobsCacheKey(status, keyword), JSON.stringify(jobs));
  } catch {
    // ignore cache write failures
  }
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);

  // 从面试官系统导入相关状态
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [interviewerPositions, setInterviewerPositions] = useState<InterviewerPosition[]>([]);
  const [interviewerPositionsLoading, setInterviewerPositionsLoading] = useState(false);
  const [importSearchKeyword, setImportSearchKeyword] = useState('');
  const [selectedPosition, setSelectedPosition] = useState<InterviewerPosition | null>(null);
  const [importedPositionId, setImportedPositionId] = useState<number | null>(null); // 导入时关联的面试官系统岗位ID

  // 启动任务相关状态
  const [startTaskDialogOpen, setStartTaskDialogOpen] = useState(false);
  const [selectedJobForTask, setSelectedJobForTask] = useState<Job | null>(null);
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('');
  const [taskLaunchMode, setTaskLaunchMode] = useState<TaskLaunchMode>('playwright');
  const [taskStarting, setTaskStarting] = useState(false);
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const [extensionLoading, setExtensionLoading] = useState(false);
  const [bossTabs, setBossTabs] = useState<BossTabOption[]>([]);
  const [selectedBossTabId, setSelectedBossTabId] = useState<number | null>(null);
  const [extensionRunResult, setExtensionRunResult] = useState<Record<string, unknown> | null>(null);
  const [extensionLoopRunning, setExtensionLoopRunning] = useState(false);
  const [extensionLoopPaused, setExtensionLoopPaused] = useState(false);
  const [extensionAutomationSettings, setExtensionAutomationSettings] = useState<ExtensionAutomationSettings>(
    DEFAULT_EXTENSION_AUTOMATION_SETTINGS
  );
  const extensionStopRequestedRef = useRef(false);
  const extensionPauseRequestedRef = useRef(false);
  const optimisticJobsRef = useRef<Map<string, Job>>(new Map());
  const hiddenJobIdsRef = useRef<Set<string>>(new Set());

  // 表单状态
  const [formData, setFormData] = useState({
    name: '',
    department: '',
    location: '待补充',
    salaryMin: '',
    salaryMax: '',
    skills: '',
    minExperience: '',
    education: '',
    highlights: '',
    targetPlatforms: ['boss'] as string[],
    matchThreshold: '60',
  });

  const fetchJobs = useCallback(async (forceRefresh: boolean = false) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (searchKeyword) params.append('keyword', searchKeyword);

      const result = await fetchClientJsonCached<any>(`/api/auto-greeting/jobs?${params}`, {}, {
        forceRefresh,
        ttlMs: 10_000,
      });

      if (result.success) {
        const fetchedJobs: Job[] = Array.isArray(result.data?.jobs) ? result.data.jobs : [];
        const mergedJobs = (() => {
          const visibleFetchedJobs = fetchedJobs.filter(
            (job) => !hiddenJobIdsRef.current.has(job.id)
          );
          const nextJobs = [...visibleFetchedJobs];
          const fetchedIds = new Set(visibleFetchedJobs.map((job) => job.id));

          for (const [jobId, job] of optimisticJobsRef.current.entries()) {
            if (hiddenJobIdsRef.current.has(jobId)) {
              continue;
            }

            if (fetchedIds.has(jobId)) {
              optimisticJobsRef.current.delete(jobId);
              continue;
            }

            nextJobs.unshift(job);
          }

          return nextJobs;
        })();

        const fallbackJobs =
          mergedJobs.length === 0
            ? loadJobsCache(statusFilter, searchKeyword)
            : mergedJobs;

        setJobs(fallbackJobs);
        if (fallbackJobs.length > 0) {
          saveJobsCache(statusFilter, searchKeyword, fallbackJobs);
        }
        if (result.data?.syncWarning) {
          toast.error(result.data.syncWarning);
        }
      } else {
        toast.error(result.error || '获取岗位列表失败');
      }
    } catch (error) {
      console.error('获取岗位列表失败:', error);
      toast.error('获取岗位列表失败');
    } finally {
      setLoading(false);
    }
  }, [searchKeyword, statusFilter]);

  const availableAccounts = accounts.filter(
    (account) => account.platform === selectedPlatform && account.status === 'active'
  );

  const taskPlatformOptions = (() => {
    const configuredPlatforms = selectedJobForTask?.targetPlatforms || [];
    const supportedConfigured = configuredPlatforms.filter((platform): platform is string =>
      SUPPORTED_TASK_PLATFORMS.includes(platform as (typeof SUPPORTED_TASK_PLATFORMS)[number])
    );

    if (supportedConfigured.length > 0) {
      return supportedConfigured;
    }

    return ['boss'];
  })();

  useEffect(() => {
    const cachedJobs = loadJobsCache(statusFilter, searchKeyword);
    if (cachedJobs.length > 0) {
      setJobs(cachedJobs);
      setLoading(false);
    }
    void fetchJobs(false);
  }, [fetchJobs]);

  // 获取面试官系统的岗位列表
  const fetchInterviewerPositions = async () => {
    try {
      setInterviewerPositionsLoading(true);
      const params = new URLSearchParams();
      params.append('status', 'active');
      if (importSearchKeyword) params.append('keyword', importSearchKeyword);

      const result = await fetchClientJsonCached<any>(`/api/auto-greeting/positions?${params}`, {}, {
        ttlMs: 15_000,
      });

      if (result.success) {
        setInterviewerPositions(result.data);
      } else {
        toast.error('获取面试官系统岗位失败');
      }
    } catch (error) {
      console.error('获取面试官系统岗位失败:', error);
      toast.error('获取面试官系统岗位失败');
    } finally {
      setInterviewerPositionsLoading(false);
    }
  };

  // 打开导入对话框
  const openImportDialog = () => {
    setImportDialogOpen(true);
    setSelectedPosition(null);
    setImportSearchKeyword('');
    fetchInterviewerPositions();
  };

  // 确认导入岗位
  const handleImportPosition = () => {
    if (!selectedPosition) {
      toast.error('请选择要导入的岗位');
      return;
    }

    // 解析技能要求
    const skills: string[] = [];
    if (selectedPosition.coreRequirements && Array.isArray(selectedPosition.coreRequirements)) {
      selectedPosition.coreRequirements.forEach((req) => {
        if (req.name) skills.push(req.name);
      });
    }

    // 解析经验要求
    let minExperience = '';
    if (selectedPosition.experience) {
      const expMatch = selectedPosition.experience.match(/(\d+)/);
      if (expMatch) {
        minExperience = expMatch[1];
      }
    }

    // 填充表单
    setFormData({
      name: selectedPosition.title,
      department: selectedPosition.department,
      location: '待补充',
      salaryMin: '',
      salaryMax: '',
      skills: skills.join(', '),
      minExperience,
      education: selectedPosition.education || '',
      highlights: '',
      targetPlatforms: ['boss'],
      matchThreshold: '60',
    });

    // 保存关联的面试官系统岗位ID
    setImportedPositionId(selectedPosition.id);

    setEditingJob(null);
    setImportDialogOpen(false);
    setDialogOpen(true);
    toast.success(`已载入岗位: ${selectedPosition.title}，请补充自动打招呼配置`);
  };

  const handleSubmit = async () => {
    try {
      if (!formData.name.trim()) {
        toast.error('请填写岗位名称');
        return;
      }

      if (!formData.skills.split(',').map(s => s.trim()).filter(Boolean).length) {
        toast.error('请至少填写一个技能要求');
        return;
      }

      const payload = {
        name: formData.name.trim(),
        department: formData.department || undefined,
        location: formData.location.trim() || '待补充',
        salaryMin: formData.salaryMin ? parseInt(formData.salaryMin) : undefined,
        salaryMax: formData.salaryMax ? parseInt(formData.salaryMax) : undefined,
        requirements: {
          skills: formData.skills.split(',').map(s => s.trim()).filter(Boolean),
          experience: formData.minExperience ? { min: parseInt(formData.minExperience) } : undefined,
          education: formData.education ? formData.education.split(',').map(s => s.trim()) : [],
        },
        highlights: formData.highlights.split(',').map(s => s.trim()).filter(Boolean),
        targetPlatforms: formData.targetPlatforms.length > 0 ? formData.targetPlatforms : ['boss'],
        matchThreshold: parseInt(formData.matchThreshold),
        positionId: importedPositionId, // 关联面试官系统岗位ID
      };

      let response;
      if (editingJob) {
        response = await fetchClient(`/api/auto-greeting/jobs/${editingJob.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        response = await fetchClient('/api/auto-greeting/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const result = await response.json();
      if (result.success) {
        const nextJobId = String(result.data?.id || editingJob?.id || '');
        const nextJob: Job = {
          id: nextJobId,
          name: payload.name,
          department: payload.department,
          location: payload.location,
          salaryMin: payload.salaryMin,
          salaryMax: payload.salaryMax,
          requirements: payload.requirements,
          highlights: payload.highlights,
          targetPlatforms: payload.targetPlatforms,
          matchThreshold: payload.matchThreshold,
          status: editingJob?.status || 'active',
          stats: editingJob?.stats || {
            totalGreeted: 0,
            totalReplied: 0,
            totalHighIntent: 0,
          },
          createdAt: editingJob?.createdAt || new Date().toISOString(),
        };

        hiddenJobIdsRef.current.delete(nextJobId);
        optimisticJobsRef.current.set(nextJobId, nextJob);
        setSearchKeyword('');
        setStatusFilter('active');
        setJobs((current) => {
          const nextJobs = (() => {
          if (editingJob) {
            const exists = current.some((job) => job.id === nextJobId);
            if (!exists) {
                return [nextJob, ...current];
            }
              return current.map((job) => (job.id === nextJobId ? { ...job, ...nextJob } : job));
          }

            return [nextJob, ...current.filter((job) => job.id !== nextJobId)];
          })();
          saveJobsCache('active', '', nextJobs);
          return nextJobs;
        });
        setDialogOpen(false);
        resetForm();
        toast.success(editingJob ? '岗位更新成功' : '岗位创建成功');
      } else {
        toast.error(result.error || '操作失败');
      }
    } catch (error) {
      console.error('保存岗位失败:', error);
      toast.error('保存失败');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个岗位吗？删除后会归档并从默认列表中隐藏。')) return;

    try {
      const response = await fetchClient(`/api/auto-greeting/jobs/${id}`, {
        method: 'DELETE',
      });
      const result = await response.json();

      if (result.success) {
        hiddenJobIdsRef.current.add(id);
        optimisticJobsRef.current.delete(id);
        setJobs((current) => {
          const nextJobs = current.filter((job) => job.id !== id);
          saveJobsCache(statusFilter, searchKeyword, nextJobs);
          return nextJobs;
        });
        if (statusFilter === 'all') {
          setStatusFilter('active');
        } else {
          await fetchJobs(true);
        }
        toast.success(result.message || '删除成功');
      } else {
        toast.error(result.error || '删除失败');
      }
    } catch (error) {
      console.error('删除岗位失败:', error);
      toast.error('删除失败');
    }
  };

  const handleToggleStatus = async (job: Job) => {
    const newStatus = job.status === 'active' ? 'paused' : 'active';
    try {
      const response = await fetchClient(`/api/auto-greeting/jobs/${job.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const result = await response.json();

      if (result.success) {
        await fetchJobs(true);
        toast.success(job.status === 'active' ? '已暂停' : '已启动');
      }
    } catch (error) {
      console.error('更新状态失败:', error);
      toast.error('更新状态失败');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      department: '',
      location: '待补充',
      salaryMin: '',
      salaryMax: '',
      skills: '',
      minExperience: '',
      education: '',
      highlights: '',
      targetPlatforms: ['boss'],
      matchThreshold: '60',
    });
    setEditingJob(null);
    setImportedPositionId(null); // 清除关联ID
  };

  const refreshBossExtensionTabs = useCallback(async () => {
    setExtensionLoading(true);
    try {
      const ping = await pingBossExtension();
      if (!ping.ok) {
        setExtensionInstalled(false);
        setBossTabs([]);
        setSelectedBossTabId(null);
        return;
      }

      setExtensionInstalled(true);
      const tabsResponse = await getBossExtensionTabs();
      const tabs = tabsResponse.ok && Array.isArray(tabsResponse.data) ? tabsResponse.data : [];
      setBossTabs(tabs);
      const activeTab = tabs.find((tab) => tab.active) || tabs[0];
      setSelectedBossTabId(activeTab?.id ?? null);
    } catch (error) {
      console.error('检测 Boss 扩展失败:', error);
      setExtensionInstalled(false);
      setBossTabs([]);
      setSelectedBossTabId(null);
    } finally {
      setExtensionLoading(false);
    }
  }, []);

  const loadExtensionAutomationDefaults = useCallback(async () => {
    try {
      const result = await fetchClientJsonCached<any>('/api/auto-greeting/settings?category=general', {}, {
        ttlMs: 20_000,
      });

      if (!result.success) {
        setExtensionAutomationSettings(DEFAULT_EXTENSION_AUTOMATION_SETTINGS);
        return;
      }

      const general = result.data?.general || {};
      setExtensionAutomationSettings(
        normalizeExtensionAutomationSettings({
          maxGreetings: general.maxDailyGreetings,
          gapMinSeconds: general.greetingIntervalMin,
          gapMaxSeconds: general.greetingIntervalMax,
          replyDelayMinSeconds: general.replyDelayMin,
          replyDelayMaxSeconds: general.replyDelayMax,
          resumeReadMinSeconds: DEFAULT_EXTENSION_AUTOMATION_SETTINGS.resumeReadMinSeconds,
          resumeReadMaxSeconds: DEFAULT_EXTENSION_AUTOMATION_SETTINGS.resumeReadMaxSeconds,
        })
      );
    } catch (error) {
      console.error('读取系统配置失败，回退到默认扩展参数:', error);
      setExtensionAutomationSettings(DEFAULT_EXTENSION_AUTOMATION_SETTINGS);
    }
  }, []);

  // 打开启动任务对话框
  const loadAccountsForPlatform = useCallback(async (platform: string) => {
    setAccountsLoading(true);
    setAccountsError('');
    setAccounts([]);
    setSelectedAccountId('');

    try {
      const result = await fetchClientJsonCached<any>(`/api/auto-greeting/accounts?platform=${platform}&status=active`, {}, {
        ttlMs: 15_000,
      });

      if (!result.success) {
        setAccountsError(result.error || '获取账号列表失败');
        return;
      }

      const nextAccounts = (result.data || [])
        .filter((acc: PlatformAccount) => acc.platform === platform && acc.status === 'active')
        .sort((left: PlatformAccount, right: PlatformAccount) => {
          const rank = (status: string) => {
            if (status === 'valid') return 0;
            if (status === 'unknown') return 1;
            return 2;
          };
          return rank(left.loginStatus) - rank(right.loginStatus);
        });

      setAccounts(nextAccounts);
      if (nextAccounts.length > 0) {
        setSelectedAccountId(nextAccounts[0].id);
      } else {
        setAccountsError('当前平台暂无可用账号，请先在「平台账号」页面添加或启用账号');
      }
    } catch (error) {
      console.error('获取账号列表失败:', error);
      setAccountsError('获取账号列表失败，请稍后重试');
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  const openStartTaskDialog = async (job: Job) => {
    setSelectedJobForTask(job);
    setStartTaskDialogOpen(true);
    setExtensionRunResult(null);
    setTaskLaunchMode('playwright');

    const configuredPlatforms = job.targetPlatforms.filter((platform) =>
      SUPPORTED_TASK_PLATFORMS.includes(platform as (typeof SUPPORTED_TASK_PLATFORMS)[number])
    );
    const defaultPlatform = configuredPlatforms[0] || 'boss';
    setSelectedPlatform(defaultPlatform);
    void loadAccountsForPlatform(defaultPlatform);
    void refreshBossExtensionTabs();
    void loadExtensionAutomationDefaults();
  };

  // 启动自动化任务
  const handleStartTask = async () => {
    if (!selectedJobForTask || !selectedPlatform) {
      toast.error('请选择平台');
      return;
    }

    setTaskStarting(true);
    try {
      if (taskLaunchMode === 'extension') {
        if (!extensionInstalled || !selectedBossTabId || selectedPlatform !== 'boss') {
          toast.error('当前 Boss 标签页模式不可用，请切换到 Playwright 自动化模式或先准备好扩展标签页');
          return;
        }
        extensionStopRequestedRef.current = false;
        extensionPauseRequestedRef.current = false;
        setExtensionLoopRunning(true);
        setExtensionLoopPaused(false);
        const settings = normalizeExtensionAutomationSettings(extensionAutomationSettings);
        const salaryText =
          selectedJobForTask.salaryMin && selectedJobForTask.salaryMax
            ? `${selectedJobForTask.salaryMin}-${selectedJobForTask.salaryMax}K`
            : '';
        const jobLabel = [selectedJobForTask.name, selectedJobForTask.location, salaryText]
          .filter(Boolean)
          .join(' _ ');

        const records: Array<Record<string, unknown>> = [];
        const startedAt = new Date().toISOString();
        const chatTabId = bossTabs.find((tab) => tab.url.includes('/web/chat/index'))?.id ?? null;
        const updateExtensionProgress = (payload: Record<string, unknown>) => {
          setExtensionRunResult({
            mode: 'boss-extension',
            status: payload.status || (extensionPauseRequestedRef.current ? 'paused' : 'running'),
            startedAt,
            settings,
            jobLabel,
            chatTabId,
            greetedCount: records.filter((record) => record.action === 'greeted').length,
            processedCount: records.length,
            ...payload,
            records: [...records],
          });
        };
        const waitForExtensionContinue = async () => {
          while (extensionPauseRequestedRef.current && !extensionStopRequestedRef.current) {
            setExtensionLoopPaused(true);
            updateExtensionProgress({
              status: 'paused',
              step: 'paused',
            });
            await delay(800);
          }

          if (!extensionPauseRequestedRef.current) {
            setExtensionLoopPaused(false);
          }

          return extensionStopRequestedRef.current;
        };
        const runReplyRound = async () => {
          if (!chatTabId) {
            return {
              repliedCount: 0,
              syncedMessagesCount: 0,
              available: false,
            };
          }

          const openChatResult = await runBossExtensionCommand<Record<string, unknown>>(
            'boss.openChatPage',
            {
              tabId: chatTabId,
              timeoutMs: 18000,
            }
          );
          if (!openChatResult.ok || !openChatResult.data?.response?.ok) {
            records.push({
              action: 'reply-error',
              step: 'boss.openChatPage',
              reason:
                openChatResult.error ||
                openChatResult.data?.response?.error ||
                '打开 Boss 聊天页失败',
              timestamp: new Date().toISOString(),
            });
            return {
              repliedCount: 0,
              syncedMessagesCount: 0,
              available: false,
            };
          }

          const sessionsResult = await runBossExtensionCommand<Array<Record<string, unknown>>>(
            'boss.getChatSessions',
            {
              tabId: chatTabId,
              timeoutMs: 15000,
            }
          );
          if (!sessionsResult.ok || !sessionsResult.data?.response?.ok) {
            records.push({
              action: 'reply-error',
              step: 'boss.getChatSessions',
              reason:
                sessionsResult.error ||
                sessionsResult.data?.response?.error ||
                '获取 Boss 聊天会话失败',
              timestamp: new Date().toISOString(),
            });
            return {
              repliedCount: 0,
              syncedMessagesCount: 0,
              available: true,
            };
          }

          const sessions = Array.isArray(sessionsResult.data.response.data)
            ? sessionsResult.data.response.data
            : [];
          const activeSessions = sessions.filter((session) => {
            const unreadCount = Number(session.unreadCount || 0);
            return Boolean(session.candidateId) && (Boolean(session.hasNewMessage) || unreadCount > 0);
          });

          let repliedCount = 0;
          let syncedMessagesCount = 0;

          for (const session of activeSessions) {
            if (await waitForExtensionContinue()) {
              break;
            }

            const candidateId = String(session.candidateId || '');
            if (!candidateId) {
              continue;
            }

            const lookupResponse = await fetchClient(
              `/api/auto-greeting/communications?jobId=${selectedJobForTask.id}&platform=boss&platformUserId=${encodeURIComponent(candidateId)}`
            );
            const lookupResult = await lookupResponse.json();
            const communication = lookupResult.success ? lookupResult.data?.communication : null;
            const existingMessages = Array.isArray(lookupResult.data?.messages)
              ? lookupResult.data.messages
              : [];
            const existingPlatformMessageIds = new Set(
              existingMessages
                .map((item: Record<string, unknown>) => String(item.platformMessageId || ''))
                .filter(Boolean)
            );

            if (!communication?.id) {
              records.push({
                action: 'reply-skip',
                candidateId,
                candidateName: session.candidateName || '',
                reason: '该候选人尚未在系统中生成沟通记录',
                timestamp: new Date().toISOString(),
              });
              continue;
            }

            const historyResult = await runBossExtensionCommand<Record<string, unknown>>(
              'boss.getChatHistory',
              {
                tabId: chatTabId,
                payload: { candidateId },
                timeoutMs: 15000,
              }
            );
            if (!historyResult.ok || !historyResult.data?.response?.ok) {
              records.push({
                action: 'reply-error',
                candidateId,
                candidateName: session.candidateName || '',
                reason:
                  historyResult.error ||
                  historyResult.data?.response?.error ||
                  '读取聊天记录失败',
                timestamp: new Date().toISOString(),
              });
              continue;
            }

            const rawMessages = Array.isArray((historyResult.data.response.data as Record<string, unknown>)?.messages)
              ? ((historyResult.data.response.data as Record<string, unknown>).messages as Array<Record<string, unknown>>)
              : [];
            const newCandidateMessages: Array<{
              sender: string;
              content: string;
              rawTime: string;
              type?: string;
              platformMessageId: string;
            }> = rawMessages
              .map((item, index) => ({
                sender: String(item.sender || ''),
                content: String(item.content || ''),
                rawTime: String(item.rawTime || ''),
                type: item.type ? String(item.type) : undefined,
                platformMessageId: buildExtensionPlatformMessageId(
                  candidateId,
                  String(item.sender || ''),
                  String(item.content || ''),
                  String(item.rawTime || ''),
                  index
                ),
              }))
              .filter(
                (item) =>
                  item.sender === 'candidate' &&
                  item.content &&
                  !existingPlatformMessageIds.has(String(item.platformMessageId || ''))
              );

            if (newCandidateMessages.length === 0) {
              continue;
            }

            const latestMessage = newCandidateMessages[newCandidateMessages.length - 1];
            syncedMessagesCount += newCandidateMessages.length;

            const previewResponse = await fetchClient('/api/auto-greeting/reply', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                communicationId: communication.id,
                message: latestMessage.content,
                platformMessageId: latestMessage.platformMessageId,
                dryRun: true,
              }),
            });
            const previewResult = await previewResponse.json();

            if (!previewResult.success) {
              records.push({
                action: 'reply-error',
                candidateId,
                candidateName: session.candidateName || '',
                reason: previewResult.error || '生成自动回复失败',
                timestamp: new Date().toISOString(),
              });
              continue;
            }

            const plannedReply = typeof previewResult.data?.reply === 'string'
              ? previewResult.data.reply.trim()
              : '';
            const nextAction = String(previewResult.data?.strategy?.nextAction || '');

            if (!plannedReply) {
              await fetchClient('/api/auto-greeting/reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  communicationId: communication.id,
                  message: latestMessage.content,
                  platformMessageId: latestMessage.platformMessageId,
                  dryRun: false,
                  performSend: false,
                }),
              });

              records.push({
                action: 'reply-synced',
                candidateId,
                candidateName: session.candidateName || '',
                nextAction,
                reason: '仅同步候选人消息，不发送自动回复',
                timestamp: new Date().toISOString(),
              });
              continue;
            }

            const replyDelaySeconds = randomInteger(
              settings.replyDelayMinSeconds,
              settings.replyDelayMaxSeconds
            );
            updateExtensionProgress({
              step: 'candidate.replying',
              currentReplyCandidate: {
                candidateId,
                candidateName: session.candidateName || '',
                nextAction,
                replyDelaySeconds,
              },
            });

            if (await waitForExtensionContinue()) {
              break;
            }

            await delay(replyDelaySeconds * 1000);

            const sendReplyResult = await runBossExtensionCommand<Record<string, unknown>>(
              'boss.replyMessage',
              {
                tabId: chatTabId,
                payload: {
                  candidateId,
                  message: plannedReply,
                },
                timeoutMs: 18000,
              }
            );
            if (!sendReplyResult.ok || !sendReplyResult.data?.response?.ok) {
              records.push({
                action: 'reply-error',
                candidateId,
                candidateName: session.candidateName || '',
                reason:
                  sendReplyResult.error ||
                  sendReplyResult.data?.response?.error ||
                  'Boss 自动回复发送失败',
                timestamp: new Date().toISOString(),
              });
              continue;
            }

            await fetchClient('/api/auto-greeting/reply', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                communicationId: communication.id,
                message: latestMessage.content,
                platformMessageId: latestMessage.platformMessageId,
                dryRun: false,
                performSend: false,
                externalDelivery: true,
                replyOverride: plannedReply,
              }),
            });

            repliedCount += 1;
            records.push({
              action: 'replied',
              candidateId,
              candidateName: session.candidateName || '',
              nextAction,
              replyDelaySeconds,
              replyMessage: plannedReply,
              timestamp: new Date().toISOString(),
            });
          }

          return {
            repliedCount,
            syncedMessagesCount,
            available: true,
          };
        };

        await runBossExtensionCommand<Record<string, unknown>>('boss.resetSeenCandidates', {
          tabId: selectedBossTabId,
          timeoutMs: 8000,
        });

        const pageInfo = await runBossExtensionCommand<Record<string, unknown>>('boss.getPageInfo', {
          tabId: selectedBossTabId,
          timeoutMs: 10000,
        });
        if (!pageInfo.ok || !pageInfo.data?.response?.ok) {
          toast.error(pageInfo.error || pageInfo.data?.response?.error || '读取 Boss 页面失败');
          return;
        }

        const pageData = pageInfo.data.response.data as Record<string, unknown>;
        const currentUrl = String(pageData.url || '');
        const topUrl = String(pageData.topUrl || '');
        if (!isBossRecommendUrl(currentUrl) && !isBossRecommendUrl(topUrl)) {
          toast.error('请先在同一个浏览器中打开并停留在 Boss 的“推荐牛人”页面');
          updateExtensionProgress({
            status: 'failed',
            step: 'boss.getPageInfo',
            pageInfo: pageData,
          });
          return;
        }

        updateExtensionProgress({
          pageInfo: pageData,
          step: 'boss.getPageInfo',
        });

        const selectedJobResult = await runBossExtensionCommand<Record<string, unknown>>(
          'boss.selectRecommendJob',
          {
            tabId: selectedBossTabId,
            payload: { jobLabel },
            timeoutMs: 12000,
          }
        );
        if (!selectedJobResult.ok || !selectedJobResult.data?.response?.ok) {
          const errorMessage =
            selectedJobResult.error ||
            selectedJobResult.data?.response?.error ||
            '选择推荐岗位失败';
          updateExtensionProgress({
            status: 'failed',
            step: 'boss.selectRecommendJob',
            pageInfo: pageData,
            selectedJobError: errorMessage,
            selectedJobRaw: selectedJobResult.data?.response?.data || null,
          });
          toast.error(errorMessage);
          return;
        }

        const selectedJobData = selectedJobResult.data.response.data as Record<string, unknown>;
        updateExtensionProgress({
          pageInfo: pageData,
          selectedJob: selectedJobData,
          step: 'boss.selectRecommendJob',
        });

        setTaskStarting(false);
        toast.success('当前 Boss 标签页流程已启动，可使用“暂停/停止”控制执行');

        let greetedCount = 0;
        let skippedCount = 0;
        let exhausted = false;
        let repliedCount = 0;
        let syncedMessagesCount = 0;
        let currentPhase: 'greet' | 'reply' = 'greet';

        const createPhaseWindow = (phase: 'greet' | 'reply') => {
          const durationMinutes = phase === 'greet'
            ? randomInteger(settings.greetingPhaseMinMinutes, settings.greetingPhaseMaxMinutes)
            : randomInteger(settings.replyPhaseMinMinutes, settings.replyPhaseMaxMinutes);

          return {
            phase,
            durationMinutes,
            startedAt: new Date().toISOString(),
            endsAt: Date.now() + durationMinutes * 60 * 1000,
          };
        };

        let phaseWindow = createPhaseWindow(currentPhase);

        const switchPhase = (nextPhase: 'greet' | 'reply') => {
          currentPhase = nextPhase;
          phaseWindow = createPhaseWindow(nextPhase);
          updateExtensionProgress({
            step: 'phase.switch',
            currentPhase,
            phaseWindow,
            greetedCount,
            skippedCount,
            repliedCount,
            syncedMessagesCount,
          });
        };

        const runGreetingStep = async () => {
          const inspectResult = await runBossExtensionCommand<Record<string, unknown>>(
            'boss.inspectNextCandidate',
            {
              tabId: selectedBossTabId,
              timeoutMs: 20000,
            }
          );
          if (!inspectResult.ok || !inspectResult.data?.response?.ok) {
            const errorMessage =
              inspectResult.error || inspectResult.data?.response?.error || '读取候选人简历失败';
            updateExtensionProgress({
              status: 'failed',
              step: 'boss.inspectNextCandidate',
              currentPhase,
              phaseWindow,
              error: errorMessage,
            });
            toast.error(errorMessage);
            return { fatal: true };
          }

          const inspectData = inspectResult.data.response.data as Record<string, unknown>;
          if (Boolean(inspectData.exhausted)) {
            exhausted = true;
            return { exhausted: true };
          }

          if (inspectData.dialogVisible !== true) {
            skippedCount += 1;
            records.push({
              action: 'skip',
              reason: inspectData.error || '未成功打开简历弹窗',
              inspect: inspectData,
              timestamp: new Date().toISOString(),
            });
            updateExtensionProgress({
              step: 'candidate.resume_required',
              currentPhase,
              phaseWindow,
              skippedCount,
              lastInspect: inspectData,
            });
            await runBossExtensionCommand<Record<string, unknown>>('boss.skipCurrentCandidate', {
              tabId: selectedBossTabId,
              timeoutMs: 8000,
            });
            return { worked: true };
          }

          const candidate =
            inspectData.candidate && typeof inspectData.candidate === 'object'
              ? (inspectData.candidate as Record<string, unknown>)
              : null;
          if (!candidate) {
            records.push({
              action: 'skip',
              reason: inspectData.error || '候选人信息为空',
              inspect: inspectData,
              timestamp: new Date().toISOString(),
            });
            updateExtensionProgress({
              step: 'boss.inspectNextCandidate',
              currentPhase,
              phaseWindow,
              lastInspect: inspectData,
            });
            return { worked: false };
          }

          updateExtensionProgress({
            step: 'candidate.inspect',
            currentPhase,
            phaseWindow,
            lastInspect: inspectData,
            currentCandidate: candidate,
          });

          const previewResponse = await fetchClient('/api/auto-greeting/greeting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jobId: selectedJobForTask.id,
              platform: 'boss',
              candidate,
              dryRun: true,
            }),
          });
          const previewResult = await previewResponse.json();

          const reviewSeconds = randomInteger(
            settings.resumeReadMinSeconds,
            settings.resumeReadMaxSeconds
          );
          updateExtensionProgress({
            step: 'candidate.review',
            currentPhase,
            phaseWindow,
            currentCandidate: candidate,
            reviewSeconds,
            preview: previewResult,
          });

          if (await waitForExtensionContinue()) {
            return { stopped: true };
          }

          await runBossExtensionCommand<Record<string, unknown>>('boss.reviewCurrentCandidateResume', {
            tabId: selectedBossTabId,
            payload: { durationMs: reviewSeconds * 1000 },
            timeoutMs: reviewSeconds * 1000 + 12000,
          });

          if (!previewResult.success) {
            await runBossExtensionCommand<Record<string, unknown>>('boss.skipCurrentCandidate', {
              tabId: selectedBossTabId,
              timeoutMs: 8000,
            });

            skippedCount += 1;
            records.push({
              action: 'skip',
              candidateName: candidate.name || '未命名候选人',
              candidateId: candidate.id || candidate.geekKey || null,
              reviewSeconds,
              reason: previewResult.error || '匹配未通过',
              matchScore: previewResult.matchScore ?? null,
              matchReasons: previewResult.matchReasons ?? [],
              timestamp: new Date().toISOString(),
            });

            updateExtensionProgress({
              step: 'candidate.skip',
              currentPhase,
              phaseWindow,
              skippedCount,
            });

            if (await waitForExtensionContinue()) {
              return { stopped: true };
            }
            await delay(randomInteger(1200, 3600));
            return { worked: true };
          }

          if (await waitForExtensionContinue()) {
            return { stopped: true };
          }

          const greetResult = await runBossExtensionCommand<Record<string, unknown>>(
            'boss.greetCurrentCandidate',
            {
              tabId: selectedBossTabId,
              timeoutMs: 12000,
            }
          );
          if (!greetResult.ok || !greetResult.data?.response?.ok) {
            const errorMessage =
              greetResult.error || greetResult.data?.response?.error || 'Boss 打招呼失败';
            records.push({
              action: 'error',
              candidateName: candidate.name || '未命名候选人',
              candidateId: candidate.id || candidate.geekKey || null,
              reviewSeconds,
              reason: errorMessage,
              timestamp: new Date().toISOString(),
            });
            updateExtensionProgress({
              status: 'failed',
              step: 'boss.greetCurrentCandidate',
              currentPhase,
              phaseWindow,
              error: errorMessage,
            });
            toast.error(errorMessage);
            return { fatal: true };
          }

          greetedCount += 1;
          let persistenceResult: Record<string, unknown> | null = null;
          let persistenceError: string | null = null;
          try {
            const persistResponse = await fetchClient('/api/auto-greeting/greeting', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jobId: selectedJobForTask.id,
                accountId: selectedAccountId || null,
                platform: 'boss',
                candidate,
                dryRun: false,
                performSend: false,
                externalDelivery: true,
                actualMessage:
                  typeof previewResult.data?.greetingMessage === 'string'
                    ? previewResult.data.greetingMessage
                    : undefined,
              }),
            });
            const persistResult = await persistResponse.json();
            if (persistResult.success) {
              persistenceResult = persistResult.data || null;
            } else {
              persistenceError = persistResult.error || '回写沟通记录失败';
            }
          } catch (error) {
            persistenceError = error instanceof Error ? error.message : '回写沟通记录失败';
          }

          const gapSeconds =
            greetedCount < settings.maxGreetings
              ? randomInteger(settings.gapMinSeconds, settings.gapMaxSeconds)
              : 0;
          records.push({
            action: 'greeted',
            candidateName: candidate.name || '未命名候选人',
            candidateId: candidate.id || candidate.geekKey || null,
            reviewSeconds,
            gapSeconds,
            matchScore: previewResult.data?.matchScore ?? null,
            matchReasons: previewResult.data?.matchReasons ?? [],
            greetingMessage: previewResult.data?.greetingMessage ?? '',
            greetResult: greetResult.data.response.data,
            persistenceResult,
            persistenceError,
            timestamp: new Date().toISOString(),
          });

          updateExtensionProgress({
            step: 'candidate.greeted',
            currentPhase,
            phaseWindow,
            greetedCount,
            skippedCount,
            repliedCount,
            syncedMessagesCount,
            currentCandidate: candidate,
            lastGreet: greetResult.data.response.data,
          });

          if (gapSeconds > 0) {
            if (await waitForExtensionContinue()) {
              return { stopped: true };
            }
            await delay(gapSeconds * 1000);
          }

          return { worked: true };
        };

        while (greetedCount < settings.maxGreetings && !extensionStopRequestedRef.current) {
          if (await waitForExtensionContinue()) {
            break;
          }

          const phaseExpired = Date.now() >= phaseWindow.endsAt;
          if (phaseExpired) {
            if (currentPhase === 'greet' && chatTabId) {
              switchPhase('reply');
            } else {
              switchPhase('greet');
            }
            continue;
          }

          if (currentPhase === 'greet') {
            if (exhausted) {
              if (chatTabId) {
                switchPhase('reply');
                continue;
              }
              break;
            }

            const result = await runGreetingStep();
            if (result?.fatal) {
              return;
            }
            if (result?.stopped) {
              break;
            }
            if (result?.exhausted) {
              if (chatTabId) {
                switchPhase('reply');
                continue;
              }
              break;
            }
            continue;
          }

          const replyRoundResult = await runReplyRound();
          repliedCount += replyRoundResult.repliedCount;
          syncedMessagesCount += replyRoundResult.syncedMessagesCount;
          updateExtensionProgress({
            step: 'reply.round',
            currentPhase,
            phaseWindow,
            greetedCount,
            skippedCount,
            repliedCount,
            syncedMessagesCount,
            chatTabAvailable: replyRoundResult.available,
          });

          if (await waitForExtensionContinue()) {
            break;
          }

          if (Date.now() >= phaseWindow.endsAt || !chatTabId) {
            switchPhase('greet');
            continue;
          }

          const idleSeconds = randomInteger(
            Math.max(20, settings.replyDelayMinSeconds),
            Math.max(Math.max(20, settings.replyDelayMinSeconds), settings.replyDelayMaxSeconds)
          );
          await delay(idleSeconds * 1000);
        }

        const finalReplyRoundResult =
          chatTabId && !extensionStopRequestedRef.current
            ? await runReplyRound()
            : {
                repliedCount: 0,
                syncedMessagesCount: 0,
                available: Boolean(chatTabId),
              };
        repliedCount += finalReplyRoundResult.repliedCount;
        syncedMessagesCount += finalReplyRoundResult.syncedMessagesCount;

        updateExtensionProgress({
          status: extensionStopRequestedRef.current ? 'stopped' : 'completed',
          step: extensionStopRequestedRef.current ? 'stopped' : 'completed',
          currentPhase,
          phaseWindow,
          greetedCount,
          skippedCount,
          repliedCount,
          syncedMessagesCount,
          chatTabAvailable: finalReplyRoundResult.available,
          exhausted,
          completedAt: new Date().toISOString(),
        });
        if (extensionStopRequestedRef.current) {
          toast.success(`已停止当前 Boss 标签页流程，累计打招呼 ${greetedCount} 人`);
        } else {
          toast.success(`当前 Boss 标签页流程已完成，累计打招呼 ${greetedCount} 人`);
        }
        return;
      }

      if (!selectedAccountId) {
        toast.error('请先选择 Boss 账号');
        return;
      }

      const response = await fetchClient('/api/auto-greeting/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobPositionId: selectedJobForTask.id,
          accountId: selectedAccountId,
          platform: selectedPlatform,
          executionMode: selectedPlatform === 'boss' ? 'computer-user-playwright-mcp' : undefined,
          taskType: 'all',
        }),
      });
      const result = await response.json();

      if (result.success) {
        toast.success('自动化任务已启动');
        setStartTaskDialogOpen(false);
        // 更新岗位状态为运行中
        fetchJobs(true);
      } else {
        toast.error(result.error || '启动任务失败');
      }
    } catch (error) {
      console.error('启动任务失败:', error);
      toast.error('启动任务失败');
    } finally {
      setExtensionLoopRunning(false);
      setExtensionLoopPaused(false);
      extensionStopRequestedRef.current = false;
      extensionPauseRequestedRef.current = false;
      setTaskStarting(false);
    }
  };

  const openEditDialog = (job: Job) => {
    setEditingJob(job);
    setFormData({
      name: job.name,
      department: job.department || '',
      location: job.location,
      salaryMin: job.salaryMin?.toString() || '',
      salaryMax: job.salaryMax?.toString() || '',
      skills: job.requirements.skills.join(', '),
      minExperience: job.requirements.experience?.min?.toString() || '',
      education: job.requirements.education?.join(', ') || '',
      highlights: job.highlights.join(', '),
      targetPlatforms: job.targetPlatforms,
      matchThreshold: job.matchThreshold.toString(),
    });
    setDialogOpen(true);
  };

  const platformLabels: Record<string, string> = {
    boss: 'Boss直聘',
    zhilian: '智联招聘',
    liepin: '猎聘',
    '51job': '前程无忧',
  };

  const statusLabels: Record<string, { label: string; color: string }> = {
    active: { label: '运行中', color: 'bg-green-500' },
    paused: { label: '已暂停', color: 'bg-yellow-500' },
    archived: { label: '已归档', color: 'bg-gray-500' },
  };

  // 筛选面试官系统岗位
  const filteredInterviewerPositions = interviewerPositions.filter(pos => {
    if (!importSearchKeyword) return true;
    const keyword = importSearchKeyword.toLowerCase();
    return (
      pos.title.toLowerCase().includes(keyword) ||
      pos.department.toLowerCase().includes(keyword)
    );
  });

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
            <span className="text-sm font-medium">岗位管理</span>
          </div>
        </div>
      </nav>

      <div className="container mx-auto py-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">岗位管理</h1>
          <p className="text-muted-foreground">页面会自动同步面试官系统中的岗位，你可以在这里补充自动打招呼配置</p>
        </div>
        <div className="flex gap-2">
          {/* 查看同步源岗位 */}
          <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" onClick={openImportDialog}>
                <Download className="mr-2 h-4 w-4" />
                查看同步源
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle>面试官岗位同步源</DialogTitle>
                <DialogDescription>
                  岗位进入页面时会自动同步到这里；你也可以从同步源快速载入信息并补充配置
                </DialogDescription>
              </DialogHeader>
              
              {/* 搜索 */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-10"
                  placeholder="搜索岗位名称、部门..."
                  value={importSearchKeyword}
                  onChange={(e) => setImportSearchKeyword(e.target.value)}
                />
              </div>

              {/* 岗位列表 */}
              <div className="flex-1 overflow-auto border rounded-lg">
                {interviewerPositionsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-muted-foreground">加载中...</span>
                  </div>
                ) : filteredInterviewerPositions.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    暂无可同步的岗位
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>岗位名称</TableHead>
                        <TableHead>部门</TableHead>
                        <TableHead>学历要求</TableHead>
                        <TableHead>经验要求</TableHead>
                        <TableHead>状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInterviewerPositions.map((pos) => (
                        <TableRow 
                          key={pos.id}
                          className={`cursor-pointer hover:bg-muted/50 ${
                            selectedPosition?.id === pos.id ? 'bg-primary/10' : ''
                          }`}
                          onClick={() => setSelectedPosition(pos)}
                        >
                          <TableCell>
                            <div className={`w-4 h-4 rounded-full border-2 ${
                              selectedPosition?.id === pos.id 
                                ? 'bg-primary border-primary' 
                                : 'border-muted-foreground'
                            }`} />
                          </TableCell>
                          <TableCell className="font-medium">{pos.title}</TableCell>
                          <TableCell>{pos.department}</TableCell>
                          <TableCell>{pos.education}</TableCell>
                          <TableCell>{pos.experience || '不限'}</TableCell>
                          <TableCell>
                            <Badge variant={pos.status === 'active' ? 'default' : 'secondary'}>
                              {pos.status === 'active' ? '招聘中' : '已关闭'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* 底部操作 */}
              <div className="flex items-center justify-between pt-4 border-t">
                <Link 
                  href="/positions" 
                  target="_blank"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  前往面试官系统岗位管理
                  <ExternalLink className="h-3 w-3" />
                </Link>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                    取消
                  </Button>
                  <Button onClick={handleImportPosition} disabled={!selectedPosition}>
                    载入并补充配置
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* 新建岗位按钮 */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" />
                新建岗位
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingJob ? '编辑岗位' : '新建岗位'}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">岗位名称 *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="如：高级Java工程师"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="department">所属部门</Label>
                    <Input
                      id="department"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      placeholder="如：技术部"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="location">工作地点 *</Label>
                    <Input
                      id="location"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      placeholder="如：北京朝阳区"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="salaryMin">最低薪资(K)</Label>
                    <Input
                      id="salaryMin"
                      type="number"
                      value={formData.salaryMin}
                      onChange={(e) => setFormData({ ...formData, salaryMin: e.target.value })}
                      placeholder="如：20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="salaryMax">最高薪资(K)</Label>
                    <Input
                      id="salaryMax"
                      type="number"
                      value={formData.salaryMax}
                      onChange={(e) => setFormData({ ...formData, salaryMax: e.target.value })}
                      placeholder="如：35"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="skills">技能要求（逗号分隔）*</Label>
                  <Input
                    id="skills"
                    value={formData.skills}
                    onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
                    placeholder="如：Java, Spring Boot, MySQL"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="minExperience">最低工作年限</Label>
                    <Input
                      id="minExperience"
                      type="number"
                      value={formData.minExperience}
                      onChange={(e) => setFormData({ ...formData, minExperience: e.target.value })}
                      placeholder="如：3"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="education">学历要求（逗号分隔）</Label>
                    <Input
                      id="education"
                      value={formData.education}
                      onChange={(e) => setFormData({ ...formData, education: e.target.value })}
                      placeholder="如：本科, 硕士"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="highlights">岗位亮点（逗号分隔）</Label>
                  <Input
                    id="highlights"
                    value={formData.highlights}
                    onChange={(e) => setFormData({ ...formData, highlights: e.target.value })}
                    placeholder="如：六险一金, 弹性工作, 年终奖"
                  />
                </div>

                <div className="space-y-2">
                  <Label>目标平台 *</Label>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(platformLabels).map(([value, label]) => (
                      <Badge
                        key={value}
                        variant={formData.targetPlatforms.includes(value) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => {
                          const platforms = formData.targetPlatforms.includes(value)
                            ? formData.targetPlatforms.filter((p) => p !== value)
                            : [...formData.targetPlatforms, value];
                          setFormData({ ...formData, targetPlatforms: platforms });
                        }}
                      >
                        {label}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="matchThreshold">匹配阈值（0-100）</Label>
                  <Input
                    id="matchThreshold"
                    type="number"
                    min="0"
                    max="100"
                    value={formData.matchThreshold}
                    onChange={(e) => setFormData({ ...formData, matchThreshold: e.target.value })}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    取消
                  </Button>
                  <Button onClick={handleSubmit}>
                    {editingJob ? '保存' : '创建'}
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
                placeholder="搜索岗位名称、部门、地点..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="状态筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="active">运行中</SelectItem>
                <SelectItem value="paused">已暂停</SelectItem>
                <SelectItem value="archived">已归档</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 岗位列表 */}
      <Card>
        <CardHeader>
          <CardTitle>岗位列表</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">加载中...</div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              暂无岗位数据，系统会在进入页面时自动同步面试官系统中的岗位
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>岗位名称</TableHead>
                  <TableHead>工作地点</TableHead>
                  <TableHead>薪资范围</TableHead>
                  <TableHead>目标平台</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>统计数据</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{job.name}</div>
                        {job.department && (
                          <div className="text-sm text-muted-foreground">{job.department}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{job.location}</TableCell>
                    <TableCell>
                      {job.salaryMin && job.salaryMax
                        ? `${job.salaryMin}-${job.salaryMax}K`
                        : '面议'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {job.targetPlatforms.map((p) => (
                          <Badge key={p} variant="secondary" className="text-xs">
                            {platformLabels[p] || p}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`${statusLabels[job.status]?.color || 'bg-gray-500'} text-white`}
                      >
                        {statusLabels[job.status]?.label || job.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>已打招呼: {job.stats.totalGreeted}</div>
                        <div>已回复: {job.stats.totalReplied}</div>
                        <div>高意向: {job.stats.totalHighIntent}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openStartTaskDialog(job)}
                          title="启动自动化任务"
                          className="text-primary hover:text-primary"
                        >
                          <Rocket className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleToggleStatus(job)}
                          title={job.status === 'active' ? '暂停' : '启动'}
                        >
                          {job.status === 'active' ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEditDialog(job)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(job.id)}
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

      {/* 启动自动化任务对话框 */}
      <Dialog
        open={startTaskDialogOpen}
        onOpenChange={(open) => {
          if (!open && extensionLoopRunning) {
            toast.error('当前 Boss 标签页流程仍在执行，请先暂停或停止后再关闭弹窗');
            return;
          }
          setStartTaskDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>启动自动化任务</DialogTitle>
            <DialogDescription>
              为岗位「{selectedJobForTask?.name}」启动自动化打招呼与回复任务
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1">
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>启动方式</Label>
              <div className="grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setTaskLaunchMode('playwright')}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    taskLaunchMode === 'playwright'
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-background hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Rocket className="h-4 w-4" />
                    <span className="font-medium">推荐：Playwright 自动化</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    直接使用已登录 Boss 账号执行自动打招呼。这是当前默认方案，不需要浏览器插件。
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setTaskLaunchMode('extension')}
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    taskLaunchMode === 'extension'
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-background hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4" />
                    <span className="font-medium">兼容：当前 Boss 标签页</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    只有你想继续使用旧的浏览器扩展标签页方式时，才需要选这个模式。
                  </p>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>目标平台</Label>
              <Select value={selectedPlatform} onValueChange={(value) => {
                setSelectedPlatform(value);
                void loadAccountsForPlatform(value);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="选择平台" />
                </SelectTrigger>
                <SelectContent>
                  {taskPlatformOptions.map((value) => (
                    <SelectItem key={value} value={value}>
                      {platformLabels[value] || value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                当前自动化任务仅支持 Boss 直聘。若岗位未配置平台，这里会默认使用 Boss。
              </p>
            </div>

            <div className="space-y-2">
              <Label>{taskLaunchMode === 'playwright' ? '选择 Boss 账号' : '选择账号'}</Label>
              {taskLaunchMode === 'playwright' && (
                <div className="rounded-md border bg-blue-50 px-3 py-3 text-sm text-blue-700 dark:bg-blue-950 dark:text-blue-200">
                  现在默认走 Playwright 自动化。你只需要在这里选择一个已登录的 Boss 账号，然后点右下角“启动任务”。
                </div>
              )}
              {accountsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="ml-2 text-muted-foreground">加载账号列表...</span>
                </div>
              ) : availableAccounts.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  <p>{accountsError || '该平台暂无可用账号'}</p>
                  <p className="text-sm mt-1">请先在「平台账号」页面添加并激活账号</p>
                  <Link
                    href={`/auto-greeting/accounts?interactive=${selectedPlatform || 'boss'}`}
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2"
                  >
                    去人工登录 {platformLabels[selectedPlatform] || selectedPlatform || 'Boss直聘'}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              ) : (
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择账号" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {`${account.nickname || account.accountId || account.id} ${
                          account.loginStatus === 'valid'
                            ? '(已登录)'
                            : account.loginStatus === 'unknown'
                              ? '(待验证)'
                              : '(已过期)'
                        }`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedPlatform === 'boss' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>当前 Boss 标签页模式</Label>
                  <Button variant="outline" size="sm" onClick={() => void refreshBossExtensionTabs()} disabled={extensionLoading}>
                    {extensionLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        检测中
                      </>
                    ) : (
                      '检测扩展'
                    )}
                  </Button>
                </div>
                {!extensionInstalled ? (
                  <div className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">
                    未检测到 Boss 扩展。这不影响默认的 Playwright 自动化启动；只有你切到“当前 Boss 标签页”模式时才需要扩展。
                  </div>
                ) : bossTabs.length === 0 ? (
                  <div className="rounded-md border bg-muted p-3 text-sm text-muted-foreground">
                    已检测到扩展，但当前浏览器没有打开 Boss 标签页。请先在同一个 Chrome 中打开并登录 Boss 的推荐牛人页面。
                  </div>
                ) : (
                  <div className="space-y-2">
                    {bossTabs.map((tab) => (
                      <label
                        key={tab.id || `${tab.title}-${tab.url}`}
                        className="flex items-start gap-3 rounded-md border bg-background p-3 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="boss-tab-picker"
                          checked={selectedBossTabId === tab.id}
                          onChange={() => setSelectedBossTabId(tab.id || null)}
                        />
                        <div className="min-w-0">
                          <div className="font-medium flex items-center gap-2">
                            <span>{tab.title || 'Boss 标签页'}</span>
                            {tab.active && <Badge variant="secondary">当前活动</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground break-all">{tab.url}</div>
                        </div>
                      </label>
                    ))}
                    <p className="text-xs text-muted-foreground">
                      如果使用当前 Boss 标签页模式，系统会直接在这个标签页里执行“推荐牛人 {'->'} 选岗 {'->'} 看简历 {'->'} 打招呼”。
                    </p>
                  </div>
                )}

                <div className="rounded-lg border bg-muted/40 p-4 space-y-4">
                  <div>
                    <p className="text-sm font-medium">拟人化执行参数</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      默认会优先读取“系统配置”中的打招呼间隔与每日上限；看简历时长按你要求默认 10-30 秒，可在这里覆盖。
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="extension-max-greetings">最大打招呼数量</Label>
                      <Input
                        id="extension-max-greetings"
                        type="number"
                        min={1}
                        value={extensionAutomationSettings.maxGreetings}
                        onChange={(event) =>
                          setExtensionAutomationSettings((current) =>
                            normalizeExtensionAutomationSettings({
                              ...current,
                              maxGreetings: Number(event.target.value || current.maxGreetings),
                            })
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="extension-gap-min">打招呼最短间隔（秒）</Label>
                      <Input
                        id="extension-gap-min"
                        type="number"
                        min={1}
                        value={extensionAutomationSettings.gapMinSeconds}
                        onChange={(event) =>
                          setExtensionAutomationSettings((current) =>
                            normalizeExtensionAutomationSettings({
                              ...current,
                              gapMinSeconds: Number(event.target.value || current.gapMinSeconds),
                            })
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="extension-read-min">看简历最短时长（秒）</Label>
                      <Input
                        id="extension-read-min"
                        type="number"
                        min={1}
                        value={extensionAutomationSettings.resumeReadMinSeconds}
                        onChange={(event) =>
                          setExtensionAutomationSettings((current) =>
                            normalizeExtensionAutomationSettings({
                              ...current,
                              resumeReadMinSeconds: Number(
                                event.target.value || current.resumeReadMinSeconds
                              ),
                            })
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="extension-read-max">看简历最长时长（秒）</Label>
                      <Input
                        id="extension-read-max"
                        type="number"
                        min={1}
                        value={extensionAutomationSettings.resumeReadMaxSeconds}
                        onChange={(event) =>
                          setExtensionAutomationSettings((current) =>
                            normalizeExtensionAutomationSettings({
                              ...current,
                              resumeReadMaxSeconds: Number(
                                event.target.value || current.resumeReadMaxSeconds
                              ),
                            })
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="extension-gap-max">打招呼最长间隔（秒）</Label>
                      <Input
                        id="extension-gap-max"
                        type="number"
                        min={1}
                        value={extensionAutomationSettings.gapMaxSeconds}
                        onChange={(event) =>
                          setExtensionAutomationSettings((current) =>
                            normalizeExtensionAutomationSettings({
                              ...current,
                              gapMaxSeconds: Number(event.target.value || current.gapMaxSeconds),
                            })
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="extension-reply-delay-min">自动回复最短延迟（秒）</Label>
                      <Input
                        id="extension-reply-delay-min"
                        type="number"
                        min={1}
                        value={extensionAutomationSettings.replyDelayMinSeconds}
                        onChange={(event) =>
                          setExtensionAutomationSettings((current) =>
                            normalizeExtensionAutomationSettings({
                              ...current,
                              replyDelayMinSeconds: Number(
                                event.target.value || current.replyDelayMinSeconds
                              ),
                            })
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="extension-reply-delay-max">自动回复最长延迟（秒）</Label>
                      <Input
                        id="extension-reply-delay-max"
                        type="number"
                        min={1}
                        value={extensionAutomationSettings.replyDelayMaxSeconds}
                        onChange={(event) =>
                          setExtensionAutomationSettings((current) =>
                            normalizeExtensionAutomationSettings({
                              ...current,
                              replyDelayMaxSeconds: Number(
                                event.target.value || current.replyDelayMaxSeconds
                              ),
                            })
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="extension-greet-phase-min">打招呼阶段最短时长（分钟）</Label>
                      <Input
                        id="extension-greet-phase-min"
                        type="number"
                        min={1}
                        value={extensionAutomationSettings.greetingPhaseMinMinutes}
                        onChange={(event) =>
                          setExtensionAutomationSettings((current) =>
                            normalizeExtensionAutomationSettings({
                              ...current,
                              greetingPhaseMinMinutes: Number(
                                event.target.value || current.greetingPhaseMinMinutes
                              ),
                            })
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="extension-greet-phase-max">打招呼阶段最长时长（分钟）</Label>
                      <Input
                        id="extension-greet-phase-max"
                        type="number"
                        min={1}
                        value={extensionAutomationSettings.greetingPhaseMaxMinutes}
                        onChange={(event) =>
                          setExtensionAutomationSettings((current) =>
                            normalizeExtensionAutomationSettings({
                              ...current,
                              greetingPhaseMaxMinutes: Number(
                                event.target.value || current.greetingPhaseMaxMinutes
                              ),
                            })
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="extension-reply-phase-min">回复阶段最短时长（分钟）</Label>
                      <Input
                        id="extension-reply-phase-min"
                        type="number"
                        min={1}
                        value={extensionAutomationSettings.replyPhaseMinMinutes}
                        onChange={(event) =>
                          setExtensionAutomationSettings((current) =>
                            normalizeExtensionAutomationSettings({
                              ...current,
                              replyPhaseMinMinutes: Number(
                                event.target.value || current.replyPhaseMinMinutes
                              ),
                            })
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="extension-reply-phase-max">回复阶段最长时长（分钟）</Label>
                      <Input
                        id="extension-reply-phase-max"
                        type="number"
                        min={1}
                        value={extensionAutomationSettings.replyPhaseMaxMinutes}
                        onChange={(event) =>
                          setExtensionAutomationSettings((current) =>
                            normalizeExtensionAutomationSettings({
                              ...current,
                              replyPhaseMaxMinutes: Number(
                                event.target.value || current.replyPhaseMaxMinutes
                              ),
                            })
                          )
                        }
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    当前 Boss 标签页模式会按“随机打一段招呼 {'->'} 随机回一段消息”的整段交替方式执行，而不是一边打招呼一边回复。默认是 1-1.5 小时打招呼、0.5-1 小时回复；执行期间请保持这个页面和 Boss 标签页不要关闭。
                  </p>
                </div>
              </div>
            )}

            {((taskLaunchMode === 'playwright' && selectedAccountId) || (taskLaunchMode === 'extension' && extensionInstalled && selectedBossTabId && selectedPlatform === 'boss')) && (
              <div className="rounded-lg bg-muted p-4 text-sm">
                <p className="font-medium mb-2">任务说明：</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>系统将自动获取该岗位的推荐候选人</li>
                  <li>根据匹配度筛选合适候选人</li>
                  <li>自动发送个性化打招呼消息</li>
                  <li>收到候选人消息后继续自动回复与分流</li>
                  <li>可在「沟通记录」与任务状态中查看执行进度</li>
                </ul>
              </div>
            )}

            {extensionRunResult && (
              <div className="space-y-2">
                <p className="font-medium text-sm">当前 Boss 标签页执行结果</p>
                <pre className="rounded-md border bg-background p-3 text-xs overflow-auto max-h-64">
                  {JSON.stringify(extensionRunResult, null, 2)}
                </pre>
              </div>
            )}

            {extensionLoopRunning && selectedPlatform === 'boss' && (
              <div className="rounded-lg border bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                当前 Boss 标签页流程正在前台执行。你可以暂停、恢复或停止；执行期间请保持 Boss 推荐牛人标签页与当前页面都处于打开状态。
              </div>
            )}
          </div>
          </div>

          <DialogFooter className="border-t pt-4 bg-background">
            <Button
              variant="outline"
              onClick={() => {
                if (extensionLoopRunning) {
                  toast.error('当前 Boss 标签页流程仍在执行，请先暂停或停止后再关闭弹窗');
                  return;
                }
                setStartTaskDialogOpen(false);
              }}
            >
              取消
            </Button>
            {selectedPlatform === 'boss' && extensionLoopRunning && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    extensionPauseRequestedRef.current = !extensionPauseRequestedRef.current;
                    setExtensionLoopPaused(extensionPauseRequestedRef.current);
                    setExtensionRunResult((current) => current ? {
                      ...current,
                      status: extensionPauseRequestedRef.current ? 'paused' : 'running',
                    } : current);
                  }}
                >
                  {extensionLoopPaused ? (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      恢复
                    </>
                  ) : (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      暂停
                    </>
                  )}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    extensionStopRequestedRef.current = true;
                    extensionPauseRequestedRef.current = false;
                    setExtensionLoopPaused(false);
                    setExtensionRunResult((current) => current ? {
                      ...current,
                      status: 'stopping',
                    } : current);
                  }}
                >
                  停止
                </Button>
              </>
            )}
            <Button 
              onClick={handleStartTask} 
              disabled={
                taskStarting ||
                extensionLoopRunning ||
                (
                  taskLaunchMode === 'extension'
                    ? (!extensionInstalled || !selectedBossTabId || selectedPlatform !== 'boss')
                    : (!selectedAccountId || availableAccounts.length === 0)
                )
              }
            >
              {taskStarting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  启动中...
                </>
              ) : extensionLoopRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  运行中
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4 mr-2" />
                  {taskLaunchMode === 'playwright' ? '启动 Playwright 自动化' : '启动标签页模式'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
