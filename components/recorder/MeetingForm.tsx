"use client";

import { MeetingMeta, Attendee } from "@/types";
import { Button, Input, Card, SectionLabel } from "@/components/ui";
import { Plus, X } from "lucide-react";

interface MeetingFormProps {
  meta: MeetingMeta;
  onUpdateMeta: (patch: Partial<MeetingMeta>) => void;
  onAddAttendee: () => void;
  onUpdateAttendee: (id: string, patch: Partial<Attendee>) => void;
  onRemoveAttendee: (id: string) => void;
}

export function MeetingForm({ meta, onUpdateMeta, onAddAttendee, onUpdateAttendee, onRemoveAttendee }: MeetingFormProps) {
  return (
    <Card>
      <SectionLabel>Meeting details</SectionLabel>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Topic / agenda</label>
          <Input value={meta.topic} onChange={e => onUpdateMeta({ topic: e.target.value })} placeholder="e.g. Q2 Planning, Product Review..." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Venue</label>
            <Input value={meta.venue} onChange={e => onUpdateMeta({ venue: e.target.value })} placeholder="e.g. Conference Room A" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Date</label>
            <Input type="date" value={meta.date} onChange={e => onUpdateMeta({ date: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Start time</label>
            <Input type="time" value={meta.timeStart} onChange={e => onUpdateMeta({ timeStart: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">End time</label>
            <Input type="time" value={meta.timeEnd} onChange={e => onUpdateMeta({ timeEnd: e.target.value })} />
          </div>
        </div>

        <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-500 font-medium">Attendees</label>
            <Button size="sm" onClick={onAddAttendee}><Plus className="h-3.5 w-3.5" /> Add</Button>
          </div>
          {meta.attendees.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">Add attendees so the AI can assign responsibilities correctly.</p>
          ) : (
            <div className="space-y-2">
              {meta.attendees.map((a, i) => (
                <div key={a.id} className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-medium text-gray-500 flex-shrink-0">
                    {(a.name?.trim()?.[0] || String(i + 1)).toUpperCase()}
                  </div>
                  <Input value={a.name} onChange={e => onUpdateAttendee(a.id, { name: e.target.value })} placeholder="Full name" className="flex-1" />
                  <Input value={a.role} onChange={e => onUpdateAttendee(a.id, { role: e.target.value })} placeholder="Role / company" className="flex-1" />
                  <button onClick={() => onRemoveAttendee(a.id)} className="text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}