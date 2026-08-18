import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const catalog = JSON.parse(readFileSync(resolve("resources/catalog.json"), "utf8"));
const modelRoot = join(homedir(), "Library", "Application Support", "VoxLocal", "models");
const command = process.argv[2] ?? "list";
const resourceId = process.argv[3];
const speaker = process.argv[4];

const directoryFor = (modelId) => join(modelRoot, modelId.replace("/", "--"));
const modelReady = (model) => model.id === "kokoro"
  ? existsSync(join(directoryFor(model.modelId), "kokoro-v1_0.safetensors"))
  : existsSync(join(directoryFor(model.modelId), "model.safetensors"));

if (command === "list" || command === "status") {
  for (const model of catalog.models) {
    const installed = modelReady(model);
    const voiceCount = model.id === "kokoro" ? (model.speakers ?? []).filter((voice) => existsSync(join(directoryFor(model.modelId), "voices", `${voice}.safetensors`))).length : undefined;
    process.stdout.write(`${installed ? "✓" : "○"} ${model.id}\n  ${model.modelId}\n  ${model.purpose}${voiceCount === undefined ? "" : ` · 已下载 ${voiceCount}/${model.speakers.length} 个音色`}\n`);
  }
  process.exit(0);
}

if (command !== "download" || !resourceId) {
  process.stderr.write("用法：npm run resources -- list | status | download <资源ID> [Kokoro音色名|--all]\n");
  process.exit(1);
}

const resource = catalog.models.find((model) => model.id === resourceId);
if (!resource) throw new Error(`未知资源：${resourceId}`);
if (resource.id === "kokoro" && speaker && speaker !== "--all" && !resource.speakers.includes(speaker)) throw new Error(`未知 Kokoro 音色：${speaker}`);

const patterns = resource.id === "kokoro"
  ? ["config.json", "kokoro-v1_0.safetensors", ".gitattributes", ...(speaker === "--all" ? ["voices/*.safetensors"] : speaker ? [`voices/${speaker}.safetensors`] : [])]
  : [];
const downloader = `
import json, sys
from huggingface_hub import snapshot_download
model_id, target, patterns = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
kwargs = dict(repo_id=model_id, local_dir=target, max_workers=2)
if patterns: kwargs['allow_patterns'] = patterns
snapshot_download(**kwargs)
print(target)
`;
const uv = resolve("vendor/uv");
const result = spawnSync(uv, ["run", "--with", "huggingface-hub", "python", "-c", downloader, resource.modelId, directoryFor(resource.modelId), JSON.stringify(patterns)], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
process.stdout.write(`资源下载完成：${resource.id}${speaker ? ` / ${speaker}` : ""}\n`);
