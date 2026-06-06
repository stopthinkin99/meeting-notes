import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export const SPEAKER_COLORS = [
  { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-200", dot: "bg-blue-500" },
  { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-200", dot: "bg-emerald-500" },
  { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-200", dot: "bg-amber-500" },
  { bg: "bg-rose-100", text: "text-rose-800", border: "border-rose-200", dot: "bg-rose-500" },
  { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-200", dot: "bg-purple-500" },
  { bg: "bg-cyan-100", text: "text-cyan-800", border: "border-cyan-200", dot: "bg-cyan-500" },
];

export function getSpeakerColor(index: number) {
  return SPEAKER_COLORS[index % SPEAKER_COLORS.length];
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function exportMoMAsText(data: import("@/types").MeetingData): string {
  const { meta, summary, momRows, actionItems, transcript } = data;

  const lines: string[] = [
    "MINUTES OF MEETING",
    "==================",
    "",
    `Topic:   ${meta.topic}`,
    `Venue:   ${meta.venue || "Virtual"}`,
    `Date:    ${meta.date}`,
    `Time:    ${meta.timeStart} to ${meta.timeEnd}`,
    "",
    "Attendees:",
    ...meta.attendees.map((a) => `  - ${a.name}${a.role ? ` (${a.role})` : ""}`),
    "",
    "SUMMARY",
    "-------",
    summary,
    "",
    "POINTS DISCUSSED",
    "----------------",
  ];

  momRows.forEach((row, i) => {
    lines.push(
      `${i + 1}. ${row.pointsDiscussed}`,
      `   Contact: ${row.contactPerson}`,
      `   Dependency: ${row.dependency}`,
      `   Priority: ${row.priority}  |  Status: ${row.status}`,
      ""
    );
  });

  lines.push("ACTION ITEMS", "------------");
  actionItems.forEach((item, i) => {
    lines.push(
      `${i + 1}. ${item.task}`,
      `   Owner: ${item.owner}  |  Due: ${item.dueDate}  |  ${item.done ? "✓ Done" : "○ Open"}`,
      ""
    );
  });

  if (transcript.length > 0) {
    lines.push("TRANSCRIPT", "----------");
    transcript.forEach((seg) => {
      lines.push(`[${formatTime(seg.startTime)}] ${seg.speaker}: ${seg.text}`);
    });
  }

  return lines.join("\n");
}
