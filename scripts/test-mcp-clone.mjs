import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const pluginRoot = resolve("plugins/voxlocal");
const appRoot = join(homedir(), "Library", "Application Support", "VoxLocal");
const voicesRoot = join(appRoot, "voices");
const voiceId = `voice-integration-${Date.now()}`;
const referenceAiff = join(tmpdir(), `${voiceId}.aiff`);
const referencePath = join(voicesRoot, `${voiceId}.wav`);
const metadataPath = join(voicesRoot, `${voiceId}.json`);
const outputRoot = join(tmpdir(), `${voiceId}-output`);
mkdirSync(voicesRoot, { recursive: true });
mkdirSync(outputRoot, { recursive: true });
execFileSync("/usr/bin/say", ["-v", "Tingting", "-o", referenceAiff, "清晨的阳光落在窗边，我打开一本喜欢的书。"]);
execFileSync("/usr/bin/afconvert", ["-f", "WAVE", "-d", "LEI16@24000", "-c", "1", referenceAiff, referencePath]);
writeFileSync(metadataPath, JSON.stringify({ id: voiceId, name: "Integration Clone", description: "Automated clone test", recordingPath: referencePath, referenceText: "清晨的阳光落在窗边，我打开一本喜欢的书。" }));

const client = new Client({ name: "voxlocal-clone-test", version: "0.1.0" });
const transport = new StdioClientTransport({ command: "node", args: [join(pluginRoot, "mcp/server.cjs")], cwd: pluginRoot });
const structured = (result) => result.structuredContent ?? (() => { throw new Error("Missing structured content"); })();

try {
  await client.connect(transport);
  const listed = structured(await client.callTool({ name: "list_voices", arguments: {} }));
  if (!listed.voices.some((voice) => voice.id === voiceId && voice.kind === "user")) throw new Error("Temporary cloned voice was not discovered");
  const started = structured(await client.callTool({ name: "synthesize_text", arguments: { text: "这是 Codex 通过 VoxLocal 生成的克隆语音。", voiceId, outputDirectory: outputRoot, fileName: "clone-integration" } }));
  let job;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    job = structured(await client.callTool({ name: "get_job", arguments: { jobId: started.jobId } })).job;
    if (job.status === "completed" || job.status === "failed") break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  if (!job || job.status !== "completed") throw new Error(job?.error || "Clone MCP job did not complete");
  if (!existsSync(job.outputPath) || statSync(job.outputPath).size < 10_000 || readFileSync(job.outputPath).toString("ascii", 0, 4) !== "RIFF") throw new Error("Clone MCP output is not a valid WAV");
  process.stdout.write(`MCP cloned-voice integration passed: ${job.outputPath}\n`);
} finally {
  await client.close();
  for (const path of [referenceAiff, referencePath, metadataPath]) rmSync(path, { force: true });
  rmSync(outputRoot, { recursive: true, force: true });
}
