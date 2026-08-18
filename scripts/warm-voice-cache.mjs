import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const previewText = "清晨的阳光落在窗边，我打开一本喜欢的书。文字不只是信息，也保存着一个人的语气、节奏和温度。";
const voices = [
  ...[["qwen-vivian", "Vivian"], ["qwen-serena", "Serena"], ["qwen-uncle-fu", "Uncle_Fu"], ["qwen-dylan", "Dylan"], ["qwen-eric", "Eric"], ["qwen-ryan", "Ryan"], ["qwen-aiden", "Aiden"], ["qwen-ono-anna", "Ono_Anna"], ["qwen-sohee", "Sohee"]]
    .map(([id, speaker]) => ({ id, speaker, language: "Chinese", modelId: "mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit" })),
  ...[["kokoro-xiaobei", "zf_xiaobei"], ["kokoro-xiaoni", "zf_xiaoni"], ["kokoro-xiaoxiao", "zf_xiaoxiao"], ["kokoro-xiaoyi", "zf_xiaoyi"], ["kokoro-yunjian", "zm_yunjian"], ["kokoro-yunxi", "zm_yunxi"], ["kokoro-yunxia", "zm_yunxia"], ["kokoro-yunyang", "zm_yunyang"]]
    .map(([id, speaker]) => ({ id, speaker, language: "z", modelId: "mlx-community/Kokoro-82M-8bit" })),
];
const appRoot = join(homedir(), "Library", "Application Support", "VoxLocal");
const cacheRoot = join(appRoot, "voice-previews");
const modelId = "mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit";
mkdirSync(cacheRoot, { recursive: true });

function cachePath(voiceId) {
  const digest = createHash("sha256").update("v1\0").update(voiceId).update("\0").update(previewText).digest("hex").slice(0, 24);
  return join(cacheRoot, `${voiceId}-${digest}.wav`);
}

for (const modelId of [...new Set(voices.map((voice) => voice.modelId))]) {
  const missing = voices.filter((voice) => voice.modelId === modelId && !existsSync(cachePath(voice.id)));
  if (!missing.length) continue;
  const requestPath = join(cacheRoot, `.warm-${Date.now()}.json`);
  writeFileSync(requestPath, JSON.stringify({
    model_id: modelId,
    model_dir: join(appRoot, "models", modelId.replace("/", "--")),
    language: missing[0].language,
    chunks: missing.map((voice) => ({ text: previewText, speaker: voice.speaker, output: cachePath(voice.id) })),
  }, null, 2));
  const result = spawnSync(join(appRoot, "runtime", ".venv", "bin", "python"), [resolve("backend/voxlocal_engine.py"), "--request", requestPath], { encoding: "utf8", timeout: 300_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Cache warmup exited with ${result.status}`);
}

for (const voice of voices) {
  const wave = readFileSync(cachePath(voice.id));
  if (wave.length < 1_024 || wave.toString("ascii", 0, 4) !== "RIFF") throw new Error(`Invalid preview cache for ${voice.id}`);
}
console.log(`Voice preview cache ready: ${voices.length} files in ${cacheRoot}`);
