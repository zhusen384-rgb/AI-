// 候选人状态监控系统（完整版）
// 特性：
// 1. 使用 face-api.js 进行准确的人脸检测
// 2. 事件驱动监控（页面隐藏、窗口失焦、网络状态）
// 3. 随机检查间隔（8-15秒），降低性能消耗
// 4. 定时截图（60-90秒）+ 异常事件截图
// 5. 同时截取人脸画面和屏幕画面
// 6. 支持多种异常检测场景
// 7. 兼容 Chrome 和 Edge 浏览器
//
// 状态分类：
// - normal（正常）- 检测到 1 张人脸，候选人表现正常
// - abnormal（异常）- 未检测到人脸、长时间看别处、低头、侧脸等
// - cheating（作弊）- 检测到多张人脸、切换屏幕、分屏/浮窗等可疑行为

import { faceDetectionManager, FaceDetectionResult } from './face-detection';
import { getMediaCapabilityProblem } from './media-environment';

// 检测是否是 Edge 浏览器
const isEdgeBrowser = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /Edg/.test(navigator.userAgent);
};

// 检测是否是 Chrome 浏览器（非 Edge）
const isChromeBrowser = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Chrome/.test(ua) && !/Edg/.test(ua) && !/OPR/.test(ua) && !/Brave/.test(ua);
};

// 异常事件类型枚举
export enum AbnormalEventType {
  // 人脸相关
  FACE_LOST = 'face_lost',                    // 人脸丢失
  MULTIPLE_FACES = 'multiple_faces',          // 多人出现
  FACE_DEVIATED = 'face_deviated',            // 人脸偏离/遮挡
  LONG_ABSENCE = 'long_absence',              // 长时间无人
  
  // 行为相关
  PAGE_SWITCH = 'page_switch',                // 页面切换
  WINDOW_BLUR = 'window_blur',                // 窗口失焦
  FREQUENT_SWITCH = 'frequent_switch',        // 切屏频繁
  PASTE_DETECTED = 'paste_detected',          // 粘贴行为
  
  // 设备相关
  CAMERA_ERROR = 'camera_error',              // 摄像头异常
  MICROPHONE_ERROR = 'microphone_error',      // 麦克风异常
  NETWORK_DISCONNECTED = 'network_disconnected', // 网络断开
  
  // 其他
  WINDOW_COVERED = 'window_covered',          // 窗口被覆盖
  PERIODIC_CHECK = 'periodic_check',          // 定时检查
}

export type StatusEventType = 'normal' | 'abnormal' | 'cheating';
export type StatusSeverity = 'high' | 'medium' | 'low';
export type OverallStatus = 'normal' | 'warning' | 'cheating';

// 截图信息
export interface ScreenshotEvidence {
  faceScreenshot?: string;      // 人脸截图 base64
  screenScreenshot?: string;    // 屏幕截图 base64
  timestamp: string;            // 时间戳
  interviewStep?: string;       // 当前面试步骤
  abnormalType?: AbnormalEventType; // 异常类型
  description?: string;         // 描述
}

export interface StatusEvent {
  timestamp: string;
  type: StatusEventType;
  severity: StatusSeverity;
  description: string;
  abnormalType?: AbnormalEventType;  // 具体的异常类型
  evidence?: ScreenshotEvidence;
  roundNumber: number;
}

export interface CandidateStatusStatistics {
  totalDuration: number; // 总面试时长（秒）
  normalDuration: number; // 正常时长
  abnormalDuration: number; // 异常时长
  cheatingDuration: number; // 作弊时长
  faceDetectionRate: number; // 人脸检测率
  faceLostCount: number; // 人脸丢失次数
  multipleFaceCount: number; // 多人出现次数
  suspiciousActions: number; // 可疑行为次数
  screenshotCount: number; // 截图总数
  periodicScreenshotCount: number; // 定时截图数量
  eventScreenshotCount: number; // 事件截图数量
}

export interface CandidateStatus {
  overallStatus: OverallStatus;
  summary: string;
  events: StatusEvent[];
  statistics: CandidateStatusStatistics;
  screenshots: ScreenshotEvidence[]; // 所有截图按时间顺序存储
}

export interface MonitorConfig {
  enabled: boolean; // 是否启用监控
  minCheckInterval: number; // 最小检查间隔（毫秒）
  maxCheckInterval: number; // 最大检查间隔（毫秒）
  minScreenshotInterval: number; // 最小定时截图间隔（毫秒）
  maxScreenshotInterval: number; // 最大定时截图间隔（毫秒）
  screenshotQuality: number; // 截图质量 0-1
  enableScreenCapture: boolean; // 是否启用屏幕截图
  threshold: {
    maxFaceLostDuration: number; // 最大人脸丢失时长（秒）
    maxMultipleFaceDuration: number; // 最大多人出现时长（秒）
    maxAbnormalDuration: number; // 最大异常时长（秒）
    maxSwitchCount: number; // 最大切换次数（5分钟内）
    longAbsenceDuration: number; // 长时间无人时长（秒）
  };
}

export class CandidateMonitor {
  private config: MonitorConfig; // 配置
  
  private videoElement: HTMLVideoElement | null = null;
  private screenVideoElement: HTMLVideoElement | null = null; // 屏幕共享视频元素
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private screenCanvas: HTMLCanvasElement | null = null; // 屏幕截图Canvas
  private screenCtx: CanvasRenderingContext2D | null = null;
  private monitorTimeout: NodeJS.Timeout | null = null;
  private screenshotTimeout: NodeJS.Timeout | null = null; // 定时截图定时器
  private isMonitoring = false;
  private startTime: number = 0;
  private lastUpdateTime: number = 0;
  private lastFrameData: ImageData | null = null;
  private screenStream: MediaStream | null = null; // 屏幕共享流
  
  // 切换行为追踪
  private switchCount: number = 0;
  private switchHistory: number[] = []; // 记录切换时间戳
  
  // 当前面试步骤
  private currentInterviewStep: string = '准备中';
  
  // 状态数据
  private status: CandidateStatus = {
    overallStatus: 'normal',
    summary: '面试进行中，候选人表现正常',
    events: [],
    statistics: {
      totalDuration: 0,
      normalDuration: 0,
      abnormalDuration: 0,
      cheatingDuration: 0,
      faceDetectionRate: 0,
      faceLostCount: 0,
      multipleFaceCount: 0,
      suspiciousActions: 0,
      screenshotCount: 0,
      periodicScreenshotCount: 0,
      eventScreenshotCount: 0,
    },
    screenshots: [],
  };
  
  private currentRound: number = 1;
  private currentStatus: StatusEventType = 'normal';
  private statusStartTime: number = 0;
  private checkCount: number = 0; // 检查次数计数器
  
  // 事件监听器
  private eventListeners: {
    visibilityChange: () => void;
    blur: () => void;
    focus: () => void;
    online: () => void;
    offline: () => void;
    paste: () => void;
  } | null = null;

  constructor(config?: Partial<MonitorConfig>) {
    this.config = {
      enabled: true,
      minCheckInterval: 8000, // 最小 8 秒
      maxCheckInterval: 15000, // 最大 15 秒
      minScreenshotInterval: 60000, // 最小 60 秒
      maxScreenshotInterval: 90000, // 最大 90 秒
      screenshotQuality: 0.75, // JPEG 质量 75%
      enableScreenCapture: true, // 默认启用屏幕截图
      threshold: {
        maxFaceLostDuration: 10,
        maxMultipleFaceDuration: 5,
        maxAbnormalDuration: 30,
        maxSwitchCount: 3, // 5分钟内最多切换3次
        longAbsenceDuration: 30, // 30秒无人算异常
      },
      ...config,
    };
  }

  // 初始化监控器
  async initialize(videoElement: HTMLVideoElement): Promise<void> {
    console.log('[候选人监控] initialize 方法被调用');
    console.log('[候选人监控] videoElement:', videoElement);
    console.log('[候选人监控] videoElement.srcObject:', videoElement?.srcObject);
    
    if (!this.config.enabled) {
      console.log('[候选人监控] 监控未启用（配置禁用）');
      return;
    }

    console.log('[候选人监控] 初始化监控器...');
    
    if (!videoElement) {
      throw new Error('视频元素为空');
    }
    
    this.videoElement = videoElement;
    
    // 检查视频元素状态
    console.log('[候选人监控] 视频元素状态:', {
      readyState: videoElement.readyState,
      videoWidth: videoElement.videoWidth,
      videoHeight: videoElement.videoHeight,
      paused: videoElement.paused,
      muted: videoElement.muted,
      hasSrcObject: !!videoElement.srcObject,
      streamTracks: videoElement.srcObject ? (videoElement.srcObject as MediaStream).getVideoTracks().length : 0,
      videoTrackEnabled: videoElement.srcObject ? (videoElement.srcObject as MediaStream).getVideoTracks()[0]?.enabled : false,
    });

    // 等待视频元素就绪（最多等待 10 秒）
    if (videoElement.readyState < 2) {
      console.log('[候选人监控] 等待视频元素就绪...');
      const maxWaitTime = 10000; // 10 秒
      const startTime = Date.now();
      
      while (videoElement.readyState < 2 && Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (videoElement.readyState < 2) {
        throw new Error(`视频元素在 ${maxWaitTime}ms 内未就绪`);
      }
      
      console.log('[候选人监控] 视频元素已就绪');
    }

    // 如果视频被暂停，尝试播放
    if (videoElement.paused) {
      console.log('[候选人监控] 视频被暂停，尝试播放...');
      try {
        await videoElement.play();
        console.log('[候选人监控] 视频播放成功');
      } catch (error) {
        console.warn('[候选人监控] 视频播放失败:', error);
        // 不抛出错误，继续初始化
      }
    }

    console.log('[候选人监控] 视频尺寸:', {
      videoWidth: videoElement.videoWidth,
      videoHeight: videoElement.videoHeight,
    });

    // 创建Canvas用于视频帧分析
    this.canvas = document.createElement('canvas');
    this.canvas.width = 320; // 降低分辨率以提高性能
    this.canvas.height = 240;
    this.ctx = this.canvas.getContext('2d');
    
    // 创建屏幕截图Canvas
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = 1280;
    this.screenCanvas.height = 720;
    this.screenCtx = this.screenCanvas.getContext('2d');
    
    // 初始化屏幕共享流（如果启用）
    if (this.config.enableScreenCapture) {
      await this.initScreenCapture();
    }
    if (!this.ctx) {
      throw new Error('无法创建Canvas上下文');
    }

    console.log('[候选人监控] Canvas 创建完成');
    console.log(`[候选人监控] Canvas尺寸: ${this.canvas.width}x${this.canvas.height}`);

    // 加载 face-api.js 模型
    try {
      console.log('[候选人监控] 开始加载人脸检测模型...');
      await faceDetectionManager.loadModels();
      console.log('[候选人监控] ✅ 人脸检测模型加载成功');
    } catch (error) {
      console.error('[候选人监控] ⚠️ 人脸检测模型加载失败，将使用基础检测:', error);
      // 模型加载失败不影响监控启动，使用基础检测
    }

    // 检查模型是否真正加载成功
    const isModelLoaded = faceDetectionManager.isModelLoaded();
    console.log(`[候选人监控] 模型加载状态: ${isModelLoaded ? '已加载（AI检测）' : '未加载（基础检测）'}`);

    // 更新summary，明确显示检测方式
    if (isModelLoaded) {
      this.status.summary = '候选人状态监控已启动（AI人脸检测）';
    } else {
      this.status.summary = '候选人状态监控已启动（基础检测模式）';
    }
    
    // 标记监控已初始化（即使模型加载失败）
    this.status.overallStatus = 'normal'; // 初始状态设为正常

    console.log('[候选人监控] 监控器初始化完成');
    console.log(`[候选人监控] 检查间隔: ${this.config.minCheckInterval}-${this.config.maxCheckInterval}ms（随机）`);
  }

  // 开始监控
  startMonitoring(roundNumber: number = 1): void {
    if (!this.config.enabled) {
      console.log('[候选人监控] 监控未启用（配置禁用）');
      return;
    }

    if (this.isMonitoring) {
      console.log('[候选人监控] 监控已在运行中');
      return;
    }

    console.log(`[候选人监控] 开始监控，轮次：${roundNumber}`);
    console.log(`[候选人监控] 检查间隔：${this.config.minCheckInterval}-${this.config.maxCheckInterval}ms（随机）`);
    console.log(`[候选人监控] 定时截图间隔：${this.config.minScreenshotInterval}-${this.config.maxScreenshotInterval}ms（随机）`);
    console.log(`[候选人监控] 阈值配置：`, this.config.threshold);
    
    this.isMonitoring = true;
    this.startTime = Date.now();
    this.lastUpdateTime = Date.now();
    this.currentRound = roundNumber;
    this.currentStatus = 'normal';
    this.statusStartTime = Date.now();
    this.checkCount = 0;
    this.switchCount = 0;
    this.switchHistory = [];
    
    // 注册事件监听器
    this.setupEventListeners();
    
    // 启动第一次检查
    this.scheduleNextCheck();
    
    // 启动定时截图
    this.schedulePeriodicScreenshot();
  }

  // 注册事件监听器
  private setupEventListeners(): void {
    this.eventListeners = {
      visibilityChange: () => this.handleVisibilityChange(),
      blur: () => this.handleWindowBlur(),
      focus: () => this.handleWindowFocus(),
      online: () => this.handleNetworkOnline(),
      offline: () => this.handleNetworkOffline(),
      paste: () => this.handlePaste(),
    };

    // 页面可见性变化
    document.addEventListener('visibilitychange', this.eventListeners.visibilityChange);
    
    // 窗口失焦/聚焦
    window.addEventListener('blur', this.eventListeners.blur);
    window.addEventListener('focus', this.eventListeners.focus);
    
    // 网络状态变化
    window.addEventListener('online', this.eventListeners.online);
    window.addEventListener('offline', this.eventListeners.offline);
    
    // 粘贴事件
    document.addEventListener('paste', this.eventListeners.paste);
    
    console.log('[候选人监控] ✅ 事件监听器已注册');
  }

  // 移除事件监听器
  private removeEventListeners(): void {
    if (this.eventListeners) {
      document.removeEventListener('visibilitychange', this.eventListeners.visibilityChange);
      window.removeEventListener('blur', this.eventListeners.blur);
      window.removeEventListener('focus', this.eventListeners.focus);
      window.removeEventListener('online', this.eventListeners.online);
      window.removeEventListener('offline', this.eventListeners.offline);
      document.removeEventListener('paste', this.eventListeners.paste);
      this.eventListeners = null;
      console.log('[候选人监控] ✅ 事件监听器已移除');
    }
  }

  // 处理页面可见性变化
  private handleVisibilityChange(): void {
    if (document.hidden) {
      console.log('[候选人监控] ⚠️ 页面隐藏，记录异常');
      this.trackSwitch();
      this.recordEventWithScreenshot(
        'abnormal', 
        'high', 
        '候选人切换页面或最小化窗口', 
        AbnormalEventType.PAGE_SWITCH
      );
    } else {
      console.log('[候选人监控] ✅ 页面恢复可见');
    }
  }

  // 处理窗口失焦
  private handleWindowBlur(): void {
    console.log('[候选人监控] ⚠️ 窗口失焦，候选人可能切换应用');
    this.trackSwitch();
    this.recordEventWithScreenshot(
      'abnormal', 
      'medium', 
      '面试窗口失去焦点，候选人可能切换到其他应用', 
      AbnormalEventType.WINDOW_BLUR
    );
  }

  // 处理粘贴事件
  private handlePaste(): void {
    console.log('[候选人监控] ⚠️ 检测到粘贴操作');
    this.recordEventWithScreenshot(
      'abnormal',
      'high',
      '检测到粘贴操作，可能存在作弊行为',
      AbnormalEventType.PASTE_DETECTED
    );
  }

  // 追踪切换行为
  private trackSwitch(): void {
    const now = Date.now();
    this.switchHistory.push(now);
    this.switchCount++;
    
    // 只保留最近5分钟的切换记录
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    this.switchHistory = this.switchHistory.filter(t => t > fiveMinutesAgo);
    
    // 检查是否频繁切换
    if (this.switchHistory.length > this.config.threshold.maxSwitchCount) {
      this.recordEventWithScreenshot(
        'cheating',
        'high',
        `5分钟内切换${this.switchHistory.length}次，可能存在作弊行为`,
        AbnormalEventType.FREQUENT_SWITCH
      );
    }
  }

  // 处理窗口聚焦
  private handleWindowFocus(): void {
    console.log('[候选人监控] ✅ 窗口获得焦点');
  }

  // 处理网络离线
  private handleNetworkOffline(): void {
    console.log('[候选人监控] ⚠️ 网络离线，记录异常');
    this.recordEventWithScreenshot(
      'abnormal',
      'medium',
      '网络连接中断',
      AbnormalEventType.NETWORK_DISCONNECTED
    );
  }

  // 处理网络恢复
  private handleNetworkOnline(): void {
    console.log('[候选人监控] ✅ 网络恢复');
  }

  // 调度下一次检查（随机间隔）
  private scheduleNextCheck(): void {
    if (!this.isMonitoring) return;
    
    // 生成随机检查间隔（8-15秒）
    const randomInterval = Math.floor(
      Math.random() * (this.config.maxCheckInterval - this.config.minCheckInterval + 1)
    ) + this.config.minCheckInterval;
    
    console.log(`[候选人监控] 下次检查将在 ${randomInterval}ms 后进行`);
    
    this.monitorTimeout = setTimeout(() => {
      this.checkStatus();
    }, randomInterval);
  }

  // 检查状态
  private async checkStatus(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    if (!this.videoElement || !this.ctx || !this.canvas) {
      console.warn('[候选人监控] 检查状态失败: videoElement/ctx/canvas 未初始化');
      this.scheduleNextCheck();
      return;
    }

    this.checkCount++;

    try {
      // 先绘制当前视频帧到Canvas（用于截图）
      this.ctx.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height);

      // 优先使用 face-api.js 进行人脸检测
      if (faceDetectionManager.isModelLoaded()) {
        const faceResult = await faceDetectionManager.detectFaces(this.videoElement);
        
        console.log(`[候选人监控] 第${this.checkCount}次检查: 人脸=${faceResult.faceCount}, 检测=face-api.js`);
        
        // 分析人脸检测结果
        this.analyzeFaceResult(faceResult);
      } else {
        // 回退到基础检测（基于亮度和运动）
        await this.checkWithBasicDetection();
      }
      
      // 更新统计
      this.updateStatistics();
      
      // 调度下一次检查
      this.scheduleNextCheck();
      
    } catch (error) {
      console.error('[候选人监控] 检查状态失败:', error);
      this.scheduleNextCheck();
    }
  }

  // 停止监控
  stopMonitoring(): void {
    if (!this.isMonitoring) {
      console.log('[候选人监控] 监控未在运行中');
      return;
    }

    console.log('[候选人监控] 停止监控');
    console.log(`[候选人监控] 总检查次数: ${this.checkCount}`);
    console.log(`[候选人监控] 总截图次数: ${this.status.statistics.screenshotCount}`);
    console.log(`[候选人监控] 运行时长: ${((Date.now() - this.startTime) / 1000).toFixed(1)}秒`);
    
    this.isMonitoring = false;
    
    // 清除检查定时器
    if (this.monitorTimeout) {
      clearTimeout(this.monitorTimeout);
      this.monitorTimeout = null;
      console.log('[候选人监控] 检查定时器已清除');
    }
    
    // 清除截图定时器
    if (this.screenshotTimeout) {
      clearTimeout(this.screenshotTimeout);
      this.screenshotTimeout = null;
      console.log('[候选人监控] 截图定时器已清除');
    }
    
    // 移除事件监听器
    this.removeEventListeners();
    
    // 停止屏幕共享
    this.stopScreenCapture();
    
    // 计算最终统计
    this.calculateFinalStatistics();
  }

  // 使用 face-api.js 分析人脸检测结果
  // 状态分类：
  // - normal（正常）- 检测到 1 张人脸，候选人表现正常
  // - abnormal（异常）- 未检测到人脸、长时间看别处、机械背诵感强、闭眼时间＞2秒、只露半张脸、长期低头/侧脸、多人交谈、画面被物品大面积遮挡等
  // - cheating（作弊）- 检测到多张人脸、切换屏幕、分屏/浮窗等可疑行为
  private analyzeFaceResult(faceResult: FaceDetectionResult): void {
    let newStatus: StatusEventType = 'normal';
    let severity: StatusSeverity = 'low';
    let description = '';
    
    if (faceResult.faceCount === 0) {
      // 没有检测到人脸
      newStatus = 'abnormal';
      severity = 'medium';
      description = '画面中未检测到候选人';
      this.status.statistics.faceLostCount++;
    } else if (faceResult.faceCount > 1) {
      // 检测到多个人脸
      newStatus = 'cheating';
      severity = 'high';
      description = `检测到 ${faceResult.faceCount} 张人脸，可能存在作弊行为`;
      this.status.statistics.multipleFaceCount++;
      this.status.statistics.suspiciousActions++;
    } else {
      // 只有一张人脸，检查其他特征
      const isLookingAway = faceDetectionManager.isLookingAway(faceResult.landmarks);
      const isEyesClosed = faceDetectionManager.isEyesClosed(faceResult.landmarks);
      const isFocused = faceDetectionManager.isFocused(faceResult.expressions);
      
      if (isEyesClosed) {
        newStatus = 'abnormal';
        severity = 'medium';
        description = '检测到候选人闭眼，可能在休息或不专心';
        this.status.statistics.suspiciousActions++;
      } else if (isLookingAway) {
        newStatus = 'abnormal';
        severity = 'low';
        description = '候选人可能在看别处，未专注屏幕';
        this.status.statistics.suspiciousActions++;
      } else if (!isFocused) {
        newStatus = 'normal';
        description = '候选人表情正常';
      }
    }
    
    // 更新状态
    this.updateStatus(newStatus, severity, description);
  }

  // 使用基础检测（回退方案）
  private async checkWithBasicDetection(): Promise<void> {
    // 类型守卫：确保 ctx 和 canvas 不为 null
    if (!this.ctx || !this.canvas || !this.videoElement) {
      console.warn('[候选人监控] checkWithBasicDetection: ctx/canvas/videoElement 未初始化');
      this.scheduleNextCheck();
      return;
    }

    // 绘制当前视频帧到Canvas
    this.ctx.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height);

    // 获取帧数据
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    
    // 分析帧数据
    const analysis = this.analyzeFrame(imageData);
    
    console.log(`[候选人监控] 第${this.checkCount}次检查: hasPerson=${analysis.hasPerson}, multiplePeople=${analysis.multiplePeople}, 检测=basic`);
    
    // 更新状态
    this.updateStatus(
      analysis.hasPerson ? 'normal' : 'abnormal',
      analysis.multiplePeople ? 'high' : 'medium',
      analysis.hasPerson ? '候选人表现正常' : '画面中未检测到候选人'
    );
  }

  // 分析视频帧
  private analyzeFrame(imageData: ImageData): {
    hasPerson: boolean;
    multiplePeople: boolean;
    brightness: number;
    motionLevel: number;
  } {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    // 计算平均亮度
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
      totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    const brightness = totalBrightness / (data.length / 4);
    
    // 计算运动水平（与上一帧比较）
    let motionLevel = 0;
    if (this.lastFrameData) {
      let diff = 0;
      for (let i = 0; i < data.length; i += 4) {
        diff += Math.abs(data[i] - this.lastFrameData.data[i]) +
                Math.abs(data[i + 1] - this.lastFrameData.data[i + 1]) +
                Math.abs(data[i + 2] - this.lastFrameData.data[i + 2]);
      }
      motionLevel = diff / (data.length / 4);
    }
    
    // 保存当前帧用于下一次比较
    this.lastFrameData = imageData;
    
    // 检测是否有人
    // 基于中心区域的亮度和运动检测
    const centerWidth = width / 2;
    const centerHeight = height / 2;
    const startX = (width - centerWidth) / 2;
    const startY = (height - centerHeight) / 2;
    
    let centerBrightness = 0;
    let centerPixels = 0;
    for (let y = startY; y < startY + centerHeight; y++) {
      for (let x = startX; x < startX + centerWidth; x++) {
        const i = (y * width + x) * 4;
        centerBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
        centerPixels++;
      }
    }
    centerBrightness = centerBrightness / centerPixels;
    
    // 简单判断：如果中心区域有明显的内容，假设有人
    const hasPerson = centerBrightness > 20 && centerBrightness < 240;
    
    // 检测多人（基于运动分布）
    // 这里使用简单的启发式方法：如果运动分散在多个区域，可能有多人
    const multiplePeople = motionLevel > 30 && brightness > 50;
    
    return {
      hasPerson,
      multiplePeople,
      brightness,
      motionLevel,
    };
  }

  // 更新状态
  private updateStatus(
    newStatus: StatusEventType,
    severity: StatusSeverity,
    description: string
  ): void {
    const now = Date.now();
    
    // 如果状态发生变化，记录事件
    if (newStatus !== this.currentStatus) {
      const duration = (now - this.statusStartTime) / 1000;
      
      console.log(`[候选人监控] 状态变化: ${this.currentStatus} -> ${newStatus}, 持续时间: ${duration.toFixed(1)}秒`);
      
      // 记录之前状态的持续时间
      const evidence: ScreenshotEvidence = {
        timestamp: new Date().toISOString(),
        interviewStep: this.currentInterviewStep,
        description: `持续时间: ${duration.toFixed(1)}秒`,
      };
      this.recordEvent(this.currentStatus, severity, description, evidence);
      
      // 更新当前状态
      this.currentStatus = newStatus;
      this.statusStartTime = now;
    }
  }

  // 记录事件
  private recordEvent(
    type: StatusEventType,
    severity: StatusSeverity,
    description: string,
    evidence?: ScreenshotEvidence
  ): void {
    const event: StatusEvent = {
      timestamp: new Date().toISOString(),
      type,
      severity,
      description,
      evidence: evidence || {
        timestamp: new Date().toISOString(),
        interviewStep: this.currentInterviewStep,
      },
      roundNumber: this.currentRound,
    };

    // 如果传入了evidence但没有截图，且是异常事件，则自动截图
    if ((type === 'abnormal' || type === 'cheating') && evidence && !evidence.faceScreenshot) {
      const screenshots = this.captureBoth();
      event.evidence = {
        ...evidence,
        faceScreenshot: screenshots.faceScreenshot,
        screenScreenshot: screenshots.screenScreenshot,
      };
    }

    this.status.events.push(event);
    console.log(`[候选人监控] 记录事件:`, {
      type,
      severity,
      description,
      hasFaceScreenshot: !!event.evidence?.faceScreenshot,
      hasScreenScreenshot: !!event.evidence?.screenScreenshot
    });
    console.log(`[候选人监控] 当前事件总数: ${this.status.events.length}`);
  }

  // 更新统计
  private updateStatistics(): void {
    const now = Date.now();
    const totalDuration = (now - this.startTime) / 1000;
    
    // 计算自上次更新以来的时间间隔
    const timeDelta = (now - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = now;
    
    this.status.statistics.totalDuration = totalDuration;
    
    console.log(`[候选人监控] 更新统计: total=${totalDuration.toFixed(1)}s, delta=${timeDelta.toFixed(2)}s, normal=${this.status.statistics.normalDuration.toFixed(1)}s, abnormal=${this.status.statistics.abnormalDuration.toFixed(1)}s, cheating=${this.status.statistics.cheatingDuration.toFixed(1)}s`);
    
    // 根据当前状态更新持续时间（使用实际的时间间隔）
    // 状态分类：
    // - normal（正常）- 检测到 1 张人脸，候选人表现正常
    // - abnormal（异常）- 未检测到人脸、长时间看别处、机械背诵感强、闭眼时间＞2秒、只露半张脸、长期低头/侧脸、多人交谈、画面被物品大面积遮挡等
    // - cheating（作弊）- 检测到多张人脸、切换屏幕、分屏/浮窗等可疑行为
    switch (this.currentStatus) {
      case 'normal':
        this.status.statistics.normalDuration += timeDelta;
        break;
      case 'abnormal':
        this.status.statistics.abnormalDuration += timeDelta;
        break;
      case 'cheating':
        this.status.statistics.cheatingDuration += timeDelta;
        break;
    }
    
    // 计算人脸检测率
    // 确保总时长不会小于正常时长，避免计算错误
    if (totalDuration > 0) {
      // 确保检测率在 0-100% 之间
      let detectionRate = (this.status.statistics.normalDuration / totalDuration) * 100;
      
      // 添加边界检查，防止异常值
      if (detectionRate < 0) {
        console.warn(`[候选人监控] ⚠️ 人脸检测率为负数，已修正: ${detectionRate.toFixed(1)}%`);
        detectionRate = 0;
      } else if (detectionRate > 100) {
        console.warn(`[候选人监控] ⚠️ 人脸检测率超过100%，已修正: ${detectionRate.toFixed(1)}%`);
        console.warn(`[候选人监控] 原因: normal=${this.status.statistics.normalDuration.toFixed(1)}s, total=${totalDuration.toFixed(1)}s`);
        detectionRate = 100;
      }
      
      this.status.statistics.faceDetectionRate = detectionRate;
    }
  }

  // 计算最终统计和状态
  private calculateFinalStatistics(): void {
    const { statistics } = this.status;
    
    // 先更新一次统计，确保时间是最新的
    this.updateStatistics();
    
    // 计算整体状态
    if (statistics.cheatingDuration > 0) {
      this.status.overallStatus = 'cheating';
      this.status.summary = '面试过程中检测到可疑行为，可能存在作弊';
    } else if (
      statistics.abnormalDuration > this.config.threshold.maxAbnormalDuration ||
      statistics.faceLostCount > 3
    ) {
      this.status.overallStatus = 'warning';
      this.status.summary = '面试过程中存在一些异常情况，需要人工复核';
    } else {
      this.status.overallStatus = 'normal';
      this.status.summary = '面试过程中候选人表现正常，无明显异常';
    }
    
    console.log('[候选人监控] 最终状态:', this.status);
    console.log('[候选人监控] 最终统计:', {
      总时长: `${statistics.totalDuration.toFixed(1)}秒`,
      正常: `${statistics.normalDuration.toFixed(1)}秒`,
      异常: `${statistics.abnormalDuration.toFixed(1)}秒`,
      作弊: `${statistics.cheatingDuration.toFixed(1)}秒`,
      人脸检测率: `${statistics.faceDetectionRate.toFixed(1)}%`
    });
  }

  // 获取当前状态
  getCurrentStatus(): CandidateStatus {
    return this.status;
  }

  // 设置当前轮次
  setCurrentRound(round: number): void {
    this.currentRound = round;
    console.log(`[候选人监控] 切换到轮次：${round}`);
  }

  // 检查监控器是否正在运行（公共方法）
  isMonitoringRunning(): boolean {
    return this.isMonitoring;
  }

  // 添加自定义事件
  addEvent(
    type: StatusEventType,
    severity: StatusSeverity,
    description: string,
    evidence?: ScreenshotEvidence
  ): void {
    this.recordEvent(type, severity, description, evidence);
  }

  // 重置监控器
  reset(): void {
    this.stopMonitoring();
    
    this.status = {
      overallStatus: 'normal',
      summary: '面试进行中，候选人表现正常',
      events: [],
      statistics: {
        totalDuration: 0,
        normalDuration: 0,
        abnormalDuration: 0,
        cheatingDuration: 0,
        faceDetectionRate: 0,
        faceLostCount: 0,
        multipleFaceCount: 0,
        suspiciousActions: 0,
        screenshotCount: 0,
        periodicScreenshotCount: 0,
        eventScreenshotCount: 0,
      },
      screenshots: [],
    };
    
    this.currentRound = 1;
    this.currentStatus = 'normal';
    this.statusStartTime = 0;
    this.switchCount = 0;
    this.switchHistory = [];
    this.currentInterviewStep = '准备中';
    
    console.log('[候选人监控] 监控器已重置');
  }

  // ==================== 屏幕截图相关方法 ====================

  // 初始化屏幕共享
  private async initScreenCapture(): Promise<void> {
    try {
      console.log('[候选人监控] 请求屏幕共享权限...');
      console.log('[候选人监控] 浏览器类型:', {
        isEdge: isEdgeBrowser(),
        isChrome: isChromeBrowser(),
        userAgent: navigator.userAgent.substring(0, 100)
      });

      const screenCaptureProblem = getMediaCapabilityProblem('screen');
      if (screenCaptureProblem) {
        console.warn('[候选人监控] 当前环境不支持屏幕共享:', screenCaptureProblem);
        this.config.enableScreenCapture = false;
        return;
      }
      
      // Edge 和 Chrome 浏览器都支持 getDisplayMedia API
      // 配置参数在两个浏览器中应该一致
      const displayMediaOptions = {
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 1 } // 低帧率，仅用于截图
        },
        audio: false
      };
      
      console.log('[候选人监控] getDisplayMedia 配置:', displayMediaOptions);
      
      this.screenStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);

      // 创建隐藏的视频元素用于屏幕截图
      this.screenVideoElement = document.createElement('video');
      this.screenVideoElement.srcObject = this.screenStream;
      this.screenVideoElement.muted = true;
      this.screenVideoElement.playsInline = true;
      
      // 等待视频元素加载元数据
      await new Promise<void>((resolve, reject) => {
        if (!this.screenVideoElement) {
          reject(new Error('视频元素创建失败'));
          return;
        }
        
        this.screenVideoElement.onloadedmetadata = () => {
          console.log('[候选人监控] 屏幕视频元数据已加载:', {
            videoWidth: this.screenVideoElement?.videoWidth,
            videoHeight: this.screenVideoElement?.videoHeight
          });
          resolve();
        };
        
        this.screenVideoElement.onerror = (e) => {
          console.error('[候选人监控] 屏幕视频加载错误:', e);
          reject(new Error('屏幕视频加载失败'));
        };
        
        // 设置超时
        setTimeout(() => {
          if (this.screenVideoElement && !this.screenVideoElement.videoWidth) {
            console.warn('[候选人监控] 屏幕视频加载超时，继续尝试播放');
            resolve();
          }
        }, 3000);
      });
      
      await this.screenVideoElement.play();

      console.log('[候选人监控] ✅ 屏幕共享已启动');
      console.log('[候选人监控] 屏幕共享流信息:', {
        videoTracks: this.screenStream.getVideoTracks().length,
        trackLabel: this.screenStream.getVideoTracks()[0]?.label,
        trackSettings: this.screenStream.getVideoTracks()[0]?.getSettings()
      });

      // 监听屏幕共享停止事件
      this.screenStream.getVideoTracks()[0].onended = () => {
        console.log('[候选人监控] ⚠️ 屏幕共享已停止');
        this.recordEventWithScreenshot(
          'abnormal',
          'high',
          '屏幕共享已停止',
          AbnormalEventType.CAMERA_ERROR
        );
        this.screenStream = null;
        this.screenVideoElement = null;
      };
    } catch (error: any) {
      console.error('[候选人监控] 屏幕共享初始化失败:', error);
      console.error('[候选人监控] 错误详情:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      
      // 针对不同错误类型提供不同的提示
      if (error.name === 'NotAllowedError') {
        console.warn('[候选人监控] 用户拒绝了屏幕共享权限');
      } else if (error.name === 'NotSupportedError') {
        console.warn('[候选人监控] 浏览器不支持屏幕共享');
      } else if (error.name === 'NotFoundError') {
        console.warn('[候选人监控] 未找到可共享的屏幕');
      }
      
      // 屏幕共享失败不影响人脸监控
      this.config.enableScreenCapture = false;
    }
  }

  // 停止屏幕共享
  private stopScreenCapture(): void {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
      console.log('[候选人监控] 屏幕共享已停止');
    }
    if (this.screenVideoElement) {
      this.screenVideoElement.srcObject = null;
      this.screenVideoElement = null;
    }
  }

  // 截取人脸画面
  private captureFace(): string | null {
    if (!this.canvas || !this.ctx || !this.videoElement) {
      console.warn('[候选人监控] 无法截图：Canvas或视频元素不可用');
      return null;
    }

    try {
      // 创建临时Canvas用于高质量截图
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 640;
      tempCanvas.height = 480;
      const tempCtx = tempCanvas.getContext('2d');
      
      if (!tempCtx) return null;
      
      tempCtx.drawImage(this.videoElement, 0, 0, tempCanvas.width, tempCanvas.height);
      const dataUrl = tempCanvas.toDataURL('image/jpeg', this.config.screenshotQuality);
      console.log('[候选人监控] ✅ 人脸截图成功，大小:', Math.round(dataUrl.length / 1024), 'KB');
      return dataUrl;
    } catch (error) {
      console.error('[候选人监控] 截取人脸失败:', error);
      return null;
    }
  }

  // 截取屏幕画面
  private captureScreen(): string | null {
    if (!this.screenCanvas || !this.screenCtx || !this.screenVideoElement) {
      console.warn('[候选人监控] 无法截取屏幕：屏幕共享未启动', {
        hasScreenCanvas: !!this.screenCanvas,
        hasScreenCtx: !!this.screenCtx,
        hasScreenVideoElement: !!this.screenVideoElement,
        isEdgeBrowser: isEdgeBrowser()
      });
      return null;
    }

    try {
      // 检查屏幕视频元素状态
      if (this.screenVideoElement.readyState < 2) {
        console.warn('[候选人监控] 屏幕视频元素未就绪，readyState:', this.screenVideoElement.readyState);
        return null;
      }
      
      const videoWidth = this.screenVideoElement.videoWidth || 1280;
      const videoHeight = this.screenVideoElement.videoHeight || 720;
      
      // 确保Canvas尺寸与视频匹配
      if (this.screenCanvas.width !== videoWidth || this.screenCanvas.height !== videoHeight) {
        this.screenCanvas.width = videoWidth;
        this.screenCanvas.height = videoHeight;
        this.screenCtx = this.screenCanvas.getContext('2d');
        if (!this.screenCtx) {
          console.error('[候选人监控] 无法重新创建屏幕Canvas上下文');
          return null;
        }
        console.log('[候选人监控] 屏幕Canvas尺寸已调整:', videoWidth, 'x', videoHeight);
      }
      
      this.screenCtx.drawImage(
        this.screenVideoElement, 
        0, 0, 
        this.screenCanvas.width, 
        this.screenCanvas.height
      );
      const dataUrl = this.screenCanvas.toDataURL('image/jpeg', this.config.screenshotQuality);
      console.log('[候选人监控] ✅ 屏幕截图成功，大小:', Math.round(dataUrl.length / 1024), 'KB, 尺寸:', videoWidth, 'x', videoHeight);
      return dataUrl;
    } catch (error) {
      console.error('[候选人监控] 截取屏幕失败:', error);
      return null;
    }
  }

  // 同时截取人脸和屏幕
  private captureBoth(): ScreenshotEvidence {
    const timestamp = new Date().toISOString();
    
    console.log('[候选人监控] 开始同时截取人脸和屏幕...');
    
    const faceScreenshot = this.captureFace();
    const screenScreenshot = this.captureScreen();
    
    const result: ScreenshotEvidence = {
      faceScreenshot: faceScreenshot || undefined,
      screenScreenshot: screenScreenshot || undefined,
      timestamp,
      interviewStep: this.currentInterviewStep,
    };
    
    console.log('[候选人监控] 截图完成:', {
      hasFaceScreenshot: !!faceScreenshot,
      hasScreenScreenshot: !!screenScreenshot,
      faceSize: faceScreenshot ? Math.round(faceScreenshot.length / 1024) : 0,
      screenSize: screenScreenshot ? Math.round(screenScreenshot.length / 1024) : 0
    });
    
    return result;
  }

  // 定时截图调度
  private schedulePeriodicScreenshot(): void {
    if (!this.isMonitoring) return;

    // 随机间隔 60-90 秒
    const randomInterval = Math.floor(
      Math.random() * (this.config.maxScreenshotInterval - this.config.minScreenshotInterval + 1)
    ) + this.config.minScreenshotInterval;

    console.log(`[候选人监控] 下次定时截图将在 ${(randomInterval / 1000).toFixed(0)} 秒后进行`);

    this.screenshotTimeout = setTimeout(() => {
      this.takePeriodicScreenshot();
      this.schedulePeriodicScreenshot();
    }, randomInterval);
  }

  // 执行定时截图
  private takePeriodicScreenshot(): void {
    if (!this.isMonitoring) return;

    console.log('[候选人监控] 📸 执行定时截图');
    
    const evidence = this.captureBoth();
    evidence.abnormalType = AbnormalEventType.PERIODIC_CHECK;
    evidence.description = '定时检查截图';

    // 保存截图
    this.status.screenshots.push(evidence);
    this.status.statistics.screenshotCount++;
    this.status.statistics.periodicScreenshotCount++;

    // 记录事件（但不触发异常）
    this.recordEvent('normal', 'low', '定时截图已完成', evidence);

    console.log(`[候选人监控] ✅ 定时截图完成，总截图数: ${this.status.statistics.screenshotCount}`);
  }

  // 带截图的事件记录
  private recordEventWithScreenshot(
    type: StatusEventType,
    severity: StatusSeverity,
    description: string,
    abnormalType: AbnormalEventType
  ): void {
    const evidence = this.captureBoth();
    evidence.abnormalType = abnormalType;
    evidence.description = description;

    // 保存截图
    this.status.screenshots.push(evidence);
    this.status.statistics.screenshotCount++;
    this.status.statistics.eventScreenshotCount++;

    this.recordEvent(type, severity, description, evidence);
  }

  // 设置当前面试步骤
  setCurrentInterviewStep(step: string): void {
    this.currentInterviewStep = step;
    console.log(`[候选人监控] 当前面试步骤: ${step}`);
  }

  // 获取所有截图
  getScreenshots(): ScreenshotEvidence[] {
    return this.status.screenshots;
  }

  // 检查屏幕共享是否成功启用
  isScreenCaptureEnabled(): boolean {
    return this.config.enableScreenCapture && this.screenStream !== null && this.screenVideoElement !== null;
  }

  // 获取监控配置状态
  getMonitorStatus(): {
    isMonitoring: boolean;
    screenCaptureEnabled: boolean;
    screenshotCount: number;
    eventCount: number;
  } {
    return {
      isMonitoring: this.isMonitoring,
      screenCaptureEnabled: this.isScreenCaptureEnabled(),
      screenshotCount: this.status.statistics.screenshotCount,
      eventCount: this.status.events.length,
    };
  }

  // 销毁监控器
  destroy(): void {
    this.stopMonitoring();
    
    if (this.canvas) {
      this.canvas.remove();
      this.canvas = null;
    }
    
    if (this.screenCanvas) {
      this.screenCanvas.remove();
      this.screenCanvas = null;
    }
    
    this.ctx = null;
    this.screenCtx = null;
    this.videoElement = null;
    this.screenVideoElement = null;
    this.lastFrameData = null;
    
    console.log('[候选人监控] 监控器已销毁');
  }
}
