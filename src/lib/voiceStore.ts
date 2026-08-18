import type { DocumentRecord, VoiceProfile } from "../types";

const DB_NAME = "voxlocal";
const DB_VERSION = 2;
const RECORDINGS = "recordings";
const DOCUMENTS = "documents";
const PROFILE_KEY = "voxlocal.voiceProfiles";
const DEFAULT_VOICE_KEY = "voxlocal.defaultVoice";
const VOICE_ORDER_KEY = "voxlocal.voiceOrder";
const FAVORITE_VOICES_KEY = "voxlocal.favoriteVoices";
const PINNED_VOICES_KEY = "voxlocal.pinnedVoices";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECORDINGS)) {
        db.createObjectStore(RECORDINGS);
      }
      if (!db.objectStoreNames.contains(DOCUMENTS)) {
        db.createObjectStore(DOCUMENTS, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDocument(document: DocumentRecord): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DOCUMENTS, "readwrite");
    tx.objectStore(DOCUMENTS).put(document);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadDocuments(): Promise<DocumentRecord[]> {
  const db = await openDatabase();
  const result = await new Promise<DocumentRecord[]>((resolve, reject) => {
    const request = db.transaction(DOCUMENTS, "readonly").objectStore(DOCUMENTS).getAll();
    request.onsuccess = () => resolve(request.result as DocumentRecord[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DOCUMENTS, "readwrite");
    tx.objectStore(DOCUMENTS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function saveRecording(id: string, blob: Blob): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(RECORDINGS, "readwrite");
    tx.objectStore(RECORDINGS).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getRecording(id: string): Promise<Blob | undefined> {
  const db = await openDatabase();
  const result = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = db.transaction(RECORDINGS, "readonly").objectStore(RECORDINGS).get(id);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

export async function deleteRecording(id: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(RECORDINGS, "readwrite");
    tx.objectStore(RECORDINGS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export function loadUserProfiles(): VoiceProfile[] {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "[]") as VoiceProfile[];
  } catch {
    return [];
  }
}

export function saveUserProfiles(profiles: VoiceProfile[]): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profiles));
}

export function loadDefaultVoice(fallback: string): string {
  return localStorage.getItem(DEFAULT_VOICE_KEY) ?? fallback;
}

export function saveDefaultVoice(id: string): void {
  localStorage.setItem(DEFAULT_VOICE_KEY, id);
}

export function loadVoiceOrder(): string[] {
  try {
    return JSON.parse(localStorage.getItem(VOICE_ORDER_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function saveVoiceOrder(ids: string[]): void {
  localStorage.setItem(VOICE_ORDER_KEY, JSON.stringify(ids));
}

function loadVoiceIds(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export const loadFavoriteVoices = () => loadVoiceIds(FAVORITE_VOICES_KEY);
export const loadPinnedVoices = () => loadVoiceIds(PINNED_VOICES_KEY);
export const saveFavoriteVoices = (ids: string[]) => localStorage.setItem(FAVORITE_VOICES_KEY, JSON.stringify(ids));
export const savePinnedVoices = (ids: string[]) => localStorage.setItem(PINNED_VOICES_KEY, JSON.stringify(ids));
