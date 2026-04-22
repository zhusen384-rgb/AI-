/**
 * 面试语音识别器 - 封装的 Web Speech API 实现
 * 提供稳定的语音识别功能，支持连续识别和回调机制
 */

export interface SpeechRecognizerOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onResult?: (data: SpeechResult) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: SpeechRecognizerError) => void;
}

export interface SpeechResult {
  final: string;
  interim: string;
  isFinal: boolean;
  confidence?: number;
}

export interface SpeechRecognizerError {
  name: string;
  message: string;
  code?: number;
}

export class InterviewSpeechRecognizer {
  private recognition: any;
  private isInitialized: boolean = false;
  private options: SpeechRecognizerOptions;
  public isListening: boolean = false;  // 改为 public，允许外部访问
  private shouldAutoRestart: boolean = true;  // 控制是否应该自动重启
  private restartTimeout: NodeJS.Timeout | null = null;  // 重启定时器
  private retryCount: number = 0;  // 重试次数
  private maxRetries: number = 5;  // 最大重试次数（使用延迟重试策略，可以增加重试次数）
  private networkErrorDetected: boolean = false;  // 是否检测到网络错误

  constructor(options: SpeechRecognizerOptions = {}) {
    this.options = {
      language: 'zh-CN',
      continuous: true,
      interimResults: true,
      ...options
    };

    this.initialize();
  }

  /**
   * 初始化语音识别器
   */
  private initialize() {
    // 检查浏览器支持
    if (!this.isBrowserSupported()) {
      this.options.onError?.({
        name: 'NotSupported',
        message: '您的浏览器不支持语音识别功能，请使用 Chrome 或 Edge 浏览器'
      });
      return;
    }

    // 创建识别器实例
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();

    // 配置识别器
    this.recognition.lang = this.options.language || 'zh-CN';
    this.recognition.continuous = this.options.continuous !== false;
    this.recognition.interimResults = this.options.interimResults !== false;

    // 设置事件监听器
    this.setupEventListeners();

    this.isInitialized = true;
    console.log('[InterviewSpeechRecognizer] ✅ 初始化完成:', {
      lang: this.recognition.lang,
      continuous: this.recognition.continuous,
      interimResults: this.recognition.interimResults,
      hasRecognition: !!this.recognition,
      recognitionType: this.recognition.constructor.name
    });
  }

  /**
   * 检查浏览器是否支持语音识别
   */
  private isBrowserSupported(): boolean {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners() {
    // 识别结果
    this.recognition.onresult = (event: any) => {
      console.log('[InterviewSpeechRecognizer] 🎤 onresult 事件触发:', {
        resultIndex: event.resultIndex,
        resultsLength: event.results.length,
        isListening: this.isListening
      });

      let interimTranscript = '';
      let finalTranscript = '';

      // 计算最终和中间结果
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptText = event.results[i][0].transcript;
        const isFinal = event.results[i].isFinal;
        const confidence = event.results[i][0].confidence;

        console.log(`[InterviewSpeechRecognizer] 结果[${i}]:`, {
          transcript: transcriptText,
          isFinal,
          confidence
        });

        if (isFinal) {
          finalTranscript += transcriptText;
        } else {
          interimTranscript += transcriptText;
        }
      }

      console.log(`[InterviewSpeechRecognizer] 汇总 - final="${finalTranscript}", interim="${interimTranscript}"`);

      // 调用结果回调
      if (this.options.onResult) {
        try {
          this.options.onResult({
            final: finalTranscript,
            interim: interimTranscript,
            isFinal: finalTranscript.length > 0,
            confidence: this.calculateConfidence(event, event.resultIndex)
          });
          console.log('[InterviewSpeechRecognizer] onResult 回调调用成功');
        } catch (callbackError) {
          console.error('[InterviewSpeechRecognizer] onResult 回调调用失败:', callbackError);
        }
      }
    };

    // 开始识别
    this.recognition.onstart = () => {
      console.log('[InterviewSpeechRecognizer] ✅ 识别已启动 - onstart 事件触发');
      this.isListening = true;

      // 重置重试计数器和网络错误标记（识别器成功启动说明网络可能已恢复）
      if (this.retryCount > 0 || this.networkErrorDetected) {
        console.log('[InterviewSpeechRecognizer] 识别器成功启动，重置重试计数器');
        this.retryCount = 0;
        this.networkErrorDetected = false;
      }

      // 清除重启定时器（避免重复启动）
      if (this.restartTimeout) {
        clearTimeout(this.restartTimeout);
        this.restartTimeout = null;
        console.log('[InterviewSpeechRecognizer] 已清除重启定时器');
      }

      // 调用外部回调
      console.log('[InterviewSpeechRecognizer] 调用 onStart 回调...');
      this.options.onStart?.();
      console.log('[InterviewSpeechRecognizer] onStart 回调调用完成');
    };

    // 结束识别
    this.recognition.onend = () => {
      console.log('[InterviewSpeechRecognizer] 识别已结束');

      // 保存当前 shouldAutoRestart 状态，用于后续判断
      const shouldAutoRestartNow = this.shouldAutoRestart;

      // 先设置 isListening 为 false
      this.isListening = false;

      // 调用外部回调
      this.options.onEnd?.();

      // 如果是连续识别且应该继续监听，自动重启
      if (this.options.continuous && shouldAutoRestartNow) {
        console.log('[InterviewSpeechRecognizer] 连续识别模式，准备自动重启');

        // 清除之前的重启定时器（避免重复启动）
        if (this.restartTimeout) {
          clearTimeout(this.restartTimeout);
        }

        // 根据重试次数计算延迟时间（指数退避）
        const retryDelay = Math.min(1000 * Math.pow(2, Math.min(this.retryCount, 3)), 10000);
        console.log('[InterviewSpeechRecognizer] 自动重启延迟:', retryDelay, 'ms');

        // 延迟重启，避免快速触发导致的错误
        this.restartTimeout = setTimeout(() => {
          // 双重检查：识别器是否已经初始化且未在监听，且仍然应该自动重启
          if (this.isInitialized && !this.isListening && this.shouldAutoRestart) {
            try {
              console.log('[InterviewSpeechRecognizer] 执行自动重启');
              // 先尝试 abort，确保状态干净
              try {
                this.recognition.abort();
              } catch (abortError) {
                // 忽略 abort 错误
              }
              // 延迟一小段时间后启动识别器
              setTimeout(() => {
                try {
                  this.recognition.start();
                } catch (startError: any) {
                  // 忽略 "recognition has already started" 错误
                  if (startError instanceof Error && startError.message?.includes('already started')) {
                    console.log('[InterviewSpeechRecognizer] 识别器已经在运行中，跳过自动重启');
                    this.isListening = true;
                  } else {
                    console.error('[InterviewSpeechRecognizer] 自动重启失败:', startError);
                  }
                }
              }, 50);
            } catch (error: any) {
              // 忽略 "recognition has already started" 错误（可能是竞态条件或状态不一致）
              if (error instanceof Error && error.message?.includes('already started')) {
                console.log('[InterviewSpeechRecognizer] 识别器已经在运行中，跳过自动重启');
                // 更新状态以保持一致性
                this.isListening = true;
              } else {
                console.error('[InterviewSpeechRecognizer] 自动重启失败:', error);
              }
            }
          } else {
            console.log('[InterviewSpeechRecognizer] 识别器未初始化或已在运行，跳过自动重启');
          }
          this.restartTimeout = null;
        }, 150);
      }
    };

    // 错误处理
    this.recognition.onerror = (event: any) => {
      // 提取错误信息
      const errorName = event?.error || event?.errorType || 'UnknownError';
      const errorCode = event?.errorCode || event?.code;

      const error: SpeechRecognizerError = {
        name: errorName,
        message: this.getErrorMessage(errorName),
        code: errorCode
      };

      // 根据错误类型选择日志级别
      if (errorName === 'no-speech') {
        // 静音是正常情况，使用 log 级别
        console.log('[InterviewSpeechRecognizer] 检测到静音', error);
      } else if (errorName === 'not-allowed') {
        // 权限问题，使用 warn 级别
        console.warn('[InterviewSpeechRecognizer] 麦克风权限被拒绝', error);
      } else if (errorName === 'network' || errorName === 'NetworkError') {
        // 网络问题，使用 warn 级别
        this.networkErrorDetected = true;
        this.retryCount++;
        const retryDelay = Math.min(1000 * Math.pow(2, this.retryCount - 1), 10000); // 指数退避，最大10秒

        console.warn('[InterviewSpeechRecognizer] 网络错误，语音识别服务不可用', error);
        console.warn('[InterviewSpeechRecognizer] 重试计数:', this.retryCount, '/', this.maxRetries);
        console.warn('[InterviewSpeechRecognizer] 下次重试延迟:', retryDelay, 'ms');

        // 如果重试次数达到上限，禁用自动重启并提供更明确的错误信息
        if (this.retryCount >= this.maxRetries) {
          console.error('[InterviewSpeechRecognizer] 已达到最大重试次数，禁用自动重启');
          this.shouldAutoRestart = false;
          // 修改错误消息，告知用户重试次数已用尽
          error.message = '语音识别服务暂时不可用，已多次重试失败。建议刷新页面或稍后再试';
        } else {
          // 使用延迟重试而不是立即重试（避免短时间内频繁重试）
          console.log('[InterviewSpeechRecognizer] 将使用延迟重试策略');
        }
      } else if (errorName === 'aborted') {
        // 中止是正常操作，使用 log 级别
        console.log('[InterviewSpeechRecognizer] 语音识别已中止', error);
      } else if (errorName === 'UnknownError') {
        // 未知错误，使用 warn 级别
        console.warn('[InterviewSpeechRecognizer] 发生未知错误', event);
      } else {
        // 其他错误，使用 error 级别
        console.error('[InterviewSpeechRecognizer] 识别错误:', error);
        
        // 只有当 event 对象有实际内容时才打印详细信息
        if (event && (event.type || event.error || event.errorCode || event.message)) {
          console.error('[InterviewSpeechRecognizer] Event 对象:', {
            type: event?.type,
            error: event?.error,
            errorCode: event?.errorCode,
            message: event?.message,
            eventName: event?.eventName,
            errorType: event?.errorType,
            eventDetails: event
          });
        }
      }

      // 调用错误回调
      this.options.onError?.(error);
    };
  }

  /**
   * 获取友好的错误消息
   */
  private getErrorMessage(errorName: string): string {
    const errorMessages: Record<string, string> = {
      'no-speech': '未检测到语音，请说话',
      'audio-capture': '无法访问麦克风，请检查麦克风连接',
      'not-allowed': '麦克风权限被拒绝，请在浏览器中允许麦克风访问',
      'network': '语音识别服务暂时不可用，请检查网络连接',
      'aborted': '语音识别已中断',
      'busy': '语音识别服务繁忙，请稍后重试'
    };

    return errorMessages[errorName] || `语音识别错误: ${errorName}`;
  }

  /**
   * 确保识别器完全停止（内部方法）
   */
  private async ensureStopped(): Promise<void> {
    // 如果识别器已经在停止状态，直接返回
    if (!this.isListening) {
      console.log('[InterviewSpeechRecognizer] 识别器已停止，跳过确保停止流程');
      return;
    }

    // 先尝试 abort
    try {
      this.recognition.abort();
      console.log('[InterviewSpeechRecognizer] 已中止识别器');
    } catch (abortError) {
      // 忽略 abort 错误（可能已经是停止状态）
      console.log('[InterviewSpeechRecognizer] abort() 忽略错误:', abortError);
    }

    // 等待更长时间，确保 onend 事件触发和状态完全重置
    await new Promise(resolve => setTimeout(resolve, 300));

    // 强制设置状态为 false
    this.isListening = false;
    this.shouldAutoRestart = false;
  }

  /**
   * 开始语音识别
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('语音识别器未初始化');
    }

    // 检查是否已经在监听（防止重复启动）
    if (this.isListening) {
      console.log('[InterviewSpeechRecognizer] 已经在监听中，跳过启动');
      return;
    }

    try {
      // 检查环境要求
      this.checkEnvironment();

      // 检查麦克风权限（使用静默方式，避免干扰）
      try {
        await this.checkMicrophonePermission();
      } catch (micError) {
        console.error('[InterviewSpeechRecognizer] 麦克风权限检查失败:', micError);
        // 不抛出错误，让 recognition.start() 处理权限问题
      }

      // 检测网络连接（仅在首次启动或检测到网络错误时）
      if (this.networkErrorDetected || this.retryCount === 0) {
        const networkAvailable = await this.checkNetworkConnectivity();
        if (!networkAvailable) {
          console.warn('[InterviewSpeechRecognizer] 网络连接不可用，语音识别可能无法工作');
          // 不抛出错误，让 recognition.start() 处理
        }
      }

      // 确保识别器完全停止
      await this.ensureStopped();

      // 再次检查是否已经在监听（防止 ensureStopped 后状态不一致）
      if (this.isListening) {
        console.log('[InterviewSpeechRecognizer] ensureStopped 后仍在监听中，更新状态');
        return;
      }

      // 清除重启定时器
      if (this.restartTimeout) {
        clearTimeout(this.restartTimeout);
        this.restartTimeout = null;
      }

      // 重置网络错误状态和重试计数器（手动启动时给新的机会）
      if (this.retryCount > 0 || this.networkErrorDetected) {
        console.log('[InterviewSpeechRecognizer] 手动启动，重置网络错误状态和重试计数器');
        this.retryCount = 0;
        this.networkErrorDetected = false;
      }

      // 启用自动重启（新启动的会话应该支持自动重启）
      this.shouldAutoRestart = true;

      console.log('[InterviewSpeechRecognizer] 启动识别');

      // 启动识别器（注意：isListening 会由 onstart 事件设置）
      try {
        this.recognition.start();
      } catch (startError: any) {
        // 处理 "already started" 错误
        if (startError instanceof Error && startError.message?.includes('already started')) {
          console.log('[InterviewSpeechRecognizer] 识别器已经在运行中，更新状态并继续');
          this.isListening = true;
          this.shouldAutoRestart = true;
          return;
        }
        // 重新抛出其他错误
        throw startError;
      }
    } catch (error: any) {
      console.error('[InterviewSpeechRecognizer] 启动失败:', error);

      const recognizerError: SpeechRecognizerError = {
        name: error.name || 'StartError',
        message: error.message || '启动语音识别失败'
      };

      this.options.onError?.(recognizerError);
      throw error;
    }
  }

  /**
   * 停止语音识别
   */
  stop(): void {
    if (!this.isInitialized) {
      console.log('[InterviewSpeechRecognizer] 识别器未初始化，无需停止');
      return;
    }

    // 即使 isListening 为 false，也尝试停止（确保状态一致）
    if (!this.isListening) {
      console.log('[InterviewSpeechRecognizer] 识别器未在监听，但仍然尝试停止以确保状态一致');
    } else {
      console.log('[InterviewSpeechRecognizer] 停止识别');
    }

    // 禁用自动重启（主动停止时不应该自动重启）
    this.shouldAutoRestart = false;

    // 清除可能存在的重启定时器
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    try {
      // 使用 stop() 而不是 abort()，让当前正在进行的识别完成
      this.recognition.stop();
    } catch (error) {
      console.error('[InterviewSpeechRecognizer] 停止失败:', error);
      // 即使停止失败，也更新状态
      this.isListening = false;
    }
  }

  /**
   * 中止语音识别
   */
  abort(): void {
    if (!this.isInitialized) {
      return;
    }

    console.log('[InterviewSpeechRecognizer] 中止识别');

    // 禁用自动重启（主动中止时不应该自动重启）
    this.shouldAutoRestart = false;

    // 清除重启定时器
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    try {
      this.recognition.abort();
    } catch (error) {
      console.error('[InterviewSpeechRecognizer] 中止失败:', error);
    }

    // 强制更新状态
    this.isListening = false;
  }

  /**
   * 重启语音识别（安全地停止并重新启动）
   */
  async restart(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('语音识别器未初始化');
    }

    console.log('[InterviewSpeechRecognizer] 重启识别器');

    // 先停止
    this.abort();

    // 等待更长时间，确保停止完成（ensureStopped 内部会等待 300ms）
    await new Promise(resolve => setTimeout(resolve, 350));

    // 然后重新启动
    await this.start();
  }

  /**
   * 获取识别器当前状态（用于诊断）
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      isListening: this.isListening,
      shouldAutoRestart: this.shouldAutoRestart,
      hasRestartTimeout: !!this.restartTimeout,
      networkErrorDetected: this.networkErrorDetected,
      retryCount: this.retryCount,
      maxRetries: this.maxRetries,
      options: {
        language: this.options.language,
        continuous: this.options.continuous,
        interimResults: this.options.interimResults,
        hasOnResult: !!this.options.onResult,
        hasOnStart: !!this.options.onStart,
        hasOnEnd: !!this.options.onEnd,
        hasOnError: !!this.options.onError,
      }
    };
  }

  /**
   * 重置网络错误状态（用于手动重试）
   */
  resetNetworkError() {
    console.log('[InterviewSpeechRecognizer] 重置网络错误状态');
    this.networkErrorDetected = false;
    this.retryCount = 0;
    this.shouldAutoRestart = true;
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(event: any, resultIndex: number): number | undefined {
    // 仅在非 continuous 模式下计算平均置信度
    if (!this.recognition.continuous && event.results.length > 0) {
      let sumConfidence = 0;
      let count = 0;
      for (let i = resultIndex; i < event.results.length; i++) {
        if (event.results[i][0].confidence !== undefined) {
          sumConfidence += event.results[i][0].confidence;
          count++;
        }
      }
      return count > 0 ? sumConfidence / count : undefined;
    }
    return undefined;
  }

  /**
   * 检查环境要求
   */
  private checkEnvironment(): void {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isHttps = window.location.protocol === 'https:';

    if (!isLocalhost && !isHttps) {
      throw new Error('语音识别需要 HTTPS 环境或 localhost 访问');
    }
  }

  /**
   * 检测网络连接状态
   */
  private async checkNetworkConnectivity(): Promise<boolean> {
    try {
      console.log('[InterviewSpeechRecognizer] 检测网络连接...');
      // 尝试访问 Google 的语音识别服务
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      await fetch('https://www.googleapis.com', {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-cache',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      console.log('[InterviewSpeechRecognizer] 网络连接正常');
      return true;
    } catch (error: any) {
      console.warn('[InterviewSpeechRecognizer] 网络连接检测失败:', error.message);
      return false;
    }
  }

  /**
   * 检查麦克风权限
   */
  private async checkMicrophonePermission(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      console.log('[InterviewSpeechRecognizer] 麦克风权限已授予');
    } catch (error: any) {
      console.error('[InterviewSpeechRecognizer] 麦克风权限检查失败:', error);

      let message = '无法访问麦克风';
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        message = '麦克风权限被拒绝，请在浏览器地址栏左侧点击允许麦克风权限';
      } else if (error.name === 'NotFoundError') {
        message = '未找到麦克风设备，请检查麦克风连接';
      } else if (error.name === 'NotReadableError') {
        message = '麦克风被其他应用占用，请关闭其他应用后重试';
      }

      throw new Error(message);
    }
  }

  /**
   * 检查是否正在监听
   */
  isActive(): boolean {
    return this.isListening;
  }

  /**
   * 销毁识别器
   */
  destroy(): void {
    console.log('[InterviewSpeechRecognizer] 销毁识别器');
    
    // 清除重启定时器
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    
    this.abort();
    this.isInitialized = false;
    this.options = {};
  }
}

/**
 * 创建默认的语音识别器实例
 */
export function createSpeechRecognizer(options: SpeechRecognizerOptions = {}) {
  return new InterviewSpeechRecognizer(options);
}
