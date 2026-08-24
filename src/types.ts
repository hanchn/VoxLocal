export type View = "reader" | "voices" | "record" | "library" | "history" | "video" | "ppt" | "trash";

export type VoiceKind = "system" | "open" | "user";

export interface VoiceProfile {
  id: string;
  name: string;
  kind: VoiceKind;
  description: string;
  accent: string;
  color: string;
  createdAt?: string;
  recordingId?: string;
  recordingPath?: string;
  referenceText?: string;
  speaker?: string;
  license?: string;
  source?: string;
  language?: string;
  previewCached?: boolean;
  optimized?: boolean;
  status: "ready" | "recorded" | "downloadable" | "downloading";
}

export interface DocumentRecord {
  id: string;
  title: string;
  type: "text" | "markdown" | "pdf" | "word" | "epub";
  text: string;
  createdAt: string;
  language?: "zh" | "en" | "ja" | "other";
  isSample?: boolean;
}
