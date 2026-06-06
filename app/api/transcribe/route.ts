import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { TranscriptSegment } from "@/types";
import { generateId } from "@/lib/utils";

export const maxDuration = 60;

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

    // Step 1: Transcribe with Whisper
    const transcription = await client.audio.transcriptions.create({
      file: audio,
      model: "whisper-large-v3",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    const rawText: string = transcription.text || "";
    const rawSegments = (transcription as any).segments || [];
    const segments: TranscriptSegment[] = assignSpeakers(rawSegments, attendeeNames);

    // Step 2: Fix Whisper mishearings using Groq LLM
    const correctedSegments = await correctTranscriptWithAI(rawText, segments, client);

    return NextResponse.json({ segments: correctedSegments, rawText });
  } catch (err) {
    console.error("Transcribe error:", err);
    return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
  }
}

async function correctTranscriptWithAI(
  rawText: string,
  segments: TranscriptSegment[],
  groqClient: Groq
): Promise<TranscriptSegment[]> {
  try {
    const completion = await groqClient.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      max_tokens: 4096,
      messages: [
        {
          role: "system",
          content: `You are a transcript proofreader. Fix ONLY speech-to-text errors — misheared words, wrong proper nouns, technical terms transcribed incorrectly.
DO NOT rephrase, summarize, reword, or change anything that is correct.
Focus on: technical terms, product names, company names, acronyms, and industry jargon that Whisper commonly mishears.
Examples of the kind of fix you should make:
- "AgentDKI" → "Agentic AI" (when context is about AI)
- "Reck" → "RAG" (when context is about AI retrieval)
- "Lang Jane" → "LangChain" (when context is about AI frameworks)
- "open eye" → "OpenAI" (when context is about AI companies)
Return ONLY a valid JSON array of corrected segment texts in the exact same order as input. No extra text, no markdown.
Example output: ["corrected text 1", "corrected text 2", "corrected text 3"]`,
        },
        {
          role: "user",
          content: `Here is the full transcript for context:
"${rawText.slice(0, 800)}"

Now fix any speech-to-text errors in these ${segments.length} segments:
${JSON.stringify(segments.map((s) => s.text))}

Return ONLY a JSON array with exactly ${segments.length} corrected strings.`,
        },
      ],
    });

    const response = completion.choices[0]?.message?.content || "[]";
    const clean = response.replace(/```json|```/g, "").trim();
    const corrected: string[] = JSON.parse(clean);

    if (!Array.isArray(corrected) || corrected.length !== segments.length) {
      console.warn("AI correction returned wrong length, using original");
      return segments;
    }

    return segments.map((seg, i) => ({
      ...seg,
      text: corrected[i] || seg.text,
    }));
  } catch (err) {
    console.warn("AI correction failed, using original transcript:", err);
    return segments; // always fall back to original if anything goes wrong
  }
}

function assignSpeakers(
  segments: Array<{ start: number; end: number; text: string }>,
  attendeeNames: string[]
): TranscriptSegment[] {
  const names = attendeeNames.length > 0 ? attendeeNames : ["Speaker 1", "Speaker 2", "Speaker 3"];
  let currentSpeakerIdx = 0;
  let lastEnd = 0;
  const PAUSE_THRESHOLD = 1.5;

  return segments.map((seg) => {
    const gap = seg.start - lastEnd;
    if (gap > PAUSE_THRESHOLD && lastEnd > 0) {
      currentSpeakerIdx = (currentSpeakerIdx + 1) % names.length;
    }
    lastEnd = seg.end;
    return {
      id: generateId(),
      speaker: names[currentSpeakerIdx],
      speakerIndex: currentSpeakerIdx,
      text: seg.text.trim(),
      startTime: seg.start,
      endTime: seg.end,
    };
  });
}

function getMockTranscript(attendeeNames: string[]) {
  const names = attendeeNames.length >= 2 ? attendeeNames : ["Speaker 1", "Speaker 2", "Speaker 3"];
  const mockSegments: TranscriptSegment[] = [
    { id: generateId(), speaker: names[0], speakerIndex: 0, text: "Good afternoon everyone. Let's get started.", startTime: 0, endTime: 5 },
    { id: generateId(), speaker: names[1 % names.length], speakerIndex: 1, text: "We want to explore how Agentic AI can help across our operations.", startTime: 6, endTime: 13 },
    { id: generateId(), speaker: names[0], speakerIndex: 0, text: "One key area is the research tool for customer preferences.", startTime: 14, endTime: 21 },
    { id: generateId(), speaker: names[2 % names.length], speakerIndex: 2, text: "Secondary market data is also important for insights.", startTime: 22, endTime: 30 },
  ];
  const rawText = mockSegments.map((s) => `${s.speaker}: ${s.text}`).join("\n");
  return { segments: mockSegments, rawText };
}