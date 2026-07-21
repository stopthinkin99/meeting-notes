import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 5);
}

export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

// Save MoM to localStorage
export function saveMoMToLocal(result: import("@/types").MeetingResult) {
  try {
    const existing = loadMoMHistory();
    const updated = [result, ...existing].slice(0, 10); // keep last 10
    localStorage.setItem("meetingmind_history", JSON.stringify(updated));
  } catch {}
}

// Load MoM history from localStorage
export function loadMoMHistory(): import("@/types").MeetingResult[] {
  try {
    const raw = localStorage.getItem("meetingmind_history");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Auto-download audio file to device
export function downloadAudioFile(blob: Blob, mimeType: string) {
  const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("webm") ? "webm" : "ogg";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `meeting-${timestamp}.${ext}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return fileName;
}