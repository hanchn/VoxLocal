import { invoke } from "@tauri-apps/api/core";

const voiceHints: Record<string, string[]> = {
  warm: ["Tingting", "Meijia", "Sinji", "Chinese"],
  calm: ["Li-mu", "Chinese", "Mandarin"],
  clear: ["Tingting", "Chinese", "Mandarin"],
  bright: ["Meijia", "Sinji", "Chinese"],
};
const languageConfig: Record<string, { locale: string; hints: string[] }> = {
  zh: { locale: "zh-CN", hints: ["Tingting", "Meijia", "Sinji", "Chinese"] },
  en: { locale: "en-US", hints: ["Samantha", "Alex", "Ava", "English"] },
  ja: { locale: "ja-JP", hints: ["Kyoko", "Otoya", "Japanese"] },
};

function isTauriRuntime(): boolean {
  return typeof (window as Window & { __TAURI_INTERNALS__?: { invoke?: unknown } }).__TAURI_INTERNALS__?.invoke === "function";
}

export async function speakWithSystemVoice(
  text: string,
  profileId: string,
  rate: number,
  language = "zh",
  onBoundary?: (charIndex: number) => void,
): Promise<void> {
  if (isTauriRuntime()) {
    await invoke("speak_text", {
      text,
      voiceId: profileId,
      wordsPerMinute: Math.round(180 * rate),
      language,
    });
    onBoundary?.(text.length);
    return;
  }

  if (!("speechSynthesis" in window)) {
    throw new Error("当前预览环境不支持语音播放，请运行 Mac 桌面版。");
  }
  window.speechSynthesis.cancel();
  await new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const config = languageConfig[language] ?? languageConfig.zh;
    const hints = config.hints.length ? config.hints : (voiceHints[profileId] ?? voiceHints.warm);
    utterance.voice =
      voices.find((voice) => hints.some((hint) => voice.name.includes(hint))) ??
      voices.find((voice) => voice.lang.toLowerCase().startsWith(config.locale.slice(0, 2))) ??
      null;
    utterance.lang = config.locale;
    utterance.rate = rate;
    utterance.pitch = profileId === "bright" ? 1.08 : profileId === "calm" ? 0.92 : 1;
    utterance.onboundary = (event) => onBoundary?.(event.charIndex);
    utterance.onend = () => resolve();
    utterance.onerror = (event) => event.error === "canceled" || event.error === "interrupted" ? resolve() : reject(new Error(`播放失败：${event.error}`));
    window.speechSynthesis.speak(utterance);
  });
}

export async function stopSpeaking(): Promise<void> {
  if (isTauriRuntime()) {
    await invoke("stop_speech");
    return;
  }
  window.speechSynthesis?.cancel();
}
