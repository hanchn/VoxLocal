import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  BookOpen,
  Check,
  ChevronDown,
  CircleStop,
  Cpu,
  Download,
  FileText,
  Film,
  GripVertical,
  Heart,
  History,
  Library,
  Mic,
  Play,
  Pin,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
  Volume2,
  WandSparkles,
} from "lucide-react";
import { deleteDocument, deleteRecording, loadDefaultVoice, loadDocuments, loadFavoriteVoices, loadPinnedVoices, loadUserProfiles, loadVoiceOrder, saveDefaultVoice, saveDocument, saveFavoriteVoices, savePinnedVoices, saveRecording, saveUserProfiles, saveVoiceOrder } from "./lib/voiceStore";
import { speakWithSystemVoice, stopSpeaking } from "./lib/speech";
import { optimizeVoiceRecording } from "./lib/audioProcessing";
import { importDocument } from "./lib/documentImport";
import { cacheVoicePreview, cancelSynthesis, downloadPublicVoice, getDeviceProfile, getEngineStatus, getPublicVoiceAvailability, getSynthesisJob, listPersistedVoiceProfiles, listSynthesisJobs, listTrashedAudioJobs, listTrashVoiceProfiles, prepareEngine, purgeAudioTrash, purgeVoiceTrash, persistRecording, persistVoiceProfile, readCachedVoicePreview, readGeneratedAudio, renameGeneratedAudio, restoreTrashedAudio, restoreVoiceProfile, revealGeneratedAudio, startSynthesis, trashGeneratedAudio, trashVoiceProfile, type DeviceProfile, type EngineStatus, type SynthesisJob } from "./lib/synthesis";
import { LipSyncView } from "./components/LipSyncView";
import { PptVideoView } from "./components/PptVideoView";
import type { DocumentRecord, View, VoiceProfile } from "./types";

const primaryPublicVoices: VoiceProfile[] = [
  { id: "qwen-vivian", name: "Vivian · 明亮女声", kind: "open", description: "明亮、年轻，适合故事与知识内容", accent: "普通话", color: "#c56b82", status: "ready", speaker: "Vivian", license: "Apache-2.0", source: "Qwen3-TTS CustomVoice" },
  { id: "qwen-serena", name: "Serena · 温柔女声", kind: "open", description: "温暖、柔和，适合长文与睡前阅读", accent: "普通话", color: "#a8739b", status: "ready", speaker: "Serena", license: "Apache-2.0", source: "Qwen3-TTS CustomVoice" },
  { id: "qwen-uncle-fu", name: "Uncle Fu · 醇厚男声", kind: "open", description: "成熟、低缓，适合纪实与历史内容", accent: "普通话", color: "#647b72", status: "ready", speaker: "Uncle_Fu", license: "Apache-2.0", source: "Qwen3-TTS CustomVoice" },
  { id: "qwen-dylan", name: "Dylan · 北京青年", kind: "open", description: "年轻、自然，带有北京语言风格", accent: "北京话", color: "#637b9c", status: "ready", speaker: "Dylan", license: "Apache-2.0", source: "Qwen3-TTS CustomVoice" },
  { id: "qwen-eric", name: "Eric · 成都青年", kind: "open", description: "活泼、略带沙哑，富有轻快表现力", accent: "四川话", color: "#b3784e", status: "ready", speaker: "Eric", license: "Apache-2.0", source: "Qwen3-TTS CustomVoice" },
  { id: "qwen-ryan", name: "Ryan · 律动男声", kind: "open", description: "节奏鲜明、富有动感，中文带英语口音", accent: "美式英语", color: "#477b91", status: "ready", speaker: "Ryan", license: "Apache-2.0", source: "Qwen3-TTS CustomVoice" },
  { id: "qwen-aiden", name: "Aiden · 阳光男声", kind: "open", description: "清晰、阳光，中文带英语口音", accent: "美式英语", color: "#4f78b0", status: "ready", speaker: "Aiden", license: "Apache-2.0", source: "Qwen3-TTS CustomVoice" },
  { id: "qwen-ono-anna", name: "Ono Anna · 轻快女声", kind: "open", description: "轻盈、俏皮，中文带日语口音", accent: "日语", color: "#c46f87", status: "ready", speaker: "Ono_Anna", license: "Apache-2.0", source: "Qwen3-TTS CustomVoice" },
  { id: "qwen-sohee", name: "Sohee · 温暖女声", kind: "open", description: "温暖、富有情感，中文带韩语口音", accent: "韩语", color: "#966e9e", status: "ready", speaker: "Sohee", license: "Apache-2.0", source: "Qwen3-TTS CustomVoice" },
  { id: "kokoro-xiaobei", name: "小贝 · 轻量女声", kind: "open", description: "轻量快速的普通话女声", accent: "普通话", color: "#cf7b73", status: "downloadable", speaker: "zf_xiaobei", language: "z", license: "Apache-2.0", source: "Kokoro 82M" },
  { id: "kokoro-xiaoni", name: "小妮 · 轻量女声", kind: "open", description: "轻巧自然的普通话女声", accent: "普通话", color: "#bf7188", status: "downloadable", speaker: "zf_xiaoni", language: "z", license: "Apache-2.0", source: "Kokoro 82M" },
  { id: "kokoro-xiaoxiao", name: "晓晓 · 轻量女声", kind: "open", description: "清晰明快的普通话女声", accent: "普通话", color: "#b96e9c", status: "downloadable", speaker: "zf_xiaoxiao", language: "z", license: "Apache-2.0", source: "Kokoro 82M" },
  { id: "kokoro-xiaoyi", name: "小艺 · 轻量女声", kind: "open", description: "柔和轻快的普通话女声", accent: "普通话", color: "#a874a3", status: "downloadable", speaker: "zf_xiaoyi", language: "z", license: "Apache-2.0", source: "Kokoro 82M" },
  { id: "kokoro-yunjian", name: "云健 · 轻量男声", kind: "open", description: "清楚稳健的普通话男声", accent: "普通话", color: "#527b7b", status: "downloadable", speaker: "zm_yunjian", language: "z", license: "Apache-2.0", source: "Kokoro 82M" },
  { id: "kokoro-yunxi", name: "云希 · 轻量男声", kind: "open", description: "年轻自然的普通话男声", accent: "普通话", color: "#547894", status: "downloadable", speaker: "zm_yunxi", language: "z", license: "Apache-2.0", source: "Kokoro 82M" },
  { id: "kokoro-yunxia", name: "云夏 · 轻量男声", kind: "open", description: "温和舒展的普通话男声", accent: "普通话", color: "#6474a0", status: "downloadable", speaker: "zm_yunxia", language: "z", license: "Apache-2.0", source: "Kokoro 82M" },
  { id: "kokoro-yunyang", name: "云扬 · 轻量男声", kind: "open", description: "明朗有力的普通话男声", accent: "普通话", color: "#766f98", status: "downloadable", speaker: "zm_yunyang", language: "z", license: "Apache-2.0", source: "Kokoro 82M" },
].map((voice) => voice.id.startsWith("qwen-") ? { ...voice, previewCached: true } : voice) as VoiceProfile[];

const kokoroLanguage: Record<string, { label: string; code: string }> = {
  a: { label: "美式英语", code: "a" }, b: { label: "英式英语", code: "b" }, e: { label: "西班牙语", code: "e" },
  f: { label: "法语", code: "f" }, h: { label: "印地语", code: "h" }, i: { label: "意大利语", code: "i" },
  j: { label: "日语", code: "j" }, p: { label: "葡萄牙语", code: "p" }, z: { label: "普通话", code: "z" },
};
const kokoroSpeakers = `af_alloy af_aoede af_bella af_heart af_jessica af_kore af_nicole af_nova af_river af_sarah af_sky am_adam am_echo am_eric am_fenrir am_liam am_michael am_onyx am_puck am_santa bf_alice bf_emma bf_isabella bf_lily bm_daniel bm_fable bm_george bm_lewis ef_dora em_alex em_santa ff_siwis hf_alpha hf_beta hm_omega hm_psi if_sara im_nicola jf_alpha jf_gongitsune jf_nezumi jf_tebukuro jm_kumo pf_dora pm_alex pm_santa zf_xiaobei zf_xiaoni zf_xiaoxiao zf_xiaoyi zm_yunjian zm_yunxi zm_yunxia zm_yunyang`.split(" ");
const existingSpeakers = new Set(primaryPublicVoices.map((voice) => voice.speaker));
const additionalKokoroVoices: VoiceProfile[] = kokoroSpeakers.filter((speaker) => !existingSpeakers.has(speaker)).map((speaker, index) => {
  const language = kokoroLanguage[speaker[0]] ?? { label: "多语言", code: speaker[0] };
  const female = speaker[1] === "f";
  const display = speaker.slice(3).replace(/(^|_)(\w)/g, (_, __, letter: string) => ` ${letter.toUpperCase()}`).trim();
  return { id: `kokoro-${speaker.replaceAll("_", "-")}`, name: `${display} · ${language.label}${female ? "女声" : "男声"}`, kind: "open", description: `Kokoro 轻量快速${language.label}${female ? "女声" : "男声"}`, accent: language.label, color: ["#557a91", "#957095", "#b47468", "#6f8067"][index % 4], status: "downloadable", speaker, language: language.code, license: "Apache-2.0", source: "Kokoro 82M" };
});
const builtInVoiceCatalog = [...primaryPublicVoices, ...additionalKokoroVoices];

const sampleText = `在本地运行，意味着你的声音和文档始终留在自己的设备上。VoxLocal 会把长文档拆成自然的语义片段，逐段生成语音，再无缝拼接成完整的阅读体验。\n\n选择一个喜欢的音色，或者录制你自己的声音。生成完成后，即使离线，也能继续收听。`;

const recordingPrompts = [
  "清晨的阳光落在窗边，我打开一本喜欢的书。文字不只是信息，也保存着一个人的语气、节奏和温度。",
  "傍晚的风穿过树梢，远处传来缓慢的钟声。我停下脚步，认真听着城市里细小而温柔的声音。",
  "今天的天气很好，我们准备沿着河边散步。路上会经过一座旧桥，也会看到刚刚开放的花朵。",
  "阅读让人暂时离开熟悉的生活，进入另一个时间和空间。每一页，都可能藏着意想不到的答案。",
  "如果把记忆比作一条河流，那么声音就是水面上的光。它不断变化，却始终保留着独特的方向。",
  "在安静的房间里，我放慢速度，清楚地读出每一个字。自然的停顿，会让语言更容易被理解。",
];

const publicPreviewSamples: Record<string, string> = {
  a: "This voice runs locally on your Mac and can read documents without sending them to the cloud.",
  b: "This voice runs locally on your Mac and reads each document in a clear, natural style.",
  e: "Esta voz funciona localmente en tu Mac y puede leer documentos sin enviarlos a la nube.",
  f: "Cette voix fonctionne localement sur votre Mac et peut lire vos documents hors ligne.",
  h: "यह आवाज़ आपके Mac पर स्थानीय रूप से चलती है और दस्तावेज़ों को ऑफ़लाइन पढ़ सकती है।",
  i: "Questa voce funziona localmente sul tuo Mac e può leggere i documenti anche offline.",
  j: "この音声はMac上でローカルに動作し、文書をオフラインで読み上げることができます。",
  p: "Esta voz funciona localmente no seu Mac e pode ler documentos mesmo sem internet.",
  z: recordingPrompts[0],
};

const sampleDocuments: DocumentRecord[] = [
  { id: "sample-zh-short", title: "清晨的一页", type: "text", text: recordingPrompts[0], language: "zh", isSample: true, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "sample-zh-long", title: "本地阅读长文示例", type: "text", text: [...recordingPrompts, ...recordingPrompts].join("\n\n"), language: "zh", isSample: true, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "sample-en-short", title: "A Quiet Local Morning", type: "text", text: "The morning light reached the desk as I opened a familiar book. A local voice can preserve the pace and warmth of every paragraph without sending the document to the cloud.", language: "en", isSample: true, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "sample-ja-short", title: "静かな読書の時間", type: "text", text: "朝の光が窓辺に差し込み、私は好きな本を開きました。声と文書はMacの中に保存され、オフラインでも読み上げられます。", language: "ja", isSample: true, createdAt: "2026-01-01T00:00:00.000Z" },
];

function randomRecordingPrompt(current?: string) {
  const candidates = recordingPrompts.filter((prompt) => prompt !== current);
  return candidates[Math.floor(Math.random() * candidates.length)] ?? recordingPrompts[0];
}

function detectDocumentLanguage(text: string, declared?: DocumentRecord["language"]): "zh" | "en" | "ja" | "other" {
  return declared ?? (/[぀-ヿ]/.test(text) ? "ja" : /[\u3400-\u9fff]/.test(text) ? "zh" : /[A-Za-z]/.test(text) ? "en" : "other");
}

function App() {
  const [view, setView] = useState<View>("reader");
  const [voiceOrder, setVoiceOrder] = useState<string[]>(loadVoiceOrder);
  const [favoriteVoiceIds, setFavoriteVoiceIds] = useState<string[]>(loadFavoriteVoices);
  const [pinnedVoiceIds, setPinnedVoiceIds] = useState<string[]>(loadPinnedVoices);
  const [userVoices, setUserVoices] = useState<VoiceProfile[]>(loadUserProfiles);
  const [publicVoiceList, setPublicVoiceList] = useState(builtInVoiceCatalog);
  const [selectedVoiceId, setSelectedVoiceId] = useState(() => loadDefaultVoice(builtInVoiceCatalog[0].id));
  const allVoices = useMemo(() => {
    const voices = [...publicVoiceList, ...userVoices];
    const positions = new Map(voiceOrder.map((id, index) => [id, index]));
    const rank = (voice: VoiceProfile) => voice.id === selectedVoiceId ? 0 : pinnedVoiceIds.includes(voice.id) ? 1 : favoriteVoiceIds.includes(voice.id) ? 2 : voice.kind === "user" ? 3 : 4;
    return voices.map((voice, index) => ({ voice, index })).sort((left, right) => rank(left.voice) - rank(right.voice) || (positions.get(left.voice.id) ?? voiceOrder.length + left.index) - (positions.get(right.voice.id) ?? voiceOrder.length + right.index)).map(({ voice }) => voice);
  }, [publicVoiceList, userVoices, voiceOrder, favoriteVoiceIds, pinnedVoiceIds, selectedVoiceId]);
  const selectedVoice = allVoices.find((voice) => voice.id === selectedVoiceId) ?? builtInVoiceCatalog[0];
  const [text, setText] = useState(sampleText);
  const [documentTitle, setDocumentTitle] = useState("未命名文档");
  const [rate, setRate] = useState(1);
  const [speechLanguage, setSpeechLanguage] = useState<"zh" | "en" | "ja">("zh");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [device, setDevice] = useState<DeviceProfile | null>(null);
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [synthesisJob, setSynthesisJob] = useState<SynthesisJob | null>(null);
  const [synthesisJobs, setSynthesisJobs] = useState<SynthesisJob[]>([]);
  const [trashedVoices, setTrashedVoices] = useState<VoiceProfile[]>([]);
  const [trashedAudioJobs, setTrashedAudioJobs] = useState<SynthesisJob[]>([]);
  const [pendingAudioTrash, setPendingAudioTrash] = useState<SynthesisJob | null>(null);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const generatedPlayerRef = useRef<HTMLAudioElement | null>(null);
  const autoplayGeneratedRef = useRef(false);

  function changeSpeechLanguage(language: "zh" | "en" | "ja") {
    if (language === speechLanguage) return;
    if (generatedAudioUrl) URL.revokeObjectURL(generatedAudioUrl);
    setGeneratedAudioUrl(null);
    setSynthesisJob(null);
    setProgress(0);
    setSpeechLanguage(language);
    setNotice(language === "en" ? "已切换为 English，请重新生成语音" : language === "ja" ? "已切换为 日本語，请重新生成语音" : "已切换为中文，请重新生成语音");
  }

  async function refreshAppState(showNotice = true) {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const downloadable = builtInVoiceCatalog.filter((voice) => voice.speaker).map((voice) => ({ id: voice.id, speaker: voice.speaker! }));
    try {
      const [nextDevice, nextEngine, nextDocuments, jobs, availability, persistedVoices, nextTrashedVoices, nextTrashedAudio] = await Promise.all([
        getDeviceProfile(), getEngineStatus(), loadDocuments(), listSynthesisJobs(), getPublicVoiceAvailability(downloadable), listPersistedVoiceProfiles(), listTrashVoiceProfiles(), listTrashedAudioJobs(),
      ]);
      setDevice(nextDevice);
      setEngine(nextEngine);
      setDocuments(nextDocuments);
      const browserVoices = loadUserProfiles();
      const mergedVoices = [...persistedVoices, ...browserVoices.filter((voice) => !persistedVoices.some((persisted) => persisted.id === voice.id))];
      setUserVoices(mergedVoices);
      saveUserProfiles(mergedVoices);
      setSynthesisJobs(jobs);
      setTrashedVoices(nextTrashedVoices);
      setTrashedAudioJobs(nextTrashedAudio);
      const latest = jobs.find((job) => job.voiceId === selectedVoiceId) ?? null;
      setSynthesisJob(latest ?? null);
      if (latest) setProgress(latest.progress);
      setPublicVoiceList((voices) => voices.map((voice) => availability[voice.id] ? { ...voice, status: "ready" } : voice.kind === "open" ? { ...voice, status: "downloadable" } : voice));
      if (showNotice) setNotice(nextEngine.ready ? "已刷新，本地引擎与音色状态已更新" : nextEngine.message);
    } catch (error) {
      if (showNotice) setNotice(error instanceof Error ? error.message : "刷新失败");
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void refreshAppState(false);
  }, []);

  useEffect(() => () => { if (generatedAudioUrl) URL.revokeObjectURL(generatedAudioUrl); }, [generatedAudioUrl]);

  useEffect(() => {
    const audio = generatedPlayerRef.current;
    if (!audio) return;
    audio.playbackRate = rate;
    const playing = () => setIsSpeaking(true);
    const stopped = () => setIsSpeaking(false);
    const updatePlaybackProgress = () => { if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100); };
    audio.addEventListener("play", playing);
    audio.addEventListener("pause", stopped);
    audio.addEventListener("ended", stopped);
    audio.addEventListener("timeupdate", updatePlaybackProgress);
    if (autoplayGeneratedRef.current) {
      autoplayGeneratedRef.current = false;
      void audio.play();
    }
    return () => {
      audio.removeEventListener("play", playing);
      audio.removeEventListener("pause", stopped);
      audio.removeEventListener("ended", stopped);
      audio.removeEventListener("timeupdate", updatePlaybackProgress);
    };
  }, [generatedAudioUrl, rate]);

  useEffect(() => {
    if (!allVoices.some((voice) => voice.id === selectedVoiceId)) {
      setSelectedVoiceId(builtInVoiceCatalog[0].id);
    }
  }, [allVoices, selectedVoiceId]);

  function chooseVoice(id: string) {
    generatedPlayerRef.current?.pause();
    if (generatedAudioUrl) URL.revokeObjectURL(generatedAudioUrl);
    setGeneratedAudioUrl(null);
    setSelectedVoiceId(id);
    const cachedJob = synthesisJobs.find((job) => job.voiceId === id) ?? null;
    setSynthesisJob(cachedJob);
    setProgress(cachedJob?.progress ?? 0);
    saveDefaultVoice(id);
    setMenuOpen(false);
    void stopSpeaking();
    setIsSpeaking(false);
  }

  async function toggleSpeech() {
    if (isSpeaking) {
      if (selectedVoice.kind !== "system") generatedPlayerRef.current?.pause();
      else await stopSpeaking();
      setIsSpeaking(false);
      setNotice("已停止播放");
      return;
    }
    if (selectedVoice.kind !== "system") {
      if (generatedAudioUrl && generatedPlayerRef.current) {
        generatedPlayerRef.current.playbackRate = rate;
        await generatedPlayerRef.current.play();
        setIsSpeaking(true);
      } else if (synthesisJob?.status === "completed" && synthesisJob.outputPath && synthesisJob.voiceId === selectedVoice.id) {
        try {
          autoplayGeneratedRef.current = true;
          setGeneratedAudioUrl(URL.createObjectURL(await readGeneratedAudio(synthesisJob.outputPath)));
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "无法加载生成音频");
        }
      } else {
        setNotice("请先点击“生成完整音频”，完成后再播放");
      }
      return;
    }
    setIsSpeaking(true);
    setProgress((value) => Math.max(value, 4));
    try {
      await speakWithSystemVoice(text, selectedVoice.id, rate, speechLanguage, (charIndex) => {
        setProgress(Math.min(100, (charIndex / Math.max(text.length, 1)) * 100));
      });
      setIsSpeaking(false);
      setProgress(100);
    } catch (error) {
      setIsSpeaking(false);
      setNotice(error instanceof Error ? error.message : "本地播放失败");
    }
  }

  async function handleDocument(file?: File) {
    if (!file) return;
    try {
      setNotice("正在本地解析文档…");
      const imported = await importDocument(file);
      setText(imported.text);
      setDocumentTitle(imported.name);
      const detectedLanguage = detectDocumentLanguage(imported.text);
      const document: DocumentRecord = { id: `document-${Date.now()}`, title: imported.name, type: imported.type, text: imported.text, language: detectedLanguage, createdAt: new Date().toISOString() };
      if (detectedLanguage === "zh" || detectedLanguage === "en" || detectedLanguage === "ja") setSpeechLanguage(detectedLanguage);
      await saveDocument(document);
      setDocuments((current) => [document, ...current]);
      setProgress(0);
      setSynthesisJob(null);
      if (generatedAudioUrl) URL.revokeObjectURL(generatedAudioUrl);
      setGeneratedAudioUrl(null);
      setNotice(`已导入“${imported.name}”，共 ${imported.text.length.toLocaleString()} 字`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "文档导入失败");
    }
  }

  async function createDocument(title: string, content: string, language: DocumentRecord["language"]) {
    const detected = detectDocumentLanguage(content, language);
    const document: DocumentRecord = { id: `document-${Date.now()}`, title: title.trim() || "未命名文档", type: "text", text: content, language: detected, createdAt: new Date().toISOString() };
    await saveDocument(document);
    setDocuments((current) => [document, ...current]);
    setNotice(`已创建“${document.title}”`);
  }

  function openDocument(document: DocumentRecord) {
    setDocumentTitle(document.title);
    setText(document.text);
    const language = detectDocumentLanguage(document.text, document.language);
    if (language === "zh" || language === "en" || language === "ja") setSpeechLanguage(language);
    setProgress(0);
    setSynthesisJob(null);
    setView("reader");
  }

  async function discardDocument(document: DocumentRecord) {
    if (!window.confirm(`确定删除“${document.title}”吗？`)) return;
    await deleteDocument(document.id);
    setDocuments((current) => current.filter((item) => item.id !== document.id));
  }

  async function generateNarration() {
    if (!text.trim() || synthesisJob?.status === "running" || synthesisJob?.status === "queued") return;
    try {
      if (selectedVoice.kind !== "system") {
        let status = engine ?? await getEngineStatus();
        if (!status.ready) {
          setNotice("正在一次性安装本地 MLX 运行时…");
          status = await prepareEngine();
          setEngine(status);
        }
        if (selectedVoice.kind === "user" && !selectedVoice.recordingPath) throw new Error("这个旧音色缺少模型参考录音，请重新录制一次");
      }
      if (generatedAudioUrl) URL.revokeObjectURL(generatedAudioUrl);
      setGeneratedAudioUrl(null);
      const started = await startSynthesis({ text, title: documentTitle, voiceId: selectedVoice.id, rate, referencePath: selectedVoice.recordingPath, referenceText: selectedVoice.referenceText, speaker: selectedVoice.speaker, language: speechLanguage === "en" ? "English" : speechLanguage === "ja" ? "Japanese" : "Chinese" });
      setSynthesisJob(started);
      setSynthesisJobs((jobs) => [started, ...jobs.filter((job) => job.id !== started.id)]);
      let current = started;
      while (current.status === "queued" || current.status === "running") {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        current = await getSynthesisJob(current.id);
        setSynthesisJob(current);
        setSynthesisJobs((jobs) => [current, ...jobs.filter((job) => job.id !== current.id)]);
        setProgress(current.progress);
      }
      if (current.status === "failed") throw new Error(current.error || "语音生成失败");
      if (current.status === "completed" && current.outputPath) {
        const blob = await readGeneratedAudio(current.outputPath);
        setGeneratedAudioUrl(URL.createObjectURL(blob));
        setNotice("完整音频已生成并保存到本地");
        if (selectedVoice.kind !== "system") void getEngineStatus().then(setEngine);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "语音生成失败");
    }
  }

  async function quickTestNarration(sentence: string): Promise<SynthesisJob> {
    if (selectedVoice.kind === "system") throw new Error("快速测试需要先选择一个本地音色");
    let status = engine ?? await getEngineStatus();
    if (!status.ready) { setNotice("正在准备本地语音引擎…"); status = await prepareEngine(); setEngine(status); }
    const started = await startSynthesis({ text: sentence, title: "一句话快速测试", voiceId: selectedVoice.id, rate, referencePath: selectedVoice.recordingPath, referenceText: selectedVoice.referenceText, speaker: selectedVoice.speaker, language: speechLanguage === "en" ? "English" : speechLanguage === "ja" ? "Japanese" : "Chinese" });
    setSynthesisJobs((jobs) => [started, ...jobs.filter((job) => job.id !== started.id)]);
    let current = started;
    while (current.status === "queued" || current.status === "running") { await new Promise((resolve) => window.setTimeout(resolve, 500)); current = await getSynthesisJob(current.id); setSynthesisJobs((jobs) => [current, ...jobs.filter((job) => job.id !== current.id)]); }
    if (current.status !== "completed" || !current.outputPath) throw new Error(current.error || "快速测试语音生成失败");
    return current;
  }

  async function cancelNarration() {
    if (!synthesisJob) return;
    await cancelSynthesis(synthesisJob.id);
    setNotice("正在取消生成任务…");
  }

  async function showInFinder(path: string) {
    try {
      await revealGeneratedAudio(path);
      setNotice("已在 Finder 中定位音频文件");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法打开 Finder");
    }
  }

  async function renameHistoryAudio(job: SynthesisJob, newName: string) {
    try {
      const renamed = await renameGeneratedAudio(job.id, newName);
      setSynthesisJobs((jobs) => jobs.map((item) => item.id === renamed.id ? renamed : item));
      if (synthesisJob?.id === renamed.id) setSynthesisJob(renamed);
      setNotice("音频文件名已修改");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "修改文件名失败");
      throw error;
    }
  }

  async function installPublicVoice(voice: VoiceProfile) {
    if (!voice.speaker || voice.kind !== "open") return;
    setPublicVoiceList((voices) => voices.map((item) => item.id === voice.id ? { ...item, status: "downloading" } : item));
    setNotice(`正在下载“${voice.name}”…`);
    try {
      let status = engine ?? await getEngineStatus();
      if (!status.ready) status = await prepareEngine();
      setEngine(status);
      await downloadPublicVoice(voice.id, voice.speaker);
      setPublicVoiceList((voices) => voices.map((item) => item.id === voice.id ? { ...item, status: "ready" } : item));
      setNotice(`“${voice.name}”已下载，可离线使用`);
    } catch (error) {
      setPublicVoiceList((voices) => voices.map((item) => item.id === voice.id ? { ...item, status: "downloadable" } : item));
      setNotice(error instanceof Error ? error.message : "音色下载失败");
    }
  }

  function seekGeneratedAudio(seconds: number) {
    const audio = generatedPlayerRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seconds));
  }

  function addVoice(profile: VoiceProfile) {
    const next = [profile, ...userVoices];
    setUserVoices(next);
    saveUserProfiles(next);
    setSelectedVoiceId(profile.id);
    saveDefaultVoice(profile.id);
    void persistVoiceProfile(profile);
    setView("voices");
  }

  async function discardVoice(profile: VoiceProfile) {
    const confirmed = window.confirm(`确定将“${profile.name}”移入回收站吗？之后可以恢复。`);
    if (!confirmed) return;
    const trashed = await trashVoiceProfile(profile.id);
    const next = userVoices.filter((voice) => voice.id !== profile.id);
    setUserVoices(next);
    saveUserProfiles(next);
    setTrashedVoices((voices) => [trashed, ...voices.filter((voice) => voice.id !== trashed.id)]);
    if (selectedVoiceId === profile.id) chooseVoice(builtInVoiceCatalog[0].id);
    setNotice(`“${profile.name}”已移入回收站`);
  }

  async function trashHistoryAudio(job: SynthesisJob) {
    setPendingAudioTrash(job);
  }

  async function confirmTrashHistoryAudio() {
    const job = pendingAudioTrash;
    if (!job) return;
    setPendingAudioTrash(null);
    try {
      const trashed = await trashGeneratedAudio(job.id);
      setSynthesisJobs((jobs) => jobs.filter((item) => item.id !== job.id));
      setTrashedAudioJobs((jobs) => [trashed, ...jobs.filter((item) => item.id !== trashed.id)]);
      if (synthesisJob?.id === job.id) { setSynthesisJob(null); setGeneratedAudioUrl(null); }
      setNotice("历史音频已移入回收站");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : typeof error === "string" ? error : "无法移入回收站");
    }
  }

  async function restoreTrashedVoice(profile: VoiceProfile) {
    const restored = await restoreVoiceProfile(profile.id);
    const next = [restored, ...userVoices.filter((voice) => voice.id !== restored.id)];
    setUserVoices(next);
    saveUserProfiles(next);
    setTrashedVoices((voices) => voices.filter((voice) => voice.id !== restored.id));
    setNotice(`已恢复音色“${restored.name}”`);
  }

  async function restoreHistoryAudio(job: SynthesisJob) {
    const restored = await restoreTrashedAudio(job.id);
    setSynthesisJobs((jobs) => [restored, ...jobs.filter((item) => item.id !== restored.id)]);
    setTrashedAudioJobs((jobs) => jobs.filter((item) => item.id !== restored.id));
    setNotice("历史音频已恢复");
  }

  async function emptyTrash() {
    if (!trashedVoices.length && !trashedAudioJobs.length) return;
    if (!window.confirm("清空回收站后无法恢复，确定继续吗？")) return;
    for (const profile of trashedVoices) { if (profile.recordingId) await deleteRecording(profile.recordingId); }
    await Promise.all([purgeVoiceTrash(), purgeAudioTrash()]);
    setTrashedVoices([]);
    setTrashedAudioJobs([]);
    setNotice("回收站已清空，文件已永久删除");
  }

  function reorderVoice(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const ids = allVoices.map((voice) => voice.id);
    const sourceIndex = ids.indexOf(sourceId);
    const targetIndex = ids.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = ids.splice(sourceIndex, 1);
    ids.splice(targetIndex, 0, moved);
    setVoiceOrder(ids);
    saveVoiceOrder(ids);
    setNotice("音色顺序已保存");
  }

  function toggleFavoriteVoice(id: string) {
    const next = favoriteVoiceIds.includes(id) ? favoriteVoiceIds.filter((voiceId) => voiceId !== id) : [id, ...favoriteVoiceIds];
    setFavoriteVoiceIds(next);
    saveFavoriteVoices(next);
    setNotice(next.includes(id) ? "已喜欢，音色已自动置顶" : "已取消喜欢");
  }

  function togglePinnedVoice(id: string) {
    const next = pinnedVoiceIds.includes(id) ? pinnedVoiceIds.filter((voiceId) => voiceId !== id) : [id, ...pinnedVoiceIds];
    setPinnedVoiceIds(next);
    savePinnedVoices(next);
    setNotice(next.includes(id) ? "音色已置顶" : "已取消置顶");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><AudioLines size={19} /></span><span>VoxLocal</span></div>
        <nav>
          <NavButton active={view === "reader"} icon={<BookOpen size={18} />} label="阅读" onClick={() => setView("reader")} />
          <NavButton active={view === "voices"} icon={<AudioLines size={18} />} label="音色库" onClick={() => setView("voices")} />
          <NavButton active={view === "record"} icon={<Mic size={18} />} label="录制音色" onClick={() => setView("record")} />
          <NavButton active={view === "library"} icon={<Library size={18} />} label="文档库" onClick={() => setView("library")} />
          <NavButton active={view === "history"} icon={<History size={18} />} label="生成历史" onClick={() => setView("history")} />
          <NavButton active={view === "video"} icon={<Film size={18} />} label="口型视频" onClick={() => setView("video")} />
          <NavButton active={view === "ppt"} icon={<Film size={18} />} label="PPT视频" onClick={() => setView("ppt")} />
          <NavButton active={view === "trash"} icon={<Trash2 size={18} />} label={`回收站${trashedVoices.length + trashedAudioJobs.length ? ` (${trashedVoices.length + trashedAudioJobs.length})` : ""}`} onClick={() => setView("trash")} />
        </nav>
        <button className="refresh-app-button" disabled={isRefreshing} onClick={() => void refreshAppState()}><RefreshCw className={isRefreshing ? "spin" : ""} size={16} /><span>{isRefreshing ? "正在刷新" : "刷新状态"}</span></button>
        <div className="privacy-note"><span className="status-dot" />完全本地运行<div>声音与文档不会离开设备</div></div>
      </aside>

      <main className="main-area">
        {view === "reader" && (
          <Reader
            text={text} setText={setText} selectedVoice={selectedVoice} allVoices={allVoices}
            menuOpen={menuOpen} setMenuOpen={setMenuOpen} chooseVoice={chooseVoice}
            isSpeaking={isSpeaking} toggleSpeech={toggleSpeech} rate={rate} setRate={setRate} language={speechLanguage} setLanguage={changeSpeechLanguage}
            progress={progress} onRecord={() => setView("record")}
            documentTitle={documentTitle} onImport={() => importInputRef.current?.click()}
            synthesisJob={synthesisJob} generatedAudioUrl={generatedAudioUrl}
            onGenerate={generateNarration} device={device} engine={engine}
            onCancel={cancelNarration}
            onReveal={showInFinder}
            generatedPlayerRef={generatedPlayerRef}
            onSeek={seekGeneratedAudio}
          />
        )}
        {view === "voices" && <VoiceLibrary voices={allVoices} selectedVoiceId={selectedVoice.id} favoriteVoiceIds={favoriteVoiceIds} pinnedVoiceIds={pinnedVoiceIds} onChoose={chooseVoice} onDiscard={discardVoice} onDownload={installPublicVoice} onReorder={reorderVoice} onToggleFavorite={toggleFavoriteVoice} onTogglePinned={togglePinnedVoice} onRecord={() => setView("record")} />}
        {view === "record" && <VoiceRecorder onComplete={addVoice} />}
        {view === "library" && <LibraryView documents={[...documents, ...sampleDocuments]} onOpen={openDocument} onDiscard={discardDocument} onImport={() => importInputRef.current?.click()} onCreate={createDocument} />}
        {view === "history" && <HistoryView jobs={synthesisJobs} voices={allVoices} onReveal={showInFinder} onRename={renameHistoryAudio} onTrash={trashHistoryAudio} />}
        {view === "video" && <LipSyncView audioJobs={synthesisJobs} selectedVoice={selectedVoice} onQuickTest={quickTestNarration} onNotice={setNotice} />}
        {view === "ppt" && <PptVideoView audioJobs={synthesisJobs} onNotice={setNotice} />}
        {view === "trash" && <TrashView voices={trashedVoices} audioJobs={trashedAudioJobs} onRestoreVoice={restoreTrashedVoice} onRestoreAudio={restoreHistoryAudio} onEmpty={emptyTrash} />}
      </main>

      {notice && <div className="toast" onClick={() => setNotice(null)}><Sparkles size={16} />{notice}</div>}
      {pendingAudioTrash && <div className="delete-confirm-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingAudioTrash(null); }}><div className="delete-confirm-card" role="dialog" aria-modal="true" aria-labelledby="delete-audio-title"><h3 id="delete-audio-title">确认删除历史音频？</h3><p>音频会先移入回收站，之后仍可恢复。</p><div><button type="button" onClick={() => setPendingAudioTrash(null)}>取消</button><button type="button" className="danger" onClick={() => void confirmTrashHistoryAudio()}>确认删除</button></div></div></div>}
      <input ref={importInputRef} className="hidden-file-input" type="file" accept=".txt,.md,.markdown,.pdf,.docx,.epub" onChange={(event) => { void handleDocument(event.target.files?.[0]); event.currentTarget.value = ""; }} />
    </div>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}>{icon}<span>{label}</span></button>;
}

interface ReaderProps {
  text: string;
  setText: (text: string) => void;
  selectedVoice: VoiceProfile;
  allVoices: VoiceProfile[];
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  chooseVoice: (id: string) => void;
  isSpeaking: boolean;
  toggleSpeech: () => void;
  rate: number;
  setRate: (rate: number) => void;
  language: "zh" | "en" | "ja";
  setLanguage: (language: "zh" | "en" | "ja") => void;
  progress: number;
  onRecord: () => void;
  documentTitle: string;
  onImport: () => void;
  synthesisJob: SynthesisJob | null;
  generatedAudioUrl: string | null;
  onGenerate: () => void;
  device: DeviceProfile | null;
  engine: EngineStatus | null;
  onCancel: () => void;
  onReveal: (path: string) => void;
  generatedPlayerRef: React.RefObject<HTMLAudioElement>;
  onSeek: (seconds: number) => void;
}

function Reader(props: ReaderProps) {
  const system = props.allVoices.filter((voice) => voice.kind !== "user" && voice.status === "ready");
  const users = props.allVoices.filter((voice) => voice.kind === "user");
  const [showMoreRates, setShowMoreRates] = useState(false);
  const commonRates = [0.8, 0.9, 1, 1.1, 1.2, 1.3];
  const extraRates = [1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2];
  const visibleRates = showMoreRates ? [...commonRates, ...extraRates] : commonRates;
  return (
    <section className="page reader-page">
      <header className="page-header">
        <div><p className="eyebrow">阅读工作台</p><h1>让文字，用喜欢的声音说出来</h1></div>
        <button className="secondary-button" onClick={props.onImport}><FileText size={17} />导入文档</button>
      </header>

      <div className="reader-grid">
        <div className="document-panel">
          <div className="document-title"><div><span className="file-pill">文本</span><strong>{props.documentTitle}</strong></div><span>{props.text.length.toLocaleString()} 字</span></div>
          <textarea aria-label="阅读文本" value={props.text} onChange={(event) => props.setText(event.target.value)} />
        </div>

        <aside className="control-panel">
          <div className="control-label">朗读音色</div>
          <div className="voice-selector-wrap">
            <button className="voice-selector" onClick={() => props.setMenuOpen(!props.menuOpen)}>
              <VoiceAvatar voice={props.selectedVoice} /><span><strong>{props.selectedVoice.name}</strong><small>{props.selectedVoice.description}</small></span><ChevronDown size={18} />
            </button>
            {props.menuOpen && (
              <div className="voice-menu">
                <VoiceGroup title="公共音色" voices={system} selected={props.selectedVoice.id} onChoose={props.chooseVoice} />
                {users.length > 0 && <VoiceGroup title="克隆音色" voices={users} selected={props.selectedVoice.id} onChoose={props.chooseVoice} />}
                <button className="record-menu-button" onClick={props.onRecord}><Plus size={16} />录制新音色</button>
              </div>
            )}
          </div>

          <div className="setting-row"><span>语音语言</span><select value={props.language} onChange={(event) => props.setLanguage(event.target.value as "zh" | "en" | "ja")}><option value="zh">中文</option><option value="en">English</option><option value="ja">日本語</option></select></div>
          <div className="setting-row"><span><Settings2 size={16} />语速</span><div className="rate-buttons">{visibleRates.map((value) => <button key={value} className={props.rate === value ? "active" : ""} onClick={() => props.setRate(value)}>{value.toFixed(1)}×</button>)}<button className="rate-more" onClick={() => setShowMoreRates((open) => !open)} aria-expanded={showMoreRates}>{showMoreRates ? "收起" : "更多"}</button></div></div>
          <div className="engine-card"><Cpu size={18} /><div><strong>{props.selectedVoice.kind === "user" ? "Qwen3-TTS 克隆引擎" : props.selectedVoice.id.startsWith("kokoro-") ? "Kokoro 开源音色" : props.selectedVoice.kind === "open" ? "Qwen3-TTS 开源音色" : "Mac 公共音色"}</strong><small>{props.device ? `${props.device.memoryGb}GB · ${props.device.performanceTier === "quality" ? "质量模式" : props.device.performanceTier === "balanced" ? "均衡模式" : "轻量模式"} · ${props.device.chunkCharacters}字/片` : "正在检测设备…"}</small></div><span className="local-badge" title={props.engine?.message}>{props.selectedVoice.kind !== "system" && !props.engine?.ready ? "组件待安装" : "本地"}</span></div>

          <button className="generate-button" disabled={!props.text.trim() || props.synthesisJob?.status === "running" || props.synthesisJob?.status === "queued"} onClick={props.onGenerate}><Download size={17} />{props.synthesisJob?.status === "running" || props.synthesisJob?.status === "queued" ? props.synthesisJob.stage : "生成完整音频"}</button>
          {props.synthesisJob && <div className={`job-progress ${props.synthesisJob.status}`}><div><span>{props.synthesisJob.stage}</span><strong>{props.synthesisJob.progress}%</strong></div><div className="progress-track"><span style={{ width: `${props.synthesisJob.progress}%` }} /></div><div className="job-progress-footer"><small>{props.synthesisJob.completedChunks}/{props.synthesisJob.totalChunks} 个分片</small>{(props.synthesisJob.status === "running" || props.synthesisJob.status === "queued") && <button onClick={props.onCancel}>取消</button>}{props.synthesisJob.outputPath && <button onClick={() => props.onReveal(props.synthesisJob!.outputPath!)}>在 Finder 中显示</button>}</div>{props.synthesisJob.error && <p>{props.synthesisJob.error}</p>}</div>}
          {props.generatedAudioUrl && <audio ref={props.generatedPlayerRef} className="generated-audio" preload="metadata" src={props.generatedAudioUrl} />}

          <div className={`player-card ${props.isSpeaking ? "is-playing" : ""}`}>
            <div className="now-playing"><VoiceAvatar voice={props.selectedVoice} /><div><small>正在阅读</small><strong>{props.selectedVoice.name}</strong></div><Volume2 size={18} /></div>
            <div className="progress-track"><span style={{ width: `${props.progress}%` }} /></div>
            <div className="player-controls"><button disabled={!props.generatedAudioUrl} aria-label="后退 15 秒" title="后退 15 秒" onClick={() => props.onSeek(-15)}><RotateCcw size={18} /></button><button className="play-button" disabled={!props.generatedAudioUrl && !(props.synthesisJob?.status === "completed" && props.synthesisJob.outputPath && props.synthesisJob.voiceId === props.selectedVoice.id)} aria-label={props.isSpeaking ? "停止播放" : "开始播放"} title={props.isSpeaking ? "停止播放" : "开始播放"} onClick={props.toggleSpeech}>{props.isSpeaking ? <CircleStop fill="currentColor" /> : <Play fill="currentColor" />}</button><button disabled={!props.generatedAudioUrl} aria-label="前进 15 秒" title="前进 15 秒" onClick={() => props.onSeek(15)}><RotateCcw className="flip" size={18} /></button></div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function VoiceGroup({ title, voices, selected, onChoose }: { title: string; voices: VoiceProfile[]; selected: string; onChoose: (id: string) => void }) {
  return <div className="voice-group"><p>{title}</p>{voices.map((voice) => <button key={voice.id} onClick={() => onChoose(voice.id)}><VoiceAvatar voice={voice} /><span><strong>{voice.name}</strong><small>{voice.accent}</small></span>{voice.id === selected && <Check size={17} />}</button>)}</div>;
}

function VoiceAvatar({ voice }: { voice: VoiceProfile }) {
  return <span className="voice-avatar" style={{ background: voice.color }}>{voice.kind === "user" ? <Mic size={17} /> : <AudioLines size={17} />}</span>;
}

function VoiceLibrary({ voices, selectedVoiceId, favoriteVoiceIds, pinnedVoiceIds, onChoose, onDiscard, onDownload, onReorder, onToggleFavorite, onTogglePinned, onRecord }: { voices: VoiceProfile[]; selectedVoiceId: string; favoriteVoiceIds: string[]; pinnedVoiceIds: string[]; onChoose: (id: string) => void; onDiscard: (voice: VoiceProfile) => void; onDownload: (voice: VoiceProfile) => void; onReorder: (sourceId: string, targetId: string) => void; onToggleFavorite: (id: string) => void; onTogglePinned: (id: string) => void; onRecord: () => void }) {
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [voiceTab, setVoiceTab] = useState<"all" | "public" | "cloned">("all");
  const [previewText, setPreviewText] = useState(recordingPrompts[0]);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewJobRef = useRef<string | null>(null);
  const previewRunRef = useRef(0);
  const publicVoices = voices.filter((voice) => voice.kind !== "user");
  const clonedVoices = voices.filter((voice) => voice.kind === "user");
  const visibleVoices = voiceTab === "public" ? publicVoices : voiceTab === "cloned" ? clonedVoices : voices;

  useEffect(() => () => {
    previewRunRef.current += 1;
    previewAudioRef.current?.pause();
    if (previewJobRef.current) void cancelSynthesis(previewJobRef.current).catch(() => undefined);
  }, []);

  async function playPreviewBlob(blob: Blob, run: number) {
    if (run !== previewRunRef.current) return;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    previewAudioRef.current = audio;
    audio.onended = () => { URL.revokeObjectURL(url); if (run === previewRunRef.current) { previewAudioRef.current = null; setPreviewingId(null); } };
    audio.onerror = () => { URL.revokeObjectURL(url); if (run === previewRunRef.current) { previewAudioRef.current = null; setPreviewingId(null); } };
    await audio.play();
  }

  async function previewVoice(voice: VoiceProfile) {
    if (voice.status === "downloading") return;
    const run = ++previewRunRef.current;
    if (previewJobRef.current) {
      void cancelSynthesis(previewJobRef.current).catch(() => undefined);
      previewJobRef.current = null;
    }
    if (previewingId === voice.id) {
      await stopSpeaking();
      previewAudioRef.current?.pause();
      previewAudioRef.current = null;
      setPreviewingId(null);
      return;
    }
    await stopSpeaking();
    previewAudioRef.current?.pause();
    setPreviewingId(voice.id);
    if (voice.kind === "system") {
      try {
        await speakWithSystemVoice(previewText, voice.id, 1);
      } finally {
        setPreviewingId(null);
      }
      return;
    }
    try {
      const needsLocalizedSample = voice.id.startsWith("kokoro-") && voice.language && voice.language !== "z" && /[\u3400-\u9fff]/.test(previewText);
      const effectiveText = needsLocalizedSample ? publicPreviewSamples[voice.language!] ?? previewText : previewText;
      if (needsLocalizedSample) setPreviewText(effectiveText);
      const cached = await readCachedVoicePreview(voice.id, effectiveText);
      if (cached) {
        await playPreviewBlob(cached, run);
        return;
      }
      if (voice.status === "downloadable") throw new Error("请先下载这个音色，再试听自定义文本");
      if (voice.kind === "user" && !voice.recordingPath) throw new Error("这个旧音色需要重新录制后才能生成试听");
      const status = await getEngineStatus();
      if (!status.ready) await prepareEngine();
      if (run !== previewRunRef.current) return;
      let job = await startSynthesis({ text: effectiveText, title: `${voice.name}-试听`, voiceId: voice.id, rate: 1, referencePath: voice.recordingPath, referenceText: voice.referenceText, speaker: voice.speaker, language: voice.language });
      previewJobRef.current = job.id;
      while (job.status === "queued" || job.status === "running") {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        if (run !== previewRunRef.current) return;
        job = await getSynthesisJob(job.id);
      }
      previewJobRef.current = null;
      if (run !== previewRunRef.current) return;
      if (job.status !== "completed" || !job.outputPath) throw new Error(job.error || "试听生成失败");
      await cacheVoicePreview(job.outputPath, voice.id, effectiveText);
      const blob = await readGeneratedAudio(job.outputPath);
      await playPreviewBlob(blob, run);
    } catch (error) {
      if (run === previewRunRef.current) {
        previewJobRef.current = null;
        setPreviewingId(null);
        alert(error instanceof Error ? error.message : "试听生成失败");
      }
    }
  }

  const renderVoice = (voice: VoiceProfile) => (
    <article className={`voice-card ${previewingId === voice.id ? "is-previewing" : ""} ${draggingId === voice.id ? "is-dragging" : ""} ${dropTargetId === voice.id ? "is-drop-target" : ""}`} key={voice.id} onDragEnter={(event) => event.preventDefault()} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; const sourceId = draggingId || event.dataTransfer.getData("text/plain"); if (sourceId && sourceId !== voice.id) setDropTargetId(voice.id); }} onDragLeave={() => setDropTargetId((current) => current === voice.id ? null : current)} onDrop={(event) => { event.preventDefault(); const sourceId = draggingId || event.dataTransfer.getData("text/plain"); if (sourceId) onReorder(sourceId, voice.id); setDraggingId(null); setDropTargetId(null); }}>
      <button className="voice-drag-handle" draggable aria-label={`拖拽排序 ${voice.name}`} title="拖拽调整顺序" onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", voice.id); setDraggingId(voice.id); }} onDragEnd={() => { setDraggingId(null); setDropTargetId(null); }}><GripVertical size={17} /></button>
      <VoiceAvatar voice={voice} />
      <div><h3>{voice.name}</h3><p>{voice.description}</p><span>{voice.kind === "user" ? "克隆音色" : voice.kind === "open" ? `开源音色 · ${voice.license}` : "系统音色"}</span></div>
      <div className="voice-preferences"><button className={favoriteVoiceIds.includes(voice.id) ? "active" : ""} aria-label={`${favoriteVoiceIds.includes(voice.id) ? "取消喜欢" : "喜欢"} ${voice.name}`} title={favoriteVoiceIds.includes(voice.id) ? "取消喜欢" : "喜欢并置顶"} onClick={() => onToggleFavorite(voice.id)}><Heart size={15} fill={favoriteVoiceIds.includes(voice.id) ? "currentColor" : "none"} /></button><button className={pinnedVoiceIds.includes(voice.id) ? "active" : ""} aria-label={`${pinnedVoiceIds.includes(voice.id) ? "取消置顶" : "置顶"} ${voice.name}`} title={pinnedVoiceIds.includes(voice.id) ? "取消置顶" : "置顶"} onClick={() => onTogglePinned(voice.id)}><Pin size={15} fill={pinnedVoiceIds.includes(voice.id) ? "currentColor" : "none"} /></button></div>
      <button className="preview-button" aria-label={previewingId === voice.id ? `停止试听 ${voice.name}` : `试听 ${voice.name}`} disabled={voice.status !== "ready" && voice.status !== "recorded" && !voice.previewCached} onClick={() => previewVoice(voice)}>{previewingId === voice.id ? <CircleStop size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}{previewingId === voice.id ? "停止" : "试听"}</button>
      {(voice.status === "downloadable" || voice.status === "downloading") && <button className="download-voice-button" aria-label={`下载 ${voice.name}`} disabled={voice.status === "downloading"} onClick={() => onDownload(voice)}>{voice.status === "downloading" ? <RotateCcw className="spin" size={16} /> : <Download size={16} />}{voice.status === "downloading" ? "下载中" : "下载"}</button>}
      <button className={`use-button ${selectedVoiceId === voice.id ? "selected" : ""}`} disabled={voice.status === "downloadable" || voice.status === "downloading"} onClick={() => onChoose(voice.id)}>{selectedVoiceId === voice.id ? "使用中" : "使用"}</button>
      {voice.kind === "user" && <button className="discard-voice-button" onClick={() => onDiscard(voice)}>废弃</button>}
    </article>
  );

  return (
    <section className="page voices-page">
      <header className="page-header"><div><p className="eyebrow">声音档案</p><h1>音色库</h1><p className="subtitle">试听公共音色，或选择你已经创建的克隆音色。</p></div><button className="primary-button" onClick={onRecord}><Mic size={17} />录制新音色</button></header>
      <div className="preview-text-card">
        <div className="preview-text-heading"><div><strong>试听文本</strong><span>公共音色直接朗读；克隆音色会在本地生成这段文字</span></div><button onClick={() => setPreviewText((current) => randomRecordingPrompt(current))}>随机一段</button></div>
        <textarea aria-label="自定义试听文本" value={previewText} maxLength={300} onChange={(event) => setPreviewText(event.target.value)} />
        <small>{previewText.length}/300</small>
      </div>
      <div className="voice-tabs" role="tablist" aria-label="音色分类">
        <button role="tab" aria-selected={voiceTab === "all"} className={voiceTab === "all" ? "active" : ""} onClick={() => setVoiceTab("all")}>全部<span>{voices.length}</span></button>
        <button role="tab" aria-selected={voiceTab === "public"} className={voiceTab === "public" ? "active" : ""} onClick={() => setVoiceTab("public")}>公共<span>{publicVoices.length}</span></button>
        <button role="tab" aria-selected={voiceTab === "cloned"} className={voiceTab === "cloned" ? "active" : ""} onClick={() => setVoiceTab("cloned")}>克隆<span>{clonedVoices.length}</span></button>
      </div>
      <div className="voice-library-list">
        <div className="voice-list">
          <div className="section-title"><h2>{voiceTab === "all" ? "全部音色" : voiceTab === "public" ? "公共音色" : "克隆音色"}</h2><span>{visibleVoices.length} 个</span></div>
          {visibleVoices.length ? visibleVoices.map(renderVoice) : <div className="empty-voices"><Mic size={24} /><p>还没有克隆音色</p><button onClick={onRecord}>录制第一个音色</button></div>}
        </div>
      </div>
    </section>
  );
}

function VoiceRecorder({ onComplete }: { onComplete: (profile: VoiceProfile) => void }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [name, setName] = useState("我的声音");
  const [referenceText, setReferenceText] = useState(() => randomRecordingPrompt());
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isOptimized, setIsOptimized] = useState(false);
  const [optimizeProgress, setOptimizeProgress] = useState(0);
  const [optimizeStage, setOptimizeStage] = useState("准备处理");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => () => { if (timerRef.current) window.clearInterval(timerRef.current); if (recordingUrl) URL.revokeObjectURL(recordingUrl); }, [recordingUrl]);

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setRecordedBlob(blob);
        setRecordingUrl(URL.createObjectURL(blob));
        setIsOptimized(false);
        setOptimizeProgress(0);
        setOptimizeStage("准备处理");
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        if (timerRef.current) window.clearInterval(timerRef.current);
      };
      recorderRef.current = recorder;
      recorder.start(250);
      setElapsed(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    } catch {
      alert("无法使用麦克风，请在系统设置中允许 VoxLocal 访问麦克风。");
    }
  }

  async function saveVoice() {
    if (!recordedBlob) return;
    const id = `voice-${Date.now()}`;
    try {
      const modelRecording = isOptimized ? recordedBlob : await optimizeVoiceRecording(recordedBlob);
      await saveRecording(id, modelRecording);
      const recordingPath = await persistRecording(id, modelRecording);
      onComplete({ id, name: name.trim() || "我的声音", kind: "user", description: isOptimized ? "由降噪优化录音创建" : "由你的本地录音创建", accent: "普通话", color: "#8a6654", createdAt: new Date().toISOString(), recordingId: id, recordingPath, referenceText, optimized: isOptimized, status: "recorded" });
    } catch (error) {
      alert(error instanceof Error ? error.message : "保存模型参考录音失败");
    }
  }

  async function optimizeRecording() {
    if (!recordedBlob || isOptimizing || isOptimized) return;
    setIsOptimizing(true);
    setOptimizeProgress(0);
    setOptimizeStage("准备处理");
    try {
      const optimized = await optimizeVoiceRecording(recordedBlob, ({ percent, stage }) => {
        setOptimizeProgress(percent);
        setOptimizeStage(stage);
      });
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
      setRecordedBlob(optimized);
      setRecordingUrl(URL.createObjectURL(optimized));
      setIsOptimized(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : "降噪优化失败");
    } finally {
      setIsOptimizing(false);
    }
  }

  function discardCurrentRecording() {
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    setRecordedBlob(null);
    setRecordingUrl(null);
    setElapsed(0);
    setIsOptimized(false);
    setOptimizeProgress(0);
    setOptimizeStage("准备处理");
    chunksRef.current = [];
    setReferenceText((current) => randomRecordingPrompt(current));
  }

  return (
    <section className="page record-page">
      <header className="page-header"><div><p className="eyebrow">创建克隆音色</p><h1>录制你的声音</h1><p className="subtitle">录音和声音特征只保存在这台 Mac 上。</p></div></header>
      <div className="record-content">
        <div className="record-card">
          <div className="record-heading"><span><Mic size={21} /></span><div><h2>录制你的声音</h2><p>在安静环境中自然朗读下面文字。</p></div></div>
          <div className="prompt-heading"><span>随机参考文字</span><button disabled={recording} onClick={() => setReferenceText((current) => randomRecordingPrompt(current))}>换一段</button></div>
          <blockquote>“{referenceText}”</blockquote>
          <div className={`waveform ${recording ? "active" : ""}`}>{Array.from({ length: 36 }).map((_, index) => <i key={index} style={{ height: `${12 + ((index * 17) % 35)}%` }} />)}</div>
          <div className="record-actions">
            <button className={`record-button ${recording ? "recording" : ""}`} onClick={toggleRecording}>{recording ? <CircleStop size={19} fill="currentColor" /> : <Mic size={19} />}{recording ? `停止录制  ${formatTime(elapsed)}` : recordedBlob ? "重新录制" : "开始录制"}</button>
            {recordingUrl && <audio controls src={recordingUrl} />}
          </div>
          {recordedBlob && <div className={`optimize-panel ${isOptimized ? "done" : ""} ${isOptimizing ? "processing" : ""}`}>
            <div className="optimize-copy"><WandSparkles size={18} /><span><strong>{isOptimized ? "声音已优化" : isOptimizing ? optimizeStage : "降噪优化"}</strong><small>{isOptimized ? "播放器现在试听的是处理后版本" : isOptimizing ? `本地处理中 · ${optimizeProgress}%` : "削减环境底噪，平衡音量并提升清晰度"}</small></span></div>
            <button disabled={isOptimizing || isOptimized} onClick={optimizeRecording}>{isOptimizing ? `${optimizeProgress}%` : isOptimized ? <><Check size={15} />已完成</> : "开始处理"}</button>
            {(isOptimizing || isOptimized) && <div className="optimize-progress" role="progressbar" aria-label="降噪优化进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={isOptimized ? 100 : optimizeProgress}><div style={{ width: `${isOptimized ? 100 : optimizeProgress}%` }} /></div>}
          </div>}
          {recordedBlob && <div className="save-row"><button className="discard-recording-button" onClick={discardCurrentRecording}>废弃录音</button><input value={name} onChange={(event) => setName(event.target.value)} aria-label="音色名称" /><button className="primary-button" onClick={saveVoice}><Sparkles size={17} />创建音色</button></div>}
        </div>

      </div>
    </section>
  );
}

function HistoryView({ jobs, voices, onReveal, onRename, onTrash }: { jobs: SynthesisJob[]; voices: VoiceProfile[]; onReveal: (path: string) => void; onRename: (job: SynthesisJob, name: string) => Promise<void>; onTrash: (job: SynthesisJob) => void }) {
  const [historyTab, setHistoryTab] = useState<"generated" | "system">("generated");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const fileName = (path: string) => path.split("/").pop()?.replace(/\.wav$/i, "") ?? "未命名音频";
  const completed = jobs.filter((job) => job.status === "completed" && job.outputPath);
  const userGenerated = completed.filter((job) => job.source !== "preview" && !fileName(job.outputPath!).includes("试听"));
  const systemGenerated = completed.filter((job) => job.source === "preview" || fileName(job.outputPath!).includes("试听"));
  const visibleJobs = historyTab === "generated" ? userGenerated : systemGenerated;

  async function saveName(job: SynthesisJob) {
    if (!editingName.trim()) return;
    try {
      await onRename(job, editingName);
      setEditingId(null);
    } catch {
      // The parent toast contains the actionable rename error.
    }
  }

  useEffect(() => () => {
    audioRef.current?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
  }, []);

  async function playJob(job: SynthesisJob) {
    if (playingId === job.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    try {
      const blob = await readGeneratedAudio(job.outputPath!);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audioUrlRef.current = url;
      audio.onended = () => { setPlayingId(null); URL.revokeObjectURL(url); if (audioUrlRef.current === url) audioUrlRef.current = null; };
      audio.onerror = () => { setPlayingId(null); alert("历史音频无法播放"); };
      await audio.play();
      setPlayingId(job.id);
    } catch (error) {
      setPlayingId(null);
      alert(error instanceof Error ? error.message : "历史音频无法播放");
    }
  }

  return <section className="page history-page">
    <header className="page-header"><div><p className="eyebrow">本地音频</p><h1>生成历史</h1><p className="subtitle">只在历史中展示用户主动生成的完整音频。</p></div><span className="history-count">{userGenerated.length} 个生成音频</span></header>
    <div className="voice-tabs history-tabs"><button className={historyTab === "generated" ? "active" : ""} onClick={() => setHistoryTab("generated")}>生成历史<span>{userGenerated.length}</span></button><button className={historyTab === "system" ? "active" : ""} onClick={() => setHistoryTab("system")}>系统音频<span>{systemGenerated.length}</span></button></div>
    {visibleJobs.length ? <div className="history-list">{visibleJobs.map((job) => {
      const voice = voices.find((item) => item.id === job.voiceId);
      const created = Number(job.createdAt) * 1000;
      return <article className="history-card" key={job.id}>
        <span className="history-icon"><AudioLines size={19} /></span>
        <div className="history-info">
          {editingId === job.id ? <div className="history-rename"><input autoFocus value={editingName} onChange={(event) => setEditingName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveName(job); if (event.key === "Escape") setEditingId(null); }} /><span>.wav</span><button onClick={() => void saveName(job)}>保存</button><button onClick={() => setEditingId(null)}>取消</button></div> : <h2>{fileName(job.outputPath!)}</h2>}
          <p>{voice?.name ?? job.voiceId} · {Number.isFinite(created) ? new Date(created).toLocaleString() : "本地生成"} · {job.totalChunks} 个分片</p>
        </div>
        <button className={`history-action ${playingId === job.id ? "active" : ""}`} onClick={() => void playJob(job)}>{playingId === job.id ? <CircleStop size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}{playingId === job.id ? "停止" : "播放"}</button>
        {historyTab === "generated" && <button className="history-action" onClick={() => { setEditingId(job.id); setEditingName(fileName(job.outputPath!)); }}>改名</button>}
        <button className="history-action" onClick={() => onReveal(job.outputPath!)}>在 Finder 中显示</button>
        {historyTab === "generated" && <button className="history-action danger" aria-label={`删除 ${fileName(job.outputPath!)}`} onClick={() => onTrash(job)}><Trash2 size={14} />删除</button>}
      </article>;
    })}</div> : <div className="library-empty"><div className="empty-illustration"><History size={34} /></div><h2>{historyTab === "generated" ? "还没有主动生成记录" : "还没有系统音频"}</h2><p>{historyTab === "generated" ? "在阅读页点击“生成完整音频”后会出现在这里。" : "默认试听与缓存音频会归类到这里。"}</p></div>}
  </section>;
}

function TrashView({ voices, audioJobs, onRestoreVoice, onRestoreAudio, onEmpty }: { voices: VoiceProfile[]; audioJobs: SynthesisJob[]; onRestoreVoice: (voice: VoiceProfile) => void; onRestoreAudio: (job: SynthesisJob) => void; onEmpty: () => void }) {
  const total = voices.length + audioJobs.length;
  const audioName = (job: SynthesisJob) => job.outputPath?.split("/").pop()?.replace(/\.wav$/i, "") ?? "历史音频";
  return <section className="page trash-page">
    <header className="page-header"><div><p className="eyebrow">可恢复删除</p><h1>回收站</h1><p className="subtitle">删除的克隆音色和历史音频会先保留在这里。</p></div><button className="secondary-button danger" disabled={!total} onClick={onEmpty}><Trash2 size={15} />清空回收站</button></header>
    {!total ? <div className="library-empty"><div className="empty-illustration"><Trash2 size={34} /></div><h2>回收站是空的</h2><p>只有清空回收站后，本地文件才会被永久删除。</p></div> : <div className="trash-sections">
      {!!voices.length && <div className="trash-section"><div className="section-title"><h2>克隆音色</h2><span>{voices.length} 个</span></div>{voices.map((voice) => <article className="trash-card" key={voice.id}><VoiceAvatar voice={voice} /><div><h3>{voice.name}</h3><p>{voice.description}</p></div><button onClick={() => onRestoreVoice(voice)}>恢复音色</button></article>)}</div>}
      {!!audioJobs.length && <div className="trash-section"><div className="section-title"><h2>生成音频</h2><span>{audioJobs.length} 个</span></div>{audioJobs.map((job) => <article className="trash-card" key={job.id}><span className="history-icon"><AudioLines size={17} /></span><div><h3>{audioName(job)}</h3><p>{job.totalChunks} 个分片</p></div><button onClick={() => onRestoreAudio(job)}>恢复音频</button></article>)}</div>}
    </div>}
  </section>;
}

function LibraryView({ documents, onOpen, onDiscard, onImport, onCreate }: { documents: DocumentRecord[]; onOpen: (document: DocumentRecord) => void; onDiscard: (document: DocumentRecord) => void; onImport: () => void; onCreate: (title: string, content: string, language: DocumentRecord["language"]) => Promise<void> }) {
  const [language, setLanguage] = useState<"all" | "zh" | "en" | "ja">("all");
  const [length, setLength] = useState<"all" | "short" | "long">("all");
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newText, setNewText] = useState("");
  const detectLanguage = (document: DocumentRecord) => document.language ?? (/[぀-ヿ]/.test(document.text) ? "ja" : /[\u3400-\u9fff]/.test(document.text) ? "zh" : /[A-Za-z]/.test(document.text) ? "en" : "other");
  const visible = documents.filter((document) => (language === "all" || detectLanguage(document) === language) && (length === "all" || (length === "long" ? document.text.length >= 300 : document.text.length < 300)));

  async function saveNewDocument() {
    if (!newText.trim()) return;
    await onCreate(newTitle, newText.trim(), undefined);
    setCreating(false);
    setNewTitle("");
    setNewText("");
  }

  return <section className="page library-page">
    <header className="page-header"><div><p className="eyebrow">本地内容</p><h1>文档库</h1><p className="subtitle">文档文本只保存在这台设备。</p></div><div className="library-header-actions"><button className="secondary-button" onClick={() => setCreating(true)}><Plus size={17} />新建文档</button><button className="primary-button" onClick={onImport}><Plus size={17} />导入文档</button></div></header>
    <div className="library-filters"><div className="voice-tabs">{([['all','全部语言'],['zh','中文'],['en','英文'],['ja','日文']] as const).map(([id, label]) => <button key={id} className={language === id ? "active" : ""} onClick={() => setLanguage(id)}>{label}</button>)}</div><div className="voice-tabs">{([['all','全部篇幅'],['short','短文本'],['long','长文本']] as const).map(([id, label]) => <button key={id} className={length === id ? "active" : ""} onClick={() => setLength(id)}>{label}</button>)}</div></div>
    {creating && <div className="create-document-card"><div className="create-document-row"><input placeholder="文档标题" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} /><small className="document-language-auto">语言将根据文案自动识别</small></div><textarea autoFocus placeholder="在这里输入需要阅读的内容…" value={newText} onChange={(event) => setNewText(event.target.value)} /><div><small>{newText.length.toLocaleString()} 字</small><button onClick={() => setCreating(false)}>取消</button><button className="primary-button" disabled={!newText.trim()} onClick={() => void saveNewDocument()}>保存文档</button></div></div>}
    {visible.length ? <div className="document-library-grid">{visible.map((document) => <article key={document.id} className="document-library-card"><span className="document-icon"><FileText size={20} /></span><div><h2>{document.title}{document.isSample && <span className="sample-badge">示例</span>}</h2><p>{detectLanguage(document) === "zh" ? "中文" : detectLanguage(document) === "en" ? "英文" : detectLanguage(document) === "ja" ? "日文" : "其他"} · {document.text.length >= 300 ? "长文本" : "短文本"} · {document.text.length.toLocaleString()} 字</p></div><button onClick={() => onOpen(document)}>打开阅读</button>{!document.isSample && <button className="document-delete" aria-label={`删除 ${document.title}`} onClick={() => onDiscard(document)}><Trash2 size={15} /></button>}</article>)}</div> : <div className="library-empty"><div className="empty-illustration"><FileText size={34} /></div><h2>没有符合条件的文档</h2><p>请切换语言或篇幅筛选。</p></div>}
  </section>;
}

function formatTime(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }

export default App;
