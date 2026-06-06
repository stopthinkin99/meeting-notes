"use client";

import { useState, useRef, useCallback } from "react";

export type RecordingState = "idle" | "recording" | "paused" | "stopped";

export interface PauseMarker {
  type: "pause" | "resume";
  time: number;
}

interface UseRecorderOptions {
  onChunk?: (blob: Blob) => void;
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
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>("audio/mp4");
  const durationRef = useRef(0);
  const pauseMarkersRef = useRef<PauseMarker[]>([]);

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

  const uploadToSupabase = async (blob: Blob, mimeType: string) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      setUploadError("Supabase keys not configured");
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("webm") ? "webm" : "ogg";
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const fileName = `meeting-${timestamp}.${ext}`;

      const uploadUrl = `${supabaseUrl}/storage/v1/object/meeting-recordings/${fileName}`;

      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${supabaseKey}`,
          "Content-Type": mimeType,
          "x-upsert": "false",
        },
        body: blob,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Upload failed: ${errText}`);
      }

      setUploadedFileName(fileName);
    } catch (err) {
      console.error("Supabase upload error:", err);
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const start = useCallback(async () => {
    setError(null);
    chunksRef.current = [];
    pauseMarkersRef.current = [];
    setAudioBlob(null);
    setUploadedFileName(null);
    setUploadError(null);
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
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          options.onChunk?.(e.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        setAudioBlob(blob);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        // Upload to Supabase only — no local download
        await uploadToSupabase(blob, mimeTypeRef.current);
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
      const timeStr = new Date().toTimeString().slice(0, 5);
      if (options.onStopTime) options.onStopTime(timeStr);
    }
  }, [options]);

  const reset = useCallback(() => {
    stop();
    setDuration(0);
    durationRef.current = 0;
    setAudioBlob(null);
    setUploadedFileName(null);
    setUploadError(null);
    pauseMarkersRef.current = [];
    setPauseMarkers([]);
    setError(null);
    setState("idle");
    chunksRef.current = [];
  }, [stop]);

  return {
    state, duration, audioBlob, error,
    pauseMarkers, isUploading, uploadedFileName, uploadError,
    start, pause, resume, stop, reset,
  };
}