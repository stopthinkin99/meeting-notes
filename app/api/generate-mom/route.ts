import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { MeetingMeta, MoMRow, ActionItem } from "@/types";
import { generateId } from "@/lib/utils";

export const maxDuration = 120;

const MODEL = "qwen/qwen3.8-27b";

// Keep each transcript chunk comfortably under your 7000 ITPM limit.
// ~4 chars/token is a rough estimate, so 12,000 chars is usually ~3,000 tokens.
const TRANSCRIPT_CHUNK_CHARS = 12000;

interface ExtractedChunk {
  discussionPoints: Array<{
    pointsDiscussed: string;
    contactPerson: string;
    dependency: string;
    priority: "High" | "Medium" | "Low";
    status: "Open" | "In Progress" | "Done";
  }>;
  actionItems: Array<{
    task: string;
    owner: string;
    dueDate: string;
  }>;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      transcript,
      meta,
    }: {
      transcript: string;
      meta: MeetingMeta;
    } = body;

    if (!transcript?.trim()) {
      return NextResponse.json(
        { error: "No transcript provided" },
        { status: 400 }
      );
    }

    const groqKey = process.env.GROQ_API_KEY;

    if (!groqKey) {
      return NextResponse.json(
        { error: "GROQ_API_KEY not configured" },
        { status: 500 }
      );
    }

    const client = new Groq({
      apiKey: groqKey,
    });

    const attendeeList =
      meta.attendees
        .map((a) => a.name)
        .filter(Boolean)
        .join(", ") || "Not specified";

    const transcriptChunks =
      splitTranscript(
        transcript,
        TRANSCRIPT_CHUNK_CHARS
      );

    console.log(
      `Generating MoM from ${transcriptChunks.length} transcript chunks`
    );

    const extractedChunks: ExtractedChunk[] = [];

    /*
     * STEP 1
     * Process each transcript section separately.
     */
    for (
      let i = 0;
      i < transcriptChunks.length;
      i++
    ) {
      const chunk = transcriptChunks[i];

      const extractionPrompt = `
You are an expert meeting analyst.

Analyze ONLY this section of a larger meeting transcript.

Meeting Details:
- Topic: ${meta.topic || "Not specified"}
- Date: ${meta.date || "Not specified"}
- Time: ${meta.timeStart || ""}${
        meta.timeEnd
          ? ` to ${meta.timeEnd}`
          : ""
      }
- Venue: ${meta.venue || "Not specified"}
- Attendees: ${attendeeList}

TRANSCRIPT SECTION ${i + 1} OF ${transcriptChunks.length}:
${chunk}

Extract every meaningful discussion point, decision, responsibility, dependency, and action item present in THIS section.

Return ONLY valid JSON with this exact structure:

{
  "discussionPoints": [
    {
      "pointsDiscussed": "Clear description of what was discussed or decided",
      "contactPerson": "Responsible person, or empty string",
      "dependency": "Dependency or 'No Dependency'",
      "priority": "High",
      "status": "Open"
    }
  ],
  "actionItems": [
    {
      "task": "Specific action required",
      "owner": "Responsible person, or empty string",
      "dueDate": "Date/timeframe mentioned, or 'TBD'"
    }
  ]
}

Rules:
- Preserve all important details.
- Do not summarize away distinct discussion points.
- Do not invent names, deadlines, or decisions.
- priority must be exactly High, Medium, or Low.
- status must be exactly Open, In Progress, or Done.
- If no contact person is known, use an empty string.
- Return JSON only.
`;

      const completion =
        await client.chat.completions.create({
          model: MODEL,
          max_completion_tokens: 850,
          reasoning_effort: "none",
          include_reasoning: false,
          temperature: 0.1,
          response_format: {
            type: "json_object",
          },
          messages: [
            {
              role: "user",
              content: extractionPrompt,
            },
          ],
        });

      const responseText =
        completion.choices[0]?.message
          ?.content || "";

      const parsed =
        parseJsonResponse<ExtractedChunk>(
          responseText
        );

      extractedChunks.push({
        discussionPoints:
          parsed.discussionPoints || [],
        actionItems:
          parsed.actionItems || [],
      });

      /*
       * Your current Groq tier has per-minute limits.
       * A pause between calls prevents back-to-back
       * requests from immediately hitting the limit.
       */
      if (
        i <
        transcriptChunks.length - 1
      ) {
        await sleep(65000);
      }
    }

    /*
     * STEP 2
     * Merge everything locally first.
     *
     * This ensures we never throw away content from
     * earlier transcript sections.
     */
    const allDiscussionPoints =
      extractedChunks.flatMap(
        (chunk) =>
          chunk.discussionPoints
      );

    const allActionItems =
      extractedChunks.flatMap(
        (chunk) => chunk.actionItems
      );

    /*
     * STEP 3
     * Ask the AI to create the executive summary
     * and clean duplicate points only.
     *
     * Notice: we are NOT sending the original
     * hour-long transcript again.
     */
    const mergeInput = {
      discussionPoints:
        allDiscussionPoints,
      actionItems: allActionItems,
    };

    // Wait before final Groq call because of current rate limits.
    await sleep(65000);

    const mergePrompt = `
You are finalizing Minutes of Meeting from already-extracted meeting notes.

Meeting Details:
- Topic: ${meta.topic || "Not specified"}
- Date: ${meta.date || "Not specified"}
- Time: ${meta.timeStart || ""}${
      meta.timeEnd
        ? ` to ${meta.timeEnd}`
        : ""
    }
- Venue: ${meta.venue || "Not specified"}
- Attendees: ${attendeeList}

EXTRACTED MEETING DATA:
${JSON.stringify(mergeInput)}

Create the final structured Minutes of Meeting.

Return ONLY this JSON:

{
  "summary": "A clear 3-5 sentence executive summary.",
  "momRows": [
    {
      "pointsDiscussed": "Specific discussion point",
      "contactPerson": "Responsible person or empty string",
      "dependency": "Dependency or 'No Dependency'",
      "priority": "High",
      "status": "Open"
    }
  ],
  "actionItems": [
    {
      "task": "Specific action",
      "owner": "Responsible person or empty string",
      "dueDate": "Date/timeframe or 'TBD'"
    }
  ]
}

Rules:
- Preserve all materially distinct discussion points.
- Merge only true duplicates.
- Do not remove important decisions, responsibilities, or actions.
- Do not invent information.
- priority must be High, Medium, or Low.
- status must be Open, In Progress, or Done.
- Return JSON only.
`;

    const finalCompletion =
      await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: 900,
        reasoning_effort: "none",
        include_reasoning: false,
        temperature: 0.1,
        response_format: {
          type: "json_object",
        },
        messages: [
          {
            role: "user",
            content: mergePrompt,
          },
        ],
      });

    const finalText =
      finalCompletion.choices[0]
        ?.message?.content || "";

    const parsed =
      parseJsonResponse<{
        summary?: string;
        momRows?: Partial<MoMRow>[];
        actionItems?: Partial<ActionItem>[];
      }>(finalText);

    const momRows: MoMRow[] = (
      parsed.momRows || []
    ).map(
      (
        r: Partial<MoMRow>,
        i: number
      ) => ({
        id: generateId(),
        pointNumber: i + 1,
        pointsDiscussed:
          r.pointsDiscussed || "",
        contactPerson:
          r.contactPerson || "",
        dependency:
          r.dependency ||
          "No Dependency",
        priority: (
          [
            "High",
            "Medium",
            "Low",
          ].includes(
            r.priority as string
          )
            ? r.priority
            : "Medium"
        ) as MoMRow["priority"],
        status: (
          [
            "Open",
            "In Progress",
            "Done",
          ].includes(
            r.status as string
          )
            ? r.status
            : "Open"
        ) as MoMRow["status"],
      })
    );

    const actionItems: ActionItem[] =
      (
        parsed.actionItems || []
      ).map(
        (
          a: Partial<ActionItem>
        ) => ({
          id: generateId(),
          task: a.task || "",
          owner: a.owner || "",
          dueDate:
            a.dueDate || "TBD",
          done: false,
        })
      );

    return NextResponse.json({
      summary:
        parsed.summary || "",
      momRows,
      actionItems,
    });
  } catch (err) {
    console.error(
      "Generate MoM error:",
      err
    );

    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to generate MoM",
      },
      {
        status: 500,
      }
    );
  }
}

function splitTranscript(
  text: string,
  maxChars: number
): string[] {
  const cleanText =
    text.trim();

  if (
    cleanText.length <= maxChars
  ) {
    return [cleanText];
  }

  const chunks: string[] = [];
  let remaining = cleanText;

  while (
    remaining.length > maxChars
  ) {
    let splitAt =
      remaining.lastIndexOf(
        "\n",
        maxChars
      );

    if (
      splitAt <
      maxChars * 0.6
    ) {
      splitAt =
        remaining.lastIndexOf(
          ". ",
          maxChars
        );
    }

    if (
      splitAt <
      maxChars * 0.6
    ) {
      splitAt = maxChars;
    }

    const chunk =
      remaining
        .slice(0, splitAt)
        .trim();

    if (chunk) {
      chunks.push(chunk);
    }

    remaining =
      remaining
        .slice(splitAt)
        .trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

function parseJsonResponse<T>(
  responseText: string
): T {
  const withoutThinking =
    responseText.replace(
      /<think>[\s\S]*?<\/think>/g,
      ""
    );

  const start =
    withoutThinking.indexOf("{");

  const end =
    withoutThinking.lastIndexOf(
      "}"
    );

  if (
    start === -1 ||
    end === -1
  ) {
    throw new Error(
      "No JSON object found in model response"
    );
  }

  const jsonStr =
    withoutThinking.slice(
      start,
      end + 1
    );

  return JSON.parse(jsonStr);
}

function sleep(
  ms: number
): Promise<void> {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, ms)
  );
}
