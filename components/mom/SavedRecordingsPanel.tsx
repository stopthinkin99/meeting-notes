"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, FileAudio, Clock, RefreshCw, Play } from "lucide-react";
import { Button, Card, SectionLabel } from "@/components/ui";

interface StoredRecording {
  name: string;
  created_at: string;
  metadata: { size: number };
  publicUrl: string;
}

interface SavedRecordingsPanelProps {
  onGenerate: (blob: Blob, duration: number) => void;
  isGenerating: boolean;
}

export function SavedRecordingsPanel({ onGenerate, isGenerating }: SavedRecordingsPanelProps) {
  const [recordings, setRecordings] = useState<StoredRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StoredRecording | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadRecordings = useCallback(async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `${supabaseUrl}/storage/v1/object/list/meeting-recordings`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prefix: "",
            limit: 20,
            offset: 0,
            sortBy: { column: "created_at", order: "desc" },
          }),
        }
      );

      if (!res.ok) throw new Error("Failed to list recordings");
      const data = await res.json();

      const withUrls: StoredRecording[] = (data || [])
        .filter((f: StoredRecording) => f.name && f.name !== ".emptyFolderPlaceholder")
        .map((f: StoredRecording) => ({
          ...f,
          publicUrl: `${supabaseUrl}/storage/v1/object/public/meeting-recordings/${f.name}`,
        }));

      setRecordings(withUrls);
      if (withUrls.length > 0) setSelected(withUrls[0]);
    } catch (err) {
      console.error("Failed to load recordings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  const handleGenerate = async () => {
    if (!selected) return;
    setFetching(true);
    setFetchError(null);
    try {
      const res = await fetch(selected.publicUrl);
      if (!res.ok) throw new Error("Failed to fetch recording");
      const blob = await res.blob();
      onGenerate(blob, 0);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to fetch recording");
    } finally {
      setFetching(false);
    }
  };

  const formatDate = (iso: string) => {
    if (!iso) return "";
    return new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Saved recordings</SectionLabel>
        <button
          onClick={loadRecordings}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading recordings...</span>
        </div>
      ) : recordings.length === 0 ? (
        <div className="py-8 text-center">
          <FileAudio className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No recordings saved yet</p>
          <p className="text-xs text-gray-300 mt-1">Complete a recording and it will appear here</p>
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {recordings.map((rec, i) => (
            <button
              key={rec.name}
              onClick={() => setSelected(rec)}
              className={`w-full text-left flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all ${
                selected?.name === rec.name
                  ? "border-gray-900 bg-gray-50 dark:border-gray-100 dark:bg-gray-800"
                  : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"
              }`}
            >
              <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                selected?.name === rec.name
                  ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                  : "bg-gray-100 text-gray-500 dark:bg-gray-800"
              }`}>
                <FileAudio className="h-4 w-4" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {rec.name}
                  </p>
                  {i === 0 && (
                    <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                      Latest
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {rec.created_at && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(rec.created_at)}
                    </span>
                  )}
                  {rec.metadata?.size && (
                    <span className="text-xs text-gray-400">
                      {formatSize(rec.metadata.size)}
                    </span>
                  )}
                </div>
              </div>

              {selected?.name === rec.name && (
                <Play className="h-4 w-4 text-gray-900 dark:text-gray-100 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}

      {fetchError && (
        <p className="text-xs text-red-600 mb-3 text-center">{fetchError}</p>
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
            <>Generate minutes from {selected && recordings[0]?.name === selected.name ? "latest" : "selected"} recording →</>
          )}
        </Button>
      )}
    </Card>
  );
}