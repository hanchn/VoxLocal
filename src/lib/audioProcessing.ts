function audioBufferToWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const frameCount = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frameCount * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, dataSize, true);

  const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return new Blob([arrayBuffer], { type: "audio/wav" });
}

export type AudioOptimizationProgress = {
  percent: number;
  stage: string;
};

type ProgressCallback = (progress: AudioOptimizationProgress) => void;

const nextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export async function optimizeVoiceRecording(blob: Blob, onProgress?: ProgressCallback): Promise<Blob> {
  const report = async (percent: number, stage: string) => {
    onProgress?.({ percent, stage });
    await nextPaint();
  };

  const AudioContextClass = window.AudioContext;
  if (!AudioContextClass) throw new Error("当前设备不支持本地音频处理");
  const context = new AudioContextClass();
  try {
    await report(5, "读取录音");
    const sourceData = await blob.arrayBuffer();
    await report(18, "解码音频");
    const decoded = await context.decodeAudioData(sourceData);
    await report(32, "分析音量与底噪");
    let peak = 0;
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const data = decoded.getChannelData(channel);
      for (let index = 0; index < data.length; index += 1) peak = Math.max(peak, Math.abs(data[index]));
    }

    await report(48, "配置降噪与动态压缩");
    const offline = new OfflineAudioContext(decoded.numberOfChannels, decoded.length, decoded.sampleRate);
    const source = offline.createBufferSource();
    const highPass = offline.createBiquadFilter();
    const lowPass = offline.createBiquadFilter();
    const compressor = offline.createDynamicsCompressor();
    const gain = offline.createGain();

    source.buffer = decoded;
    highPass.type = "highpass";
    highPass.frequency.value = 80;
    highPass.Q.value = 0.72;
    lowPass.type = "lowpass";
    lowPass.frequency.value = Math.min(12_000, decoded.sampleRate * 0.45);
    lowPass.Q.value = 0.7;
    compressor.threshold.value = -25;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.18;
    gain.gain.value = peak > 0.001 ? Math.min(1.75, 0.9 / peak) : 1;

    source.connect(highPass).connect(lowPass).connect(compressor).connect(gain).connect(offline.destination);
    source.start();
    await report(65, "渲染优化音频");
    const rendered = await offline.startRendering();
    await report(90, "编码 WAV 音频");
    const result = audioBufferToWav(rendered);
    await report(100, "处理完成");
    return result;
  } finally {
    await context.close();
  }
}
