import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { MeetingMeta, MoMRow, ActionItem } from "@/types";
import { generateId } from "@/lib/utils";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transcript, meta }: { transcript: string; meta: MeetingMeta } = body;

    if (!transcript?.trim()) {
      return NextResponse.json({ error: "No transcript provided" }, { status: 400 });
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return NextResponse.json({ error: "GROQ_API_KEY not configured" }, { status: 500 });
    }

    const client = new Groq({ apiKey: groqKey });

    const attendeeList = meta.attendees.map(a => a.name).filter(Boolean).join(", ") || "Not specified";

    const prompt = `You are an expert meeting analyst. Analyze this meeting transcript and produce structured minutes.

Meeting Details:
- Topic: ${meta.topic || "Not specified"}
- Date: ${meta.date || "Not specified"}
- Time: ${meta.timeStart || ""}${meta.timeEnd ? ` to ${meta.timeEnd}` : ""}
- Venue: ${meta.venue || "Not specified"}
- Attendees: ${attendeeList}

TRANSCRIPT:
${transcript}

Return ONLY this exact JSON structure, no other text:

{
  "summary": "A clear 3-5 sentence executive summary covering what was discussed, key decisions made, and overall outcome of the meeting.",
  "momRows": [
    {
      "pointsDiscussed": "Specific point discussed. Be detailed and clear.",
      "contactPerson": "Person responsible (use attendee names if provided, otherwise leave blank)",
      "dependency": "What this depends on, or 'No Dependency'",
      "priority": "High",
      "status": "Open"
    }
  ],
  "actionItems": [
    {
      "task": "Specific action that needs to be done",
      "owner": "Person responsible",
      "dueDate": "Specific date or timeframe mentioned, or 'TBD'"
    }
  ]
}

Rules:
- Extract ALL distinct discussion points as separate momRows
- priority must be exactly: High, Medium, or Low
- status must be exactly: Open, In Progress, or Done
- If attendees are not specified, leave contactPerson as empty string
- Find all action items even if not explicitly stated
- Return ONLY the JSON, nothing else before or after`;

    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 4096,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "You are a meeting analyst. Always respond with valid JSON only. No markdown, no explanation, just the JSON object.",
        },
        { role: "user", content: prompt },
      ],
    });

    const responseText = completion.choices[0]?.message?.content || "";

    let parsed;
    try {
      // Strip any markdown if present
      const cleaned = responseText.replace(/```json\n?|\n?```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // Try to extract JSON
      const start = responseText.indexOf("{");
      const end = responseText.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        parsed = JSON.parse(responseText.slice(start, end + 1));
      } else {
        throw new Error("Could not parse response as JSON");
      }
    }

    const momRows: MoMRow[] = (parsed.momRows || []).map((r: Partial<MoMRow>, i: number) => ({
      id: generateId(),
      pointNumber: i + 1,
      pointsDiscussed: r.pointsDiscussed || "",
      contactPerson: r.contactPerson || "",
      dependency: r.dependency || "No Dependency",
      priority: (["High", "Medium", "Low"].includes(r.priority as string) ? r.priority : "Medium") as MoMRow["priority"],
      status: (["Open", "In Progress", "Done"].includes(r.status as string) ? r.status : "Open") as MoMRow["status"],
    }));

    const actionItems: ActionItem[] = (parsed.actionItems || []).map((a: Partial<ActionItem>) => ({
      id: generateId(),
      task: a.task || "",
      owner: a.owner || "",
      dueDate: a.dueDate || "TBD",
      done: false,
    }));

    return NextResponse.json({
      summary: parsed.summary || "",
      momRows,
      actionItems,
    });
  } catch (err) {
    console.error("Generate MoM error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate MoM" },
      { status: 500 }
    );
  }
}