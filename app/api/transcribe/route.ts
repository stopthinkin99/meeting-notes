import {
  NextRequest,
  NextResponse,
} from "next/server";

import Groq from "groq-sdk";

export const maxDuration = 120;

const MAX_AUDIO_BYTES =
  20 * 1024 * 1024;

export async function POST(
  req: NextRequest
) {
  try {
    const formData =
      await req.formData();

    const audio =
      formData.get("audio");

    if (!(audio instanceof File)) {
      return NextResponse.json(
        {
          error:
            "No audio file provided",
        },
        {
          status: 400,
        }
      );
    }

    if (audio.size === 0) {
      return NextResponse.json(
        {
          error:
            "The recording is empty.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * IMPORTANT:
     *
     * We no longer byte-split MP4/WebM files here.
     *
     * Recorded meetings are segmented properly in
     * the browser before being uploaded.
     */
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        {
          error:
            `Recording segment is too large (${(
              audio.size /
              1024 /
              1024
            ).toFixed(
              1
            )} MB). Maximum segment size is 20 MB.`,
        },
        {
          status: 413,
        }
      );
    }

    const groqKey =
      process.env.GROQ_API_KEY;

    if (!groqKey) {
      return NextResponse.json(
        {
          error:
            "GROQ_API_KEY not configured",
        },
        {
          status: 500,
        }
      );
    }

    const client = new Groq({
      apiKey: groqKey,
    });

    const result =
      await client.audio.translations.create({
        file: audio,
        model: "whisper-large-v3",
        response_format: "text",
      });

    const text =
      typeof result === "string"
        ? result
        : (result as { text?: string })
            .text || "";

    if (!text.trim()) {
      return NextResponse.json(
        {
          error:
            "No speech detected in this recording segment.",
        },
        {
          status: 400,
        }
      );
    }

    return NextResponse.json({
      text: text.trim(),
    });
  } catch (err) {
    console.error(
      "Transcribe error:",
      err
    );

    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Transcription failed",
      },
      {
        status: 500,
      }
    );
  }
}
