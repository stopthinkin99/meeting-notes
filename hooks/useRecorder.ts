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

// 3 minutes keeps each transcription upload comfortably small.
const TRANSCRIPTION_SEGMENT_SECONDS = 60;

export function useRecorder(options: UseRecorderOptions = {}) {
  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  // Valid, independently playable recording pieces used only for transcription.
  const [transcriptionBlobs, setTranscriptionBlobs] = useState<Blob[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [pauseMarkers, setPauseMarkers] = useState<PauseMarker[]>([]);
  const [savedFileName, setSavedFileName] = useState<string | null>(null);

  // Full-meeting recorder. This is what gets saved to Downloads.
  const backupRecorderRef = useRef<MediaRecorder | null>(null);
  const backupChunksRef = useRef<Blob[]>([]);

  // Separate recorder that is restarted every few minutes.
  // Restarting creates a new valid media container for every segment.
  const segmentRecorderRef = useRef<MediaRecorder | null>(null);
  const currentSegmentChunksRef = useRef<Blob[]>([]);
  const completedSegmentsRef = useRef<Blob[]>([]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const extraStreamsRef = useRef<MediaStream[]>([]);

  const mimeTypeRef = useRef<string>("audio/webm");
  const durationRef = useRef(0);
  const segmentDurationRef = useRef(0);

  const pauseMarkersRef = useRef<PauseMarker[]>([]);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const recordingActiveRef = useRef(false);
  const meetingStoppingRef = useRef(false);
  const segmentRotationRef = useRef(false);

  const stopAllTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());

    extraStreamsRef.current.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });

    extraStreamsRef.current = [];
  };

  const createSegmentRecorder = useCallback((stream: MediaStream) => {
    const recorder = new MediaRecorder(stream, {
      mimeType: mimeTypeRef.current,
    });

    currentSegmentChunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        currentSegmentChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const pieces = currentSegmentChunksRef.current;

      if (pieces.length > 0) {
        const blob = new Blob(pieces, {
          type: mimeTypeRef.current,
        });

        if (blob.size > 0) {
          completedSegmentsRef.current.push(blob);
        }
      }

      currentSegmentChunksRef.current = [];
      segmentDurationRef.current = 0;

      // If this stop happened only because we reached the segment limit,
      // immediately start another independent recording segment.
      if (
        recordingActiveRef.current &&
        !meetingStoppingRef.current &&
        segmentRotationRef.current
      ) {
        segmentRotationRef.current = false;

        const nextRecorder = createSegmentRecorder(stream);
        segmentRecorderRef.current = nextRecorder;
        nextRecorder.start(1000);
      } else {
        segmentRotationRef.current = false;

        // Meeting has ended, so expose the completed pieces to React.
        if (meetingStoppingRef.current) {
          setTranscriptionBlobs([...completedSegmentsRef.current]);
        }
      }
    };

    return recorder;
  }, []);

  const rotateSegment = useCallback(() => {
    const recorder = segmentRecorderRef.current;

    if (!recorder || recorder.state !== "recording") {
      return;
    }

    segmentRotationRef.current = true;
    recorder.stop();
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    timerRef.current = setInterval(() => {
      durationRef.current += 1;
      segmentDurationRef.current += 1;

      setDuration(durationRef.current);

      if (
        segmentDurationRef.current >= TRANSCRIPTION_SEGMENT_SECONDS &&
        segmentRecorderRef.current?.state === "recording"
      ) {
        rotateSegment();
      }
    }, 1000);
  }, [rotateSegment]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setAudioBlob(null);
    setTranscriptionBlobs([]);
    setSavedFileName(null);
    setPauseMarkers([]);
    setDuration(0);

    backupChunksRef.current = [];
    completedSegmentsRef.current = [];
    currentSegmentChunksRef.current = [];

    durationRef.current = 0;
    segmentDurationRef.current = 0;

    pauseMarkersRef.current = [];

    recordingActiveRef.current = false;
    meetingStoppingRef.current = false;
    segmentRotationRef.current = false;

    const now = new Date();

    optionsRef.current.onStartTime?.(
      now.toISOString().split("T")[0],
      now.toTimeString().slice(0, 5)
    );

    try {
      let stream: MediaStream;

      if (optionsRef.current.captureSystemAudio) {
        try {
          const displayStream =
            await navigator.mediaDevices.getDisplayMedia({
              audio: true,
              video: false,
            } as DisplayMediaStreamOptions);

          const micStream =
            await navigator.mediaDevices.getUserMedia({
              audio: true,
            });

          const ctx = new AudioContext();
          const destination = ctx.createMediaStreamDestination();

          if (displayStream.getAudioTracks().length > 0) {
            ctx.createMediaStreamSource(displayStream).connect(destination);
          }

          if (micStream.getAudioTracks().length > 0) {
            ctx.createMediaStreamSource(micStream).connect(destination);
          }

          stream = destination.stream;

          streamRef.current = stream;
          extraStreamsRef.current = [displayStream, micStream];
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });

          streamRef.current = stream;
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

        streamRef.current = stream;
      }

      const mimeType =
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "audio/ogg";

      mimeTypeRef.current = mimeType;

      /*
       * Recorder #1:
       * Records the COMPLETE meeting for the user's downloadable backup.
       */
      const backupRecorder = new MediaRecorder(stream, {
        mimeType,
      });

      backupRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          backupChunksRef.current.push(event.data);
        }
      };

      backupRecorder.onstop = () => {
        const blob = new Blob(backupChunksRef.current, {
          type: mimeTypeRef.current,
        });

        setAudioBlob(blob);

        // Auto-download full meeting to Downloads.
        const fileName = downloadAudioFile(
          blob,
          mimeTypeRef.current
        );

        setSavedFileName(fileName);
        stopAllTracks();
      };

      /*
       * Recorder #2:
       * Records short, independent files solely for transcription.
       */
      const segmentRecorder = createSegmentRecorder(stream);

      backupRecorderRef.current = backupRecorder;
      segmentRecorderRef.current = segmentRecorder;

      recordingActiveRef.current = true;

      backupRecorder.start(1000);
      segmentRecorder.start(1000);

      setState("recording");
      startTimer();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not access microphone"
      );

      stopAllTracks();
    }
  }, [createSegmentRecorder, startTimer]);

  const pause = useCallback(() => {
    const backupRecorder = backupRecorderRef.current;
    const segmentRecorder = segmentRecorderRef.current;

    if (backupRecorder?.state === "recording") {
      backupRecorder.pause();
    }

    if (segmentRecorder?.state === "recording") {
      segmentRecorder.pause();
    }

    setState("paused");
    stopTimer();

    const marker: PauseMarker = {
      type: "pause",
      time: durationRef.current,
    };

    pauseMarkersRef.current = [
      ...pauseMarkersRef.current,
      marker,
    ];

    setPauseMarkers([...pauseMarkersRef.current]);
  }, [stopTimer]);

  const resume = useCallback(() => {
    const backupRecorder = backupRecorderRef.current;
    const segmentRecorder = segmentRecorderRef.current;

    if (backupRecorder?.state === "paused") {
      backupRecorder.resume();
    }

    if (segmentRecorder?.state === "paused") {
      segmentRecorder.resume();
    }

    setState("recording");
    startTimer();

    const marker: PauseMarker = {
      type: "resume",
      time: durationRef.current,
    };

    pauseMarkersRef.current = [
      ...pauseMarkersRef.current,
      marker,
    ];

    setPauseMarkers([...pauseMarkersRef.current]);
  }, [startTimer]);

  const stop = useCallback(() => {
    if (meetingStoppingRef.current) {
      return;
    }

    meetingStoppingRef.current = true;
    recordingActiveRef.current = false;
    segmentRotationRef.current = false;

    stopTimer();

    optionsRef.current.onStopTime?.(
      new Date().toTimeString().slice(0, 5)
    );

    const segmentRecorder = segmentRecorderRef.current;

    if (
      segmentRecorder &&
      segmentRecorder.state !== "inactive"
    ) {
      segmentRecorder.stop();
    } else {
      setTranscriptionBlobs([
        ...completedSegmentsRef.current,
      ]);
    }

    const backupRecorder = backupRecorderRef.current;

    if (
      backupRecorder &&
      backupRecorder.state !== "inactive"
    ) {
      backupRecorder.stop();
    }

    setState("stopped");
  }, [stopTimer]);

  const reset = useCallback(() => {
    recordingActiveRef.current = false;
    meetingStoppingRef.current = true;
    segmentRotationRef.current = false;

    stopTimer();

    const backupRecorder = backupRecorderRef.current;
    if (
      backupRecorder &&
      backupRecorder.state !== "inactive"
    ) {
      backupRecorder.stop();
    }

    const segmentRecorder = segmentRecorderRef.current;
    if (
      segmentRecorder &&
      segmentRecorder.state !== "inactive"
    ) {
      segmentRecorder.stop();
    }

    stopAllTracks();

    backupRecorderRef.current = null;
    segmentRecorderRef.current = null;

    backupChunksRef.current = [];
    currentSegmentChunksRef.current = [];
    completedSegmentsRef.current = [];

    setDuration(0);
    durationRef.current = 0;
    segmentDurationRef.current = 0;

    setAudioBlob(null);
    setTranscriptionBlobs([]);
    setSavedFileName(null);

    pauseMarkersRef.current = [];
    setPauseMarkers([]);

    setError(null);
    setState("idle");
  }, [stopTimer]);

  return {
    state,
    duration,
    audioBlob,
    transcriptionBlobs,
    error,
    pauseMarkers,
    savedFileName,
    start,
    pause,
    resume,
    stop,
    reset,
  };
}
