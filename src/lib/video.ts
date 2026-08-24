import { invoke } from "@tauri-apps/api/core";

export type VideoEngine = "still" | "wav2lip";

export interface VideoEngineStatus {
  ffmpegReady: boolean;
  wav2lipReady: boolean;
  wav2lipRoot?: string;
  message: string;
}

export interface PortraitAsset {
  path: string;
  fileName: string;
  updatedAt: string;
}

export interface ImportedAudioAsset {
  path: string;
  fileName: string;
}

export interface VideoJob {
  id: string;
  title: string;
  engine: VideoEngine;
  createdAt: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  stage: string;
  progress: number;
  outputPath?: string;
  error?: string;
}

const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const desktopOnly = () => { if (!inTauri()) throw new Error("视频合成需要在 VoxLocal 桌面应用中使用"); };

export async function getVideoEngineStatus(): Promise<VideoEngineStatus> {
  if (!inTauri()) return { ffmpegReady: false, wav2lipReady: false, message: "请打开 VoxLocal 桌面应用" };
  return invoke<VideoEngineStatus>("video_engine_status");
}

export async function getPortrait(): Promise<PortraitAsset | null> {
  if (!inTauri()) return null;
  return invoke<PortraitAsset | null>("get_video_portrait");
}

export async function savePortrait(file: File): Promise<PortraitAsset> {
  desktopOnly();
  return invoke<PortraitAsset>("persist_video_portrait", { fileName: file.name, bytes: Array.from(new Uint8Array(await file.arrayBuffer())) });
}

export async function removePortrait(): Promise<void> {
  desktopOnly();
  return invoke("delete_video_portrait");
}

export async function readPortrait(path: string): Promise<Blob> {
  desktopOnly();
  const bytes = await invoke<number[]>("read_video_asset", { path, kind: "portrait" });
  return new Blob([new Uint8Array(bytes)], { type: path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg" });
}

export async function importVideoAudio(file: File): Promise<ImportedAudioAsset> {
  desktopOnly();
  return invoke<ImportedAudioAsset>("persist_video_audio", { fileName: file.name, bytes: Array.from(new Uint8Array(await file.arrayBuffer())) });
}

export async function startVideo(input: { title: string; engine: VideoEngine; portraitPath: string; audioPath: string; synthesisJobId?: string }): Promise<VideoJob> {
  desktopOnly();
  return invoke<VideoJob>("start_video_job", { request: input });
}

export async function getVideoJob(jobId: string): Promise<VideoJob> {
  desktopOnly();
  return invoke<VideoJob>("get_video_job", { jobId });
}

export async function listVideoJobs(): Promise<VideoJob[]> {
  if (!inTauri()) return [];
  return invoke<VideoJob[]>("list_video_jobs");
}

export async function readVideo(path: string): Promise<Blob> {
  desktopOnly();
  const bytes = await invoke<number[]>("read_video_asset", { path, kind: "output" });
  return new Blob([new Uint8Array(bytes)], { type: "video/mp4" });
}

export async function revealVideo(path: string): Promise<void> {
  desktopOnly();
  return invoke("reveal_video_file", { path });
}
