/**
 * 跨标签页数据同步工具
 * 使用 BroadcastChannel API 实现不同标签页之间的实时数据同步
 */

export type SyncEventType =
  | 'positionsUpdated'
  | 'candidatesUpdated'
  | 'settingsUpdated'
  | 'resumeUploaded'
  | 'interviewerUpdated';

export interface SyncEventPayloadMap {
  positionsUpdated: unknown;
  candidatesUpdated: unknown;
  settingsUpdated: unknown;
  resumeUploaded: unknown;
  interviewerUpdated: unknown;
}

export interface SyncEvent<TType extends SyncEventType = SyncEventType> {
  type: TType;
  data?: SyncEventPayloadMap[TType];
  timestamp: number;
}

class SyncChannel {
  private channel: BroadcastChannel | null = null;
  private listeners: Map<SyncEventType, Set<(data?: unknown) => void>> = new Map();

  constructor(private channelName: string = 'interview-system-sync') {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(channelName);
      this.setupListener();
    }
  }

  /**
   * 设置消息监听器
   */
  private setupListener() {
    if (!this.channel) return;

    this.channel.onmessage = (event) => {
      const syncEvent: SyncEvent = event.data;

      // 调用对应类型的监听器
      const listeners = this.listeners.get(syncEvent.type);
      if (listeners) {
        listeners.forEach(callback => {
          try {
            callback(syncEvent.data);
          } catch (error) {
            console.error(`Sync callback error for ${syncEvent.type}:`, error);
          }
        });
      }
    };
  }

  /**
   * 发送同步事件
   */
  emit<TType extends SyncEventType>(type: TType, data?: SyncEventPayloadMap[TType]) {
    const event: SyncEvent<TType> = {
      type,
      data,
      timestamp: Date.now(),
    };

    // 1. 通过 BroadcastChannel 发送给其他标签页
    if (this.channel) {
      try {
        this.channel.postMessage(event);
      } catch (error) {
        console.error('BroadcastChannel postMessage error:', error);
      }
    }

    // 2. 通过自定义事件发送给当前标签页的其他组件
    window.dispatchEvent(new CustomEvent('syncEvent', { detail: event }));

    // 3. 同时触发传统的自定义事件（保持向后兼容）
    window.dispatchEvent(new Event(`${type}`));
  }

  /**
   * 监听同步事件
   */
  on<TType extends SyncEventType>(type: TType, callback: (data?: SyncEventPayloadMap[TType]) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }

    this.listeners.get(type)!.add(callback as (data?: unknown) => void);

    // 返回取消订阅的函数
    return () => this.off(type, callback);
  }

  /**
   * 取消监听同步事件
   */
  off<TType extends SyncEventType>(type: TType, callback: (data?: SyncEventPayloadMap[TType]) => void) {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.delete(callback as (data?: unknown) => void);
      if (listeners.size === 0) {
        this.listeners.delete(type);
      }
    }
  }

  /**
   * 清理资源
   */
  close() {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.listeners.clear();
  }
}

// 创建全局单例
let syncChannelInstance: SyncChannel | null = null;

/**
 * 获取同步通道单例
 */
export function getSyncChannel(): SyncChannel {
  if (!syncChannelInstance) {
    syncChannelInstance = new SyncChannel();
  }
  return syncChannelInstance;
}

/**
 * 导出便捷函数
 */
export const sync = {
  emit: <TType extends SyncEventType>(type: TType, data?: SyncEventPayloadMap[TType]) =>
    getSyncChannel().emit(type, data),
  on: <TType extends SyncEventType>(type: TType, callback: (data?: SyncEventPayloadMap[TType]) => void) =>
    getSyncChannel().on(type, callback),
  off: <TType extends SyncEventType>(type: TType, callback: (data?: SyncEventPayloadMap[TType]) => void) =>
    getSyncChannel().off(type, callback),
};
