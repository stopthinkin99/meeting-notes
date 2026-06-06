import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { MeetingMeta, MoMRow, ActionItem, TranscriptSegment } from "@/types";
import { generateId } from "@/lib/utils";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transcript, meta, attendeeNames }: {
      transcript: string;
      segments: TranscriptSegment[];
      meta: MeetingMeta;
      attendeeNames: string[];
    } = body;

    if (!transcript) {
      return NextResponse.json({ error: "No transcript provided" }, { status: 400 });
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return NextResponse.json({ error: "GROQ_API_KEY not set" }, { status: 500 });
    }

    const client = new Groq({ apiKey: groqKey });
    const prompt = buildPrompt(transcript, meta, attendeeNames);

    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile", // free, very capable
      max_tokens: 4096,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: "You are an expert meeting analyst. Always respond with valid JSON only — no extra text, no markdown outside the JSON block.",
        },
        { role: "user", content: prompt },
      ],
    });

    const responseText = completion.choices[0]?.message?.content || "";

    // Parse JSON from response
    let parsed;
    try {
      const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : responseText;
      parsed = JSON.parse(jsonStr);
    } catch {
      const start = responseText.indexOf("{");
      const end = responseText.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        parsed = JSON.parse(responseText.slice(start, end + 1));
      } else {
        throw new Error("Could not parse LLM response as JSON");
      }
    }

    const momRows: MoMRow[] = (parsed.momRows || []).map((r: Partial<MoMRow>, i: number) => ({
      id: generateId(),
      pointNumber: i + 1,
      pointsDiscussed: r.pointsDiscussed || "",
      contactPerson: r.contactPerson || "",
      dependency: r.dependency || "",
      priority: r.priority || "Medium",
      status: r.status || "Open",
    }));

    const actionItems: ActionItem[] = (parsed.actionItems || []).map((a: Partial<ActionItem>) => ({
      id: generateId(),
      task: a.task || "",
      owner: a.owner || "",
      dueDate: a.dueDate || "",
      done: false,
    }));

    return NextResponse.json({ summary: parsed.summary || "", momRows, actionItems });
  } catch (err) {
    console.error("Generate MoM error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

function buildPrompt(transcript: string, meta: MeetingMeta, attendeeNames: string[]): string {
  return `Analyze this meeting transcript and extract structured minutes of meeting (MoM).

Meeting Details:
- Topic: ${meta.topic || "Not specified"}
- Date: ${meta.date || "Not specified"}
- Attendees: ${attendeeNames.join(", ") || "Not specified"}

TRANSCRIPT:
${transcript}

Return ONLY this JSON structure, nothing else:

{
  "summary": "3-5 sentence executive summary of the meeting covering key themes and outcomes.",
  "momRows": [
    {
      "pointsDiscussed": "Clear description of the point. Start with a topic label like 'AI Research:' followed by details.",
      "contactPerson": "Name(s) from the attendee list responsible for this point",
      "dependency": "What this depends on, or 'No Dependency on GATI ERP' etc.",
      "priority": "High or Medium or Low",
      "status": "Open or In Progress or Done"
    }
  ],
  "actionItems": [
    {
      "task": "Specific actionable task extracted from the discussion",
      "owner": "Person responsible (from attendees)",
      "dueDate": "ASAP or End of week or End of month or specific date if mentioned"
    }
  ]
}

Rules:
- Extract ALL distinct discussion points as separate momRows entries
- Be specific and detailed in pointsDiscussed
- contactPerson must be names from the attendee list
- Find all action items even if not explicitly called out as such
- Return ONLY the JSON object, no extra text before or after`;
}
