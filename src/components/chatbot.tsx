"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { X, Send, User, History, ThumbsUp, ThumbsDown, Image as ImageIcon, ChevronLeft, Trash2, AlertCircle, MessageCircleMore } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePathname } from 'next/navigation';
import { useAuth } from "@/lib/auth-provider";
import Image from "next/image";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  messageType?: 'text' | 'image';
  attachmentUrl?: string;
  videoTutorials?: VideoTutorial[];
}

interface VideoTutorial {
  title: string;
  url: string;
  duration: string;
}

interface ChatSession {
  id: string;
  title: string;
  currentPage: string;
  createdAt: string;
  updatedAt: string;
}

interface ChatApiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  messageType?: 'text' | 'image';
  attachmentUrl?: string;
}

type LocalQuickReply = {
  answer: string;
  suggestions?: string[];
};

function isPlaceholderTutorialUrl(url?: string): boolean {
  if (!url) {
    return true;
  }

  try {
    const parsed = new URL(url);
    return parsed.hostname === 'example.com';
  } catch {
    return true;
  }
}

function normalizeQuickReplyKey(text: string): string {
  return text.replace(/\s+/g, '').trim();
}

// 页面智能提示映射
const PAGE_HINTS: Record<string, { hint: string; questions: string[] }> = {
  '/positions': {
    hint: '当前在岗位管理页面，我可以帮您：',
    questions: ['如何创建岗位？', '如何编辑岗位信息？', '如何同步岗位给其他用户？', '岗位状态如何管理？'],
  },
  '/candidates': {
    hint: '当前在候选人管理页面，我可以帮您：',
    questions: ['如何添加候选人？', '如何上传简历？', '如何查看简历解析结果？', '候选人状态说明'],
  },
  '/interviews': {
    hint: '当前在面试管理页面，我可以帮您：',
    questions: ['如何创建面试？', '如何发送面试通知？', '如何记录面试评价？', '面试状态说明'],
  },
  '/ai-interview': {
    hint: '当前在全AI面试页面，我可以帮您：',
    questions: ['如何生成面试链接？', '面试链接有效期？', '如何查看面试结果？', '面试模式说明'],
  },
  '/users': {
    hint: '当前在用户管理页面，我可以帮您：',
    questions: ['如何创建用户？', '如何重置密码？', '用户角色权限说明', '如何生成邀请码？'],
  },
  '/model-config': {
    hint: '当前在模型配置页面，我可以帮您：',
    questions: ['如何配置面试模型？', '如何配置简历解析模型？', '模型选择建议', '模型配置说明'],
  },
};

const DEFAULT_HINTS = {
  hint: '我可以帮您解答系统使用的任何问题：',
  questions: ['如何创建岗位？', '如何添加候选人？', '如何安排面试？', '忘记密码怎么办？'],
};

const LOCAL_QUICK_REPLIES: Record<string, LocalQuickReply> = {
  '如何创建岗位？': {
    answer: `创建岗位步骤：
1. 点击左侧菜单「岗位管理」
2. 点击右上角「创建岗位」
3. 填写岗位名称、部门、学历要求、经验要求和岗位描述
4. 点击「创建」完成保存

超级管理员创建时，还可以选择是否同步给所有用户。`,
    suggestions: ['如何编辑岗位信息？', '岗位状态如何管理？'],
  },
  '如何编辑岗位信息？': {
    answer: `编辑岗位步骤：
1. 进入「岗位管理」
2. 找到目标岗位
3. 点击「编辑」按钮
4. 修改岗位信息后点击「保存」`,
    suggestions: ['如何创建岗位？', '岗位状态如何管理？'],
  },
  '岗位状态如何管理？': {
    answer: `岗位状态管理说明：
1. 在「岗位管理」列表找到岗位
2. 可切换为「招聘中 / 暂停招聘 / 已关闭」
3. 已关闭岗位会停止招聘，不再作为正常招聘岗位使用`,
    suggestions: ['如何创建岗位？', '如何编辑岗位信息？'],
  },
  '如何添加候选人？': {
    answer: `添加候选人步骤：
1. 点击左侧菜单「候选人管理」
2. 点击「添加候选人」
3. 填写姓名、手机号、邮箱、招聘渠道、应聘岗位
4. 点击「保存」`,
    suggestions: ['如何上传简历？', '候选人状态说明'],
  },
  '如何上传简历？': {
    answer: `上传简历步骤：
1. 进入「候选人管理」
2. 添加候选人或进入候选人详情
3. 点击「上传简历」
4. 选择 PDF、Word 或图片格式文件
5. 系统会自动解析简历内容`,
    suggestions: ['如何查看简历解析结果？', '候选人状态说明'],
  },
  '如何查看简历解析结果？': {
    answer: `查看简历解析结果步骤：
1. 打开候选人详情
2. 查看「简历信息」区域
3. 系统会展示基础信息、教育经历、工作经历、技能等解析内容`,
    suggestions: ['如何上传简历？', '如何添加候选人？'],
  },
  '候选人状态说明': {
    answer: `候选人常见状态包括：
1. 待筛选
2. 待面试
3. 面试中
4. 已通过
5. 已拒绝
6. 已入职

不同页面里还会结合初试、复试、终试阶段显示更细的状态。`,
    suggestions: ['如何添加候选人？', '如何上传简历？'],
  },
  '如何安排面试？': {
    answer: `安排面试步骤：
1. 选择候选人
2. 选择对应岗位
3. 设置面试官和面试时间
4. 确认面试方式
5. 保存后系统会进入后续面试流程`,
    suggestions: ['如何查看面试结果？', '面试模式说明'],
  },
  '如何生成面试链接？': {
    answer: `生成 AI 面试链接步骤：
1. 进入「全AI面试」
2. 选择岗位和面试模式
3. 填写候选人信息并上传/填写简历
4. 点击生成链接
5. 复制链接发给候选人`,
    suggestions: ['面试链接有效期？', '如何查看面试结果？'],
  },
  '面试链接有效期？': {
    answer: `默认情况下，面试链接有效期为 7 天。过期后需要重新生成新的链接。`,
    suggestions: ['如何生成面试链接？', '如何查看面试结果？'],
  },
  '如何查看面试结果？': {
    answer: `查看面试结果步骤：
1. 进入对应的面试记录或全AI面试记录页面
2. 选择候选人
3. 查看综合评分、维度得分、优势、改进建议和推荐结论
4. 如有录屏，可在线查看或下载`,
    suggestions: ['如何生成面试链接？', '面试模式说明'],
  },
  '面试模式说明': {
    answer: `面试模式通常分为初级、中级、高级等类型，不同模式会影响问题深度和考察强度。你可以在生成 AI 面试链接时进行选择。`,
    suggestions: ['如何生成面试链接？', '如何查看面试结果？'],
  },
  '如何创建用户？': {
    answer: `创建用户步骤：
1. 进入「用户管理」
2. 点击「创建用户」
3. 填写用户名、姓名、邮箱、手机号、初始密码、角色
4. 点击「创建」完成`,
    suggestions: ['如何重置密码？', '用户角色权限说明'],
  },
  '如何重置密码？': {
    answer: `重置密码步骤：
1. 打开「用户管理」
2. 找到目标用户
3. 点击「重置密码」
4. 输入新密码并保存`,
    suggestions: ['如何创建用户？', '用户角色权限说明'],
  },
  '用户角色权限说明': {
    answer: `常见角色包括：
1. 超级管理员
2. 租户管理员
3. 管理员
4. 面试官
5. 普通用户

不同角色看到的菜单和可操作的数据范围不同。`,
    suggestions: ['如何创建用户？', '如何重置密码？'],
  },
  '忘记密码怎么办？': {
    answer: `忘记密码时，请联系管理员重置密码。管理员可以在「用户管理」中为您重置。`,
    suggestions: ['如何创建用户？', '用户角色权限说明'],
  },
};

// 问题分类映射（用于数据留存分析）
const QUESTION_CATEGORIES: Record<string, string[]> = {
  '岗位管理': ['岗位', 'position', '招聘', 'JD', '岗位描述'],
  '候选人管理': ['候选人', '简历', 'resume', '应聘', '求职'],
  '面试管理': ['面试', 'interview', '面谈', '面试官'],
  'AI面试': ['AI面试', '全AI', '智能面试', '在线面试'],
  '用户管理': ['用户', 'user', '权限', '角色', '管理员'],
  '账号登录': ['登录', 'login', '密码', '账号', '注册'],
  '系统故障': ['失败', '错误', 'error', '无法', '不能', '打不开'],
  '其他': [],
};

export function ChatBot() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [iconLoadFailed, setIconLoadFailed] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const hasLoadedSessionsRef = useRef(false);
  const sessionCreationPromiseRef = useRef<Promise<string | null> | null>(null);
  const pathname = usePathname();
  const currentPage = pathname || '';

  const shouldHideChatbot =
    !user || pathname?.startsWith('/full-ai-interview/share');

  const getChatbotHeaders = useCallback(() => {
    const headers: HeadersInit = {};

    if (user?.id) {
      headers['x-user-id'] = user.id;
    }

    if (user?.tenantId) {
      headers['x-tenant-id'] = user.tenantId;
    }

    return headers;
  }, [user?.id, user?.tenantId]);

  const scrollMessagesToBottom = (behavior: ScrollBehavior = 'auto') => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });
  };

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    const distanceToBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldStickToBottomRef.current = distanceToBottom < 80;
  };

  // 自动滚动到底部，但仅在用户本来就停留在底部附近时跟随
  useEffect(() => {
    if (!shouldStickToBottomRef.current) {
      return;
    }

    const behavior = isLoading ? 'auto' : 'smooth';
    scrollMessagesToBottom(behavior);
  }, [messages]);

  // 打开时自动聚焦输入框
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const timer = window.setTimeout(() => inputRef.current?.focus(), 100);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  // 初始化或根据页面切换提示
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const pageHints = PAGE_HINTS[currentPage] || DEFAULT_HINTS;
      const welcomeMessage: Message = {
        id: 'welcome',
        role: 'assistant',
        content: `您好！我是面试官系统的智能助手 👋\n\n${pageHints.hint}\n\n${pageHints.questions.map(q => `• ${q}`).join('\n')}\n\n有什么可以帮您的吗？`,
        timestamp: new Date(),
      };
      shouldStickToBottomRef.current = true;
      setMessages([welcomeMessage]);
    }
  }, [isOpen, currentPage]);

  // 加载对话历史列表
  const loadSessions = useCallback(async () => {
    if (!user?.id) return;

    try {
      const response = await fetch('/api/chatbot/sessions', {
        headers: getChatbotHeaders(),
      });
      const data = await response.json();
      if (data.success) {
        setSessions(data.sessions);
      }
    } catch (error) {
      console.error('加载对话历史失败：', error);
    }
  }, [getChatbotHeaders, user?.id]);

  useEffect(() => {
    if (!isOpen || !showHistory || hasLoadedSessionsRef.current) {
      return;
    }

    hasLoadedSessionsRef.current = true;
    void loadSessions();
  }, [isOpen, loadSessions, showHistory]);

  // 加载历史对话
  const loadHistoryChat = useCallback(async (sessionId: string) => {
    if (!user?.id) return;

    try {
      const response = await fetch(`/api/chatbot/messages?sessionId=${sessionId}`, {
        headers: getChatbotHeaders(),
      });
      const data = await response.json();
      if (data.success) {
        const loadedMessages: Message[] = (data.messages as ChatApiMessage[]).map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.createdAt),
          messageType: msg.messageType,
          attachmentUrl: msg.attachmentUrl,
        }));
        shouldStickToBottomRef.current = true;
        setMessages(loadedMessages);
        setCurrentSessionId(sessionId);
        setShowHistory(false);
      }
    } catch (error) {
      console.error('加载历史对话失败：', error);
    }
  }, [getChatbotHeaders, user?.id]);

  // 创建新对话
  const createNewSession = useCallback(async () => {
    if (!user?.id) {
      console.error('创建对话失败：未获取到当前登录用户');
      return null;
    }

    try {
      const response = await fetch('/api/chatbot/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getChatbotHeaders(),
        },
        body: JSON.stringify({
          currentPage,
          userAgent: navigator.userAgent,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setCurrentSessionId(data.session.id);
      }
      return data.session?.id;
    } catch (error) {
      console.error('创建对话失败：', error);
      return null;
    }
  }, [currentPage, getChatbotHeaders, user?.id]);

  const ensureSessionId = useCallback(async () => {
    if (currentSessionId) {
      return currentSessionId;
    }

    if (sessionCreationPromiseRef.current) {
      return sessionCreationPromiseRef.current;
    }

    const promise = createNewSession().finally(() => {
      sessionCreationPromiseRef.current = null;
    });
    sessionCreationPromiseRef.current = promise;
    return promise;
  }, [createNewSession, currentSessionId]);

  // 删除对话历史
  const deleteSession = useCallback(async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user?.id) return;

    try {
      await fetch(`/api/chatbot/sessions?sessionId=${sessionId}`, {
        method: 'DELETE',
        headers: getChatbotHeaders(),
      });
      hasLoadedSessionsRef.current = false;
      void loadSessions();
    } catch (error) {
      console.error('删除对话失败：', error);
    }
  }, [getChatbotHeaders, loadSessions, user?.id]);

  // 保存消息到数据库
  const saveMessage = useCallback(async (sessionId: string, role: string, content: string, messageType = 'text', attachmentUrl?: string) => {
    if (!user?.id) return;

    try {
      await fetch('/api/chatbot/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getChatbotHeaders(),
        },
        body: JSON.stringify({
          sessionId,
          role,
          content,
          messageType,
          attachmentUrl,
        }),
      });
    } catch (error) {
      console.error('保存消息失败：', error);
    }
  }, [getChatbotHeaders, user?.id]);

  // 智能分类问题
  const categorizeQuestion = useCallback((question: string): string => {
    const lowerQuestion = question.toLowerCase();
    for (const [category, keywords] of Object.entries(QUESTION_CATEGORIES)) {
      if (category === '其他') continue;
      if (keywords.some(keyword => lowerQuestion.includes(keyword.toLowerCase()))) {
        return category;
      }
    }
    return '其他';
  }, []);

  // 判断是否为疑难问题
  const isDifficultQuestion = useCallback((answer: string): boolean => {
    const difficultKeywords = [
      '需要联系总部人事白佳乐',
      '请联系管理员',
      '建议联系',
      '需要申请',
      '需要审批',
      '需要特殊处理',
    ];
    return difficultKeywords.some(keyword => answer.includes(keyword));
  }, []);

  // 记录提问统计（增强版）
  const recordStats = useCallback(async (
    question: string, 
    responseTime: number, 
    answer: string,
    isDifficult: boolean
  ) => {
    if (!user?.id) return;

    try {
      const category = categorizeQuestion(question);
      
      await fetch('/api/chatbot/stats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getChatbotHeaders(),
        },
        body: JSON.stringify({
          question,
          questionCategory: category,
          currentPage,
          responseTime,
          answerQuality: null, // 用户后续反馈
          wasHelpful: null, // 用户后续反馈
          isDifficult, // 标记疑难问题
          answerLength: answer.length, // 答案长度（用于质量分析）
        }),
      });
    } catch (error) {
      console.error('记录统计失败：', error);
    }
  }, [categorizeQuestion, currentPage, getChatbotHeaders, user?.id]);

  // 记录满意度（增强版）
  const recordSatisfaction = useCallback(async (messageId: string, wasHelpful: boolean) => {
    if (!user?.id) return;

    try {
      const message = messages.find(m => m.id === messageId);
      if (!message) return;

      await fetch('/api/chatbot/stats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getChatbotHeaders(),
        },
        body: JSON.stringify({
          question: message.content,
          wasHelpful,
          questionCategory: categorizeQuestion(message.content),
        }),
      });
    } catch (error) {
      console.error('记录满意度失败：', error);
    }
  }, [categorizeQuestion, getChatbotHeaders, messages, user?.id]);

  // 图片上传处理
  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('请上传图片文件');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('图片大小不能超过5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadedImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  // 发送消息
  const sendMessage = useCallback(async (messageText?: string) => {
    const text = messageText || inputValue.trim();
    if ((!text && !uploadedImage) || isLoading) return;

    const startTime = Date.now();
    shouldStickToBottomRef.current = true;
    const assistantMessageId = (Date.now() + 1).toString();

    // 添加用户消息
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text || '请帮我看看这个截图中的问题',
      timestamp: new Date(),
      messageType: uploadedImage ? 'image' : 'text',
      attachmentUrl: uploadedImage || undefined,
    };
    setInputValue('');
    setUploadedImage(null);
    setIsLoading(true);
    setMessages(prev => [
      ...prev,
      userMessage,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      },
    ]);

    let timeoutId: number | null = null;

    try {
      const sessionIdPromise = ensureSessionId();
      const controller = new AbortController();
      timeoutId = window.setTimeout(() => controller.abort(), 45000);

      // 准备历史消息
      const history = messages.filter(m => m.id !== 'welcome').map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      // 调用 API
      const response = await fetch('/api/chatbot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          question: text,
          history,
          imageUrl: uploadedImage,
          currentPage,
        }),
      });
      window.clearTimeout(timeoutId);

      const sessionId = await sessionIdPromise;
      if (!sessionId) {
        throw new Error('创建对话失败，请刷新页面重试');
      }

      void saveMessage(sessionId, 'user', userMessage.content, userMessage.messageType, userMessage.attachmentUrl);

      if (!response.ok) {
        throw new Error('请求失败');
      }

      // 处理 SSE 流式响应
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('无法读取响应流');
      }

      let fullContent = '';
      let videoTutorials: VideoTutorial[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              break;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullContent += parsed.content;
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: fullContent }
                      : msg
                  )
                );
              } else if (parsed.videos) {
                videoTutorials = parsed.videos;
              } else if (parsed.error) {
                throw new Error(parsed.error);
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }

      // 计算响应时间
      const responseTime = Date.now() - startTime;
      
      // 判断是否为疑难问题
      const difficult = isDifficultQuestion(fullContent);

      // 保存助手消息
      void saveMessage(sessionId, 'assistant', fullContent);

      // 记录统计数据
      void recordStats(text, responseTime, fullContent, difficult);

      // 如果有视频教程，更新消息
      if (videoTutorials.length > 0) {
        setMessages(prev =>
          prev.map(msg =>
            msg.id === assistantMessageId
              ? { ...msg, videoTutorials }
              : msg
          )
        );
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev =>
        prev.map(msg =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content:
                  error instanceof Error && error.name === 'AbortError'
                    ? '回复超时了，请重试一次。'
                    : '抱歉，我遇到了一些问题。这个问题需要联系总部人事白佳乐。',
              }
            : msg
        )
      );
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      setIsLoading(false);
    }
  }, [currentPage, ensureSessionId, inputValue, isDifficultQuestion, isLoading, messages, recordStats, saveMessage, uploadedImage]);

  // 处理键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) {
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }, [sendMessage]);

  const pageHints = useMemo(() => PAGE_HINTS[currentPage] || DEFAULT_HINTS, [currentPage]);

  if (shouldHideChatbot) {
    return null;
  }

  return (
    <>
      {/* 浮动按钮 - 固定在右下角 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed right-4 bottom-4 z-[9999] flex items-center justify-center shadow-xl sm:right-6 sm:bottom-6",
          isOpen
            ? "h-14 min-w-14 rounded-full bg-primary px-4 text-primary-foreground hover:bg-primary/90"
            : "h-16 w-16 rounded-full bg-white ring-1 ring-black/8 hover:scale-105",
          "transition-all duration-300",
          "hover:scale-110 active:scale-95"
        )}
        aria-label="打开智能助手"
        type="button"
      >
        {isOpen ? (
          <X className="w-5 h-5" />
        ) : iconLoadFailed ? (
          <MessageCircleMore className="w-7 h-7 text-primary" />
        ) : (
          <Image
            src="/chatbot-icon.png"
            alt="智能助手"
            width={56}
            height={56}
            className="h-14 w-14 rounded-full object-cover"
            onError={() => setIconLoadFailed(true)}
          />
        )}
        <span className={cn("text-sm font-medium", isOpen ? "hidden" : "sr-only")}>
          智能助手
        </span>
      </button>

      {/* 聊天窗口 - 固定在右下角，不遮挡侧边栏 */}
      {isOpen && (
        <div
          className="fixed z-[9998] flex flex-col overflow-hidden rounded-2xl shadow-2xl"
          style={{
            right: '1rem',
            bottom: '5.5rem',
            width: '24rem',
            maxWidth: 'calc(100vw - 2rem)',
            height: '42rem',
            maxHeight: 'calc(100vh - 8rem)',
            backgroundColor: '#ededed',
            border: '1px solid rgba(0,0,0,0.1)',
          }}
        >
            {/* ===== 标题栏 ===== */}
            <div
              className="flex shrink-0 items-center justify-between px-4 py-3"
              style={{ backgroundColor: '#f7f7f7', borderBottom: '1px solid rgba(0,0,0,0.06)' }}
            >
              <div className="flex items-center gap-2">
                {showHistory && (
                  <button onClick={() => setShowHistory(false)} className="rounded-full p-1 hover:bg-black/5">
                    <ChevronLeft className="w-5 h-5 text-foreground" />
                  </button>
                )}
                <img src="/chatbot-icon.png" alt="智能助手" className="w-8 h-8" />
                <div>
                  <h3 className="font-semibold text-foreground text-sm">智能助手</h3>
                  <p className="text-xs text-muted-foreground">随时为您解答问题</p>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="rounded-full p-1.5 hover:bg-black/5"
                  title="历史记录"
                >
                  <History className="w-4 h-4 text-foreground" />
                </button>
                <button
                  onClick={() => {
                    setCurrentSessionId(null);
                    sessionCreationPromiseRef.current = null;
                    shouldStickToBottomRef.current = true;
                    setMessages([]);
                    setShowHistory(false);
                  }}
                  className="rounded-full p-1.5 hover:bg-black/5"
                  title="新对话"
                >
                  <img src="/chatbot-icon.png" alt="新对话" className="w-4 h-4" />
                </button>
              </div>
            </div>

            {showHistory ? (
              /* ===== 历史记录列表 ===== */
              <div
                className="flex-1 overflow-y-auto px-3 py-3"
                style={{ backgroundColor: '#ededed', minHeight: 0, WebkitOverflowScrolling: 'touch' }}
              >
                <div className="space-y-2">
                  {sessions.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">
                      暂无历史对话
                    </div>
                  ) : (
                    sessions.map((session) => (
                      <div
                        key={session.id}
                        onClick={() => loadHistoryChat(session.id)}
                        className="flex cursor-pointer items-center justify-between rounded-2xl bg-white p-3 shadow-sm transition-colors hover:bg-gray-50"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-sm">
                            {session.title || '新对话'}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {session.currentPage} · {new Date(session.updatedAt).toLocaleDateString()}
                          </div>
                        </div>
                        <button
                          onClick={(e) => deleteSession(session.id, e)}
                          className="p-1 hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* ===== 消息列表（唯一可滚动区域） ===== */}
                <div
                  ref={messagesContainerRef}
                  onScroll={handleMessagesScroll}
                  style={{
                    flex: '1 1 0%',
                    minHeight: 0,
                    overflowY: 'auto',
                    overscrollBehavior: 'contain',
                    backgroundColor: '#ededed',
                    WebkitOverflowScrolling: 'touch',
                    touchAction: 'pan-y',
                  }}
                  className="px-3 py-4"
                >
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          "flex items-end gap-2",
                          message.role === 'user' ? "justify-end" : "justify-start"
                        )}
                      >
                        {message.role === 'assistant' && (
                          <div className="mb-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/5">
                            <img src="/chatbot-icon.png" alt="助手" className="w-5 h-5" />
                          </div>
                        )}
                        <div className="max-w-[80%]">
                          <div
                            className={cn(
                              "mb-1 px-1 text-[11px] text-muted-foreground",
                              message.role === 'user' ? "text-right" : "text-left"
                            )}
                          >
                            {message.timestamp.toLocaleTimeString("zh-CN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                          {message.attachmentUrl && (
                            <img
                              src={message.attachmentUrl}
                              alt="截图"
                              className="mb-2 max-w-full rounded-2xl border border-black/5"
                            />
                          )}
                          <div
                            className={cn(
                              "relative max-w-full overflow-hidden px-3 py-2.5 text-sm leading-6 whitespace-pre-wrap break-words shadow-sm [overflow-wrap:anywhere]",
                              message.role === 'user'
                                ? "rounded-[18px] rounded-br-md bg-[#95ec69] text-foreground"
                                : "rounded-[18px] rounded-bl-md bg-white text-foreground"
                            )}
                          >
                            {message.content || (
                              <span className="opacity-50">正在输入...</span>
                            )}
                          </div>
                          {/* 疑难问题提示 */}
                          {message.role === 'assistant' &&
                           message.content &&
                           message.id !== 'welcome' &&
                           isDifficultQuestion(message.content) && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-amber-600">
                              <AlertCircle className="w-3 h-3" />
                              <span>疑难问题已记录</span>
                            </div>
                          )}
                          {/* 视频教程 */}
                          {message.videoTutorials && message.videoTutorials.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {message.videoTutorials.map((video, idx) => (
                                isPlaceholderTutorialUrl(video.url) ? (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => sendMessage(video.title)}
                                    disabled={isLoading}
                                    className="flex w-full items-center gap-2 p-2 rounded bg-muted/50 hover:bg-muted text-xs text-left transition-colors disabled:opacity-50"
                                  >
                                    <span className="flex-1">{video.title}</span>
                                    <span className="text-muted-foreground">{video.duration}</span>
                                  </button>
                                ) : (
                                  <a
                                    key={idx}
                                    href={video.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 p-2 rounded bg-muted/50 hover:bg-muted text-xs"
                                  >
                                    <span className="flex-1">{video.title}</span>
                                    <span className="text-muted-foreground">{video.duration}</span>
                                  </a>
                                )
                              ))}
                            </div>
                          )}
                          {/* 满意度评价 */}
                          {message.role === 'assistant' && message.content && message.id !== 'welcome' && (
                            <div className="flex gap-1 mt-1">
                              <button
                                onClick={() => recordSatisfaction(message.id, true)}
                                className="p-1 hover:text-green-600 text-muted-foreground"
                                title="有帮助"
                              >
                                <ThumbsUp className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => recordSatisfaction(message.id, false)}
                                className="p-1 hover:text-red-600 text-muted-foreground"
                                title="没帮助"
                              >
                                <ThumbsDown className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                        {message.role === 'user' && (
                          <div className="mb-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#95ec69] shadow-sm ring-1 ring-black/5">
                            <User className="w-4 h-4 text-primary-foreground" />
                          </div>
                        )}
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {/* ===== 快捷问题（固定不动） ===== */}
                {messages.length <= 2 && (
                  <div
                    className="px-4 py-2.5"
                    style={{ flexShrink: 0, backgroundColor: '#f7f7f7', borderTop: '1px solid rgba(0,0,0,0.06)' }}
                  >
                    <p className="text-xs text-muted-foreground mb-1.5">快捷问题：</p>
                    <div className="flex flex-wrap gap-1.5">
                      {pageHints.questions.map((question, index) => (
                        <button
                          key={index}
                          onClick={() => sendMessage(question)}
                          disabled={isLoading}
                          className="rounded-full bg-white px-2.5 py-1 text-xs shadow-sm transition-colors hover:bg-gray-100 disabled:opacity-50"
                        >
                          {question}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ===== 上传的图片预览（固定不动） ===== */}
                {uploadedImage && (
                  <div
                    className="px-4 py-2"
                    style={{ flexShrink: 0, backgroundColor: '#f7f7f7', borderTop: '1px solid rgba(0,0,0,0.06)' }}
                  >
                    <div className="relative inline-block">
                      <img src={uploadedImage} alt="上传预览" className="h-16 rounded" />
                      <button
                        onClick={() => setUploadedImage(null)}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}

                {/* ===== 输入区（固定在最底部） ===== */}
                <div
                  className="px-3 pb-3 pt-2"
                  style={{ flexShrink: 0, backgroundColor: '#f7f7f7', borderTop: '1px solid rgba(0,0,0,0.06)' }}
                >
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-shrink-0 rounded-full bg-white p-2 text-muted-foreground shadow-sm ring-1 ring-black/5 hover:bg-gray-100 hover:text-foreground"
                      title="上传截图"
                    >
                      <ImageIcon className="w-4 h-4" />
                    </button>
                    <div className="flex flex-1 items-center gap-1 rounded-full bg-white px-3 py-1 shadow-sm ring-1 ring-black/5">
                      <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={uploadedImage ? "描述您的问题..." : "输入您的问题..."}
                        disabled={isLoading}
                        className="h-9 flex-1 bg-transparent text-sm outline-none disabled:opacity-50"
                      />
                      <Button
                        onClick={() => sendMessage()}
                        disabled={(!inputValue.trim() && !uploadedImage) || isLoading}
                        size="icon"
                        className="h-8 w-8 flex-shrink-0 rounded-full bg-[#07c160] text-white hover:bg-[#06ad56]"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
      )}
    </>
  );
}
