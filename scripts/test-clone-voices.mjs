import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const appRoot = join(homedir(), "Library", "Application Support", "VoxLocal");
const python = join(appRoot, "runtime", ".venv", "bin", "python");
const modelId = "mlx-community/Qwen3-TTS-12Hz-0.6B-Base-8bit";
const modelDir = join(appRoot, "models", modelId.replace("/", "--"));
const runner = resolve("backend/voxlocal_engine.py");
const runId = new Date().toISOString().replaceAll(":", "-").replace(".", "-");
const outputRoot = join(appRoot, "clone-tests", runId);
const referenceRoot = join(outputRoot, "references");
const voicesRoot = join(appRoot, "voices");
mkdirSync(referenceRoot, { recursive: true });
mkdirSync(voicesRoot, { recursive: true });

const referenceText = "清晨的阳光落在窗边，我打开一本喜欢的书。文字不只是信息，也保存着一个人的语气、节奏和温度。";
const targetText = "这是一次真实的本地音色克隆测试。同一段文字应该保留不同说话人的音色、节奏和声音质感。";
const cases = [
  { id: "voice-test-vivian", name: "Vivian · 测试克隆", color: "#c56b82", source: resolve("assets/public-voice-previews/qwen-vivian-8667a97679f883cdbb820584.wav") },
  { id: "voice-test-uncle-fu", name: "Uncle Fu · 测试克隆", color: "#647b72", source: resolve("assets/public-voice-previews/qwen-uncle-fu-c5c3cf472650f3f7b364c3a3.wav") },
  { id: "voice-test-xiaobei", name: "小贝 · 测试克隆", color: "#cf7b73", source: join(appRoot, "voice-previews", "kokoro-xiaobei-6a45ae47d0be4a745c1fbc18.wav") },
];

const results = [];
for (const item of cases) {
  if (!existsSync(item.source)) throw new Error(`Missing reference audio: ${item.source}`);
  const reference = join(referenceRoot, `${item.id}-${basename(item.source)}`);
  const output = join(outputRoot, `${item.id}.wav`);
  const requestPath = join(outputRoot, `${item.id}.json`);
  const persistedReference = join(voicesRoot, `${item.id}.wav`);
  copyFileSync(item.source, reference);
  copyFileSync(item.source, persistedReference);
  writeFileSync(join(voicesRoot, `${item.id}.json`), JSON.stringify({
    id: item.id,
    name: item.name,
    kind: "user",
    description: "由现有音色录音创建的克隆能力测试",
    accent: "普通话",
    color: item.color,
    createdAt: new Date().toISOString(),
    recordingId: item.id,
    recordingPath: persistedReference,
    referenceText,
    optimized: true,
    status: "ready",
  }, null, 2));
  writeFileSync(requestPath, JSON.stringify({
    model_id: modelId,
    model_dir: modelDir,
    reference_audio: reference,
    reference_text: referenceText,
    chunks: [{ text: targetText, output }],
  }, null, 2));
  const generated = spawnSync(python, [runner, "--request", requestPath], { encoding: "utf8", timeout: 300_000 });
  if (generated.status !== 0) throw new Error(generated.stdout || generated.stderr || `${item.name} clone failed`);
  const wave = readFileSync(output);
  if (wave.toString("ascii", 0, 4) !== "RIFF" || statSync(output).size < 10_000) throw new Error(`${item.name} did not produce a valid WAV`);
  results.push({ id: item.id, name: item.name, reference: persistedReference, output, bytes: statSync(output).size });
  process.stdout.write(`${item.name}: ${output}\n`);
}

writeFileSync(join(outputRoot, "results.json"), JSON.stringify({ referenceText, targetText, results }, null, 2));
process.stdout.write(`Clone comparison complete: ${outputRoot}\n`);
