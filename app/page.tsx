"use client";

import { useState, useCallback, useEffect } from "react";
import { MeetingMode, MeetingMeta, MoMRow, ActionItem, MeetingResult } from "@/types";
import { MeetingForm } from "@/components/recorder/MeetingForm";
import { RecorderPanel } from "@/components/recorder/RecorderPanel";
import { MoMTable } from "@/components/mom/MoMTable";
import { ActionItems } from "@/components/mom/ActionItems";
import { Button, Card, SectionLabel } from "@/components/ui";
import {
  Mic, Monitor, FileText, Download, Copy,
  Loader2, AlertCircle, History, Trash2,
} from "lucide-react";
import { cn, generateId, saveMoMToLocal, loadMoMHistory, formatDuration } from "@/lib/utils";

type AppTab = "inperson" | "virtual" | "minutes" | "history";

const defaultMeta = (): MeetingMeta => ({
  topic: "",
  venue: "",
  date: new Date().toISOString().split("T")[0],
  timeStart: "",
  timeEnd: "",
  attendees: [],
});

export default function Home() {
  const [activeTab, setActiveTab] = useState<AppTab>("inperson");
  const [mode, setMode] = useState<MeetingMode>("inperson");
  const [meta, setMeta] = useState<MeetingMeta>(defaultMeta());
  const [summary, setSummary] = useState("");
  const [momRows, setMomRows] = useState<MoMRow[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [hasMoM, setHasMoM] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<MeetingResult[]>([]);
  useEffect(() => {setHistory(loadMoMHistory());}, []);

  const updateMeta = useCallback((patch: Partial<MeetingMeta>) => {
    setMeta(m => ({ ...m, ...patch }));
  }, []);

  const addAttendee = useCallback(() => {
    setMeta(m => ({ ...m, attendees: [...m.attendees, { id: generateId(), name: "", role: "" }] }));
  }, []);

  const updateAttendee = useCallback((id: string, patch: { name?: string; role?: string }) => {
    setMeta(m => ({ ...m, attendees: m.attendees.map(a => a.id === id ? { ...a, ...patch } : a) }));
  }, []);

  const removeAttendee = useCallback((id: string) => {
    setMeta(m => ({ ...m, attendees: m.attendees.filter(a => a.id !== id) }));
  }, []);

  const handleRecordingStop = async (blob: Blob, duration: number) => {
    setIsGenerating(true);
    setGenerateError(null);

    try {
      // Step 1: Transcribe + translate to English
      const formData = new FormData();
      formData.append("audio", blob, "recording.mp4");

      const transcribeRes = await fetch("/api/transcribe", { method: "POST", body: formData });
      if (!transcribeRes.ok) {
        const err = await transcribeRes.json();
        throw new Error(err.error || "Transcription failed");
      }
      const { text } = await transcribeRes.json();

      if (!text?.trim()) throw new Error("No speech detected. Please try recording again.");

      // Step 2: Generate MoM
      const momRes = await fetch("/api/generate-mom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text, meta }),
      });
      if (!momRes.ok) {
        const err = await momRes.json();
        throw new Error(err.error || "MoM generation failed");
      }
      const { summary: s, momRows: rows, actionItems: actions } = await momRes.json();

      setSummary(s);
      setMomRows(rows);
      setActionItems(actions);
      setHasMoM(true);
      setActiveTab("minutes");

      // Save to localStorage history
      const result: MeetingResult = {
        meta, summary: s, momRows: rows, actionItems: actions,
        generatedAt: new Date().toISOString(),
      };
      saveMoMToLocal(result);
      setHistory(loadMoMHistory());
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsGenerating(false);
    }
  };

  // MoM CRUD
  const addMomRow = () => {
    setMomRows(r => [...r, { id: generateId(), pointNumber: r.length + 1, pointsDiscussed: "", contactPerson: "", dependency: "", priority: "", status: "Open" }]);
  };
  const updateMomRow = (id: string, patch: Partial<MoMRow>) => setMomRows(r => r.map(row => row.id === id ? { ...row, ...patch } : row));
  const deleteMomRow = (id: string) => setMomRows(r => r.filter(row => row.id !== id).map((row, i) => ({ ...row, pointNumber: i + 1 })));
  const moveMomRow = (id: string, dir: "up" | "down") => {
    setMomRows(rows => {
      const idx = rows.findIndex(r => r.id === id);
      if (idx === -1) return rows;
      const newIdx = dir === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= rows.length) return rows;
      const updated = [...rows];
      [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
      return updated.map((r, i) => ({ ...r, pointNumber: i + 1 }));
    });
  };

  // Action items CRUD
  const addActionItem = () => setActionItems(a => [...a, { id: generateId(), task: "", owner: "", dueDate: "", done: false }]);
  const updateActionItem = (id: string, patch: Partial<ActionItem>) => setActionItems(a => a.map(item => item.id === id ? { ...item, ...patch } : item));
  const deleteActionItem = (id: string) => setActionItems(a => a.filter(item => item.id !== id));

  const exportText = () => {
    const lines = [
      "MINUTES OF MEETING",
      "==================",
      `Topic:  ${meta.topic || "—"}`,
      `Date:   ${meta.date || "—"}`,
      `Time:   ${meta.timeStart || "—"} – ${meta.timeEnd || "—"}`,
      `Venue:  ${meta.venue || "—"}`,
      `Attendees: ${meta.attendees.map(a => a.name).filter(Boolean).join(", ") || "—"}`,
      "",
      "SUMMARY",
      "-------",
      summary,
      "",
      "MINUTES",
      "-------",
      ...momRows.map(r => `${r.pointNumber}. ${r.pointsDiscussed}\n   Contact: ${r.contactPerson || "—"} | Dependency: ${r.dependency} | Priority: ${r.priority} | Status: ${r.status}`),
      "",
      "ACTION ITEMS",
      "------------",
      ...actionItems.map((a, i) => `${i + 1}. ${a.task}\n   Owner: ${a.owner || "—"} | Due: ${a.dueDate} | ${a.done ? "✓ Done" : "○ Open"}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MoM_${meta.topic || "meeting"}_${meta.date || "today"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyText = async () => {
    const lines = [`Topic: ${meta.topic || "—"}`, `Date: ${meta.date}`, ``, `Summary: ${summary}`, ``, `Minutes:`, ...momRows.map(r => `${r.pointNumber}. ${r.pointsDiscussed}`)];
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const loadFromHistory = (result: MeetingResult) => {
    setMeta(result.meta);
    setSummary(result.summary);
    setMomRows(result.momRows);
    setActionItems(result.actionItems);
    setHasMoM(true);
    setActiveTab("minutes");
  };

  const tabs = [
    { id: "inperson" as AppTab, label: "In-person", icon: Mic },
    { id: "virtual" as AppTab, label: "Virtual", icon: Monitor },
    { id: "minutes" as AppTab, label: "Minutes", icon: FileText, badge: hasMoM },
    { id: "history" as AppTab, label: "History", icon: History, badge: history.length > 0 },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-gray-900 dark:bg-gray-100 flex items-center justify-center">
              <Mic className="h-4 w-4 text-white dark:text-gray-900" />
            </div>
            <span className="font-semibold text-gray-900 dark:text-gray-100">MeetingMind</span>
          </div>
          {hasMoM && (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={copyText}><Copy className="h-3.5 w-3.5" />{copied ? "Copied!" : "Copy"}</Button>
              <Button size="sm" onClick={exportText}><Download className="h-3.5 w-3.5" />Export</Button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800/60 rounded-xl p-1">
          {tabs.map(({ id, label, icon: Icon, badge }) => (
            <button key={id} onClick={() => { setActiveTab(id); if (id === "inperson") setMode("inperson"); if (id === "virtual") setMode("virtual"); }}
              className={cn("flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-all",
                activeTab === id ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300")}>
              <Icon className="h-4 w-4" />{label}
              {badge && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
            </button>
          ))}
        </div>

        {/* In-person / Virtual tabs */}
        {(activeTab === "inperson" || activeTab === "virtual") && (
          <div className="space-y-4">
            <MeetingForm meta={meta} onUpdateMeta={updateMeta} onAddAttendee={addAttendee} onUpdateAttendee={updateAttendee} onRemoveAttendee={removeAttendee} />
            <RecorderPanel
              mode={activeTab === "virtual" ? "virtual" : "inperson"}
              onStop={handleRecordingStop}
              onStartTime={(date, time) => updateMeta({ date, timeStart: time })}
              onStopTime={(time) => updateMeta({ timeEnd: time })}
            />
            {isGenerating && (
              <Card>
                <div className="flex items-center gap-3 py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Generating minutes...</p>
                    <p className="text-xs text-gray-400 mt-0.5">Transcribing audio → translating → structuring MoM. Large files may take 30–60 seconds.</p>
                  </div>
                </div>
              </Card>
            )}
            {generateError && (
              <Card>
                <div className="flex items-start gap-2 text-red-600">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <p className="text-sm">{generateError}</p>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Minutes tab */}
        {activeTab === "minutes" && (
          <div className="space-y-6">
            {!hasMoM && !isGenerating ? (
              <Card>
                <div className="py-8 text-center">
                  <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">No minutes yet</p>
                  <p className="text-xs text-gray-400 mb-4">Record a meeting first — minutes will appear here automatically.</p>
                  <Button onClick={() => setActiveTab("inperson")}>Start a recording</Button>
                </div>
              </Card>
            ) : isGenerating ? (
              <Card>
                <div className="flex items-center gap-3 py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  <div>
                    <p className="text-sm font-medium">Generating your minutes...</p>
                    <p className="text-xs text-gray-400 mt-0.5">This takes 15–60 seconds depending on recording length</p>
                  </div>
                </div>
              </Card>
            ) : (
              <>
                {/* Meeting overview */}
                <Card>
                  <SectionLabel>Meeting overview</SectionLabel>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4">
                    {meta.topic && <div className="col-span-2"><span className="text-gray-400 text-xs">Topic</span><p className="font-medium text-gray-900 dark:text-gray-100">{meta.topic}</p></div>}
                    {meta.date && <div><span className="text-gray-400 text-xs">Date</span><p className="text-gray-700 dark:text-gray-300">{meta.date}</p></div>}
                    {(meta.timeStart || meta.timeEnd) && <div><span className="text-gray-400 text-xs">Time</span><p className="text-gray-700 dark:text-gray-300">{meta.timeStart}{meta.timeEnd ? ` – ${meta.timeEnd}` : ""}</p></div>}
                    {meta.venue && <div><span className="text-gray-400 text-xs">Venue</span><p className="text-gray-700 dark:text-gray-300">{meta.venue}</p></div>}
                  </div>
                  {meta.attendees.length > 0 && (
                    <div><span className="text-gray-400 text-xs">Attendees</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {meta.attendees.map(a => (
                          <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-0.5 text-xs text-gray-700 dark:text-gray-300">
                            {a.name}{a.role ? ` · ${a.role}` : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>

                {/* Summary */}
                {summary && (
                  <Card><SectionLabel>Summary</SectionLabel>
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{summary}</p>
                  </Card>
                )}

                {/* MoM Table */}
                <Card><MoMTable rows={momRows} onUpdate={updateMomRow} onDelete={deleteMomRow} onMove={moveMomRow} onAdd={addMomRow} /></Card>

                {/* Action items */}
                <Card><ActionItems items={actionItems} onUpdate={updateActionItem} onDelete={deleteActionItem} onAdd={addActionItem} /></Card>
              </>
            )}
          </div>
        )}

        {/* History tab */}
        {activeTab === "history" && (
          <div className="space-y-4">
            {history.length === 0 ? (
              <Card>
                <div className="py-8 text-center">
                  <History className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">No meeting history yet</p>
                  <p className="text-xs text-gray-300 mt-1">Completed meetings will appear here</p>
                </div>
              </Card>
            ) : (
              history.map((result, i) => (
                <Card key={i}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {result.meta.topic || "Untitled meeting"}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {result.meta.date} {result.meta.timeStart && `· ${result.meta.timeStart}`}
                        {result.meta.attendees.length > 0 && ` · ${result.meta.attendees.map(a => a.name).filter(Boolean).join(", ")}`}
                      </p>
                      {result.summary && (
                        <p className="text-xs text-gray-500 mt-2 line-clamp-2">{result.summary}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        <span>{result.momRows.length} points</span>
                        <span>{result.actionItems.length} actions</span>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => loadFromHistory(result)} className="ml-3 flex-shrink-0">
                      View
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}