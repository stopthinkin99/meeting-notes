"use client";

import { useState, useCallback } from "react";
import {
  MeetingData,
  MeetingMeta,
  MoMRow,
  ActionItem,
  TranscriptSegment,
  Attendee,
} from "@/types";
import { generateId } from "@/lib/utils";

const defaultMeta: MeetingMeta = {
  topic: "",
  venue: "",
  date: new Date().toISOString().split("T")[0],
  timeStart: "",
  timeEnd: "",
  attendees: [],
};

export function useMeeting() {
  const [meta, setMeta] = useState<MeetingMeta>(defaultMeta);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [summary, setSummary] = useState("");
  const [momRows, setMomRows] = useState<MoMRow[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Meta
  const updateMeta = useCallback((patch: Partial<MeetingMeta>) => {
    setMeta((m) => ({ ...m, ...patch }));
  }, []);

  const addAttendee = useCallback((name = "", role = "") => {
    const attendee: Attendee = { id: generateId(), name: name ?? "", role: role ?? "" };
    setMeta((m) => ({ ...m, attendees: [...m.attendees, attendee] }));
    return attendee.id;
  }, []);

  const updateAttendee = useCallback((id: string, patch: Partial<Attendee>) => {
    setMeta((m) => ({
      ...m,
      attendees: m.attendees.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  }, []);

  const removeAttendee = useCallback((id: string) => {
    setMeta((m) => ({
      ...m,
      attendees: m.attendees.filter((a) => a.id !== id),
    }));
  }, []);

  // Transcript
  const setTranscriptData = useCallback((segs: TranscriptSegment[]) => {
    setTranscript(segs);
  }, []);

  // Generate MoM from transcript via API
  const generateMoM = useCallback(
    async (audioBlob: Blob, attendeeNames: string[]) => {
      setIsGenerating(true);
      setGenerateError(null);

      try {
        // Step 1: transcribe audio
        const formData = new FormData();
        formData.append("audio", audioBlob, "recording.webm");
        formData.append("attendees", JSON.stringify(attendeeNames));

        const transcribeRes = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });

        if (!transcribeRes.ok) {
          const err = await transcribeRes.json();
          throw new Error(err.error || "Transcription failed");
        }

        const { segments, rawText } = await transcribeRes.json();
        setTranscript(segments);

        // Step 2: generate MoM from transcript
        const momRes = await fetch("/api/generate-mom", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: rawText,
            segments,
            meta,
            attendeeNames,
          }),
        });

        if (!momRes.ok) {
          const err = await momRes.json();
          throw new Error(err.error || "MoM generation failed");
        }

        const { summary: s, momRows: rows, actionItems: actions } =
          await momRes.json();

        setSummary(s);
        setMomRows(rows);
        setActionItems(actions);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setGenerateError(msg);
      } finally {
        setIsGenerating(false);
      }
    },
    [meta]
  );

  // MoM rows CRUD
  const addMomRow = useCallback(() => {
    const row: MoMRow = {
      id: generateId(),
      pointNumber: momRows.length + 1,
      pointsDiscussed: "",
      contactPerson: "",
      dependency: "",
      priority: "",
      status: "Open",
    };
    setMomRows((r) => [...r, row]);
  }, [momRows.length]);

  const updateMomRow = useCallback((id: string, patch: Partial<MoMRow>) => {
    setMomRows((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  }, []);

  const deleteMomRow = useCallback((id: string) => {
    setMomRows((rows) => {
      const filtered = rows.filter((r) => r.id !== id);
      return filtered.map((r, i) => ({ ...r, pointNumber: i + 1 }));
    });
  }, []);

  const moveMomRow = useCallback((id: string, dir: "up" | "down") => {
    setMomRows((rows) => {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx === -1) return rows;
      const newIdx = dir === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= rows.length) return rows;
      const updated = [...rows];
      [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
      return updated.map((r, i) => ({ ...r, pointNumber: i + 1 }));
    });
  }, []);

  // Action items CRUD
  const addActionItem = useCallback(() => {
    const item: ActionItem = {
      id: generateId(),
      task: "",
      owner: "",
      dueDate: "",
      done: false,
    };
    setActionItems((a) => [...a, item]);
  }, []);

  const updateActionItem = useCallback(
    (id: string, patch: Partial<ActionItem>) => {
      setActionItems((items) =>
        items.map((a) => (a.id === id ? { ...a, ...patch } : a))
      );
    },
    []
  );

  const deleteActionItem = useCallback((id: string) => {
    setActionItems((items) => items.filter((a) => a.id !== id));
  }, []);

  const getMeetingData = useCallback(
    (mode: MeetingData["mode"], duration: number): MeetingData => ({
      meta,
      transcript,
      summary,
      momRows,
      actionItems,
      mode,
      recordingDuration: duration,
    }),
    [meta, transcript, summary, momRows, actionItems]
  );

  return {
    meta,
    transcript,
    summary,
    momRows,
    actionItems,
    isGenerating,
    generateError,
    updateMeta,
    addAttendee,
    updateAttendee,
    removeAttendee,
    setTranscriptData,
    generateMoM,
    addMomRow,
    updateMomRow,
    deleteMomRow,
    moveMomRow,
    addActionItem,
    updateActionItem,
    deleteActionItem,
    getMeetingData,
    setSummary,
  };
}
