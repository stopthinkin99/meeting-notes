"use client";

import { MeetingMeta, Attendee, MeetingMode, Platform } from "@/types";
import { Button, Input, Card, SectionLabel } from "@/components/ui";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MeetingMetaFormProps {
  meta: MeetingMeta;
  mode: MeetingMode;
  onUpdateMeta: (patch: Partial<MeetingMeta>) => void;
  onAddAttendee: () => void;
  onUpdateAttendee: (id: string, patch: Partial<Attendee>) => void;
  onRemoveAttendee: (id: string) => void;
}

const PLATFORMS: { id: Platform; label: string; icon: string }[] = [
  { id: "googlemeet", label: "Google Meet", icon: "🎥" },
  { id: "zoom", label: "Zoom", icon: "🔵" },
  { id: "teams", label: "Teams", icon: "🟣" },
  { id: "other", label: "Other", icon: "🌐" },
];

export function MeetingMetaForm({
  meta,
  mode,
  onUpdateMeta,
  onAddAttendee,
  onUpdateAttendee,
  onRemoveAttendee,
}: MeetingMetaFormProps) {
  return (
    <Card>
      <SectionLabel>Meeting details</SectionLabel>

      {mode === "virtual" && (
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-2">Platform</p>
          <div className="grid grid-cols-4 gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                onClick={() => onUpdateMeta({ platform: p.id })}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border py-2.5 text-xs font-medium transition-all",
                  meta.platform === p.id
                    ? "border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                )}
              >
                <span className="text-base">{p.icon}</span>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="col-span-2">
          <label className="text-xs text-gray-500 mb-1 block">Topic / agenda</label>
          <Input
            value={meta.topic}
            onChange={(e) => onUpdateMeta({ topic: e.target.value })}
            placeholder="e.g. Digital Transformation Review"
          />
        </div>
        {mode === "inperson" && (
          <div className="col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">Venue</label>
            <Input
              value={meta.venue}
              onChange={(e) => onUpdateMeta({ venue: e.target.value })}
              placeholder="e.g. Main Conference Room"
            />
          </div>
        )}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Date</label>
          <Input
            type="date"
            value={meta.date}
            onChange={(e) => onUpdateMeta({ date: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Start time</label>
            <Input
              type="time"
              value={meta.timeStart}
              onChange={(e) => onUpdateMeta({ timeStart: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">End time</label>
            <Input
              type="time"
              value={meta.timeEnd}
              onChange={(e) => onUpdateMeta({ timeEnd: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Attendees */}
      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            {mode === "virtual" ? "Participants" : "Attendees"}
          </p>
          <Button size="sm" onClick={onAddAttendee}>
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>

        {meta.attendees.length === 0 ? (
          <p className="text-sm text-gray-400 py-2">
            Add attendees so the AI can label speakers correctly.
          </p>
        ) : (
          <div className="space-y-2">
            {meta.attendees.map((a, i) => (
              <div key={a.id} className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-medium text-gray-500 flex-shrink-0">
                  {(a.name && a.name.trim()) ? a.name.trim()[0].toUpperCase() : (i + 1)}
                </div>
                <Input
                  value={a.name}
                  onChange={(e) => onUpdateAttendee(a.id, { name: e.target.value })}
                  placeholder="Full name"
                  className="flex-1"
                />
                <Input
                  value={a.role}
                  onChange={(e) => onUpdateAttendee(a.id, { role: e.target.value })}
                  placeholder={mode === "virtual" ? "Email (optional)" : "Role / company"}
                  className="flex-1"
                />
                <button
                  onClick={() => onRemoveAttendee(a.id)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
