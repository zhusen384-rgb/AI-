// 人脸检测工具（基于 face-api.js）

type FaceApiModule = {
  nets: {
    tinyFaceDetector: { loadFromUri: (uri: string) => Promise<void> };
    faceLandmark68TinyNet: { loadFromUri: (uri: string) => Promise<void> };
    faceExpressionNet: { loadFromUri: (uri: string) => Promise<void> };
  };
  TinyFaceDetectorOptions: new (options: { inputSize: number; scoreThreshold: number }) => unknown;
  detectAllFaces: (input: HTMLVideoElement, options: unknown) => {
    withFaceLandmarks: (useTinyLandmarkNet?: boolean) => {
      withFaceExpressions: () => Promise<any[]>;
    };
  };
};

export interface FaceDetectionResult {
  hasFace: boolean;
  faceCount: number;
  faces: any[];
  landmarks?: any;
  expressions?: any;
}

class FaceDetectionManager {
  private modelsLoaded = false;
  private isLoading = false;
  private loadingPromise: Promise<void> | null = null;
  private faceApiModule: FaceApiModule | null = null;
  private faceApiPromise: Promise<FaceApiModule> | null = null;
  private static readonly scriptUrls = [
    'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js',
    'https://unpkg.com/face-api.js@0.22.2/dist/face-api.min.js',
  ];

  private async getFaceApi(): Promise<FaceApiModule> {
    if (this.faceApiModule) {
      return this.faceApiModule;
    }

    if (typeof window === 'undefined') {
      throw new Error('face-api.js 仅支持浏览器环境');
    }

    const existingModule = this.getFaceApiFromWindow();
    if (existingModule) {
      this.faceApiModule = existingModule;
      return existingModule;
    }

    if (!this.faceApiPromise) {
      this.faceApiPromise = this.loadFaceApiScript()
        .then((module) => {
          this.faceApiModule = module;
          return module;
        })
        .catch((error) => {
          this.faceApiPromise = null;
          throw error;
        });
    }

    return this.faceApiPromise;
  }

  private getFaceApiFromWindow(): FaceApiModule | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const maybeFaceApi = (window as Window & { faceapi?: FaceApiModule }).faceapi;
    return maybeFaceApi ?? null;
  }

  private async loadFaceApiScript(): Promise<FaceApiModule> {
    let lastError: Error | null = null;

    for (const scriptUrl of FaceDetectionManager.scriptUrls) {
      try {
        console.log('[人脸检测] 尝试加载 face-api.js 脚本:', scriptUrl);
        await this.injectScript(scriptUrl);
        const faceapi = this.getFaceApiFromWindow();

        if (faceapi) {
          console.log('[人脸检测] ✅ face-api.js 脚本加载成功');
          return faceapi;
        }

        throw new Error(`脚本已加载但 window.faceapi 不存在: ${scriptUrl}`);
      } catch (error) {
        lastError = error as Error;
        console.error('[人脸检测] ❌ face-api.js 脚本加载失败:', error);
      }
    }

    throw lastError ?? new Error('face-api.js 脚本加载失败');
  }

  private injectScript(src: string): Promise<void> {
    if (typeof document === 'undefined') {
      return Promise.reject(new Error('当前环境不支持动态插入脚本'));
    }

    const existingScript = document.querySelector<HTMLScriptElement>(`script[data-face-api-src="${src}"]`);
    if (existingScript) {
      if (existingScript.dataset.loaded === 'true') {
        return Promise.resolve();
      }

      return new Promise((resolve, reject) => {
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener('error', () => reject(new Error(`加载脚本失败: ${src}`)), { once: true });
      });
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.faceApiSrc = src;

      script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        resolve();
      }, { once: true });

      script.addEventListener('error', () => {
        script.remove();
        reject(new Error(`加载脚本失败: ${src}`));
      }, { once: true });

      document.head.appendChild(script);
    });
  }

  // 初始化并加载模型（支持备用CDN）
  async loadModels(): Promise<void> {
    if (this.modelsLoaded) {
      console.log('[人脸检测] 模型已加载');
      return;
    }

    if (this.isLoading && this.loadingPromise) {
      console.log('[人脸检测] 正在加载模型，请稍候...');
      return this.loadingPromise;
    }

    this.isLoading = true;
    this.loadingPromise = this.loadModelsInternal();

    return this.loadingPromise;
  }

  private async loadModelsInternal(): Promise<void> {
    let faceapi: FaceApiModule;

    try {
      faceapi = await this.getFaceApi();
    } catch (error) {
      console.error('[人脸检测] ❌ face-api.js 加载失败:', error);
      console.warn('[人脸检测] ⚠️ 将使用基础检测（非AI）作为降级方案');
      this.isLoading = false;
      this.loadingPromise = null;
      return;
    }

    // 备用CDN列表（按优先级排序）
    const modelBaseUrls = [
      'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/',  // 主CDN
      'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/',  // GitHub备用
      'https://unpkg.com/@vladmandic/face-api@1.7.12/model/',  // unpkg备用
    ];

    let lastError: Error | null = null;

    for (let i = 0; i < modelBaseUrls.length; i++) {
      const modelBaseUrl = modelBaseUrls[i];
      try {
        console.log(`[人脸检测] 尝试从CDN ${i + 1}/${modelBaseUrls.length} 加载模型: ${modelBaseUrl}`);
        
        // 使用 TinyFaceDetector（轻量级）+ faceLandmark68TinyNet（轻量级特征点）
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(modelBaseUrl),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(modelBaseUrl),
          faceapi.nets.faceExpressionNet.loadFromUri(modelBaseUrl),
        ]);

        this.modelsLoaded = true;
        this.isLoading = false;
        this.loadingPromise = null;
        console.log(`[人脸检测] ✅ 模型加载成功（CDN ${i + 1}/${modelBaseUrls.length}）`);
        return;
      } catch (error) {
        console.error(`[人脸检测] ❌ CDN ${i + 1}/${modelBaseUrls.length} 加载失败:`, error);
        lastError = error as Error;
        // 继续尝试下一个CDN
      }
    }

    // 所有CDN都失败
    console.error('[人脸检测] ❌ 所有CDN加载失败，模型无法加载');
    console.error('[人脸检测] 最后一个错误:', lastError);

    this.isLoading = false;
    this.loadingPromise = null;

    // 不抛出错误，允许监控系统降级到基础检测
    console.warn('[人脸检测] ⚠️ 将使用基础检测（非AI）作为降级方案');
  }

  // 检测视频流中的人脸
  async detectFaces(videoElement: HTMLVideoElement): Promise<FaceDetectionResult> {
    if (!this.modelsLoaded) {
      console.warn('[人脸检测] 模型未加载，跳过检测');
      return {
        hasFace: false,
        faceCount: 0,
        faces: []
      };
    }

    if (!videoElement) {
      console.warn('[人脸检测] 视频元素为空');
      return {
        hasFace: false,
        faceCount: 0,
        faces: []
      };
    }

    // 检查视频元素状态
    console.log('[人脸检测] 视频元素状态:', {
      readyState: videoElement.readyState,
      videoWidth: videoElement.videoWidth,
      videoHeight: videoElement.videoHeight,
      currentTime: videoElement.currentTime,
      paused: videoElement.paused,
      muted: videoElement.muted,
      hasSrcObject: !!videoElement.srcObject,
      streamTracks: videoElement.srcObject ? (videoElement.srcObject as MediaStream).getVideoTracks().length : 0,
      videoTrackEnabled: videoElement.srcObject ? (videoElement.srcObject as MediaStream).getVideoTracks()[0]?.enabled : false,
    });

    // 如果视频元素没有准备好，返回空结果
    if (videoElement.readyState < 2) {
      console.warn('[人脸检测] 视频元素未准备好 (readyState < 2)');
      return {
        hasFace: false,
        faceCount: 0,
        faces: []
      };
    }

    // 如果视频尺寸为 0，返回空结果
    if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      console.warn('[人脸检测] 视频尺寸为 0:', {
        videoWidth: videoElement.videoWidth,
        videoHeight: videoElement.videoHeight,
      });
      return {
        hasFace: false,
        faceCount: 0,
        faces: []
      };
    }

    // 如果视频被暂停，尝试播放
    if (videoElement.paused) {
      console.warn('[人脸检测] 视频被暂停，尝试播放...');
      try {
        await videoElement.play();
        console.log('[人脸检测] 视频播放成功');
      } catch (error) {
        console.error('[人脸检测] 视频播放失败:', error);
        return {
          hasFace: false,
          faceCount: 0,
          faces: []
        };
      }
    }

    try {
      const faceapi = await this.getFaceApi();

      // 使用轻量级检测器
      const options = new faceapi.TinyFaceDetectorOptions({
        inputSize: 320, // 降低输入尺寸以提高性能
        scoreThreshold: 0.5 // 检测阈值
      });

      // 检测人脸、特征点和表情
      const detections = await faceapi
        .detectAllFaces(videoElement, options)
        .withFaceLandmarks(true)
        .withFaceExpressions();

      const faceCount = detections.length;
      
      console.log(`[人脸检测] 检测到 ${faceCount} 张人脸`);

      return {
        hasFace: faceCount > 0,
        faceCount,
        faces: detections,
        landmarks: detections[0]?.landmarks,
        expressions: detections[0]?.expressions
      };
    } catch (error) {
      console.error('[人脸检测] 检测失败:', error);
      return {
        hasFace: false,
        faceCount: 0,
        faces: []
      };
    }
  }

  // 判断是否在屏幕外（基于头部角度）
  isLookingAway(landmarks?: any): boolean {
    if (!landmarks) return false;

    try {
      // 获取鼻子的位置
      const nose = landmarks.getNose();
      const jaw = landmarks.getJawOutline();
      
      if (!nose || nose.length === 0) return false;
      
      // 简单判断：如果鼻子位置偏离中心太大，可能在看别处
      const nosePoint = nose[3]; // 鼻子中间位置
      const jawLeft = jaw[0];
      const jawRight = jaw[jaw.length - 1];
      
      const faceWidth = Math.abs(jawRight.x - jawLeft.x);
      const faceCenterX = (jawLeft.x + jawRight.x) / 2;
      
      // 如果鼻子偏离中心超过 30%，可能在看别处
      const deviation = Math.abs(nosePoint.x - faceCenterX) / faceWidth;
      
      return deviation > 0.3;
    } catch (error) {
      console.error('[人脸检测] 判断朝向失败:', error);
      return false;
    }
  }

  // 判断是否在专注（基于表情）
  isFocused(expressions?: any): boolean {
    if (!expressions) return true;

    try {
      // 检测中性、专注的表情
      const neutral = expressions.neutral || 0;
      const happy = expressions.happy || 0;
      const focused = neutral > 0.3 && happy < 0.3;
      
      return focused;
    } catch (error) {
      console.error('[人脸检测] 判断专注度失败:', error);
      return true;
    }
  }

  // 判断是否闭眼
  isEyesClosed(landmarks?: any): boolean {
    if (!landmarks) return false;

    try {
      // 获取眼睛特征点
      const leftEye = landmarks.getLeftEye();
      const rightEye = landmarks.getRightEye();
      
      if (!leftEye || !rightEye) return false;
      
      // 计算眼睛长宽比
      const leftEyeAspect = this.getEyeAspectRatio(leftEye);
      const rightEyeAspect = this.getEyeAspectRatio(rightEye);
      
      // 如果两只眼睛的长宽比都小于阈值，判断为闭眼
      const threshold = 0.25;
      
      return leftEyeAspect < threshold && rightEyeAspect < threshold;
    } catch (error) {
      console.error('[人脸检测] 判断闭眼失败:', error);
      return false;
    }
  }

  // 计算眼睛长宽比
  private getEyeAspectRatio(eye: any[]): number {
    try {
      // 计算眼睛的垂直距离
      const vertical1 = Math.sqrt(
        Math.pow(eye[1].x - eye[5].x, 2) +
        Math.pow(eye[1].y - eye[5].y, 2)
      );
      const vertical2 = Math.sqrt(
        Math.pow(eye[2].x - eye[4].x, 2) +
        Math.pow(eye[2].y - eye[4].y, 2)
      );
      
      // 计算眼睛的水平距离
      const horizontal = Math.sqrt(
        Math.pow(eye[0].x - eye[3].x, 2) +
        Math.pow(eye[0].y - eye[3].y, 2)
      );
      
      // 长宽比
      return (vertical1 + vertical2) / (2 * horizontal);
    } catch (error) {
      return 0.3; // 默认值
    }
  }

  isModelLoaded(): boolean {
    return this.modelsLoaded;
  }
}

// 导出单例
export const faceDetectionManager = new FaceDetectionManager();
