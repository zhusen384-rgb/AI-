"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Video, Mic, MicOff, VideoOff, PhoneOff, FileText, MessageSquare, Clock, Send, ChevronLeft, ChevronRight, Sparkles, Loader2, Briefcase, CheckCircle2, User, Copy, Link, Share2, Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { sync } from "@/lib/sync";
import { fetchClientJson } from "@/lib/client-api";
import type { PositionVetoCheck } from "@/lib/position-veto-rules";

interface Question {
  id: string;
  type: string;
  category: string;
  question: string;
  followUpQuestions: string[];
  targetSkill: string;
  difficulty: string;
  answer?: string;
  followUpAnswers?: string[];
  isUsed?: boolean;
  order?: number;
}

interface Position {
  id: number;
  title: string;
  department: string;
  status: string;
  education: string;
  experience: string;
  jobDescription: string;
  interviewerPreferences?: {
    focusAreas: string[];
    questionStyle: string;
    additionalNotes: string;
  };
  createdAt: string;
}

type ResumeSkill = string | { name?: string; level?: string };
type ResumeCertificate = string | { name?: string; level?: string; date?: string };
type MatchAnalysisItem =
  | string
  | {
      requirement?: string;
      area?: string;
      gap?: string;
      description?: string;
    };

interface ResumeWorkExperience {
  company?: string;
  position?: string;
  duration?: string;
  description?: string;
  responsibilities?: string[];
  achievements?: string[];
}

interface ResumeEducation {
  school?: string;
  major?: string;
  degree?: string;
  gpa?: string;
}

interface ResumeProject {
  name?: string;
  role?: string;
  description?: string;
}

interface ResumeMatchAnalysis {
  matchScore?: number;
  matchedItems?: MatchAnalysisItem[];
  unmatchedItems?: MatchAnalysisItem[];
  strengths?: MatchAnalysisItem[];
  weaknesses?: MatchAnalysisItem[];
  gaps?: MatchAnalysisItem[];
  conflicts?: MatchAnalysisItem[];
  vetoCheck?: PositionVetoCheck;
}

interface ParsedResumeData {
  basicInfo?: {
    name?: string;
    phone?: string;
    email?: string;
    education?: string;
  };
  education?: ResumeEducation;
  workExperience?: ResumeWorkExperience[];
  skills?: ResumeSkill[];
  projects?: ResumeProject[];
  certificates?: ResumeCertificate[];
  matchAnalysis?: ResumeMatchAnalysis;
}

interface StoredCandidate {
  name: string;
  phone?: string;
  email?: string;
  interviewStage?: string;
  resumeUploaded?: boolean;
  resumeFileKey?: string;
  resumeFileName?: string;
  resumeParsedData?: {
    content?: string;
    parsedData?: ParsedResumeData;
    parsedAt?: string;
  };
}

interface WebRtcSignalState {
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  "ice-candidates"?: RTCIceCandidateInit[];
  updatedAt?: string;
}

interface WebRtcSignalResponse {
  signal: WebRtcSignalState | null;
  hasUpdate: boolean;
  updatedAt?: string;
}

interface GeneratedQuestionsResponse {
  success: boolean;
  data?: {
    questions: Question[];
  };
  questions?: Question[];
  error?: string;
}

interface ResumeExtractResponse {
  success: boolean;
  content: string;
  error?: string;
}

interface ResumeParseResponse {
  success: boolean;
  data?: unknown;
  parsedData?: unknown;
  error?: string;
}

interface UploadResponse {
  success?: boolean;
  fileKey: string;
  downloadUrl?: string;
  error?: string;
}

interface MatchResponse {
  matchAnalysis?: ResumeMatchAnalysis;
  error?: string;
}

interface GeneratedInterviewReportQuestionAnswer {
  question: string;
  answer: string;
  rating: string;
  feedback: string;
}

interface GeneratedInterviewReport {
  id: string;
  candidateName: string;
  positionId?: number | null;
  positionTitle: string;
  meetingId?: string;
  videoFileKey: string;
  interviewDate: string;
  duration: number;
  transcription: {
    fullText: string;
    segments: Array<{
      speaker: string;
      text: string;
      startTime: number;
    }>;
  };
  analysis: {
    overallScore: number;
    technicalScore: number;
    communicationScore: number;
    problemSolvingScore: number;
    recommendation: string;
    summary: string;
    strengths: string[];
    weaknesses: string[];
    questionsAndAnswers: GeneratedInterviewReportQuestionAnswer[];
  };
  recommendation: string;
  createdAt: string;
}

interface GenerateReportResponse {
  success: boolean;
  report: GeneratedInterviewReport;
  error?: string;
}

interface ClearWebRtcSignalResponse {
  success: boolean;
  error?: string;
}

const getMatchAnalysisLabel = (item: MatchAnalysisItem): string => {
  if (typeof item === "string") {
    return item;
  }

  return item.requirement || item.area || item.gap || item.description || JSON.stringify(item);
};

// 模拟问题库
const mockQuestions: Question[] = [
  {
    id: "1",
    type: "basic",
    category: "experience",
    question: "您简历中提到在上一家公司担任Java开发工程师，核心职责是负责核心业务模块开发，能举例说明您独立负责的一个具体任务吗？",
    followUpQuestions: [
      "您提到'优化了流程'，能否具体说明是哪个流程？优化前后效率提升了多少？",
    ],
    targetSkill: "工作经历验证",
    difficulty: "easy",
    isUsed: false,
  },
  {
    id: "2",
    type: "skill",
    category: "hard_skill",
    question: "您提到熟练使用SpringBoot框架进行开发，能否举例说明一次用SpringBoot解决业务问题的具体场景？",
    followUpQuestions: [
      "请补充说明当时采取的具体步骤，比如架构设计、难点解决等。",
    ],
    targetSkill: "Java框架应用能力",
    difficulty: "medium",
    isUsed: false,
  },
  {
    id: "3",
    type: "skill",
    category: "soft_skill",
    question: "当项目进度滞后时，您通常如何协调团队资源推进？请描述一个具体案例。",
    followUpQuestions: [],
    targetSkill: "问题解决能力",
    difficulty: "medium",
    isUsed: false,
  },
  {
    id: "4",
    type: "scenario",
    category: "experience",
    question: "如果客户突然提出修改方案，且要求当天交付，你会怎么做？",
    followUpQuestions: [],
    targetSkill: "应急处理能力",
    difficulty: "hard",
    isUsed: false,
  },
  {
    id: "5",
    type: "gap",
    category: "experience",
    question: "您没有电商行业经验，如果入职后如何快速适应？",
    followUpQuestions: [],
    targetSkill: "学习能力",
    difficulty: "medium",
    isUsed: false,
  },
];

export default function InterviewRoomPage() {
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isRemoteVideoEnabled, setIsRemoteVideoEnabled] = useState(true);
  const [isRemoteAudioEnabled, setIsRemoteAudioEnabled] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [interviewStage, setInterviewStage] = useState<"break_the_ice" | "basic" | "core" | "interaction" | "ending">("break_the_ice");
  const [startTime] = useState(new Date());
  const [interviewDuration, setInterviewDuration] = useState(0);

  // 问题生成相关状态
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [generateLevel, setGenerateLevel] = useState<'junior' | 'mid' | 'senior'>('mid');
  const [generationError, setGenerationError] = useState<string | null>(null);

  // 岗位选择相关状态
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedPositionId, setSelectedPositionId] = useState<number | null>(null);

  // 候选人姓名输入状态
  const [candidateName, setCandidateName] = useState("");
  const [isLoadingResume, setIsLoadingResume] = useState(false);
  const [uploadedResumeInfo, setUploadedResumeInfo] = useState<{
    candidateName: string;
    fileName: string;
    content: string;
    parsedData: ParsedResumeData;
  } | null>(null);

  // 对话框中的简历上传状态
  const [dialogResumeFile, setDialogResumeFile] = useState<File | null>(null);
  const [dialogCandidateName, setDialogCandidateName] = useState("");
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [dialogResumeParsedData, setDialogResumeParsedData] = useState<ParsedResumeData | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 邀请候选人相关状态
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [meetingId, setMeetingId] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [candidatePhone, setCandidatePhone] = useState("");
  const [selectedCandidateForInvite, setSelectedCandidateForInvite] = useState<string | null>(null);
  const [availableCandidates, setAvailableCandidates] = useState<Array<{name: string; phone: string; email: string}>>([]);

  // 邀请面试官相关状态
  const [showInviteInterviewerDialog, setShowInviteInterviewerDialog] = useState(false);
  const [interviewerInviteLink, setInterviewerInviteLink] = useState("");
  const [interviewerInviteEmail, setInterviewerInviteEmail] = useState("");
  const [interviewerInvitePhone, setInterviewerInvitePhone] = useState("");

  // 面试官数量设置
  const [interviewerCount, setInterviewerCount] = useState<1 | 2 | 3>(1);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef2 = useRef<HTMLVideoElement>(null);
  const localVideoRef3 = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const streamRef2 = useRef<MediaStream | null>(null);
  const streamRef3 = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const [isWebRTCConnected, setIsWebRTCConnected] = useState(false);

  // 录屏相关状态
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);

  // WebRTC 配置（使用免费的 STUN 服务器）
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  // 获取 URL 参数中的 meetingId
  const [meetingIdFromUrl, setMeetingIdFromUrl] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'interviewer' | 'candidate'>('interviewer');

  // 加载岗位列表
  const loadPositions = () => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('positions');
      if (stored) {
        const positionsData = JSON.parse(stored);
        setPositions(positionsData);
        // 默认选中第一个岗位
        if (positionsData.length > 0 && !selectedPositionId) {
          setSelectedPositionId(positionsData[0].id);
        }
      }
    }
  };

  useEffect(() => {
    loadPositions();
  }, [selectedPositionId]);

  // 监听跨标签页的岗位更新事件
  useEffect(() => {
    const unsubscribe = sync.on('positionsUpdated', () => {
      loadPositions();
      toast.info('岗位列表已更新', {
        description: '岗位数据已从其他标签页同步',
      });
    });

    return () => {
      unsubscribe();
    };
  }, [selectedPositionId]);

  // 加载已上传的简历信息
  useEffect(() => {
    const loadResume = () => {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('selectedCandidateResume');
        if (stored) {
          try {
            const resumeInfo = JSON.parse(stored);
            setUploadedResumeInfo(resumeInfo);
            setCandidateName(resumeInfo.candidateName || "");
          } catch (error) {
            console.error('加载简历信息失败:', error);
          }
        }
      }
    };

    loadResume();
  }, []);

  // 计时器
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const diff = Math.floor((now.getTime() - startTime.getTime()) / 1000);
      setInterviewDuration(diff);
    }, 1000);

    return () => clearInterval(timer);
  }, [startTime]);

  // 检测 URL 中的 meetingId，判断用户角色
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const mid = urlParams.get('meetingId');
      if (mid) {
        setMeetingIdFromUrl(mid);
        setUserRole('candidate');
        // 隐藏侧边导航栏
        document.body.classList.add('hide-sidebar');
      } else {
        setUserRole('interviewer');
        document.body.classList.remove('hide-sidebar');
      }
    }
  }, []);

  // 清理侧边栏样式
  useEffect(() => {
    return () => {
      document.body.classList.remove('hide-sidebar');
    };
  }, []);

  // 创建 RTCPeerConnection
  const createPeerConnection = (localStream: MediaStream): RTCPeerConnection => {
    const pc = new RTCPeerConnection(rtcConfig);

    // 添加本地流到连接
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
      console.log('[WebRTC] 添加轨道:', track.kind, track.id);
    });

    // 监听远程流
    pc.ontrack = (event) => {
      console.log('[WebRTC] 收到远程流:', event.streams[0]?.getTracks().map(t => t.kind));
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        remoteVideoRef.current.play().catch(error => {
          console.error('播放远程视频失败:', error);
        });
        setIsWebRTCConnected(true);
        
        // 连接成功后启动录屏（仅面试官）
        if (userRole === 'interviewer' && !isRecording) {
          console.log('[WebRTC] 连接成功，启动录屏');
          startRecording();
        }
      }
    };

    // 监听 ICE 候选
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC] 生成 ICE candidate:', event.candidate.candidate.substring(0, 30) + '...');
        sendSignal('ice-candidate', event.candidate, userRole);
      }
    };

    // 监听连接状态
    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] 连接状态变化:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setIsWebRTCConnected(true);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setIsWebRTCConnected(false);
      }
    };

    // 监听 ICE 连接状态
    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE 连接状态:', pc.iceConnectionState);
    };

    return pc;
  };

  // 发送信令
  const sendSignal = async (
    type: string,
    signal: RTCSessionDescriptionInit | RTCIceCandidateInit | null,
    role: string
  ) => {
    const mid = meetingIdFromUrl || meetingId;
    if (!mid) return;

    try {
      await fetchClientJson<{ success: boolean }>('/api/webrtc/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId: mid, type, signal, role }),
      });
    } catch (error) {
      console.error('发送信号失败:', error);
    }
  };

  // 轮询获取信令
  const pollSignals = async (mid: string) => {
    let lastKnownTime = '';
    const processedCandidates = new Set<string>(); // 跟踪已处理的 candidates
    let pendingCandidates: RTCIceCandidateInit[] = []; // 待处理的 candidates（在 remoteDescription 设置之前收到的）

    const poll = async () => {
      try {
        const data = await fetchClientJson<WebRtcSignalResponse>(`/api/webrtc/signal?meetingId=${mid}&lastKnownTime=${lastKnownTime}`);

        if (data.hasUpdate && data.signal) {
          lastKnownTime = data.updatedAt || lastKnownTime;
          console.log('[信令轮询] 收到信号更新:', { type: Object.keys(data.signal), userRole });

          const pc = peerConnectionRef.current;
          if (!pc) {
            console.warn('[信令轮询] PeerConnection 未初始化，跳过信号处理');
            setTimeout(poll, 1000);
            return;
          }

          // 收集新的 ICE candidates
          if (data.signal['ice-candidates'] && Array.isArray(data.signal['ice-candidates'])) {
            for (const candidate of data.signal['ice-candidates']) {
              const candidateText = candidate.candidate ?? "";
              const candidateId = `${candidateText.substring(0, 20)}_${candidate.sdpMLineIndex ?? 0}`;
              if (!processedCandidates.has(candidateId)) {
                processedCandidates.add(candidateId);
                pendingCandidates.push(candidate);
                console.log('[信令轮询] 收到 ICE 候选，待处理:', candidateText.substring(0, 30) + '...');
              }
            }
          }

          // 处理 Offer（候选人收到面试官的 Offer）
          if (userRole === 'candidate' && data.signal.offer) {
            console.log('[信令轮询] 收到 Offer，signalingState:', pc.signalingState);
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(data.signal.offer));
              console.log('[信令轮询] Offer 已设置，创建 Answer...');
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              console.log('[信令轮询] Answer 已创建并发送');
              sendSignal('answer', answer, 'candidate');

              // 设置完远程描述后，立即处理待处理的 candidates
              if (pendingCandidates.length > 0) {
                console.log('[信令轮询] 处理待处理的 candidates:', pendingCandidates.length);
                for (const candidate of pendingCandidates) {
                  try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    console.log('[信令轮询] 已添加 ICE 候选:', (candidate.candidate ?? "").substring(0, 30) + '...');
                  } catch (error) {
                    console.error('[信令轮询] 添加 ICE 候选失败:', error);
                  }
                }
                pendingCandidates = [];
              }
            } catch (error) {
              console.error('[信令轮询] 处理 Offer 失败:', error);
            }
          }

          // 处理 Answer（面试官收到候选人的 Answer）
          if (userRole === 'interviewer' && data.signal.answer) {
            console.log('[信令轮询] 收到 Answer，signalingState:', pc.signalingState);
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(data.signal.answer));
              console.log('[信令轮询] Answer 已设置');

              // 设置完远程描述后，立即处理待处理的 candidates
              if (pendingCandidates.length > 0) {
                console.log('[信令轮询] 处理待处理的 candidates:', pendingCandidates.length);
                for (const candidate of pendingCandidates) {
                  try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    console.log('[信令轮询] 已添加 ICE 候选:', (candidate.candidate ?? "").substring(0, 30) + '...');
                  } catch (error) {
                    console.error('[信令轮询] 添加 ICE 候选失败:', error);
                  }
                }
                pendingCandidates = [];
              }
            } catch (error) {
              console.error('[信令轮询] 处理 Answer 失败:', error);
            }
          }

          // 如果 remoteDescription 已设置且有待处理的 candidates，立即处理
          if (pc.remoteDescription && pendingCandidates.length > 0) {
            console.log('[信令轮询] 处理待处理的 candidates:', pendingCandidates.length);
            for (const candidate of pendingCandidates) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('[信令轮询] 已添加 ICE 候选:', (candidate.candidate ?? "").substring(0, 30) + '...');
              } catch (error) {
                console.error('[信令轮询] 添加 ICE 候选失败:', error);
              }
            }
            pendingCandidates = [];
          }
        }
      } catch (error) {
        console.error('轮询信令失败:', error);
      }

      // 继续轮询，直到连接成功
      if (!isWebRTCConnected) {
        setTimeout(poll, 1000);
      }
    };

    poll();
  };

  // 初始化 WebRTC 连接
  const initWebRTCConnection = async (localStream: MediaStream) => {
    const mid = meetingIdFromUrl || meetingId;
    if (!mid) {
      console.warn('[WebRTC] 未找到会议 ID');
      return;
    }

    console.log('[WebRTC] 初始化连接:', { mid, userRole, streamTracks: localStream.getTracks().length });

    // 创建 PeerConnection
    const pc = createPeerConnection(localStream);
    peerConnectionRef.current = pc;

    if (userRole === 'interviewer') {
      // 面试官：创建 Offer
      try {
        console.log('[WebRTC] 创建 Offer...');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log('[WebRTC] Offer 已创建并设置，开始发送信令');
        sendSignal('offer', offer, 'interviewer');
      } catch (error) {
        console.error('[WebRTC] 创建 Offer 失败:', error);
      }
    }

    // 开始轮询信令
    console.log('[WebRTC] 开始轮询信令...');
    pollSignals(mid);
  };

  // 获取本地媒体流（只执行一次）
  useEffect(() => {
    const getMedia = async () => {
      try {
        console.log('[Media] 获取本地媒体流...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        console.log('[Media] 媒体流获取成功:', {
          audioTracks: stream.getAudioTracks().length,
          videoTracks: stream.getVideoTracks().length,
          audioEnabled: stream.getAudioTracks()[0]?.enabled,
          videoEnabled: stream.getVideoTracks()[0]?.enabled
        });

        streamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.onloadedmetadata = () => {
            localVideoRef.current?.play();
            console.log('[Media] 本地视频开始播放');
          };
        }

        // 如果面试官数量大于1，尝试获取额外的媒体流
        if (interviewerCount >= 2) {
          try {
            const stream2 = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true,
            });
            streamRef2.current = stream2;
            if (localVideoRef2.current) {
              localVideoRef2.current.srcObject = stream2;
              localVideoRef2.current.onloadedmetadata = () => {
                localVideoRef2.current?.play();
              };
            }
          } catch (error) {
            console.warn('[Media] 无法获取第二个媒体流:', error);
          }
        }

        if (interviewerCount >= 3) {
          try {
            const stream3 = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true,
            });
            streamRef3.current = stream3;
            if (localVideoRef3.current) {
              localVideoRef3.current.srcObject = stream3;
              localVideoRef3.current.onloadedmetadata = () => {
                localVideoRef3.current?.play();
              };
            }
          } catch (error) {
            console.warn('[Media] 无法获取第三个媒体流:', error);
          }
        }

        // 如果已有 meetingId，立即初始化 WebRTC 连接
        const mid = meetingIdFromUrl || meetingId;
        if (mid) {
          await initWebRTCConnection(stream);
        }
      } catch (error) {
        console.error('[Media] 无法获取媒体设备:', error);
        toast.error("无法获取摄像头和麦克风", {
          description: "请确保已授予浏览器权限",
        });
      }
    };

    getMedia();

    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef2.current?.getTracks().forEach((track) => track.stop());
      streamRef3.current?.getTracks().forEach((track) => track.stop());
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
    };
  }, [interviewerCount]);

  // 当 meetingId 变化时，初始化 WebRTC 连接
  useEffect(() => {
    if (streamRef.current && (meetingIdFromUrl || meetingId)) {
      const mid = meetingIdFromUrl || meetingId;
      console.log('[WebRTC] meetingId 已设置，初始化连接:', mid);
      initWebRTCConnection(streamRef.current);
    }
  }, [meetingIdFromUrl, meetingId]);

  // 加载候选人列表（用于邀请功能）
  useEffect(() => {
    const loadCandidates = () => {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('candidates');
        if (stored) {
          const candidatesData = JSON.parse(stored) as StoredCandidate[];
          // 过滤出待面试的候选人（待初试、待复试、待终试）
          const pendingCandidates = candidatesData
            .filter((candidate) => candidate.interviewStage && ['initial', 'second', 'final'].includes(candidate.interviewStage))
            .map((candidate) => ({
              name: candidate.name,
              phone: candidate.phone || "",
              email: candidate.email || "",
            }));
          setAvailableCandidates(pendingCandidates);
        }
      }
    };

    loadCandidates();
  }, []);

  const toggleVideo = () => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  const handleNextQuestion = () => {
    // 保存当前答案
    const updatedQuestions = [...questions];
    updatedQuestions[currentQuestionIndex].answer = currentAnswer;
    setQuestions(updatedQuestions);

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setCurrentAnswer("");

      // 自动切换面试阶段
      if (currentQuestionIndex === 0) {
        setInterviewStage("basic");
      } else if (currentQuestionIndex === 2) {
        setInterviewStage("core");
      } else if (currentQuestionIndex === questions.length - 2) {
        setInterviewStage("interaction");
      }
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      setCurrentAnswer(questions[currentQuestionIndex - 1]?.answer || "");
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // 生成智能问题库
  const generateQuestions = async () => {
    setIsGeneratingQuestions(true);
    setGenerationError(null);

    try {
      // 优先使用对话框中上传的简历数据，否则使用已加载的简历数据
      const resumeData = dialogResumeParsedData
        ? {
            candidateName: dialogCandidateName,
            fileName: dialogResumeFile?.name || '',
            content: '',
            parsedData: dialogResumeParsedData,
          }
        : uploadedResumeInfo;

      if (!resumeData) {
        throw new Error('请先上传简历或加载候选人简历');
      }

      const selectedPosition = positions.find(p => p.id === selectedPositionId);

      if (!selectedPosition) {
        throw new Error('请先选择岗位');
      }

      const result = await fetchClientJson<GeneratedQuestionsResponse>('/api/interview/questions/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resumeData,
          jobDescription: {
            title: selectedPosition.title,
            jobDescription: selectedPosition.jobDescription,
            education: selectedPosition.education,
            experience: selectedPosition.experience,
            interviewerPreferences: selectedPosition.interviewerPreferences,
          },
          level: generateLevel,
        }),
      });

      if (result.success) {
        const generatedQuestions = result.data?.questions ?? result.questions ?? [];
        // 为每道题添加 id
        const questionsWithId = generatedQuestions.map((q: Question, index: number) => ({
          ...q,
          id: `generated-${index + 1}`,
          isUsed: false,
        }));

        setQuestions(questionsWithId);
        setCurrentQuestionIndex(0);
        setCurrentAnswer('');
        setShowGenerateDialog(false);

        // 如果是对话框中上传的简历，更新到页面状态
        if (dialogResumeParsedData) {
          const resumeInfo = {
            candidateName: dialogCandidateName,
            fileName: dialogResumeFile?.name || '',
            content: '',
            parsedData: dialogResumeParsedData,
          };
          setUploadedResumeInfo(resumeInfo);
          setCandidateName(dialogCandidateName);
          localStorage.setItem('selectedCandidateResume', JSON.stringify(resumeInfo));
        }

        toast.success("问题库生成成功", {
          description: `已生成 ${questionsWithId.length} 道面试问题`,
        });
      } else {
        throw new Error(result.error || '生成问题失败');
      }
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : '生成问题失败');
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  // 根据候选人姓名获取简历数据
  const handleLoadResumeByName = async () => {
    if (!candidateName.trim()) {
      toast.error("请输入候选人姓名");
      return;
    }

    setIsLoadingResume(true);

    try {
      // 从候选人管理模块获取候选人信息
      const candidatesStr = localStorage.getItem('candidates');
      if (!candidatesStr) {
        throw new Error('未找到候选人数据');
      }

      const candidates = JSON.parse(candidatesStr) as StoredCandidate[];
      const candidate = candidates.find((storedCandidate) => storedCandidate.name === candidateName.trim());

      if (!candidate) {
        throw new Error('未找到该候选人');
      }

      if (!candidate.resumeUploaded || !candidate.resumeFileKey) {
        throw new Error('该候选人尚未上传简历');
      }

      if (!candidate.resumeParsedData) {
        throw new Error('该候选人简历尚未解析，请先在候选人管理页面重新上传简历');
      }

      // 从候选人数据中获取简历解析结果
      const resumeInfo = {
        candidateName: candidate.name,
        fileName: candidate.resumeFileName || "",
        content: candidate.resumeParsedData.content || "",
        parsedData: candidate.resumeParsedData.parsedData || {},
        uploadTime: candidate.resumeParsedData.parsedAt,
      };

      localStorage.setItem('selectedCandidateResume', JSON.stringify(resumeInfo));
      setUploadedResumeInfo(resumeInfo);

      toast.success("简历数据加载成功", {
        description: `候选人：${candidate.name}，职位：${resumeInfo.parsedData.workExperience?.[0]?.position || '未知'}`,
      });

    } catch (error) {
      toast.error("加载简历失败", {
        description: error instanceof Error ? error.message : "请重试",
      });
    } finally {
      setIsLoadingResume(false);
    }
  };

  // 清除已加载的简历
  const handleClearResume = () => {
    localStorage.removeItem('selectedCandidateResume');
    setUploadedResumeInfo(null);
    setCandidateName("");
    toast.success("已清除简历信息");
  };

  // 生成会议ID和邀请链接
  const generateInviteLink = () => {
    // 生成随机会议ID（8位数字）
    const randomMeetingId = Math.floor(10000000 + Math.random() * 90000000).toString();
    setMeetingId(randomMeetingId);

    // 生成友好的邀请链接格式（使用当前页面URL）
    const currentUrl = window.location.href;
    // 移除已有的查询参数
    const baseUrl = currentUrl.split('?')[0];
    const link = `${baseUrl}?meetingId=${randomMeetingId}`;
    setInviteLink(link);
  };

  // 生成面试官邀请链接
  const generateInterviewerInviteLink = () => {
    // 如果已有 meetingId，直接使用，否则生成新的
    const mid = meetingId || Math.floor(10000000 + Math.random() * 90000000).toString();
    if (!meetingId) {
      setMeetingId(mid);
    }

    // 生成友好的邀请链接格式（使用当前页面URL）
    const currentUrl = window.location.href;
    // 移除已有的查询参数
    const baseUrl = currentUrl.split('?')[0];
    const link = `${baseUrl}?meetingId=${mid}`;
    setInterviewerInviteLink(link);
  };

  // 开始录屏
  const startRecording = () => {
    if (!streamRef.current || !remoteVideoRef.current) return;

    // 创建一个包含本地和远程视频的混合流
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 设置画布尺寸（16:9）
    canvas.width = 1280;
    canvas.height = 720;

    // 开始捕获画布
    const canvasStream = canvas.captureStream(30);

    // 使用 MediaRecorder 录制混合流
    try {
      const mediaRecorder = new MediaRecorder(canvasStream, {
        mimeType: 'video/webm;codecs=vp9',
      });

      mediaRecorderRef.current = mediaRecorder;
      recordedChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        setRecordedVideoBlob(blob);
        console.log('[录屏] 录制完成，视频大小:', blob.size, 'bytes');
      };

      mediaRecorder.start(1000); // 每秒保存一次数据
      setIsRecording(true);
      console.log('[录屏] 开始录制');

      // 绘制函数 - 将两个视频画面绘制到画布上
      const draw = () => {
        if (!isRecording) return;

        // 绘制黑色背景
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 绘制远程视频（面试官/候选人）- 占据主要空间
        if (remoteVideoRef.current && remoteVideoRef.current.readyState >= 2) {
          ctx.drawImage(
            remoteVideoRef.current,
            0, 0, canvas.width, canvas.height
          );
        }

        // 绘制本地视频（画中画）
        if (localVideoRef.current && localVideoRef.current.readyState >= 2) {
          const pipWidth = 320;
          const pipHeight = 180;
          const pipX = canvas.width - pipWidth - 20;
          const pipY = canvas.height - pipHeight - 20;

          // 绘制白色边框
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 3;
          ctx.strokeRect(pipX - 2, pipY - 2, pipWidth + 4, pipHeight + 4);

          ctx.drawImage(
            localVideoRef.current,
            pipX, pipY, pipWidth, pipHeight
          );
        }

        // 添加时间戳
        ctx.fillStyle = 'white';
        ctx.font = '20px Arial';
        const now = new Date();
        const timestamp = now.toLocaleString('zh-CN');
        ctx.fillText(timestamp, 20, canvas.height - 20);

        requestAnimationFrame(draw);
      };

      draw();
    } catch (error) {
      console.error('[录屏] 启动录制失败:', error);
      toast.error('录屏启动失败');
    }
  };

  // 停止录屏并上传视频
  const stopRecordingAndUpload = async () => {
    if (!mediaRecorderRef.current) return;

    mediaRecorderRef.current.stop();
    setIsRecording(false);
    console.log('[录屏] 停止录制');

    // 等待视频生成完成
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (!recordedVideoBlob || recordedVideoBlob.size === 0) {
      console.warn('[录屏] 没有录制的视频');
      return null;
    }

    // 上传视频到对象存储
    try {
      setIsUploadingVideo(true);
      console.log('[录屏] 开始上传视频...');

      const formData = new FormData();
      const filename = `interview_${meetingId || 'unknown'}_${Date.now()}.webm`;
      formData.append('file', recordedVideoBlob);
      formData.append('filename', filename);

      const uploadData = await fetchClientJson<UploadResponse>('/api/resume/upload', {
        method: 'POST',
        body: formData,
      });

      console.log('[录屏] 视频上传成功:', uploadData);
      toast.success('录屏上传成功');
      
      return uploadData.fileKey;
    } catch (error) {
      console.error('[录屏] 上传视频失败:', error);
      toast.error('录屏上传失败');
      return null;
    } finally {
      setIsUploadingVideo(false);
    }
  };

  // 结束面试时清理 WebRTC 连接
  const handleEndInterview = async () => {
    // 如果正在录制，停止录屏并上传视频
    if (isRecording) {
      const videoFileKey = await stopRecordingAndUpload();
      
      if (videoFileKey && userRole === 'interviewer') {
        // 如果是面试官，尝试生成评估报告
        try {
          toast.loading('正在生成评估报告...', { id: 'generating-report' });

          const result = await fetchClientJson<GenerateReportResponse>('/api/reports/generate-from-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              videoFileKey,
              candidateName: uploadedResumeInfo?.candidateName || candidateName,
              positionId: selectedPositionId,
              meetingId,
            }),
          });

          if (result.success) {
            toast.success('评估报告已生成', { id: 'generating-report' });
            // 保存报告到 localStorage
            const existingReports = JSON.parse(
              localStorage.getItem('reports') || '[]'
            ) as GeneratedInterviewReport[];
            existingReports.unshift(result.report);
            localStorage.setItem('reports', JSON.stringify(existingReports));
          } else {
            throw new Error(result.error || '生成报告失败');
          }
        } catch (error) {
          console.error('生成评估报告失败:', error);
          toast.error('评估报告生成失败，请稍后在评估报告页面手动生成', { id: 'generating-report' });
        }
      }
    }

    const mid = meetingIdFromUrl || meetingId;
    if (mid) {
      try {
        await fetchClientJson<ClearWebRtcSignalResponse>('/api/webrtc/clear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meetingId: mid }),
        });
      } catch (error) {
        console.error('清理信号失败:', error);
      }
    }

    // 关闭 PeerConnection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // 停止媒体流
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    setIsWebRTCConnected(false);

    // 重定向到首页或显示结束对话框
    toast.success("面试已结束");
  };

  // 复制邀请链接到剪贴板
  const copyInviteLink = async () => {
    if (!inviteLink) {
      generateInviteLink();
    }

    try {
      await navigator.clipboard.writeText(inviteLink);
      toast.success("邀请链接已复制到剪贴板", {
        description: "可以直接粘贴发送给候选人",
      });
    } catch (error) {
      toast.error("复制失败，请手动复制");
    }
  };

  // 生成邀请文字内容
  const generateInviteMessage = (method: 'email' | 'sms') => {
    const selectedCandidate = availableCandidates.find(c => c.name === selectedCandidateForInvite);
    const name = selectedCandidate?.name || "候选人";
    const greeting = selectedCandidate ? `${name}您好，` : "";

    if (method === 'email') {
      return `${greeting}

【面试邀请】

我们诚邀您参加视频面试，请通过以下链接进入面试室：

📱 面试室链接：${inviteLink}
🔑 会议ID：${meetingId}

⏰ 请在面试时间前5分钟进入面试室
💻 请使用电脑或手机浏览器打开链接

如有任何问题，请及时与我们联系。

祝您面试顺利！`;
    } else {
      // 短信格式更简洁
      return `${greeting}【面试邀请】请点击链接进入视频面试室：${inviteLink} 会议ID：${meetingId} 请在面试时间前5分钟进入`;
    }
  };

  // 通过邮件发送邀请
  const sendEmailInvite = () => {
    if (!inviteLink) {
      generateInviteLink();
    }

    if (!inviteEmail) {
      toast.error("请先输入候选人邮箱");
      return;
    }

    const message = generateInviteMessage('email');
    const subject = encodeURIComponent("面试邀请 - 视频面试");
    const body = encodeURIComponent(message);
    const mailtoLink = `mailto:${inviteEmail}?subject=${subject}&body=${body}`;

    window.open(mailtoLink, '_blank');
    toast.success("已打开邮件客户端", {
      description: "请在邮件客户端中发送邮件",
    });
    setShowInviteDialog(false);
  };

  // 通过短信发送邀请
  const sendSMSInvite = () => {
    if (!inviteLink) {
      generateInviteLink();
    }

    if (!candidatePhone) {
      toast.error("请先输入候选人手机号");
      return;
    }

    const message = generateInviteMessage('sms');
    const smsLink = `sms:${candidatePhone}?body=${encodeURIComponent(message)}`;

    window.open(smsLink, '_blank');
    toast.success("已打开短信应用", {
      description: "请在短信应用中发送短信",
    });
    setShowInviteDialog(false);
  };

  // 复制面试官邀请链接到剪贴板
  const copyInterviewerInviteLink = async () => {
    if (!interviewerInviteLink) {
      generateInterviewerInviteLink();
    }

    try {
      await navigator.clipboard.writeText(interviewerInviteLink);
      toast.success("邀请链接已复制到剪贴板", {
        description: "可以直接粘贴发送给其他面试官",
      });
    } catch (error) {
      toast.error("复制失败，请手动复制");
    }
  };

  // 生成面试官邀请文字内容
  const generateInterviewerInviteMessage = (method: 'email' | 'sms') => {
    const greeting = "您好，";

    if (method === 'email') {
      return `${greeting}

【面试邀请】

我们诚邀您参与面试工作，请通过以下链接进入面试室：

📱 面试室链接：${interviewerInviteLink}
🔑 会议ID：${meetingId}

⏰ 请在面试时间前5分钟进入面试室
💻 请使用电脑或手机浏览器打开链接

如有任何问题，请及时与我们联系。

期待您的参与！`;
    } else {
      // 短信格式更简洁
      return `${greeting}【面试邀请】请点击链接进入面试室协助面试：${interviewerInviteLink} 会议ID：${meetingId} 请在面试时间前5分钟进入`;
    }
  };

  // 通过邮件发送面试官邀请
  const sendInterviewerEmailInvite = () => {
    if (!interviewerInviteLink) {
      generateInterviewerInviteLink();
    }

    if (!interviewerInviteEmail) {
      toast.error("请先输入面试官邮箱");
      return;
    }

    const message = generateInterviewerInviteMessage('email');
    const subject = encodeURIComponent("面试邀请 - 协助面试");
    const body = encodeURIComponent(message);
    const mailtoLink = `mailto:${interviewerInviteEmail}?subject=${subject}&body=${body}`;

    window.open(mailtoLink, '_blank');
    toast.success("已打开邮件客户端", {
      description: "请在邮件客户端中发送邮件",
    });
    setShowInviteInterviewerDialog(false);
  };

  // 通过短信发送面试官邀请
  const sendInterviewerSMSInvite = () => {
    if (!interviewerInviteLink) {
      generateInterviewerInviteLink();
    }

    if (!interviewerInvitePhone) {
      toast.error("请先输入面试官手机号");
      return;
    }

    const message = generateInterviewerInviteMessage('sms');
    const smsLink = `sms:${interviewerInvitePhone}?body=${encodeURIComponent(message)}`;

    window.open(smsLink, '_blank');
    toast.success("已打开短信应用", {
      description: "请在短信应用中发送短信",
    });
    setShowInviteInterviewerDialog(false);
  };

  // 选择候选人自动填充信息
  const handleSelectCandidate = (candidateName: string) => {
    setSelectedCandidateForInvite(candidateName);
    const candidate = availableCandidates.find(c => c.name === candidateName);
    if (candidate) {
      setInviteEmail(candidate.email);
      setCandidatePhone(candidate.phone);
    }
  };

  // 处理对话框中的简历文件选择
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'image/jpeg',
        'image/png',
        'image/jpg'
      ];

      console.log('Selected file:', {
        name: file.name,
        type: file.type,
        size: file.size
      });

      if (!validTypes.includes(file.type)) {
        setUploadError('仅支持 PDF、Word (docx/doc) 和图片格式');
        return;
      }

      setDialogResumeFile(file);
      setUploadError(null);
    }
  };

  // 处理对话框中的简历上传和解析
  const handleDialogResumeUpload = async () => {
    if (!dialogResumeFile) {
      setUploadError('请选择简历文件');
      return;
    }

    if (!dialogCandidateName.trim()) {
      setUploadError('请输入候选人姓名');
      return;
    }

    setIsUploadingResume(true);
    setUploadError(null);

    try {
      console.log('Starting resume upload process...', {
        fileName: dialogResumeFile.name,
        fileType: dialogResumeFile.type,
        fileSize: dialogResumeFile.size,
        candidateName: dialogCandidateName
      });

      // 1. 上传文件到对象存储
      const formData = new FormData();
      formData.append('file', dialogResumeFile);
      formData.append('filename', dialogResumeFile.name);

      console.log('Uploading file to storage...');

      const uploadData = await fetchClientJson<UploadResponse>('/api/resume/upload', {
        method: 'POST',
        body: formData,
      });
      console.log('Upload response:', uploadData);

      // 2. 提取文件内容
      console.log('Extracting file content...');

      const extractData = await fetchClientJson<ResumeExtractResponse>('/api/resume/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileKey: uploadData.fileKey,
          fileName: dialogResumeFile.name,
        }),
      });
      console.log('Extract response:', extractData);

      // 3. 解析简历内容
      console.log('Parsing resume content...');

      const parseData = await fetchClientJson<ResumeParseResponse>('/api/resume/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resumeContent: extractData.content,
          candidateName: dialogCandidateName,
        }),
      });
      console.log('Parse response:', parseData);

      // 解析 API 返回的数据结构是 { success: true, data: parsedData }
      const parsedData = ((parseData.data || parseData.parsedData || {}) as ParsedResumeData);

      // 4. 进行岗位匹配分析
      const selectedPosition = positions.find(p => p.id === selectedPositionId);
      if (selectedPosition) {
        console.log('Performing job match analysis...');

        const matchResult = await fetchClientJson<MatchResponse>('/api/resume/match', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            parsedData: parsedData,
            jobDescription: {
              title: selectedPosition.title,
              jobDescription: selectedPosition.jobDescription,
              education: selectedPosition.education,
              experience: selectedPosition.experience,
            },
          }),
        });

        console.log('Match response:', matchResult);
        parsedData.matchAnalysis = matchResult.matchAnalysis;
      }

      // 设置解析后的数据
      setDialogResumeParsedData(parsedData);

      toast.success("简历解析成功", {
        description: `已解析候选人 ${dialogCandidateName} 的简历信息`,
      });

    } catch (error) {
      console.error('Resume upload and parse error:', error);
      setUploadError(error instanceof Error ? error.message : '简历上传和解析失败');
    } finally {
      setIsUploadingResume(false);
    }
  };

  // 清除对话框中的简历
  const handleDialogClearResume = () => {
    setDialogResumeFile(null);
    setDialogCandidateName("");
    setDialogResumeParsedData(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const [questions, setQuestions] = useState<Question[]>(mockQuestions);

  const stageLabels: Record<string, string> = {
    break_the_ice: "破冰环节",
    basic: "基础验证环节",
    core: "核心能力考察",
    interaction: "候选人互动",
    ending: "面试收尾",
  };

  const typeLabels: Record<string, string> = {
    basic: "基础验证",
    skill: "能力考察",
    gap: "缺口补全",
    scenario: "情景模拟",
    other: "其他",
  };

  const difficultyLabels: Record<string, string> = {
    easy: "简单",
    medium: "中等",
    hard: "困难",
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* 顶部栏 */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-900">
            {userRole === 'candidate' ? '视频面试' : '面试室'}
          </h1>
          {userRole === 'candidate' && (
            <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200">
              候选人
            </Badge>
          )}
          <Badge variant="outline" className="ml-4">
            <Clock className="mr-1 h-3 w-3" />
            {formatTime(interviewDuration)}
          </Badge>
          {isWebRTCConnected && (
            <Badge variant="default" className="bg-green-600">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              已连接
            </Badge>
          )}

          {userRole === 'interviewer' && (
            <>
              {/* 候选人姓名输入 */}
              {!uploadedResumeInfo ? (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-500" />
                  <Input
                    placeholder="输入候选人姓名"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    className="w-[200px]"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleLoadResumeByName();
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLoadResumeByName}
                    disabled={isLoadingResume || !candidateName.trim()}
                  >
                    {isLoadingResume ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 text-green-700" />
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-green-700" />
                    <span className="text-sm font-medium text-green-900">{uploadedResumeInfo.candidateName || candidateName}</span>
                    {uploadedResumeInfo.parsedData?.workExperience?.[0]?.position && (
                      <>
                        <span className="text-xs text-gray-400">|</span>
                        <span className="text-xs text-green-700">
                          {uploadedResumeInfo.parsedData.workExperience[0].position}
                        </span>
                      </>
                    )}
                    {uploadedResumeInfo.parsedData?.matchAnalysis && (
                      <>
                        <span className="text-xs text-gray-400">|</span>
                        <span className="text-xs text-green-700">
                          匹配度: {uploadedResumeInfo.parsedData.matchAnalysis.matchScore}%
                        </span>
                      </>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearResume}
                    className="h-6 px-2 text-xs text-green-700 hover:text-green-900"
                  >
                    更换
                  </Button>
                </div>
              )}

              {/* 岗位选择 */}
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-gray-500" />
                <Select
                  value={selectedPositionId?.toString() || ""}
                  onValueChange={(value) => setSelectedPositionId(parseInt(value))}
                >
                  <SelectTrigger className="w-[240px]">
                    <SelectValue placeholder="选择岗位" />
                  </SelectTrigger>
                  <SelectContent>
                    {positions.map((position) => (
                      <SelectItem key={position.id} value={position.id.toString()}>
                        {position.title} - {position.department}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 面试官数量选择 */}
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-gray-500" />
                <Select
                  value={interviewerCount.toString()}
                  onValueChange={(value) => setInterviewerCount(parseInt(value) as 1 | 2 | 3)}
                >
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="面试官" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1位面试官</SelectItem>
                    <SelectItem value="2">2位面试官</SelectItem>
                    <SelectItem value="3">3位面试官</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {userRole === 'interviewer' && (
            <>
              <Button
                variant="outline"
                onClick={() => setShowGenerateDialog(true)}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                生成智能问题库
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowInviteDialog(true);
                  generateInviteLink();
                }}
              >
                <Share2 className="mr-2 h-4 w-4" />
                邀请候选人
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowInviteInterviewerDialog(true);
                  generateInterviewerInviteLink();
                }}
              >
                <User className="mr-2 h-4 w-4" />
                邀请面试官
              </Button>
            </>
          )}
          <Button variant="destructive" onClick={handleEndInterview}>
            <PhoneOff className="mr-2 h-4 w-4" />
            结束面试
          </Button>
        </div>
      </div>

      {/* 主内容区 */}
      {userRole === 'candidate' ? (
        // 候选人视角：简洁的视频通话界面
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gray-900">
          {/* 面试官视频（远程）- 大画面 */}
          <div className="w-full max-w-6xl aspect-video bg-black rounded-xl overflow-hidden relative mb-6">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted={false}
              className={`w-full h-full object-cover ${isRemoteVideoEnabled ? "block" : "hidden"}`}
            />
            {!isRemoteVideoEnabled && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                <div className="text-center text-white">
                  <div className="w-32 h-32 bg-gray-700 rounded-full flex items-center justify-center text-6xl font-bold mx-auto mb-4">
                    面试官
                  </div>
                  <p className="text-lg">面试官已关闭摄像头</p>
                </div>
              </div>
            )}
            {!isWebRTCConnected && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
                <div className="text-center text-white">
                  <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" />
                  <p className="text-xl font-medium">正在连接面试官...</p>
                  <p className="text-sm text-gray-300 mt-2">请稍候</p>
                </div>
              </div>
            )}
            {isWebRTCConnected && (
              <div className="absolute top-4 left-4 bg-black/60 px-4 py-2 rounded-lg text-white text-sm font-medium">
                面试官
              </div>
            )}
          </div>

          {/* 候选人视频（本地）- 小画面和控制栏 */}
          <div className="flex items-center gap-4">
            {/* 候选人视频 */}
            <div className="w-48 aspect-video bg-gray-900 rounded-xl overflow-hidden relative border-2 border-white/20">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted={true}
                className={`w-full h-full object-cover ${isVideoEnabled ? "block" : "hidden"}`}
              />
              {!isVideoEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                  <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center text-white text-xl font-bold">
                    你
                  </div>
                </div>
              )}
              <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-white text-xs">
                你
              </div>
            </div>

            {/* 控制按钮 */}
            <div className="flex items-center gap-3">
              <Button
                variant={isAudioEnabled ? "default" : "destructive"}
                size="lg"
                onClick={toggleAudio}
                className="rounded-full w-14 h-14"
              >
                {isAudioEnabled ? (
                  <Mic className="h-6 w-6" />
                ) : (
                  <MicOff className="h-6 w-6" />
                )}
              </Button>
              <Button
                variant={isVideoEnabled ? "default" : "destructive"}
                size="lg"
                onClick={toggleVideo}
                className="rounded-full w-14 h-14"
              >
                {isVideoEnabled ? (
                  <Video className="h-6 w-6" />
                ) : (
                  <VideoOff className="h-6 w-6" />
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        // 面试官视角：完整功能界面
        <div className="flex-1 flex overflow-hidden">
        {/* 左侧：视频区域 */}
        <div className="flex-1 p-6 flex flex-col gap-4">
          {/* 候选人视频（远程） */}
          <div className="flex-1 bg-black rounded-xl overflow-hidden relative" style={{ aspectRatio: '16/9' }}>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
            muted={false}
              className={`w-full h-full object-cover ${isRemoteVideoEnabled ? "block" : "hidden"}`}
            />
            {!isRemoteVideoEnabled && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                <div className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center text-white text-4xl font-bold">
                  候选人
                </div>
              </div>
            )}
            {!isWebRTCConnected && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
                <div className="text-center text-white">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                  <p className="text-sm">
                    等待候选人加入...
                  </p>
                </div>
              </div>
            )}
            <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1 rounded text-white text-sm">
              候选人
            </div>
          </div>

          {/* 面试官视频网格 - 根据数量动态调整 */}
          <div className={`grid gap-4 ${interviewerCount === 1 ? 'grid-cols-1' : interviewerCount === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            {/* 面试官1 */}
            <div className="h-48 max-w-md bg-gray-900 rounded-xl overflow-hidden relative" style={{ aspectRatio: '16/9' }}>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted={true}
                className={`w-full h-full object-cover ${isVideoEnabled ? "block" : "hidden"}`}
              />
              {!isVideoEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                  <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                    面试官1
                  </div>
                </div>
              )}
              <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1 rounded text-white text-sm">
                面试官1（你）
              </div>
            </div>

            {/* 面试官2 */}
            {interviewerCount >= 2 && (
              <div className="h-48 max-w-md bg-gray-900 rounded-xl overflow-hidden relative" style={{ aspectRatio: '16/9' }}>
                <video
                  ref={localVideoRef2}
                  autoPlay
                  playsInline
                  muted={true}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1 rounded text-white text-sm">
                  面试官2
                </div>
              </div>
            )}

            {/* 面试官3 */}
            {interviewerCount >= 3 && (
              <div className="h-48 max-w-md bg-gray-900 rounded-xl overflow-hidden relative" style={{ aspectRatio: '16/9' }}>
                <video
                  ref={localVideoRef3}
                  autoPlay
                  playsInline
                  muted={true}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1 rounded text-white text-sm">
                  面试官3
                </div>
              </div>
            )}
          </div>

          {/* 控制按钮 */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant={isAudioEnabled ? "default" : "destructive"}
              size="lg"
              onClick={toggleAudio}
            >
              {isAudioEnabled ? (
                <Mic className="h-5 w-5" />
              ) : (
                <MicOff className="h-5 w-5" />
              )}
            </Button>
            <Button
              variant={isVideoEnabled ? "default" : "destructive"}
              size="lg"
              onClick={toggleVideo}
            >
              {isVideoEnabled ? (
                <Video className="h-5 w-5" />
              ) : (
                <VideoOff className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>

        {/* 右侧：问题导航区 */}
        <div className="w-96 bg-white border-l p-6 overflow-y-auto">
          <div className="mb-4">
            <h2 className="text-lg font-bold mb-2">问题导航</h2>
            <div className="text-sm text-gray-600">
              问题 {currentQuestionIndex + 1} / {questions.length}
            </div>
          </div>

          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">当前问题</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{typeLabels[questions[currentQuestionIndex]?.type]}</Badge>
                  <Badge variant={
                    questions[currentQuestionIndex]?.difficulty === 'easy' ? 'default' :
                    questions[currentQuestionIndex]?.difficulty === 'medium' ? 'secondary' :
                    'destructive'
                  }>
                    {difficultyLabels[questions[currentQuestionIndex]?.difficulty || 'medium']}
                  </Badge>
                </div>
              </div>
              <div className="text-sm text-gray-600">{questions[currentQuestionIndex]?.targetSkill}</div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-base leading-relaxed">
                {questions[currentQuestionIndex]?.question}
              </div>

              {questions[currentQuestionIndex]?.followUpQuestions &&
                questions[currentQuestionIndex].followUpQuestions.length > 0 && (
                  <div className="border-l-2 border-gray-200 pl-4">
                    <div className="text-sm font-medium text-gray-700 mb-2">可选追问：</div>
                    <ul className="space-y-1">
                      {questions[currentQuestionIndex].followUpQuestions.map((followUp, i) => (
                        <li key={i} className="text-sm text-gray-600">
                          {i + 1}. {followUp}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              <div className="pt-4">
                <label className="text-sm font-medium mb-2 block">记录候选人回答</label>
                <Textarea
                  placeholder="记录候选人的回答要点..."
                  value={currentAnswer}
                  onChange={(e) => setCurrentAnswer(e.target.value)}
                  className="min-h-[150px] resize-none"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handlePreviousQuestion}
                  disabled={currentQuestionIndex === 0}
                  className="flex-1"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  上一个问题
                </Button>
                <Button
                  onClick={handleNextQuestion}
                  disabled={currentQuestionIndex === questions.length - 1}
                  className="flex-1"
                >
                  下一个问题
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 问题列表 */}
          <div className="mt-6">
            <h3 className="text-sm font-medium mb-3">所有问题</h3>
            <div className="space-y-2">
              {questions.map((q, index) => (
                <button
                  key={q.id}
                  onClick={() => setCurrentQuestionIndex(index)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    index === currentQuestionIndex
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-gray-50 hover:bg-gray-100 border-gray-200"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-medium">#{index + 1}</span>
                    <Badge
                      variant={index === currentQuestionIndex ? "secondary" : "outline"}
                      className="text-xs"
                    >
                      {typeLabels[q.type]}
                    </Badge>
                    <Badge
                      variant={index === currentQuestionIndex ? "secondary" : "outline"}
                      className="text-xs"
                    >
                      {difficultyLabels[q.difficulty] || '中等'}
                    </Badge>
                  </div>
                  <div className="text-sm line-clamp-2">{q.question}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      )}
      {/* 生成问题对话框 */}
      <Dialog open={showGenerateDialog} onOpenChange={(open) => {
        setShowGenerateDialog(open);
        if (!open) {
          // 关闭对话框时清除临时数据
          handleDialogClearResume();
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              生成智能问题库
            </DialogTitle>
            <DialogDescription>
              基于候选人简历和岗位JD，AI将自动生成分层面试问题库（基础验证题、能力考察题、缺口补全题、情景模拟题）
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto">
            {/* 简历上传区域 */}
            <div className="space-y-3">
              <Label>候选人简历</Label>
              <div className="border-2 border-dashed rounded-lg p-4 space-y-3">
                {!dialogResumeParsedData ? (
                  <>
                    <div>
                      <Label className="text-sm">候选人姓名</Label>
                      <Input
                        placeholder="请输入候选人姓名"
                        value={dialogCandidateName}
                        onChange={(e) => setDialogCandidateName(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-sm">简历文件</Label>
                      <div className="mt-1">
                        <Input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                          onChange={handleFileSelect}
                          className="cursor-pointer"
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        支持 PDF、Word (docx/doc)、图片格式
                      </p>
                    </div>
                    {dialogResumeFile && (
                      <div className="flex items-center justify-between bg-gray-50 p-2 rounded">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-gray-600" />
                          <span className="text-sm truncate">{dialogResumeFile.name}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleDialogClearResume}
                        >
                          清除
                        </Button>
                      </div>
                    )}
                    {uploadError && (
                      <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                        {uploadError}
                      </div>
                    )}
                    <Button
                      type="button"
                      onClick={handleDialogResumeUpload}
                      disabled={isUploadingResume || !dialogResumeFile || !dialogCandidateName.trim()}
                      className="w-full"
                    >
                      {isUploadingResume ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          上传并解析中...
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          上传简历并解析
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-green-700">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-sm font-medium">{dialogCandidateName}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDialogClearResume}
                        className="text-xs"
                      >
                        重新上传
                      </Button>
                    </div>

                    {/* 简历解析结果 */}
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-3">
                      {/* 基本信息 */}
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {dialogResumeParsedData.basicInfo?.name && (
                          <div>
                            <span className="text-gray-500">姓名：</span>
                            <span className="font-medium">{dialogResumeParsedData.basicInfo.name}</span>
                          </div>
                        )}
                        {dialogResumeParsedData.basicInfo?.education && (
                          <div>
                            <span className="text-gray-500">学历：</span>
                            <span className="font-medium">{dialogResumeParsedData.basicInfo.education}</span>
                          </div>
                        )}
                        {dialogResumeParsedData.workExperience?.[0]?.position && (
                          <div>
                            <span className="text-gray-500">最近职位：</span>
                            <span className="font-medium">{dialogResumeParsedData.workExperience[0].position}</span>
                          </div>
                        )}
                        {dialogResumeParsedData.workExperience?.length && (
                          <div>
                            <span className="text-gray-500">工作年限：</span>
                            <span className="font-medium">{dialogResumeParsedData.workExperience.length} 年</span>
                          </div>
                        )}
                      </div>

                      {/* 岗位匹配分析 */}
                      {dialogResumeParsedData.matchAnalysis && (
                        <>
                          <div className="border-t border-green-200 pt-3">
                            <div className="text-sm font-medium text-green-900 mb-2">岗位匹配分析</div>
                            <div className="space-y-2">
                              {dialogResumeParsedData.matchAnalysis.vetoCheck?.triggered && (
                                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="destructive">一票否决命中</Badge>
                                    <span className="text-xs font-medium text-red-800">筛选分数已强制置为 0</span>
                                  </div>
                                  <div className="mt-2 space-y-2">
                                    {dialogResumeParsedData.matchAnalysis.vetoCheck?.hits.map((hit, index) => (
                                      <div key={index} className="rounded border border-red-100 bg-white p-2">
                                        <div className="text-xs font-medium text-red-900">{hit.ruleName}</div>
                                        {hit.description && (
                                          <div className="mt-1 text-[11px] text-red-700">{hit.description}</div>
                                        )}
                                        {hit.matchedKeywords.length > 0 && (
                                          <div className="mt-1 text-[11px] text-red-700">
                                            命中关键词：{hit.matchedKeywords.join('、')}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div>
                                <div className="text-xs text-gray-600 mb-1">匹配度</div>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                                    <div
                                      className="bg-green-600 h-2 rounded-full"
                                      style={{ width: `${dialogResumeParsedData.matchAnalysis.matchScore}%` }}
                                    ></div>
                                  </div>
                                  <span className="text-sm font-bold">{dialogResumeParsedData.matchAnalysis.matchScore}%</span>
                                </div>
                              </div>

                              {/* 已匹配项 */}
                              {dialogResumeParsedData.matchAnalysis.matchedItems && dialogResumeParsedData.matchAnalysis.matchedItems.length > 0 && (
                                <div>
                                  <div className="text-xs font-medium text-green-800 mb-1">✓ 已匹配项</div>
                                  <div className="flex flex-wrap gap-1">
                                    {dialogResumeParsedData.matchAnalysis.matchedItems.slice(0, 4).map((item, index: number) => (
                                      <Badge key={index} variant="secondary" className="text-xs">
                                        {getMatchAnalysisLabel(item)}
                                      </Badge>
                                    ))}
                                    {dialogResumeParsedData.matchAnalysis.matchedItems.length > 4 && (
                                      <Badge variant="secondary" className="text-xs">
                                        +{dialogResumeParsedData.matchAnalysis.matchedItems.length - 4}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* 未匹配项 */}
                              {dialogResumeParsedData.matchAnalysis.unmatchedItems && dialogResumeParsedData.matchAnalysis.unmatchedItems.length > 0 && (
                                <div>
                                  <div className="text-xs font-medium text-orange-800 mb-1">✗ 未匹配项</div>
                                  <div className="flex flex-wrap gap-1">
                                    {dialogResumeParsedData.matchAnalysis.unmatchedItems.slice(0, 4).map((item, index: number) => (
                                      <Badge key={index} variant="outline" className="text-xs">
                                        {getMatchAnalysisLabel(item)}
                                      </Badge>
                                    ))}
                                    {dialogResumeParsedData.matchAnalysis.unmatchedItems.length > 4 && (
                                      <Badge variant="outline" className="text-xs">
                                        +{dialogResumeParsedData.matchAnalysis.unmatchedItems.length - 4}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* 优势 */}
                              {dialogResumeParsedData.matchAnalysis.strengths && dialogResumeParsedData.matchAnalysis.strengths.length > 0 && (
                                <div>
                                  <div className="text-xs font-medium text-blue-800 mb-1">⚡ 优势</div>
                                  <div className="flex flex-wrap gap-1">
                                    {dialogResumeParsedData.matchAnalysis.strengths.slice(0, 3).map((strength, index: number) => (
                                      <Badge key={index} className="text-xs bg-blue-100 text-blue-800 border-blue-200">
                                        {getMatchAnalysisLabel(strength)}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* 潜在不足 */}
                              {((dialogResumeParsedData.matchAnalysis.weaknesses?.length ?? 0) > 0 || (dialogResumeParsedData.matchAnalysis.gaps?.length ?? 0) > 0) && (
                                <div>
                                  <div className="text-xs font-medium text-red-800 mb-1">⚠️ 潜在不足</div>
                                  <div className="flex flex-wrap gap-1">
                                    {(dialogResumeParsedData.matchAnalysis.weaknesses || dialogResumeParsedData.matchAnalysis.gaps || []).slice(0, 3).map((weakness, index: number) => (
                                      <Badge key={index} variant="destructive" className="text-xs">
                                        {getMatchAnalysisLabel(weakness)}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* 冲突信息 */}
                              {dialogResumeParsedData.matchAnalysis.conflicts && dialogResumeParsedData.matchAnalysis.conflicts.length > 0 && (
                                <div>
                                  <div className="text-xs font-medium text-purple-800 mb-1">⚡ 冲突信息</div>
                                  <div className="flex flex-wrap gap-1">
                                    {dialogResumeParsedData.matchAnalysis.conflicts.slice(0, 3).map((conflict, index: number) => (
                                      <Badge key={index} variant="outline" className="text-xs bg-purple-50 text-purple-800 border-purple-200">{getMatchAnalysisLabel(conflict)}</Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* 或者使用已加载的简历 */}
                {!dialogResumeParsedData && uploadedResumeInfo && (
                  <div className="text-center">
                    <div className="text-xs text-gray-400 mb-2">或</div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (uploadedResumeInfo) {
                          setDialogCandidateName(uploadedResumeInfo.candidateName);
                          setDialogResumeParsedData(uploadedResumeInfo.parsedData);
                        }
                      }}
                    >
                      使用已加载的简历
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* 已选择岗位信息 */}
            {selectedPositionId && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-blue-700" />
                  <div className="text-sm font-medium text-blue-900">已选择岗位</div>
                </div>
                <div className="text-sm">
                  <span className="font-medium">{positions.find(p => p.id === selectedPositionId)?.title}</span>
                  <span className="text-gray-500 ml-2">|</span>
                  <span className="text-gray-600 ml-2">{positions.find(p => p.id === selectedPositionId)?.department}</span>
                </div>
                {positions.find(p => p.id === selectedPositionId)?.interviewerPreferences && (
                  <div className="text-xs text-blue-700 mt-2">
                    <div className="font-medium mb-1">面试官偏好：</div>
                    <div className="flex flex-wrap gap-1">
                      {(() => {
                        const focusAreas =
                          positions.find((p) => p.id === selectedPositionId)?.interviewerPreferences?.focusAreas ?? [];

                        return (
                          <>
                            {focusAreas.slice(0, 3).map((area, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">{area}</Badge>
                            ))}
                            {focusAreas.length > 3 && (
                              <Badge variant="secondary" className="text-xs">+{focusAreas.length - 3}</Badge>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>目标职级</Label>
              <div className="grid grid-cols-3 gap-3">
                <Button
                  type="button"
                  variant={generateLevel === 'junior' ? 'default' : 'outline'}
                  onClick={() => setGenerateLevel('junior')}
                >
                  应届生
                </Button>
                <Button
                  type="button"
                  variant={generateLevel === 'mid' ? 'default' : 'outline'}
                  onClick={() => setGenerateLevel('mid')}
                >
                  专员
                </Button>
                <Button
                  type="button"
                  variant={generateLevel === 'senior' ? 'default' : 'outline'}
                  onClick={() => setGenerateLevel('senior')}
                >
                  资深岗
                </Button>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="text-sm font-medium">生成说明：</div>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• 基础验证题：3-4题，验证简历真实性</li>
                <li>• 能力考察题：4-5题，深度考察专业能力</li>
                <li>• 缺口补全题：3-4题，针对差距进行考察</li>
                <li>• 情景模拟题：2-3题，模拟实际工作场景</li>
              </ul>
              <div className="text-xs text-gray-500 mt-2">
                每道题包含：问题内容 + 追问 + 考察目标 + 难度等级
              </div>
            </div>

            {generationError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {generationError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowGenerateDialog(false)}
              disabled={isGeneratingQuestions}
            >
              取消
            </Button>
            <Button
              onClick={generateQuestions}
              disabled={isGeneratingQuestions || !dialogResumeParsedData && !uploadedResumeInfo}
            >
              {isGeneratingQuestions ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  生成问题库
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 邀请候选人对话框 */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>邀请候选人进入面试室</DialogTitle>
            <DialogDescription>
              生成邀请链接并分享给候选人，让他们进入面试室
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* 会议信息 */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-900">会议ID</span>
                <Badge variant="secondary">{meetingId || "生成中..."}</Badge>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={inviteLink}
                    readOnly
                    className="flex-1 bg-white text-sm font-mono"
                    placeholder="点击下方按钮生成邀请链接"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={copyInviteLink}
                    title="复制链接"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-blue-700">
                  🔒 此链接为安全的面试系统内部链接，可直接发送给候选人
                </p>
              </div>
            </div>

            {/* 选择候选人 */}
            {availableCandidates.length > 0 && (
              <div className="grid gap-2">
                <Label>选择候选人（自动填充信息）</Label>
                <Select
                  value={selectedCandidateForInvite || ""}
                  onValueChange={handleSelectCandidate}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择候选人" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCandidates.map((candidate, index) => (
                      <SelectItem key={index} value={candidate.name}>
                        {candidate.name} - {candidate.phone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 手动输入联系方式 */}
            <div className="grid gap-2">
              <Label htmlFor="invite-email">邮箱（可选）</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="候选人邮箱"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="invite-phone">手机号（可选）</Label>
              <Input
                id="invite-phone"
                placeholder="候选人手机号"
                value={candidatePhone}
                onChange={(e) => setCandidatePhone(e.target.value)}
              />
            </div>

            {/* 提示信息 */}
            <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
              <p className="font-medium mb-1">温馨提示：</p>
              <ul className="list-disc list-inside space-y-1">
                <li>点击&quot;复制链接&quot;按钮可复制邀请链接</li>
                <li>选择下方按钮通过邮件或短信发送邀请</li>
                <li>候选人点击链接即可直接进入面试室</li>
              </ul>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <div className="flex-1 sm:flex-none">
              <Button
                variant="outline"
                onClick={() => setShowInviteDialog(false)}
                className="w-full sm:w-auto"
              >
                取消
              </Button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 flex-1 sm:flex-none">
              <Button
                variant="outline"
                onClick={sendEmailInvite}
                disabled={!inviteEmail}
                className="w-full sm:w-auto"
              >
                <Mail className="mr-2 h-4 w-4" />
                通过邮件发送
              </Button>
              <Button
                variant="outline"
                onClick={sendSMSInvite}
                disabled={!candidatePhone}
                className="w-full sm:w-auto"
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                通过短信发送
              </Button>
              <Button
                onClick={() => {
                  if (!inviteLink) {
                    generateInviteLink();
                  }
                  const message = generateInviteMessage('email');
                  navigator.clipboard.writeText(message);
                  toast.success("邀请文字已复制", {
                    description: "可以直接粘贴到邮件或聊天软件中",
                  });
                }}
                className="w-full sm:w-auto"
              >
                <Copy className="mr-2 h-4 w-4" />
                复制邀请文字
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 邀请面试官对话框 */}
      <Dialog open={showInviteInterviewerDialog} onOpenChange={setShowInviteInterviewerDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>邀请其他面试官进入面试室</DialogTitle>
            <DialogDescription>
              生成邀请链接并分享给其他面试官，让他们一起参与面试
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* 会议信息 */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-purple-900">会议ID</span>
                <Badge variant="secondary">{meetingId || "生成中..."}</Badge>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={interviewerInviteLink}
                    readOnly
                    className="flex-1 bg-white text-sm font-mono"
                    placeholder="点击下方按钮生成邀请链接"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={copyInterviewerInviteLink}
                    title="复制链接"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-purple-700">
                  👥 此链接可邀请其他面试官一起参与面试，支持多对一面试场景
                </p>
              </div>
            </div>

            {/* 手动输入联系方式 */}
            <div className="grid gap-2">
              <Label htmlFor="interviewer-invite-email">邮箱（可选）</Label>
              <Input
                id="interviewer-invite-email"
                type="email"
                placeholder="面试官邮箱"
                value={interviewerInviteEmail}
                onChange={(e) => setInterviewerInviteEmail(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="interviewer-invite-phone">手机号（可选）</Label>
              <Input
                id="interviewer-invite-phone"
                placeholder="面试官手机号"
                value={interviewerInvitePhone}
                onChange={(e) => setInterviewerInvitePhone(e.target.value)}
              />
            </div>

            {/* 提示信息 */}
            <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
              <p className="font-medium mb-1">温馨提示：</p>
              <ul className="list-disc list-inside space-y-1">
                <li>点击&quot;复制链接&quot;按钮可复制邀请链接</li>
                <li>选择下方按钮通过邮件或短信发送邀请</li>
                <li>其他面试官点击链接即可进入面试室</li>
                <li>多个面试官可以在同一设备上协作，或者各自使用设备</li>
              </ul>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <div className="flex-1 sm:flex-none">
              <Button
                variant="outline"
                onClick={() => setShowInviteInterviewerDialog(false)}
                className="w-full sm:w-auto"
              >
                取消
              </Button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 flex-1 sm:flex-none">
              <Button
                variant="outline"
                onClick={sendInterviewerEmailInvite}
                disabled={!interviewerInviteEmail}
                className="w-full sm:w-auto"
              >
                <Mail className="mr-2 h-4 w-4" />
                通过邮件发送
              </Button>
              <Button
                variant="outline"
                onClick={sendInterviewerSMSInvite}
                disabled={!interviewerInvitePhone}
                className="w-full sm:w-auto"
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                通过短信发送
              </Button>
              <Button
                onClick={() => {
                  if (!interviewerInviteLink) {
                    generateInterviewerInviteLink();
                  }
                  const message = generateInterviewerInviteMessage('email');
                  navigator.clipboard.writeText(message);
                  toast.success("邀请文字已复制", {
                    description: "可以直接粘贴到邮件或聊天软件中",
                  });
                }}
                className="w-full sm:w-auto"
              >
                <Copy className="mr-2 h-4 w-4" />
                复制邀请文字
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
