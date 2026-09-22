import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

export const maxDuration = 60;

const MODEL = "qwen/qwen3.8-27b";

function getErrorStatus(err: unknown): number {
  if (
    typeof err === "object" &&
    err !== null &&
    "status" in err
  ) {
    const candidate = Number(
      (err as { status?: unknown }).status
    );

    if (
      Number.isInteger(candidate) &&
      candidate >= 400 &&
      candidate <= 599
    ) {
      return candidate;
    }
  }

  const message =
    err instanceof Error
      ? err.message
      : "";

  if (
    /rate.?limit|rate_limit_exceeded/i.test(
      message
    )
  ) {
    return 429;
  }

  return 500;
}

function parseModelJson(
  responseText: string
) {
  try {
    return JSON.parse(
      responseText
    );
  } catch {
    const cleaned =
      responseText.replace(
        /<think>[\s\S]*?<\/think>/g,
        ""
      );

    const start =
      cleaned.indexOf("{");

    const end =
      cleaned.lastIndexOf("}");

    if (
      start === -1 ||
      end === -1
    ) {
      throw new Error(
        "No valid JSON object found in model response."
      );
    }

    return JSON.parse(
      cleaned.slice(
        start,
        end + 1
      )
    );
  }
}

export async function POST(
  req: NextRequest
) {
  try {
    const body =
      await req.json();

    const apiKey =
      process.env.GROQ_API_KEY;

    if (!apiKey) {
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

    const groq =
      new Groq({
        apiKey,
      });

    /*
     * MODE 1:
     * Analyze ONE transcript chunk.
     */
    if (
      body.mode ===
      "analyze"
    ) {
      const {
        transcriptChunk,
        chunkNumber,
        totalChunks,
        meta,
      } = body;

      if (
        !transcriptChunk?.trim()
      ) {
        return NextResponse.json(
          {
            error:
              "No transcript chunk provided",
          },
          {
            status: 400,
          }
        );
      }

      const attendees =
        meta?.attendees
          ?.map(
            (
              a: {
                name?: string;
              }
            ) =>
              a.name
          )
          .filter(
            Boolean
          )
          .join(
            ", "
          ) ||
        "Not specified";

      const prompt = `
You are an expert meeting analyst.

You are analyzing SECTION ${chunkNumber} OF ${totalChunks} from a larger meeting.

Meeting Details:
Topic: ${meta?.topic || "Not specified"}
Date: ${meta?.date || "Not specified"}
Time: ${meta?.timeStart || ""}${
        meta?.timeEnd
          ? ` to ${meta.timeEnd}`
          : ""
      }
Venue: ${meta?.venue || "Not specified"}
Attendees: ${attendees}

TRANSCRIPT SECTION:

${transcriptChunk}

Extract ALL materially important information from this section.

Return ONLY valid JSON using exactly this structure:

{
  "discussionPoints": [
    {
      "pointsDiscussed": "Clear and specific description of what was discussed, decided, requested, clarified, or agreed",
      "contactPerson": "Responsible person if identifiable, otherwise empty string",
      "dependency": "Dependency if mentioned, otherwise No Dependency",
      "priority": "Medium",
      "status": "Open"
    }
  ],
  "actionItems": [
    {
      "task": "Specific action required",
      "owner": "Responsible person if identifiable, otherwise empty string",
      "dueDate": "Specific date/timeframe if mentioned, otherwise TBD"
    }
  ]
}

Rules:
- Preserve distinct discussion points separately.
- Preserve important decisions.
- Preserve responsibilities.
- Preserve follow-ups.
- Preserve process changes and requirements.
- Preserve dependencies.
- Do not invent facts.
- Do not invent owners.
- Do not invent deadlines.
- priority must be exactly High, Medium, or Low.
- status must be exactly Open, In Progress, or Done.
- If there are no action items, return an empty actionItems array.
- Return JSON only.
`;

      const completion =
        await groq.chat.completions.create({
          model: MODEL,
          max_completion_tokens: 850,
          reasoning_effort:
            "none",
          include_reasoning:
            false,
          temperature: 0.1,
          response_format: {
            type:
              "json_object",
          },
          messages: [
            {
              role:
                "user",
              content:
                prompt,
            },
          ],
        });

      const responseText =
        completion
          .choices[0]
          ?.message
          ?.content ||
        "";

      const parsed =
        parseModelJson(
          responseText
        );

      return NextResponse.json(
        {
          discussionPoints:
            parsed.discussionPoints ||
            [],

          actionItems:
            parsed.actionItems ||
            [],
        }
      );
    }

    /*
     * MODE 2:
     * Finalize the MOM summary from
     * already-extracted points.
     */
    if (
      body.mode ===
      "finalize"
    ) {
      const {
        discussionPoints,
        actionItems,
        meta,
      } = body;

      const attendees =
        meta?.attendees
          ?.map(
            (
              a: {
                name?: string;
              }
            ) =>
              a.name
          )
          .filter(
            Boolean
          )
          .join(
            ", "
          ) ||
        "Not specified";

      const compactPoints =
        (
          discussionPoints ||
          []
        ).map(
          (
            point: {
              pointsDiscussed?: string;
            },
            index: number
          ) =>
            `${index + 1}. ${
              point.pointsDiscussed ||
              ""
            }`
        );

      const compactActions =
        (
          actionItems ||
          []
        ).map(
          (
            action: {
              task?: string;
              owner?: string;
            },
            index: number
          ) =>
            `${index + 1}. ${
              action.task ||
              ""
            }${
              action.owner
                ? ` — ${action.owner}`
                : ""
            }`
        );

      const prompt = `
Create a concise executive summary for these Minutes of Meeting.

Meeting:
Topic: ${meta?.topic || "Not specified"}
Date: ${meta?.date || "Not specified"}
Venue: ${meta?.venue || "Not specified"}
Attendees: ${attendees}

DISCUSSION POINTS:
${compactPoints.join("\n")}

ACTION ITEMS:
${compactActions.join("\n")}

Return ONLY JSON:

{
  "summary": "A clear 3-5 sentence executive summary covering the main subjects discussed, important decisions, responsibilities, and overall outcome."
}

Rules:
- Do not invent information.
- Keep it concise but meaningful.
- Mention major decisions where present.
- Mention significant follow-up work where present.
- Return JSON only.
`;

      const completion =
        await groq.chat.completions.create({
          model: MODEL,
          max_completion_tokens: 450,
          reasoning_effort:
            "none",
          include_reasoning:
            false,
          temperature: 0.1,
          response_format: {
            type:
              "json_object",
          },
          messages: [
            {
              role:
                "user",
              content:
                prompt,
            },
          ],
        });

      const responseText =
        completion
          .choices[0]
          ?.message
          ?.content ||
        "";

      const parsed =
        parseModelJson(
          responseText
        );

      return NextResponse.json(
        {
          summary:
            parsed.summary ||
            "",
        }
      );
    }

    return NextResponse.json(
      {
        error:
          "Invalid generate-mom mode",
      },
      {
        status: 400,
      }
    );
  } catch (err) {
    console.error(
      "Generate MOM error:",
      err
    );

    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to generate MOM",
      },
      {
        status:
          getErrorStatus(
            err
          ),
      }
    );
  }
}
