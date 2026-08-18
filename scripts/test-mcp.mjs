import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const pluginRoot = resolve("plugins/voxlocal");
const tempRoot = mkdtempSync(join(tmpdir(), "voxlocal-mcp-test-"));
const client = new Client({ name: "voxlocal-test", version: "0.1.0" });
const transport = new StdioClientTransport({
  command: "node",
  args: [join(pluginRoot, "mcp/server.cjs")],
  cwd: pluginRoot,
});

function structured(result) {
  if (!result.structuredContent) throw new Error("Tool returned no structured content");
  return result.structuredContent;
}

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const expected = ["health_check", "list_voices", "synthesize_text", "synthesize_document", "get_job"];
  for (const name of expected) {
    if (!tools.tools.some((tool) => tool.name === name)) throw new Error(`Missing tool: ${name}`);
  }

  const health = structured(await client.callTool({ name: "health_check", arguments: {} }));
  if (!health.healthy) throw new Error("VoxLocal health check failed");

  const voiceResult = structured(await client.callTool({ name: "list_voices", arguments: {} }));
  if (!Array.isArray(voiceResult.voices) || voiceResult.voices.length < 1) throw new Error("No voices returned");

  const key = `integration-${Date.now()}`;
  const started = structured(await client.callTool({
    name: "synthesize_text",
    arguments: {
      text: "你好，这是一段完全在本地生成的测试语音。",
      voiceId: "qwen-vivian",
      outputDirectory: tempRoot,
      fileName: "integration-test",
      idempotencyKey: key,
    },
  }));

  let job;
  // Cold-starting the local MLX model can take more than eight seconds on a
  // busy Mac. Keep polling long enough to test the result instead of racing
  // model initialization.
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const result = structured(await client.callTool({ name: "get_job", arguments: { jobId: started.jobId } }));
    job = result.job;
    if (job.status === "completed" || job.status === "failed") break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  if (!job || job.status !== "completed") throw new Error(`Speech job did not complete: ${job?.status ?? "unknown"}`);
  if (!existsSync(job.outputPath) || statSync(job.outputPath).size < 1024) throw new Error("Generated audio is missing or empty");
  if (readFileSync(job.outputPath).toString("ascii", 0, 4) !== "RIFF") throw new Error("Generated audio is not WAV");

  const documentPath = join(tempRoot, "agent-document.md");
  writeFileSync(documentPath, "# Agent 文档\n\n这是由 Codex 生成后交给 VoxLocal 的文档语音测试。");
  const documentStarted = structured(await client.callTool({ name: "synthesize_document", arguments: { documentPath, voiceId: "qwen-serena", outputDirectory: tempRoot, fileName: "document-test" } }));
  let documentJob;
  for (let attempt = 0; attempt < 240; attempt += 1) {
    documentJob = structured(await client.callTool({ name: "get_job", arguments: { jobId: documentStarted.jobId } })).job;
    if (documentJob.status === "completed" || documentJob.status === "failed") break;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  if (!documentJob || documentJob.status !== "completed" || !existsSync(documentJob.outputPath)) throw new Error("Document narration did not complete");

  const reused = structured(await client.callTool({
    name: "synthesize_text",
    arguments: { text: "This text must not create another job.", idempotencyKey: key },
  }));
  if (!reused.reused || reused.jobId !== started.jobId) throw new Error("Idempotency check failed");

  process.stdout.write(`MCP integration passed with ${tools.tools.length} tools and ${voiceResult.voices.length} voices.\n`);
} finally {
  await client.close();
  rmSync(tempRoot, { recursive: true, force: true });
}
