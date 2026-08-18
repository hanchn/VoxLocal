import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFile, execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readlinkSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, platform, totalmem } from "node:os";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { z } from "zod";

type JobStatus = "queued" | "running" | "completed" | "failed" | "interrupted" | "cancelled";
type Job = {
  id: string;
  idempotencyKey?: string;
  status: JobStatus;
  source: "text" | "document";
  engineId: string;
  voiceId: string;
  outputPath: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
  stage?: string;
  progress?: number;
  completedChunks?: number;
  totalChunks?: number;
};

type Voice = {
  id: string;
  name: string;
  kind: "system" | "open" | "user";
  description: string;
  isDefault: boolean;
  status: "ready" | "unavailable";
  hints: readonly string[];
  referencePath?: string;
  referenceText?: string;
  speaker?: string;
  license?: string;
  language?: string;
};

interface SpeechEngine {
  id: string;
  name: string;
  priority: number;
  isAvailable(): boolean;
  synthesize(text: string, voice: Voice, outputPath: string, wordsPerMinute: number): Promise<void>;
}

const appRoot = join(homedir(), "Library", "Application Support", "VoxLocal");
const exportRoot = join(appRoot, "exports");
const jobsRoot = join(appRoot, "jobs");
const idempotencyRoot = join(appRoot, "idempotency");
for (const directory of [exportRoot, jobsRoot, idempotencyRoot]) mkdirSync(directory, { recursive: true });

const publicVoices: Voice[] = [
  { id: "qwen-vivian", name: "Vivian · 明亮女声", kind: "open", description: "Apache-2.0 开源中文女声，明亮年轻", isDefault: true, status: "ready", hints: [], speaker: "Vivian", license: "Apache-2.0" },
  { id: "qwen-serena", name: "Serena · 温柔女声", kind: "open", description: "Apache-2.0 开源中文女声，温暖柔和", isDefault: false, status: "ready", hints: [], speaker: "Serena", license: "Apache-2.0" },
  { id: "qwen-uncle-fu", name: "Uncle Fu · 醇厚男声", kind: "open", description: "Apache-2.0 开源中文男声，成熟低缓", isDefault: false, status: "ready", hints: [], speaker: "Uncle_Fu", license: "Apache-2.0" },
  { id: "qwen-dylan", name: "Dylan · 北京青年", kind: "open", description: "Apache-2.0 开源北京青年男声", isDefault: false, status: "ready", hints: [], speaker: "Dylan", license: "Apache-2.0" },
  { id: "qwen-eric", name: "Eric · 成都青年", kind: "open", description: "Apache-2.0 开源成都青年男声", isDefault: false, status: "ready", hints: [], speaker: "Eric", license: "Apache-2.0" },
  { id: "qwen-ryan", name: "Ryan · 律动男声", kind: "open", description: "Apache-2.0 开源英语男声，可跨语言朗读", isDefault: false, status: "ready", hints: [], speaker: "Ryan", license: "Apache-2.0" },
  { id: "qwen-aiden", name: "Aiden · 阳光男声", kind: "open", description: "Apache-2.0 开源美式男声，可跨语言朗读", isDefault: false, status: "ready", hints: [], speaker: "Aiden", license: "Apache-2.0" },
  { id: "qwen-ono-anna", name: "Ono Anna · 轻快女声", kind: "open", description: "Apache-2.0 开源日语女声，可跨语言朗读", isDefault: false, status: "ready", hints: [], speaker: "Ono_Anna", license: "Apache-2.0" },
  { id: "qwen-sohee", name: "Sohee · 温暖女声", kind: "open", description: "Apache-2.0 开源韩语女声，可跨语言朗读", isDefault: false, status: "ready", hints: [], speaker: "Sohee", license: "Apache-2.0" },
  { id: "kokoro-xiaobei", name: "小贝 · 轻量女声", kind: "open", description: "Apache-2.0 Kokoro 普通话女声", isDefault: false, status: "ready", hints: [], speaker: "zf_xiaobei", language: "z", license: "Apache-2.0" },
  { id: "kokoro-xiaoni", name: "小妮 · 轻量女声", kind: "open", description: "Apache-2.0 Kokoro 普通话女声", isDefault: false, status: "ready", hints: [], speaker: "zf_xiaoni", language: "z", license: "Apache-2.0" },
  { id: "kokoro-xiaoxiao", name: "晓晓 · 轻量女声", kind: "open", description: "Apache-2.0 Kokoro 普通话女声", isDefault: false, status: "ready", hints: [], speaker: "zf_xiaoxiao", language: "z", license: "Apache-2.0" },
  { id: "kokoro-xiaoyi", name: "小艺 · 轻量女声", kind: "open", description: "Apache-2.0 Kokoro 普通话女声", isDefault: false, status: "ready", hints: [], speaker: "zf_xiaoyi", language: "z", license: "Apache-2.0" },
  { id: "kokoro-yunjian", name: "云健 · 轻量男声", kind: "open", description: "Apache-2.0 Kokoro 普通话男声", isDefault: false, status: "ready", hints: [], speaker: "zm_yunjian", language: "z", license: "Apache-2.0" },
  { id: "kokoro-yunxi", name: "云希 · 轻量男声", kind: "open", description: "Apache-2.0 Kokoro 普通话男声", isDefault: false, status: "ready", hints: [], speaker: "zm_yunxi", language: "z", license: "Apache-2.0" },
  { id: "kokoro-yunxia", name: "云夏 · 轻量男声", kind: "open", description: "Apache-2.0 Kokoro 普通话男声", isDefault: false, status: "ready", hints: [], speaker: "zm_yunxia", language: "z", license: "Apache-2.0" },
  { id: "kokoro-yunyang", name: "云扬 · 轻量男声", kind: "open", description: "Apache-2.0 Kokoro 普通话男声", isDefault: false, status: "ready", hints: [], speaker: "zm_yunyang", language: "z", license: "Apache-2.0" },
];
const kokoroCatalog = `af_alloy af_aoede af_bella af_heart af_jessica af_kore af_nicole af_nova af_river af_sarah af_sky am_adam am_echo am_eric am_fenrir am_liam am_michael am_onyx am_puck am_santa bf_alice bf_emma bf_isabella bf_lily bm_daniel bm_fable bm_george bm_lewis ef_dora em_alex em_santa ff_siwis hf_alpha hf_beta hm_omega hm_psi if_sara im_nicola jf_alpha jf_gongitsune jf_nezumi jf_tebukuro jm_kumo pf_dora pm_alex pm_santa zf_xiaobei zf_xiaoni zf_xiaoxiao zf_xiaoyi zm_yunjian zm_yunxi zm_yunxia zm_yunyang`.split(" ");
const kokoroLanguages: Record<string, [string, string]> = { a: ["美式英语", "a"], b: ["英式英语", "b"], e: ["西班牙语", "e"], f: ["法语", "f"], h: ["印地语", "h"], i: ["意大利语", "i"], j: ["日语", "j"], p: ["葡萄牙语", "p"], z: ["普通话", "z"] };
for (const speaker of kokoroCatalog) {
  if (publicVoices.some((voice) => voice.speaker === speaker)) continue;
  const [languageName, language] = kokoroLanguages[speaker[0]] ?? ["多语言", speaker[0]];
  const name = speaker.slice(3).replace(/(^|_)(\w)/g, (_match, _prefix, letter: string) => ` ${letter.toUpperCase()}`).trim();
  publicVoices.push({ id: `kokoro-${speaker.replaceAll("_", "-")}`, name: `${name} · ${languageName}`, kind: "open", description: `Apache-2.0 Kokoro 轻量${languageName}音色`, isDefault: false, status: "unavailable", hints: [], speaker, language, license: "Apache-2.0" });
}

function publicVoiceReady(voice: Voice) {
  if (voice.id.startsWith("qwen-")) return existsSync(join(appRoot, "models", openVoiceModel().replace("/", "--"), "model.safetensors"));
  if (voice.id.startsWith("kokoro-") && voice.speaker) {
    const root = join(appRoot, "models", "mlx-community--Kokoro-82M-8bit");
    return existsSync(join(root, "kokoro-v1_0.safetensors")) && existsSync(join(root, "voices", `${voice.speaker}.safetensors`));
  }
  return true;
}

function loadVoices(): Voice[] {
  const directory = join(appRoot, "voices");
  const catalog = publicVoices.map((voice) => ({ ...voice, status: publicVoiceReady(voice) ? "ready" as const : "unavailable" as const }));
  if (!existsSync(directory)) return catalog;
  const saved = readdirSync(directory).filter((file) => file.endsWith(".json")).flatMap((file): Voice[] => {
    try {
      const profile = JSON.parse(readFileSync(join(directory, file), "utf8")) as { id: string; name: string; description?: string; recordingPath?: string; referenceText?: string };
      if (!profile.id || !profile.recordingPath || !existsSync(profile.recordingPath)) return [];
      return [{ id: profile.id, name: profile.name || "本地克隆音色", kind: "user", description: profile.description || "本地录音克隆音色", isDefault: false, status: "ready", hints: [], referencePath: profile.recordingPath, referenceText: profile.referenceText }];
    } catch { return []; }
  });
  return [...catalog, ...saved];
}

function availableMacVoices(): Array<{ name: string; locale: string }> {
  if (platform() !== "darwin") return [];
  try {
    return execFileSync("/usr/bin/say", ["-v", "?"], { encoding: "utf8" }).split("\n").flatMap((line) => {
      const match = line.match(/^(.*?)\s{2,}([a-z]{2}_[A-Z]{2})\s+#/);
      return match ? [{ name: match[1].trim(), locale: match[2] }] : [];
    });
  } catch {
    return [];
  }
}

function resolveMacVoice(voice: Voice): string | undefined {
  const installed = availableMacVoices();
  for (const hint of voice.hints) {
    const exact = installed.find((candidate) => candidate.name.toLowerCase() === hint.toLowerCase());
    if (exact) return exact.name;
  }
  return installed.find((candidate) => candidate.locale === "zh_CN")?.name ?? installed.find((candidate) => candidate.locale.startsWith("zh_"))?.name;
}

class MacSayEngine implements SpeechEngine {
  id = "macos-system";
  name = "macOS System Speech";
  priority = 10;

  isAvailable() {
    return platform() === "darwin" && existsSync("/usr/bin/say");
  }

  synthesize(text: string, voice: Voice, outputPath: string, wordsPerMinute: number) {
    return new Promise<void>((resolvePromise, rejectPromise) => {
      const temporary = `${outputPath}.aiff`;
      const args = ["-o", temporary, "-r", String(wordsPerMinute)];
      const voiceName = resolveMacVoice(voice);
      if (voiceName) args.push("-v", voiceName);
      args.push(text);
      execFile("/usr/bin/say", args, { maxBuffer: 1024 * 1024 }, (error) => {
        if (error) { rejectPromise(error); return; }
        execFile("/usr/bin/afconvert", ["-f", "WAVE", "-d", "LEI16@24000", "-c", "1", temporary, outputPath], (convertError) => {
          rmSync(temporary, { force: true });
          if (convertError) rejectPromise(convertError); else resolvePromise();
        });
      });
    });
  }
}

function recommendedModel() {
  const memoryGb = totalmem() / 1024 / 1024 / 1024;
  if (memoryGb >= 24) return "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-6bit";
  if (memoryGb >= 12) return "mlx-community/Qwen3-TTS-12Hz-0.6B-Base-8bit";
  return "mlx-community/Qwen3-TTS-12Hz-0.6B-Base-4bit";
}

function openVoiceModel() {
  return "mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit";
}

function splitText(text: string, limit = 240) {
  const sentences = text.match(/[^。！？；\n.!?]+[。！？；\n.!?]?/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current.length + sentence.length > limit && current.trim()) { chunks.push(current.trim()); current = ""; }
    current += sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function parseWave(buffer: Buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") throw new Error("Invalid WAV part");
  let offset = 12; let format: Buffer | undefined; let data: Buffer | undefined;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4); const size = buffer.readUInt32LE(offset + 4); const body = buffer.subarray(offset + 8, offset + 8 + size);
    if (id === "fmt ") format = body; if (id === "data") data = body;
    offset += 8 + size + (size % 2);
  }
  if (!format || !data) throw new Error("Incomplete WAV part");
  return { format, data };
}

function joinWaveFiles(paths: string[], outputPath: string) {
  const parsed = paths.map((path) => parseWave(readFileSync(path)));
  const format = parsed[0].format;
  const channels = format.readUInt16LE(2); const sampleRate = format.readUInt32LE(4); const overlapSamples = Math.max(channels, Math.round(sampleRate * 0.02) * channels);
  let samples: number[] = [];
  for (const part of parsed) {
    const next = Array.from({ length: part.data.length / 2 }, (_, index) => part.data.readInt16LE(index * 2));
    if (!samples.length) { samples = next; continue; }
    const overlap = Math.min(overlapSamples, samples.length, next.length); const start = samples.length - overlap;
    for (let index = 0; index < overlap; index += 1) { const ratio = (index + 1) / (overlap + 1); samples[start + index] = Math.max(-32768, Math.min(32767, Math.round(samples[start + index] * (1 - ratio) + next[index] * ratio))); }
    samples.push(...next.slice(overlap));
  }
  const data = Buffer.alloc(samples.length * 2); samples.forEach((sample, index) => data.writeInt16LE(sample, index * 2));
  const header = Buffer.alloc(12); header.write("RIFF", 0); header.writeUInt32LE(4 + 8 + format.length + 8 + data.length, 4); header.write("WAVE", 8);
  const fmtHeader = Buffer.alloc(8); fmtHeader.write("fmt ", 0); fmtHeader.writeUInt32LE(format.length, 4);
  const dataHeader = Buffer.alloc(8); dataHeader.write("data", 0); dataHeader.writeUInt32LE(data.length, 4);
  writeFileSync(outputPath, Buffer.concat([header, fmtHeader, format, dataHeader, data]));
}

class MlxCloneEngine implements SpeechEngine {
  id = "mlx-qwen3-tts"; name = "Qwen3-TTS MLX Open/Clone Voices"; priority = 20;
  private python = join(appRoot, "runtime", ".venv", "bin", "python");
  private runner = [join(appRoot, "runtime", "voxlocal_engine.py"), join(process.cwd(), "mcp", "voxlocal_engine.py"), resolve(process.cwd(), "../../backend/voxlocal_engine.py")].find(existsSync) ?? join(appRoot, "runtime", "voxlocal_engine.py");
  isAvailable() { return platform() === "darwin" && process.arch === "arm64" && existsSync(this.python) && existsSync(this.runner); }
  async synthesize(text: string, voice: Voice, outputPath: string) {
    if (voice.kind === "user" && !voice.referencePath) throw new Error(`Voice ${voice.id} has no reference recording.`);
    const temporary = join(appRoot, "temp", `mcp-${randomUUID()}`); mkdirSync(temporary, { recursive: true });
    const chunks = splitText(text); const parts = chunks.map((_, index) => join(temporary, `part-${String(index).padStart(5, "0")}.wav`));
    const modelId = voice.id.startsWith("kokoro-") ? "mlx-community/Kokoro-82M-8bit" : voice.kind === "open" ? openVoiceModel() : recommendedModel(); const requestPath = join(temporary, "request.json");
    writeFileSync(requestPath, JSON.stringify({ model_id: modelId, model_dir: join(appRoot, "models", modelId.replace("/", "--")), reference_audio: voice.referencePath, reference_text: voice.referenceText, speaker: voice.speaker, language: voice.language ?? "Chinese", chunks: chunks.map((chunk, index) => ({ text: chunk, output: parts[index] })) }, null, 2));
    await new Promise<void>((resolvePromise, rejectPromise) => {
      let chinaTimezone = false; try { chinaTimezone = /Asia\/(Shanghai|Chongqing|Hong_Kong)/.test(readlinkSync("/etc/localtime")); } catch { /* use Hugging Face */ }
      const child = spawn(this.python, [this.runner, "--request", requestPath], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...(chinaTimezone ? { VOXLOCAL_MODEL_SOURCE: "modelscope" } : {}) } }); let stderr = "";
      child.stdout.on("data", () => { /* Drain structured progress; persisted MCP progress is updated at job boundaries. */ });
      child.stderr.on("data", (data) => { stderr += String(data); });
      child.on("error", rejectPromise);
      child.on("close", (code) => code === 0 ? resolvePromise() : rejectPromise(new Error(stderr || `MLX engine exited with ${code}`)));
    });
    joinWaveFiles(parts, outputPath); rmSync(temporary, { recursive: true, force: true });
  }
}

const engineRegistry: SpeechEngine[] = [new MlxCloneEngine(), new MacSayEngine()];

function selectEngine(requested?: string, voice?: Voice): SpeechEngine {
  if (requested) {
    const exact = engineRegistry.find((engine) => engine.id === requested && engine.isAvailable());
    if (!exact) throw new Error(`Speech engine is unavailable: ${requested}`);
    return exact;
  }
  if (voice?.kind === "user" || voice?.kind === "open") {
    const clone = engineRegistry.find((engine) => engine.id === "mlx-qwen3-tts" && engine.isAvailable());
    if (!clone) throw new Error("The local MLX clone engine is not ready. Open VoxLocal once to install it.");
    return clone;
  }
  const system = engineRegistry.find((engine) => engine.id === "macos-system" && engine.isAvailable());
  if (system) return system;
  const available = engineRegistry.filter((engine) => engine.isAvailable()).sort((a, b) => b.priority - a.priority);
  if (!available[0]) throw new Error("No local speech engine is available.");
  return available[0];
}

function cleanForSpeech(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, "代码块。")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[*_~`>]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeStem(value: string): string {
  const stem = value.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "");
  return stem.slice(0, 80) || `voxlocal-${Date.now()}`;
}

function chooseOutput(outputDirectory: string | undefined, fileName: string | undefined, fallback: string): string {
  if (outputDirectory && !isAbsolute(outputDirectory)) throw new Error("outputDirectory must be an absolute path");
  const directory = outputDirectory ? resolve(outputDirectory) : exportRoot;
  mkdirSync(directory, { recursive: true });
  const stem = fileName ? safeStem(fileName.replace(/\.aiff?$/i, "")) : safeStem(fallback);
  return join(directory, `${stem}-${Date.now()}.wav`);
}

function jobPath(id: string) {
  return join(jobsRoot, `${id}.json`);
}

function persistJob(job: Job) {
  writeFileSync(jobPath(job.id), JSON.stringify(job, null, 2), "utf8");
}

function loadJob(id: string): Job | undefined {
  try {
    const job = JSON.parse(readFileSync(jobPath(id), "utf8")) as Job;
    job.source ??= "text"; job.engineId ??= "unknown"; job.voiceId ??= "warm"; job.createdAt ??= new Date(0).toISOString();
    if ((job.status === "running" || job.status === "queued") && existsSync(job.outputPath) && statSync(job.outputPath).size > 1024) {
      job.status = "completed";
      job.completedAt ??= new Date().toISOString();
      persistJob(job);
    }
    return job;
  } catch {
    return undefined;
  }
}

function idempotencyPath(key: string) {
  return join(idempotencyRoot, `${safeStem(key)}.json`);
}

function existingIdempotentJob(key?: string): Job | undefined {
  if (!key) return undefined;
  try {
    const { jobId } = JSON.parse(readFileSync(idempotencyPath(key), "utf8")) as { jobId: string };
    return loadJob(jobId);
  } catch {
    return undefined;
  }
}

function createJob(source: Job["source"], engineId: string, voiceId: string, outputPath: string, idempotencyKey?: string): Job {
  const job: Job = { id: randomUUID(), idempotencyKey, status: "queued", source, engineId, voiceId, outputPath, createdAt: new Date().toISOString(), stage: "准备生成", progress: 0, completedChunks: 0, totalChunks: 1 };
  persistJob(job);
  if (idempotencyKey) writeFileSync(idempotencyPath(idempotencyKey), JSON.stringify({ jobId: job.id }), "utf8");
  return job;
}

function startJob(job: Job, engine: SpeechEngine, voice: Voice, text: string, wordsPerMinute: number) {
  job.status = "running";
  job.stage = "正在本地生成";
  persistJob(job);
  void engine.synthesize(cleanForSpeech(text), voice, job.outputPath, wordsPerMinute).then(() => {
    job.status = "completed";
    job.stage = "生成完成";
    job.progress = 100;
    job.completedChunks = job.totalChunks;
    job.completedAt = new Date().toISOString();
    persistJob(job);
  }).catch((error: unknown) => {
    job.status = "failed";
    job.stage = "生成失败";
    job.error = error instanceof Error ? error.message : String(error);
    persistJob(job);
  });
}

const server = new McpServer(
  { name: "voxlocal", version: "0.1.0" },
  { instructions: "Turn text or local documents into private on-device audio. List voices when a voice is requested. Use an idempotency key, then poll get_job until generation finishes." },
);

server.registerTool("health_check", {
  title: "Check VoxLocal health",
  description: "Check local runtime health and discover available pluggable speech engines.",
  inputSchema: {},
  outputSchema: { healthy: z.boolean(), engines: z.array(z.object({ id: z.string(), name: z.string(), available: z.boolean(), priority: z.number() })) },
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
}, async () => {
  const engines = engineRegistry.map((engine) => ({ id: engine.id, name: engine.name, available: engine.isAvailable(), priority: engine.priority }));
  const healthy = engines.some((engine) => engine.available);
  return { structuredContent: { healthy, engines }, content: [{ type: "text", text: healthy ? "VoxLocal is ready." : "No local speech engine is ready." }] };
});

server.registerTool("list_voices", {
  title: "List local voices",
  description: "List selectable local voices for text and document narration.",
  inputSchema: {},
  outputSchema: { voices: z.array(z.object({ id: z.string(), name: z.string(), kind: z.string(), description: z.string(), isDefault: z.boolean(), status: z.string(), license: z.string().optional() })) },
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
}, async () => {
  const availableVoices = loadVoices().map(({ hints: _hints, referencePath: _referencePath, referenceText: _referenceText, speaker: _speaker, language: _language, ...voice }) => voice);
  return { structuredContent: { voices: availableVoices }, content: [{ type: "text", text: `Found ${availableVoices.length} local voices.` }] };
});

const commonInputs = {
  voiceId: z.string().default("qwen-vivian"),
  engineId: z.string().optional(),
  outputDirectory: z.string().optional(),
  fileName: z.string().optional(),
  wordsPerMinute: z.number().int().min(80).max(320).default(180),
  idempotencyKey: z.string().min(1).max(120).optional(),
};

server.registerTool("synthesize_text", {
  title: "Generate speech from text",
  description: "Start an idempotent local background job that converts generated or pasted text into audio.",
  inputSchema: { text: z.string().min(1).max(200000), ...commonInputs },
  outputSchema: { jobId: z.string(), status: z.string(), outputPath: z.string(), reused: z.boolean() },
  annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
}, async ({ text, voiceId, engineId, outputDirectory, fileName, wordsPerMinute, idempotencyKey }) => {
  const reused = existingIdempotentJob(idempotencyKey);
  if (reused) return { structuredContent: { jobId: reused.id, status: reused.status, outputPath: reused.outputPath, reused: true }, content: [{ type: "text", text: `Reused VoxLocal job ${reused.id}.` }] };
  const voice = loadVoices().find((item) => item.id === voiceId);
  if (!voice) throw new Error(`Unknown voiceId: ${voiceId}`);
  const engine = selectEngine(engineId, voice);
  const outputPath = chooseOutput(outputDirectory, fileName, "voxlocal-speech");
  const job = createJob("text", engine.id, voice.id, outputPath, idempotencyKey);
  startJob(job, engine, voice, text, wordsPerMinute);
  return { structuredContent: { jobId: job.id, status: job.status, outputPath, reused: false }, content: [{ type: "text", text: `Local speech job ${job.id} started.` }] };
});

server.registerTool("synthesize_document", {
  title: "Generate speech from a document",
  description: "Start an idempotent local background narration job for a UTF-8 text or Markdown document.",
  inputSchema: { documentPath: z.string(), ...commonInputs },
  outputSchema: { jobId: z.string(), status: z.string(), outputPath: z.string(), reused: z.boolean() },
  annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
}, async ({ documentPath, voiceId, engineId, outputDirectory, fileName, wordsPerMinute, idempotencyKey }) => {
  const reused = existingIdempotentJob(idempotencyKey);
  if (reused) return { structuredContent: { jobId: reused.id, status: reused.status, outputPath: reused.outputPath, reused: true }, content: [{ type: "text", text: `Reused VoxLocal job ${reused.id}.` }] };
  if (!isAbsolute(documentPath)) throw new Error("documentPath must be an absolute path");
  if (![".txt", ".md", ".markdown"].includes(extname(documentPath).toLowerCase())) throw new Error("This MVP supports .txt, .md, and .markdown documents.");
  const voice = loadVoices().find((item) => item.id === voiceId);
  if (!voice) throw new Error(`Unknown voiceId: ${voiceId}`);
  const engine = selectEngine(engineId, voice);
  const text = readFileSync(documentPath, "utf8");
  const outputPath = chooseOutput(outputDirectory ?? dirname(documentPath), fileName, basename(documentPath, extname(documentPath)));
  const job = createJob("document", engine.id, voice.id, outputPath, idempotencyKey);
  startJob(job, engine, voice, text, wordsPerMinute);
  return { structuredContent: { jobId: job.id, status: job.status, outputPath, reused: false }, content: [{ type: "text", text: `Local narration job ${job.id} started.` }] };
});

server.registerTool("get_job", {
  title: "Get speech job",
  description: "Check a persisted VoxLocal job after restarts and obtain its audio path.",
  inputSchema: { jobId: z.string().uuid() },
  outputSchema: { job: z.object({ id: z.string(), idempotencyKey: z.string().optional(), status: z.string(), source: z.string(), engineId: z.string(), voiceId: z.string(), outputPath: z.string().optional(), createdAt: z.string(), completedAt: z.string().optional(), error: z.string().optional(), stage: z.string().optional(), progress: z.number().optional(), completedChunks: z.number().optional(), totalChunks: z.number().optional() }) },
  annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
}, async ({ jobId }) => {
  const job = loadJob(jobId);
  if (!job) throw new Error(`Unknown job: ${jobId}`);
  return { structuredContent: { job }, content: [{ type: "text", text: job.status === "completed" ? `Audio ready at ${job.outputPath}` : `Job ${job.id} is ${job.status}.` }] };
});

async function main() {
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`VoxLocal MCP failed to start: ${message}\n`);
  process.exit(1);
});
