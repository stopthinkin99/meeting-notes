"use client";

import { useState, useRef, useCallback } from "react";
import { uploadRecording, SavedRecording } from "@/lib/supabase";

export type RecordingState = "idle" | "recording" | "paused" | "stopped";

export interface PauseMarker {
  type: "pause" | "resume";
  time: number; // seconds into recording
}

interface UseRecorderOptions {
  captureSystemAudio?: boolean;
  onStartTime?: (date: string, time: string) => void;
  onStopTime?: (time: string) => void;
  topic?: string;
}

export function useRecorder(options: UseRecorderOptions = {}) {
  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pauseMarkers, setPauseMarkers] = useState<PauseMarker[]>([]);
  const [uploadedRecording, setUploadedRecording] = useState<SavedRecording | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>("audio/mp4");
  const durationRef = useRef<number>(0);

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      durationRef.current += 1;
      setDuration((d) => d + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const start = useCallback(async () => {
    setError(null);
    chunksRef.current = [];
    setAudioBlob(null);
    setUploadedRecording(null);
    setPauseMarkers([]);
    setDuration(0);
    durationRef.current = 0;

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
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        setAudioBlob(blob);
        streamRef.current?.getTracks().forEach((t) => t.stop());

        // Upload to Supabase immediately
        setIsUploading(true);
        const saved = await uploadRecording(blob, durationRef.current, options.topic || "");
        setUploadedRecording(saved);
        setIsUploading(false);
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setState("recording");
      startTimer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not access microphone";
      setError(msg);
    }
  }, [options]);

  const pause = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      setState("paused");
      stopTimer();
      // Record pause marker
      setPauseMarkers((m) => [...m, { type: "pause", time: durationRef.current }]);
    }
  }, []);

  const resume = useCallback(() => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      setState("recording");
      startTimer();
      // Record resume marker
      setPauseMarkers((m) => [...m, { type: "resume", time: durationRef.current }]);
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
    durationRef.current = 0;
    setAudioBlob(null);
    setUploadedRecording(null);
    setPauseMarkers([]);
    setError(null);
    setState("idle");
    chunksRef.current = [];
  }, [stop]);

  return {
    state,
    duration,
    audioBlob,
    error,
    pauseMarkers,
    uploadedRecording,
    isUploading,
    start,
    pause,
    resume,
    stop,
    reset,
  };
}