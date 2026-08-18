import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const appRoot = join(process.env.HOME, "Library", "Application Support", "VoxLocal");
const python = join(appRoot, "runtime", ".venv", "bin", "python");
const modelId = "mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit";
const directory = mkdtempSync(join(tmpdir(), "voxlocal-open-voice-"));
const vivianOutput = join(directory, "vivian.wav");
const uncleFuOutput = join(directory, "uncle-fu.wav");
const request = join(directory, "request.json");
writeFileSync(request, JSON.stringify({
  model_id: modelId,
  model_dir: join(appRoot, "models", modelId.replace("/", "--")),
  language: "Chinese",
  chunks: [
    { text: "开源音色库已经在本地准备完成。", speaker: "Vivian", output: vivianOutput },
    { text: "开源音色库已经在本地准备完成。", speaker: "Uncle_Fu", output: uncleFuOutput },
  ],
}, null, 2));

const result = spawnSync(python, [resolve("backend/voxlocal_engine.py"), "--request", request], { encoding: "utf8", timeout: 180_000 });
if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Runner exited with ${result.status}`);
const vivian = readFileSync(vivianOutput);
const uncleFu = readFileSync(uncleFuOutput);
for (const wave of [vivian, uncleFu]) {
  if (wave.length < 1_024 || wave.toString("ascii", 0, 4) !== "RIFF" || wave.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Open voice test did not create a valid WAV file");
  }
}
if (vivian.equals(uncleFu)) throw new Error("Vivian and Uncle Fu unexpectedly produced identical audio");
console.log(`Distinct open voices passed: ${vivianOutput} and ${uncleFuOutput}`);
