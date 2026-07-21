"use client";

import { useState, useRef, useCallback } from "react";
import { downloadAudioFile } from "@/lib/utils";

export type RecordingState = "idle" | "recording" | "paused" | "stopped";

export interface PauseMarker {
  type: "pause" | "resume";
  time: number;
}

interface UseRecorderOptions {
  captureSystemAudio?: boolean;
  onStartTime?: (date: string, time: string) => void;
  onStopTime?: (time: string) => void;
}

export function useRecorder(options: UseRecorderOptions = {}) {
  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pauseMarkers, setPauseMarkers] = useState<PauseMarker[]>([]);
  const [savedFileName, setSavedFileName] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>("audio/mp4");
  const durationRef = useRef(0);
  const pauseMarkersRef = useRef<PauseMarker[]>([]);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      durationRef.current += 1;
      setDuration(durationRef.current);
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
    pauseMarkersRef.current = [];
    setAudioBlob(null);
    setSavedFileName(null);
    setPauseMarkers([]);
    setDuration(0);
    durationRef.current = 0;

    const now = new Date();
    optionsRef.current.onStartTime?.(
      now.toISOString().split("T")[0],
      now.toTimeString().slice(0, 5)
    );

    try {
      let stream: MediaStream;

      if (optionsRef.current.captureSystemAudio) {
        try {
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            audio: true, video: false,
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
          streamRef.current = stream;
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

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        setAudioBlob(blob);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        // Auto-download to device immediately as backup
        const fileName = downloadAudioFile(blob, mimeTypeRef.current);
        setSavedFileName(fileName);
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setState("recording");
      startTimer();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not access microphone");
    }
  }, []);

  const pause = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      setState("paused");
      stopTimer();
      const marker: PauseMarker = { type: "pause", time: durationRef.current };
      pauseMarkersRef.current = [...pauseMarkersRef.current, marker];
      setPauseMarkers([...pauseMarkersRef.current]);
    }
  }, []);

  const resume = useCallback(() => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      setState("recording");
      startTimer();
      const marker: PauseMarker = { type: "resume", time: durationRef.current };
      pauseMarkersRef.current = [...pauseMarkersRef.current, marker];
      setPauseMarkers([...pauseMarkersRef.current]);
    }
  }, []);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setState("stopped");
      stopTimer();
      optionsRef.current.onStopTime?.(new Date().toTimeString().slice(0, 5));
    }
  }, []);

  const reset = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    stopTimer();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setDuration(0);
    durationRef.current = 0;
    setAudioBlob(null);
    setSavedFileName(null);
    pauseMarkersRef.current = [];
    setPauseMarkers([]);
    setError(null);
    setState("idle");
    chunksRef.current = [];
  }, []);

  return {
    state, duration, audioBlob, error,
    pauseMarkers, savedFileName,
    start, pause, resume, stop, reset,
  };
}