"use client";

import { useEffect, useState } from "react";
import { CloudUpload, Play, Loader2, Clock, FileAudio } from "lucide-react";
import { listRecordings, fetchRecordingBlob, SavedRecording } from "@/lib/supabase";
import { Button, Card, SectionLabel } from "@/components/ui";
import { formatDuration } from "@/lib/utils";

interface SavedRecordingsPanelProps {
  onGenerate: (blob: Blob, duration: number) => void;
  isGenerating: boolean;
}

export function SavedRecordingsPanel({ onGenerate, isGenerating }: SavedRecordingsPanelProps) {
  const [recordings, setRecordings] = useState<SavedRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SavedRecording | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    loadRecordings();
  }, []);

  const loadRecordings = async () => {
    setLoading(true);
    const data = await listRecordings();
    setRecordings(data);
    // Auto-select the latest one
    if (data.length > 0) setSelected(data[0]);
    setLoading(false);
  };

  const handleGenerate = async () => {
    if (!selected) return;
    setFetching(true);
    const blob = await fetchRecordingBlob(selected.file_url);
    setFetching(false);
    if (blob) {
      onGenerate(blob, selected.duration);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Saved recordings</SectionLabel>
        <button onClick={loadRecordings} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 justify-center text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading recordings...</span>
        </div>
      ) : recordings.length === 0 ? (
        <div className="py-8 text-center">
          <CloudUpload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No recordings saved yet</p>
          <p className="text-xs text-gray-300 mt-1">Complete a recording and it will appear here</p>
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {recordings.map((rec, i) => (
            <button
              key={rec.id}
              onClick={() => setSelected(rec)}
              className={`w-full text-left flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all ${
                selected?.id === rec.id
                  ? "border-gray-900 bg-gray-50 dark:border-gray-100 dark:bg-gray-800"
                  : "border-gray-200 hover:border-gray-300 dark:border-gray-700"
              }`}
            >
              <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                selected?.id === rec.id ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900" : "bg-gray-100 text-gray-500 dark:bg-gray-800"
              }`}>
                <FileAudio className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {rec.file_name}
                  </p>
                  {i === 0 && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full flex-shrink-0">
                      Latest
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDate(rec.created_at)}
                  </span>
                  {rec.file_size > 0 && (
                    <span className="text-xs text-gray-400">{formatFileSize(rec.file_size)}</span>
                  )}
                </div>
              </div>
              {selected?.id === rec.id && (
                <Play className="h-4 w-4 text-gray-900 dark:text-gray-100 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}

      {recordings.length > 0 && (
        <Button
          variant="primary"
          className="w-full"
          onClick={handleGenerate}
          disabled={!selected || fetching || isGenerating}
        >
          {fetching ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Fetching recording...</>
          ) : isGenerating ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Generating minutes...</>
          ) : (
            <>Generate minutes from {selected ? "selected" : "latest"} recording →</>
          )}
        </Button>
      )}
    </Card>
  );
}