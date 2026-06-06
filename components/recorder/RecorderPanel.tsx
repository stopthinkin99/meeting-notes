"use client";

import { useEffect } from "react";
import { Mic, Square, Pause, Play, AlertCircle } from "lucide-react";
import { useRecorder } from "@/hooks/useRecorder";
import { Button, Badge, Card, SectionLabel } from "@/components/ui";
import { formatDuration } from "@/lib/utils";
import { MeetingMode } from "@/types";

interface RecorderPanelProps {
  mode: MeetingMode;
  onStop: (blob: Blob, duration: number) => void;
  onStartTime?: (date: string, time: string) => void;
  onStopTime?: (time: string) => void;
}

export function RecorderPanel({ mode, onStop, onStartTime, onStopTime }: RecorderPanelProps) {
  const isVirtual = mode === "virtual";
  const { state, duration, audioBlob, error, start, pause, resume, stop, reset } =
    useRecorder({ captureSystemAudio: isVirtual, onStartTime, onStopTime });

  useEffect(() => {
    if (state === "stopped" && audioBlob) {
      onStop(audioBlob, duration);
    }
  }, [state, audioBlob]);

  const isIdle = state === "idle";
  const isRecording = state === "recording";
  const isPaused = state === "paused";
  const isStopped = state === "stopped";

  return (
    <Card>
      <SectionLabel>
        {isVirtual ? "System audio capture" : "Microphone recording"}
      </SectionLabel>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 mb-4 text-sm text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-400">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isVirtual && isIdle && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 mb-4 text-sm text-blue-700 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-400">
          <strong>How it works:</strong> Click start, then share your screen (or browser tab) with audio when prompted. The app captures both your mic and the meeting audio.
        </div>
      )}

      <div className="flex flex-col items-center gap-5 py-6">
        {/* Waveform animation */}
        {isRecording && (
          <div className="flex items-end gap-1 h-8">
            {[...Array(9)].map((_, i) => (
              <div
                key={i}
                className="w-1 bg-red-500 rounded-full"
                style={{
                  animation: `waveBar 0.8s ease-in-out infinite`,
                  animationDelay: `${i * 0.09}s`,
                  height: "4px",
                }}
              />
            ))}
          </div>
        )}

        {/* Timer */}
        <div className="flex items-center gap-3">
          <span className="text-4xl font-mono font-medium tabular-nums text-gray-900 dark:text-gray-100">
            {formatDuration(duration)}
          </span>
          {isRecording && <Badge variant="live">Recording</Badge>}
          {isPaused && <Badge variant="warning">Paused</Badge>}
          {isStopped && <Badge variant="success">Complete</Badge>}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {isIdle && (
            <button
              onClick={start}
              className="h-16 w-16 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-gray-700 transition-colors active:scale-95 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
              aria-label="Start recording"
            >
              <Mic className="h-7 w-7" />
            </button>
          )}

          {(isRecording || isPaused) && (
            <>
              <button
                onClick={isRecording ? pause : resume}
                className="h-12 w-12 rounded-full border-2 border-gray-300 text-gray-600 flex items-center justify-center hover:bg-gray-100 transition-colors dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                aria-label={isRecording ? "Pause" : "Resume"}
              >
                {isRecording ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>

              <button
                onClick={stop}
                className="h-14 w-14 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors active:scale-95"
                aria-label="Stop recording"
              >
                <Square className="h-6 w-6 fill-white" />
              </button>
            </>
          )}

          {isStopped && (
            <div className="flex gap-3">
              <Button onClick={reset}>Record again</Button>
              <Button variant="primary" onClick={() => audioBlob && onStop(audioBlob, duration)}>
                Generate minutes →
              </Button>
            </div>
          )}
        </div>

        {isIdle && (
          <p className="text-xs text-gray-400 text-center max-w-xs">
            {isVirtual
              ? "Captures all voices in your virtual meeting — no bot needed"
              : "Automatically detects and labels each speaker in the room"}
          </p>
        )}
      </div>

      <style jsx>{`
        @keyframes waveBar {
          0%, 100% { height: 4px; }
          50% { height: 28px; }
        }
      `}</style>
    </Card>
  );
}
