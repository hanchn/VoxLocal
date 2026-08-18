import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const appRoot = join(homedir(), "Library", "Application Support", "VoxLocal");
const python = join(appRoot, "runtime", ".venv", "bin", "python");
const runner = resolve("backend/voxlocal_engine.py");
const modelId = "mlx-community/Kokoro-82M-8bit";
const modelDir = join(appRoot, "models", modelId.replace("/", "--"));
const temporary = mkdtempSync(join(tmpdir(), "voxlocal-kokoro-"));
const downloadRequest = join(temporary, "download.json");
writeFileSync(downloadRequest, JSON.stringify({ model_id: modelId, model_dir: modelDir, speaker: "zf_xiaobei" }));
let result = spawnSync(python, [runner, "--download-request", downloadRequest], { encoding: "utf8", timeout: 300_000 });
if (result.status !== 0) throw new Error(result.stderr || result.stdout || "Kokoro download failed");
if (!existsSync(join(modelDir, "kokoro-v1_0.safetensors")) || !existsSync(join(modelDir, "voices", "zf_xiaobei.safetensors"))) throw new Error("On-demand Kokoro files are incomplete");

const output = join(temporary, "xiaobei.wav");
const request = join(temporary, "request.json");
writeFileSync(request, JSON.stringify({ model_id: modelId, model_dir: modelDir, speaker: "zf_xiaobei", language: "z", chunks: [{ text: "这是按需下载的轻量音色。", output }] }));
result = spawnSync(python, [runner, "--request", request], { encoding: "utf8", timeout: 180_000 });
if (result.status !== 0) throw new Error(result.stderr || result.stdout || "Kokoro generation failed");
const wave = readFileSync(output);
if (wave.length < 1_024 || wave.toString("ascii", 0, 4) !== "RIFF") throw new Error("Kokoro output is not a valid WAV");
console.log(`Kokoro on-demand integration passed: ${output}`);
