"use client";

import { useEffect, useRef } from "react";
import { Mic, Square, Pause, Play, AlertCircle, CloudUpload, Check, Upload } from "lucide-react";
import { useRecorder, PauseMarker } from "@/hooks/useRecorder";
import { Button, Badge, Card, SectionLabel } from "@/components/ui";
import { formatDuration } from "@/lib/utils";
import { MeetingMode } from "@/types";

interface RecorderPanelProps {
  mode: MeetingMode;
  topic: string;
  onStop: (blob: Blob, duration: number, pauseMarkers: PauseMarker[]) => void;
  onStartTime?: (date: string, time: string) => void;
  onStopTime?: (time: string) => void;
}

export function RecorderPanel({ mode, topic, onStop, onStartTime, onStopTime }: RecorderPanelProps) {
  const isVirtual = mode === "virtual";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    state, duration, audioBlob, error,
    pauseMarkers, uploadedRecording, isUploading,
    start, pause, resume, stop, reset,
  } = useRecorder({ captureSystemAudio: isVirtual, onStartTime, onStopTime, topic });

  useEffect(() => {
    if (state === "stopped" && audioBlob) {
      onStop(audioBlob, duration, pauseMarkers);
    }
  }, [state, audioBlob]);

  const isIdle = state === "idle";
  const isRecording = state === "recording";
  const isPaused = state === "paused";
  const isStopped = state === "stopped";

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onStop(file, 0, []);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Card>
      <SectionLabel>
        {isVirtual ? "System audio capture" : "Microphone recording"}
      </SectionLabel>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 mb-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isVirtual && isIdle && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 mb-4 text-sm text-blue-700">
          <strong>How it works:</strong> Click start, then share your screen or tab with audio when prompted.
        </div>
      )}

      <div className="flex flex-col items-center gap-5 py-6">
        {/* Waveform */}
        {isRecording && (
          <div className="flex items-end gap-1 h-8">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="w-1 bg-red-500 rounded-full"
                style={{ animation: `waveBar 0.8s ease-in-out infinite`, animationDelay: `${i * 0.09}s`, height: "4px" }} />
            ))}
          </div>
        )}

        {isPaused && (
          <div className="text-sm text-amber-600 font-medium bg-amber-50 border border-amber-200 rounded-full px-4 py-1.5">
            ⏸ Meeting paused — press Resume when ready
          </div>
        )}

        {/* Timer */}
        <div className="flex items-center gap-3">
          <span className="text-4xl font-mono font-medium tabular-nums text-gray-900 dark:text-gray-100">
            {formatDuration(duration)}
          </span>
          {isRecording && <Badge variant="live">Recording</Badge>}
          {isPaused && <Badge variant="warning">Paused</Badge>}
          {isStopped && <Badge variant="success">Meeting ended</Badge>}
        </div>

        {/* Pause markers summary */}
        {(isRecording || isPaused || isStopped) && pauseMarkers.filter(m => m.type === "pause").length > 0 && (
          <p className="text-xs text-gray-400">
            {pauseMarkers.filter(m => m.type === "pause").length} break{pauseMarkers.filter(m => m.type === "pause").length > 1 ? "s" : ""} taken
          </p>
        )}

        {/* Controls */}
        <div className="flex items-center gap-3">
          {isIdle && (
            <button onClick={start}
              className="h-16 w-16 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-gray-700 transition-colors active:scale-95 dark:bg-gray-100 dark:text-gray-900"
              aria-label="Start recording">
              <Mic className="h-7 w-7" />
            </button>
          )}

          {(isRecording || isPaused) && (
            <div className="flex items-center gap-3">
              {/* Pause / Resume */}
              <button
                onClick={isRecording ? pause : resume}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full border-2 border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-50 transition-colors dark:border-gray-600 dark:text-gray-300"
                aria-label={isRecording ? "Pause meeting" : "Resume meeting"}>
                {isRecording ? <><Pause className="h-4 w-4" /> Pause</> : <><Play className="h-4 w-4" /> Resume</>}
              </button>

              {/* Stop — only show if recording or paused */}
              <button onClick={stop}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-red-500 text-white font-medium text-sm hover:bg-red-600 transition-colors active:scale-95"
                aria-label="End meeting">
                <Square className="h-4 w-4 fill-white" /> End meeting
              </button>
            </div>
          )}

          {isStopped && (
            <Button onClick={reset}>Start new recording</Button>
          )}
        </div>

        {/* Upload status */}
        {isStopped && (
          <div className="w-full max-w-sm">
            {isUploading && (
              <div className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 px-4 py-2.5 text-sm text-blue-700">
                <CloudUpload className="h-4 w-4 animate-pulse flex-shrink-0" />
                <span>Saving recording to cloud...</span>
              </div>
            )}
            {!isUploading && uploadedRecording && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-700">
                <Check className="h-4 w-4 flex-shrink-0" />
                <div>
                  <p className="font-medium">Recording saved to cloud</p>
                  <p className="text-xs text-emerald-600 mt-0.5">{uploadedRecording.file_name}</p>
                </div>
              </div>
            )}
            {!isUploading && !uploadedRecording && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>Cloud save failed — recording only in memory</span>
              </div>
            )}
          </div>
        )}

        {isIdle && (
          <p className="text-xs text-gray-400 text-center max-w-xs">
            Use <strong>Pause</strong> for breaks — recording continues seamlessly when you resume. <strong>End meeting</strong> when done.
          </p>
        )}
      </div>

      {/* Re-upload saved file */}
      {isIdle && (
        <div className="border-t border-gray-100 dark:border-gray-800 pt-4 mt-2">
          <p className="text-xs text-gray-400 text-center mb-3">
            Or upload a previously saved recording
          </p>
          <div className="flex justify-center">
            <Button size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" />
              Upload audio file
            </Button>
          </div>
          <input ref={fileInputRef} type="file" accept="audio/*,.mp4,.webm,.ogg,.m4a"
            className="hidden" onChange={handleFileUpload} />
        </div>
      )}

      <style jsx>{`
        @keyframes waveBar { 0%, 100% { height: 4px; } 50% { height: 28px; } }
      `}</style>
    </Card>
  );
}