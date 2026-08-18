import { invoke } from "@tauri-apps/api/core";
import type { VoiceProfile } from "../types";

export type DeviceProfile = {
  architecture: string;
  memoryGb: number;
  performanceTier: "compact" | "balanced" | "quality";
  recommendedModel: string;
  chunkCharacters: number;
  systemConcurrency: number;
  cloneConcurrency: number;
};

export type SynthesisJob = {
  id: string;
  source: "text" | "document" | "preview" | "test";
  engineId: string;
  voiceId: string;
  createdAt: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | "interrupted";
  stage: string;
  progress: number;
  completedChunks: number;
  totalChunks: number;
  outputPath?: string;
  error?: string;
};

export type EngineStatus = {
  supported: boolean;
  ready: boolean;
  modelReady: boolean;
  runtimePath?: string;
  modelId: string;
  message: string;
};

type TauriBridgeWindow = Window & { __TAURI_INTERNALS__?: { invoke?: unknown } };
const inTauri = () => typeof (window as TauriBridgeWindow).__TAURI_INTERNALS__?.invoke === "function";
const requireTauri = () => {
  if (!inTauri()) throw new Error("本地音色需要在 VoxLocal 桌面窗口中使用，浏览器预览页无法调用本地模型");
};

export async function getDeviceProfile(): Promise<DeviceProfile> {
  if (!inTauri()) return { architecture: "browser", memoryGb: 8, performanceTier: "compact", recommendedModel: "mlx-community/Qwen3-TTS-12Hz-0.6B-Base-4bit", chunkCharacters: 160, systemConcurrency: 2, cloneConcurrency: 1 };
  return invoke<DeviceProfile>("device_profile");
}

export async function getEngineStatus(): Promise<EngineStatus> {
  if (!inTauri()) return { supported: false, ready: false, modelReady: false, modelId: "", message: "请在 VoxLocal 桌面应用中使用本地模型" };
  return invoke<EngineStatus>("engine_status");
}

export async function getPublicVoiceAvailability(voices: Array<{ id: string; speaker: string }>) {
  if (!inTauri()) return Object.fromEntries(voices.map((voice) => [voice.id, false]));
  return invoke<Record<string, boolean>>("public_voice_availability", { voices });
}

export async function downloadPublicVoice(voiceId: string, speaker: string) {
  requireTauri();
  return invoke<void>("download_public_voice", { voiceId, speaker });
}

export async function prepareEngine(): Promise<EngineStatus> {
  requireTauri();
  return invoke<EngineStatus>("prepare_ai_engine");
}

export async function persistRecording(recordingId: string, blob: Blob): Promise<string | undefined> {
  if (!inTauri()) return undefined;
  return invoke<string>("persist_voice_recording", { recordingId, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) });
}

export async function removePersistedRecording(path?: string) {
  if (!path || !inTauri()) return;
  return invoke<void>("delete_voice_recording", { path });
}

export async function persistVoiceProfile(profile: VoiceProfile) {
  if (!inTauri()) return;
  return invoke<void>("persist_voice_profile", { profile });
}

export async function listPersistedVoiceProfiles(): Promise<VoiceProfile[]> {
  if (!inTauri()) return [];
  return invoke<VoiceProfile[]>("list_voice_profiles");
}

export async function trashVoiceProfile(voiceId: string): Promise<VoiceProfile> {
  requireTauri();
  return invoke<VoiceProfile>("trash_voice_profile", { voiceId });
}

export async function listTrashVoiceProfiles(): Promise<VoiceProfile[]> {
  if (!inTauri()) return [];
  return invoke<VoiceProfile[]>("list_trash_voice_profiles");
}

export async function restoreVoiceProfile(voiceId: string): Promise<VoiceProfile> {
  requireTauri();
  return invoke<VoiceProfile>("restore_voice_profile", { voiceId });
}

export async function purgeVoiceTrash() {
  requireTauri();
  return invoke<void>("purge_voice_trash");
}

export async function startSynthesis(input: { text: string; title: string; voiceId: string; rate: number; referencePath?: string; referenceText?: string; speaker?: string; instruct?: string; language?: string }) {
  requireTauri();
  return invoke<SynthesisJob>("start_synthesis", { request: input });
}

export async function getSynthesisJob(jobId: string) {
  requireTauri();
  return invoke<SynthesisJob>("get_synthesis_job", { jobId });
}

export async function listSynthesisJobs() {
  if (!inTauri()) return [];
  return invoke<SynthesisJob[]>("list_synthesis_jobs");
}

export async function renameGeneratedAudio(jobId: string, newName: string) {
  requireTauri();
  return invoke<SynthesisJob>("rename_generated_audio", { jobId, newName });
}

export async function trashGeneratedAudio(jobId: string) {
  requireTauri();
  return invoke<SynthesisJob>("trash_generated_audio", { jobId });
}

export async function listTrashedAudioJobs() {
  if (!inTauri()) return [];
  return invoke<SynthesisJob[]>("list_trashed_audio_jobs");
}

export async function restoreTrashedAudio(jobId: string) {
  requireTauri();
  return invoke<SynthesisJob>("restore_trashed_audio", { jobId });
}

export async function purgeAudioTrash() {
  requireTauri();
  return invoke<void>("purge_audio_trash");
}

export async function cancelSynthesis(jobId: string) {
  requireTauri();
  return invoke<void>("cancel_synthesis_job", { jobId });
}

export async function readGeneratedAudio(path: string) {
  requireTauri();
  const bytes = await invoke<number[]>("read_audio_file", { path });
  return new Blob([new Uint8Array(bytes)], { type: "audio/wav" });
}

export async function readCachedVoicePreview(voiceId: string, text: string) {
  if (!inTauri()) return undefined;
  const bytes = await invoke<number[] | null>("read_voice_preview_cache", { voiceId, text });
  return bytes ? new Blob([new Uint8Array(bytes)], { type: "audio/wav" }) : undefined;
}

export async function cacheVoicePreview(sourcePath: string, voiceId: string, text: string) {
  requireTauri();
  return invoke<string>("cache_voice_preview", { sourcePath, voiceId, text });
}

export async function revealGeneratedAudio(path: string) {
  requireTauri();
  return invoke<void>("reveal_audio_file", { path });
}
