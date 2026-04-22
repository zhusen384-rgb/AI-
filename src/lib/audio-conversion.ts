export type PreparedAsrAudio = {
  blob: Blob;
  mimeType: string;
  converted: boolean;
  originalMimeType: string;
  sampleRate?: number;
  channels?: number;
};

const ASR_TARGET_SAMPLE_RATE = 16000;

function getAudioContextConstructor() {
  return (window as typeof window & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  }).AudioContext || (window as typeof window & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  }).webkitAudioContext;
}

function getOfflineAudioContextConstructor() {
  return (window as typeof window & {
    OfflineAudioContext?: typeof OfflineAudioContext;
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
  }).OfflineAudioContext || (window as typeof window & {
    OfflineAudioContext?: typeof OfflineAudioContext;
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
  }).webkitOfflineAudioContext;
}

function encodeWav(audioBuffer: AudioBuffer): ArrayBuffer {
  const numberOfChannels = 1;
  const sampleRate = audioBuffer.sampleRate;
  const pcmData = audioBuffer.getChannelData(0);
  const dataLength = pcmData.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numberOfChannels * 2, true);
  view.setUint16(32, numberOfChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let index = 0; index < pcmData.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, pcmData[index]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

async function decodeAudioBlob(blob: Blob): Promise<AudioBuffer> {
  const AudioContextClass = getAudioContextConstructor();
  if (!AudioContextClass) {
    throw new Error("当前浏览器不支持 AudioContext，无法转换录音格式");
  }

  const audioContext = new AudioContextClass();

  try {
    const arrayBuffer = await blob.arrayBuffer();
    return await audioContext.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    await audioContext.close().catch(() => {});
  }
}

async function resampleAudioBuffer(audioBuffer: AudioBuffer, targetSampleRate: number): Promise<AudioBuffer> {
  if (audioBuffer.sampleRate === targetSampleRate && audioBuffer.numberOfChannels === 1) {
    return audioBuffer;
  }

  const OfflineAudioContextClass = getOfflineAudioContextConstructor();
  if (!OfflineAudioContextClass) {
    throw new Error("当前浏览器不支持 OfflineAudioContext，无法重采样录音");
  }

  const length = Math.ceil(audioBuffer.duration * targetSampleRate);
  const offlineContext = new OfflineAudioContextClass(1, length, targetSampleRate);
  const source = offlineContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineContext.destination);
  source.start(0);

  return await offlineContext.startRendering();
}

export async function prepareRecordingBlobForAsr(blob: Blob): Promise<PreparedAsrAudio> {
  const originalMimeType = blob.type || "application/octet-stream";

  try {
    const decodedBuffer = await decodeAudioBlob(blob);
    const monoBuffer = await resampleAudioBuffer(decodedBuffer, ASR_TARGET_SAMPLE_RATE);
    const wavBuffer = encodeWav(monoBuffer);

    return {
      blob: new Blob([wavBuffer], { type: "audio/wav" }),
      mimeType: "audio/wav",
      converted: true,
      originalMimeType,
      sampleRate: monoBuffer.sampleRate,
      channels: monoBuffer.numberOfChannels,
    };
  } catch (error) {
    console.warn("[音频转换] 录音转换为 WAV 失败，回退原始格式:", error);

    return {
      blob,
      mimeType: originalMimeType || "audio/wav",
      converted: false,
      originalMimeType,
    };
  }
}

