import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { TranscriptSegment } from "@/types";
import { generateId } from "@/lib/utils";

export const maxDuration = 120;

const GROQ_MAX_BYTES = 20 * 1024 * 1024; // 20MB per chunk (safe under 25MB limit)

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audio = formData.get("audio") as File | null;
    const attendeesRaw = formData.get("attendees") as string | null;

    if (!audio) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    const attendeeNames: string[] = attendeesRaw ? JSON.parse(attendeesRaw) : [];
    const groqKey = process.env.GROQ_API_KEY;

    if (!groqKey) {
      return NextResponse.json(getMockTranscript(attendeeNames));
    }

    const client = new Groq({ apiKey: groqKey });
    const fileSize = audio.size;

    let rawText = "";
    let allSegments: TranscriptSegment[] = [];

    if (fileSize <= GROQ_MAX_BYTES) {
      // Small file — transcribe directly
      const result = await transcribeFile(client, audio);
      rawText = result.rawText;
      allSegments = assignSpeakers(result.segments, attendeeNames, 0);
    } else {
      // Large file — split into chunks and transcribe each
      const arrayBuffer = await audio.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const chunks = splitBuffer(buffer, GROQ_MAX_BYTES);

      console.log(`Large file (${(fileSize / 1024 / 1024).toFixed(1)}MB) — splitting into ${chunks.length} chunks`);

      let timeOffset = 0;
      const allRawParts: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkFile = new File([new Uint8Array(chunk)], `chunk-${i}.mp4`, { type: audio.type });

        try {
          const result = await transcribeFile(client, chunkFile);
          allRawParts.push(result.rawText);

          // Offset timestamps so chunks stitch together correctly
          const offsetSegments = result.segments.map(seg => ({
            ...seg,
            startTime: seg.startTime + timeOffset,
            endTime: seg.endTime + timeOffset,
          }));

          const speakerSegs = assignSpeakers(
            offsetSegments.map(s => ({ start: s.startTime, end: s.endTime, text: s.text })),
            attendeeNames,
            allSegments.length
          );
          allSegments = [...allSegments, ...speakerSegs];

          // Estimate time offset for next chunk based on audio duration ratio
          const chunkDurationEstimate = (chunk.length / fileSize) * estimateDuration(fileSize, audio.type);
          timeOffset += chunkDurationEstimate;
        } catch (err) {
          console.error(`Chunk ${i} failed:`, err);
          // Continue with other chunks even if one fails
        }
      }

      rawText = allRawParts.join(" ");
    }

    // Post-process: fix Whisper mishearings with Groq LLM
    const correctedSegments = await correctTranscriptWithAI(rawText, allSegments, client);

    return NextResponse.json({ segments: correctedSegments, rawText });
  } catch (err) {
    console.error("Transcribe error:", err);
    return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
  }
}

async function transcribeFile(client: Groq, file: File) {
  const transcription = await client.audio.transcriptions.create({
    file,
    model: "whisper-large-v3",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });

  const rawText: string = transcription.text || "";
  const rawSegments = (transcription as any).segments || [];

  return {
    rawText,
    segments: rawSegments.map((seg: { start: number; end: number; text: string }) => ({
      id: generateId(),
      speaker: "",
      speakerIndex: 0,
      text: seg.text.trim(),
      startTime: seg.start,
      endTime: seg.end,
    })) as TranscriptSegment[],
  };
}

function splitBuffer(buffer: Buffer, maxBytes: number): Buffer[] {
  const chunks: Buffer[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    chunks.push(buffer.slice(offset, offset + maxBytes));
    offset += maxBytes;
  }
  return chunks;
}

function estimateDuration(fileSizeBytes: number, mimeType: string): number {
  // Rough estimate: mp4 audio ~128kbps = 16KB/s
  const bytesPerSecond = mimeType.includes("mp4") ? 16000 : 12000;
  return fileSizeBytes / bytesPerSecond;
}

function assignSpeakers(
  segments: Array<{ start?: number; end?: number; startTime?: number; endTime?: number; text: string }>,
  attendeeNames: string[],
  indexOffset: number
): TranscriptSegment[] {
  const names = attendeeNames.length > 0 ? attendeeNames : ["Speaker 1", "Speaker 2", "Speaker 3"];
  let currentSpeakerIdx = 0;
  let lastEnd = 0;
  const PAUSE_THRESHOLD = 1.5;

  return segments.map((seg, i) => {
    const start = seg.start ?? seg.startTime ?? 0;
    const end = seg.end ?? seg.endTime ?? 0;
    const gap = start - lastEnd;
    if (gap > PAUSE_THRESHOLD && lastEnd > 0) {
      currentSpeakerIdx = (currentSpeakerIdx + 1) % names.length;
    }
    lastEnd = end;
    return {
      id: generateId(),
      speaker: names[currentSpeakerIdx],
      speakerIndex: currentSpeakerIdx,
      text: seg.text.trim(),
      startTime: start,
      endTime: end,
    };
  });
}

async function correctTranscriptWithAI(
  rawText: string,
  segments: TranscriptSegment[],
  groqClient: Groq
): Promise<TranscriptSegment[]> {
  if (segments.length === 0) return segments;

  try {
    // For long transcripts, only correct in batches of 30 segments
    const BATCH_SIZE = 30;
    if (segments.length > BATCH_SIZE) {
      const corrected: TranscriptSegment[] = [];
      for (let i = 0; i < segments.length; i += BATCH_SIZE) {
        const batch = segments.slice(i, i + BATCH_SIZE);
        const batchCorrected = await correctBatch(batch, rawText.slice(0, 600), groqClient);
        corrected.push(...batchCorrected);
      }
      return corrected;
    }
    return await correctBatch(segments, rawText.slice(0, 600), groqClient);
  } catch (err) {
    console.warn("AI correction failed, using original:", err);
    return segments;
  }
}

async function correctBatch(
  segments: TranscriptSegment[],
  context: string,
  groqClient: Groq
): Promise<TranscriptSegment[]> {
  const completion = await groqClient.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0,
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content: `You are a transcript proofreader. Fix ONLY speech-to-text errors — misheared words, wrong proper nouns, technical terms transcribed incorrectly. DO NOT rephrase or change correct words. Return ONLY a valid JSON array of corrected strings, nothing else.`,
      },
      {
        role: "user",
        content: `Context: "${context}"

Fix speech-to-text errors in these ${segments.length} segments:
${JSON.stringify(segments.map((s) => s.text))}

Return ONLY a JSON array with exactly ${segments.length} strings.`,
      },
    ],
  });

  const response = completion.choices[0]?.message?.content || "[]";
  const clean = response.replace(/```json|```/g, "").trim();
  const corrected: string[] = JSON.parse(clean);

  if (!Array.isArray(corrected) || corrected.length !== segments.length) return segments;
  return segments.map((seg, i) => ({ ...seg, text: corrected[i] || seg.text }));
}

function getMockTranscript(attendeeNames: string[]) {
  const names = attendeeNames.length >= 2 ? attendeeNames : ["Speaker 1", "Speaker 2"];
  const mockSegments: TranscriptSegment[] = [
    { id: generateId(), speaker: names[0], speakerIndex: 0, text: "Good afternoon everyone. Let's get started.", startTime: 0, endTime: 5 },
    { id: generateId(), speaker: names[1 % names.length], speakerIndex: 1, text: "We want to explore how Agentic AI can help across our operations.", startTime: 6, endTime: 13 },
  ];
  return { segments: mockSegments, rawText: mockSegments.map(s => `${s.speaker}: ${s.text}`).join("\n") };
}