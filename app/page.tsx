"use client";

import { useState } from "react";
import { MeetingMode } from "@/types";
import { useMeeting } from "@/hooks/useMeeting";
import { MeetingMetaForm } from "@/components/recorder/MeetingMetaForm";
import { RecorderPanel } from "@/components/recorder/RecorderPanel";
import { TranscriptViewer } from "@/components/transcript/TranscriptViewer";
import { MoMTable } from "@/components/mom/MoMTable";
import { ActionItems } from "@/components/mom/ActionItems";
import { Button, Card, SectionLabel } from "@/components/ui";
import { Mic, Monitor, FileText, Download, Copy, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { exportMoMAsText } from "@/lib/utils";

type AppTab = "inperson" | "virtual" | "minutes";

export default function Home() {
  const [activeTab, setActiveTab] = useState<AppTab>("inperson");
  const [mode, setMode] = useState<MeetingMode>("inperson");
  const [hasMoM, setHasMoM] = useState(false);
  const [copied, setCopied] = useState(false);

  const meeting = useMeeting();

  const handleTabSwitch = (tab: AppTab) => {
    setActiveTab(tab);
    if (tab === "inperson") setMode("inperson");
    else if (tab === "virtual") setMode("virtual");
  };

  const handleRecordingStop = async (blob: Blob, duration: number) => {
    const attendeeNames = meeting.meta.attendees.map((a) => a.name).filter(Boolean);
    await meeting.generateMoM(blob, attendeeNames);
    setHasMoM(true);
    setActiveTab("minutes");
  };

  const handleExport = () => {
    const data = meeting.getMeetingData(mode, 0);
    const text = exportMoMAsText(data);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MoM_${meeting.meta.topic || "meeting"}_${meeting.meta.date || new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    const data = meeting.getMeetingData(mode, 0);
    const text = exportMoMAsText(data);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tabs = [
    { id: "inperson" as AppTab, label: "In-person", icon: Mic },
    { id: "virtual" as AppTab, label: "Virtual", icon: Monitor },
    { id: "minutes" as AppTab, label: "Minutes", icon: FileText, badge: hasMoM },
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
              <Button size="sm" onClick={handleCopy}>
                <Copy className="h-3.5 w-3.5" />
                {copied ? "Copied!" : "Copy"}
              </Button>
              <Button size="sm" onClick={handleExport}>
                <Download className="h-3.5 w-3.5" />
                Export
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800/60 rounded-xl p-1">
          {tabs.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => handleTabSwitch(id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all",
                activeTab === id
                  ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
              {badge && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
            </button>
          ))}
        </div>

        {activeTab === "inperson" && (
          <div className="space-y-4">
            <MeetingMetaForm meta={meeting.meta} mode="inperson" onUpdateMeta={meeting.updateMeta} onAddAttendee={meeting.addAttendee} onUpdateAttendee={meeting.updateAttendee} onRemoveAttendee={meeting.removeAttendee} />
            <RecorderPanel mode="inperson" onStop={handleRecordingStop} onStartTime={(date, time) => meeting.updateMeta({ date, timeStart: time })} onStopTime={(time) => meeting.updateMeta({ timeEnd: time })} />
            {meeting.isGenerating && (
              <Card><div className="flex items-center gap-3 py-4"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /><div><p className="text-sm font-medium text-gray-700 dark:text-gray-300">Generating minutes...</p><p className="text-xs text-gray-400 mt-0.5">Transcribing audio, detecting speakers, and structuring your MoM</p></div></div></Card>
            )}
            {meeting.generateError && (
              <Card><div className="flex items-start gap-2 text-red-600"><AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /><p className="text-sm">{meeting.generateError}</p></div></Card>
            )}
          </div>
        )}

        {activeTab === "virtual" && (
          <div className="space-y-4">
            <MeetingMetaForm meta={meeting.meta} mode="virtual" onUpdateMeta={meeting.updateMeta} onAddAttendee={meeting.addAttendee} onUpdateAttendee={meeting.updateAttendee} onRemoveAttendee={meeting.removeAttendee} />
            <RecorderPanel mode="virtual" onStop={handleRecordingStop} onStartTime={(date, time) => meeting.updateMeta({ date, timeStart: time })} onStopTime={(time) => meeting.updateMeta({ timeEnd: time })} />
            {meeting.isGenerating && (
              <Card><div className="flex items-center gap-3 py-4"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /><div><p className="text-sm font-medium">Generating minutes...</p><p className="text-xs text-gray-400 mt-0.5">Processing audio, identifying speakers, structuring your MoM</p></div></div></Card>
            )}
          </div>
        )}

        {activeTab === "minutes" && (
          <div className="space-y-6">
            {!hasMoM && !meeting.isGenerating ? (
              <Card>
                <div className="py-8 text-center">
                  <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">No minutes yet</p>
                  <p className="text-xs text-gray-400 mb-4">Record a meeting first, then your minutes will appear here automatically.</p>
                  <Button onClick={() => setActiveTab("inperson")}>Start a recording</Button>
                </div>
              </Card>
            ) : meeting.isGenerating ? (
              <Card><div className="flex items-center gap-3 py-6"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /><div><p className="text-sm font-medium">Generating your minutes...</p><p className="text-xs text-gray-400 mt-0.5">This takes about 15–30 seconds</p></div></div></Card>
            ) : (
              <>
                <Card>
                  <SectionLabel>Meeting overview</SectionLabel>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4">
                    {meeting.meta.topic && <div className="col-span-2"><span className="text-gray-400 text-xs">Topic</span><p className="font-medium text-gray-900 dark:text-gray-100">{meeting.meta.topic}</p></div>}
                    {meeting.meta.date && <div><span className="text-gray-400 text-xs">Date</span><p className="text-gray-700 dark:text-gray-300">{meeting.meta.date}</p></div>}
                    {(meeting.meta.timeStart || meeting.meta.timeEnd) && <div><span className="text-gray-400 text-xs">Time</span><p className="text-gray-700 dark:text-gray-300">{meeting.meta.timeStart}{meeting.meta.timeEnd ? ` – ${meeting.meta.timeEnd}` : ""}</p></div>}
                    {meeting.meta.venue && <div><span className="text-gray-400 text-xs">Venue</span><p className="text-gray-700 dark:text-gray-300">{meeting.meta.venue}</p></div>}
                  </div>
                  {meeting.meta.attendees.length > 0 && (
                    <div><span className="text-gray-400 text-xs">Attendees</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {meeting.meta.attendees.map((a) => (
                          <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-0.5 text-xs text-gray-700 dark:text-gray-300">{a.name}{a.role ? ` · ${a.role}` : ""}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
                {meeting.summary && <Card><SectionLabel>Summary</SectionLabel><p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{meeting.summary}</p></Card>}
                <TranscriptViewer segments={meeting.transcript} />
                <Card><MoMTable rows={meeting.momRows} onUpdate={meeting.updateMomRow} onDelete={meeting.deleteMomRow} onMove={meeting.moveMomRow} onAdd={meeting.addMomRow} /></Card>
                <Card><ActionItems items={meeting.actionItems} onUpdate={meeting.updateActionItem} onDelete={meeting.deleteActionItem} onAdd={meeting.addActionItem} /></Card>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
