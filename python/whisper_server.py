#!/usr/bin/env python3
"""
Local Whisper + pyannote speaker diarization server.
Run this if you want completely FREE, offline transcription.

Setup:
  pip install openai-whisper pyannote.audio fastapi uvicorn python-multipart torch

HuggingFace token (free):
  1. Create account at huggingface.co
  2. Accept pyannote/speaker-diarization-3.1 model terms
  3. Generate token at huggingface.co/settings/tokens
  4. Set HF_TOKEN env var

Run:
  HF_TOKEN=your_token python python/whisper_server.py
"""

import os
import json
import tempfile
import uvicorn
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Lazy-load models so startup is fast
_whisper_model = None
_diarization_pipeline = None


def get_whisper():
    global _whisper_model
    if _whisper_model is None:
        import whisper
        print("Loading Whisper model (base)...")
        _whisper_model = whisper.load_model("base")
        print("Whisper ready.")
    return _whisper_model


def get_diarization():
    global _diarization_pipeline
    if _diarization_pipeline is None:
        hf_token = os.environ.get("HF_TOKEN")
        if not hf_token:
            raise RuntimeError("HF_TOKEN not set. Get a free token at huggingface.co/settings/tokens")
        from pyannote.audio import Pipeline
        print("Loading pyannote diarization pipeline...")
        _diarization_pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=hf_token,
        )
        print("Diarization ready.")
    return _diarization_pipeline


@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    attendees: str = Form(default="[]"),
):
    attendee_names = json.loads(attendees)

    # Save audio to temp file
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name

    try:
        # 1. Whisper transcription with word timestamps
        model = get_whisper()
        result = model.transcribe(tmp_path, word_timestamps=True, verbose=False)
        raw_text = result["text"]
        whisper_segments = result["segments"]

        # 2. Try speaker diarization
        try:
            pipeline = get_diarization()
            diarization = pipeline(tmp_path)

            # Map each whisper segment to a speaker
            segments = []
            names = attendee_names if attendee_names else None
            speaker_map = {}  # pyannote speaker label -> display name

            for seg in whisper_segments:
                start = seg["start"]
                end = seg["end"]
                mid = (start + end) / 2

                # Find which speaker was talking at the midpoint
                pyannote_speaker = "SPEAKER_00"
                for turn, _, speaker in diarization.itertracks(yield_label=True):
                    if turn.start <= mid <= turn.end:
                        pyannote_speaker = speaker
                        break

                # Map pyannote speaker label to display name
                if pyannote_speaker not in speaker_map:
                    idx = len(speaker_map)
                    if names and idx < len(names):
                        speaker_map[pyannote_speaker] = names[idx]
                    else:
                        speaker_map[pyannote_speaker] = f"Speaker {idx + 1}"

                speaker_name = speaker_map[pyannote_speaker]
                speaker_idx = list(speaker_map.values()).index(speaker_name)

                segments.append({
                    "id": f"seg_{len(segments)}",
                    "speaker": speaker_name,
                    "speakerIndex": speaker_idx,
                    "text": seg["text"].strip(),
                    "startTime": start,
                    "endTime": end,
                })

        except Exception as e:
            print(f"Diarization failed, falling back to single speaker: {e}")
            # Fallback: no diarization, single speaker or heuristic
            segments = []
            current_speaker_idx = 0
            last_end = 0
            speaker_names = attendee_names if attendee_names else ["Speaker 1", "Speaker 2"]

            for seg in whisper_segments:
                gap = seg["start"] - last_end
                if gap > 1.5 and last_end > 0:
                    current_speaker_idx = (current_speaker_idx + 1) % len(speaker_names)
                last_end = seg["end"]

                segments.append({
                    "id": f"seg_{len(segments)}",
                    "speaker": speaker_names[current_speaker_idx],
                    "speakerIndex": current_speaker_idx,
                    "text": seg["text"].strip(),
                    "startTime": seg["start"],
                    "endTime": seg["end"],
                })

        return {"segments": segments, "rawText": raw_text}

    finally:
        os.unlink(tmp_path)


@app.get("/health")
def health():
    return {"status": "ok", "models": {"whisper": _whisper_model is not None, "diarization": _diarization_pipeline is not None}}


if __name__ == "__main__":
    print("Starting local Whisper server on http://localhost:8001")
    uvicorn.run(app, host="0.0.0.0", port=8001)
