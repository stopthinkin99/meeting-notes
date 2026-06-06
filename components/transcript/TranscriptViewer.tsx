"use client";

import { TranscriptSegment } from "@/types";
import { getSpeakerColor, formatTime } from "@/lib/utils";
import { Card, SectionLabel } from "@/components/ui";
import { cn } from "@/lib/utils";

interface TranscriptViewerProps {
  segments: TranscriptSegment[];
}

export function TranscriptViewer({ segments }: TranscriptViewerProps) {
  if (segments.length === 0) return null;

  // Build unique speaker list for legend
  const speakerMap = new Map<string, number>();
  segments.forEach((s) => {
    if (!speakerMap.has(s.speaker)) speakerMap.set(s.speaker, s.speakerIndex);
  });

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Transcript</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {[...speakerMap.entries()].map(([name, idx]) => {
            const c = getSpeakerColor(idx);
            return (
              <span
                key={name}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border",
                  c.bg, c.text, c.border
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
                {name}
              </span>
            );
          })}
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
        {segments.map((seg) => {
          const c = getSpeakerColor(seg.speakerIndex);
          return (
            <div key={seg.id} className="flex gap-3">
              <span className="text-[11px] text-gray-400 tabular-nums mt-0.5 flex-shrink-0 w-10">
                {formatTime(seg.startTime)}
              </span>
              <div className="flex-1">
                <span
                  className={cn(
                    "inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold mb-1 border",
                    c.bg, c.text, c.border
                  )}
                >
                  {seg.speaker}
                </span>
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                  {seg.text}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
