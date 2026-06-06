"use client";

import { useState, useRef, useCallback } from "react";

export type RecordingState = "idle" | "recording" | "paused" | "stopped";

interface UseRecorderOptions {
  onChunk?: (blob: Blob) => void;
  captureSystemAudio?: boolean;
  onStartTime?: (date: string, time: string) => void;
  onStopTime?: (time: string) => void;
}

export function useRecorder(options: UseRecorderOptions = {}) {
  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedFileName, setSavedFileName] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>("audio/mp4");

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Auto-download the audio file to user's device
  const saveAudioFile = useCallback((blob: Blob, mimeType: string) => {
    const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("webm") ? "webm" : "ogg";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fileName = `meeting-recording-${timestamp}.${ext}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setSavedFileName(fileName);
    return fileName;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    chunksRef.current = [];
    setAudioBlob(null);
    setSavedFileName(null);
    setDuration(0);

    // Auto-set start time
    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 5);
    const dateStr = now.toISOString().split("T")[0];
    if (options.onStartTime) options.onStartTime(dateStr, timeStr);

    try {
      let stream: MediaStream;

      if (options.captureSystemAudio) {
        try {
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: false,
          } as DisplayMediaStreamOptions);
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const ctx = new AudioContext();
          const dest = ctx.createMediaStreamDestination();
          ctx.createMediaStreamSource(displayStream).connect(dest);
          ctx.createMediaStreamSource(micStream).connect(dest);
          stream = dest.stream;
          streamRef.current = displayStream;
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      }

      // iOS Safari needs mp4, Chrome/Firefox prefer webm
      const mimeType = MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";

      mimeTypeRef.current = mimeType;

      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          options.onChunk?.(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        setAudioBlob(blob);
        streamRef.current?.getTracks().forEach((t) => t.stop());

        // Auto-save to device immediately — before API call
        saveAudioFile(blob, mimeTypeRef.current);
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setState("recording");
      startTimer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not access microphone";
      setError(msg);
    }
  }, [options, saveAudioFile]);

  const pause = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      setState("paused");
      stopTimer();
    }
  }, []);

  const resume = useCallback(() => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      setState("recording");
      startTimer();
    }
  }, []);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setState("stopped");
      stopTimer();
      const timeStr = new Date().toTimeString().slice(0, 5);
      if (options.onStopTime) options.onStopTime(timeStr);
    }
  }, [options]);

  const reset = useCallback(() => {
    stop();
    setDuration(0);
    setAudioBlob(null);
    setSavedFileName(null);
    setError(null);
    setState("idle");
    chunksRef.current = [];
  }, [stop]);

  return {
    state,
    duration,
    audioBlob,
    error,
    savedFileName,
    start,
    pause,
    resume,
    stop,
    reset,
  };
}