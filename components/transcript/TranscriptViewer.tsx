"use client";

import { TranscriptSegment } from "@/types";
import { PauseMarker } from "@/hooks/useRecorder";
import { getSpeakerColor, formatTime } from "@/lib/utils";
import { Card, SectionLabel } from "@/components/ui";
import { cn } from "@/lib/utils";

interface TranscriptViewerProps {
  segments: TranscriptSegment[];
  pauseMarkers?: PauseMarker[];
}

export function TranscriptViewer({ segments, pauseMarkers = [] }: TranscriptViewerProps) {
  if (segments.length === 0) return null;

  // Build unique speaker list for legend
  const speakerMap = new Map<string, number>();
  segments.forEach((s) => {
    if (!speakerMap.has(s.speaker)) speakerMap.set(s.speaker, s.speakerIndex);
  });

  // Build a merged list of segments + pause markers sorted by time
  type SegmentItem = { kind: "segment"; data: TranscriptSegment };
  type MarkerItem = { kind: "pause" | "resume"; time: number };
  type Item = SegmentItem | MarkerItem;

  const items: Item[] = [
    ...segments.map((s): SegmentItem => ({ kind: "segment", data: s })),
    ...pauseMarkers.map((m): MarkerItem => ({ kind: m.type, time: m.time })),
  ].sort((a, b) => {
    const timeA = a.kind === "segment" ? a.data.startTime : a.time;
    const timeB = b.kind === "segment" ? b.data.startTime : b.time;
    return timeA - timeB;
  });

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Transcript</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {[...speakerMap.entries()].map(([name, idx]) => {
            const c = getSpeakerColor(idx);
            return (
              <span key={name} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border", c.bg, c.text, c.border)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
                {name}
              </span>
            );
          })}
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
        {items.map((item, idx) => {
          if (item.kind === "pause") {
            return (
              <div key={`pause-${idx}`} className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-amber-200 dark:bg-amber-800" />
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400 whitespace-nowrap px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 dark:bg-amber-950 dark:border-amber-800">
                  ⏸ Meeting Paused
                </span>
                <div className="flex-1 h-px bg-amber-200 dark:bg-amber-800" />
              </div>
            );
          }

          if (item.kind === "resume") {
            return (
              <div key={`resume-${idx}`} className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-emerald-200 dark:bg-emerald-800" />
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800">
                  ▶ Meeting Resumed
                </span>
                <div className="flex-1 h-px bg-emerald-200 dark:bg-emerald-800" />
              </div>
            );
          }

          const seg = item.data;
          const c = getSpeakerColor(seg.speakerIndex);
          return (
            <div key={seg.id} className="flex gap-3">
              <span className="text-[11px] text-gray-400 tabular-nums mt-0.5 flex-shrink-0 w-10">
                {formatTime(seg.startTime)}
              </span>
              <div className="flex-1">
                <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold mb-1 border", c.bg, c.text, c.border)}>
                  {seg.speaker}
                </span>
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{seg.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}