import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

export const maxDuration = 120;

const GROQ_MAX_BYTES = 20 * 1024 * 1024; // 20MB safe limit

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audio = formData.get("audio") as File | null;

    if (!audio) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 500 });
    }

    const client = new Groq({ apiKey: groqKey });
    let fullText = "";

    if (audio.size <= GROQ_MAX_BYTES) {
      // Small file — transcribe + translate directly
      fullText = await transcribeAndTranslate(client, audio);
    } else {
      // Large file — split into chunks
      const arrayBuffer = await audio.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const chunks = splitBuffer(buffer, GROQ_MAX_BYTES);

      console.log(`Large file (${(audio.size / 1024 / 1024).toFixed(1)}MB) — ${chunks.length} chunks`);

      const parts: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunkFile = new File(
          [new Uint8Array(chunks[i])],
          `chunk-${i}.mp4`,
          { type: audio.type }
        );
        try {
          const text = await transcribeAndTranslate(client, chunkFile);
          if (text.trim()) parts.push(text.trim());
        } catch (err) {
          console.error(`Chunk ${i} failed:`, err);
        }
      }
      fullText = parts.join(" ");
    }

    if (!fullText.trim()) {
      return NextResponse.json({ error: "No speech detected in recording" }, { status: 400 });
    }

    return NextResponse.json({ text: fullText });
  } catch (err) {
    console.error("Transcribe error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Transcription failed" },
      { status: 500 }
    );
  }
}

async function transcribeAndTranslate(client: Groq, file: File): Promise<string> {
  // Use translation task — converts any language (Hindi, Hinglish, etc.) to English
  const result = await client.audio.translations.create({
    file,
    model: "whisper-large-v3",
    response_format: "text",
  });
  return typeof result === "string" ? result : (result as any).text || "";
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