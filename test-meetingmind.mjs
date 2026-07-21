#!/usr/bin/env node
/**
 * MeetingMind Stress Test Suite
 * Tests all API endpoints and edge cases
 * 
 * Run with: node test-meetingmind.mjs
 * Or against production: BASE_URL=https://your-app.vercel.app node test-meetingmind.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

const pass = (msg) => console.log(`  ${C.green}✓${C.reset} ${msg}`);
const fail = (msg, detail = "") => console.log(`  ${C.red}✗${C.reset} ${msg}${detail ? `\n    ${C.dim}${detail}${C.reset}` : ""}`);
const info = (msg) => console.log(`  ${C.cyan}ℹ${C.reset} ${msg}`);
const section = (msg) => console.log(`\n${C.bold}${C.cyan}▶ ${msg}${C.reset}`);
const warn = (msg) => console.log(`  ${C.yellow}⚠${C.reset} ${msg}`);

let passed = 0;
let failed = 0;
let skipped = 0;

function assert(condition, label, detail = "") {
  if (condition) { pass(label); passed++; }
  else { fail(label, detail); failed++; }
}

function skip(label, reason) {
  console.log(`  ${C.yellow}○${C.reset} ${C.dim}SKIP${C.reset} ${label} — ${reason}`);
  skipped++;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, ok: res.ok, json };
}

// Generate a tiny valid WAV file in memory (silence, ~1 second)
function generateSilentWav(durationSeconds = 1) {
  const sampleRate = 16000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = sampleRate * durationSeconds;
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  // Data is already zeroed (silence)

  return buffer;
}

// Generate fake speech WAV (sine wave tones to simulate voice)
function generateToneWav(durationSeconds = 2, frequency = 440) {
  const sampleRate = 16000;
  const numSamples = sampleRate * durationSeconds;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const sample = Math.round(8000 * Math.sin(2 * Math.PI * frequency * i / sampleRate));
    buffer.writeInt16LE(sample, 44 + i * 2);
  }
  return buffer;
}

// ─── Test: Server health ──────────────────────────────────────────────────────
async function testServerHealth() {
  section("1. Server Health");
  try {
    const start = Date.now();
    const res = await fetch(BASE_URL);
    const ms = Date.now() - start;
    assert(res.ok, `Server responds at ${BASE_URL}`, `Status: ${res.status}`);
    assert(ms < 5000, `Response time under 5s`, `Took ${ms}ms`);
    info(`Response time: ${ms}ms`);
  } catch (err) {
    fail(`Server unreachable at ${BASE_URL}`, err.message);
    failed++;
    console.log(`\n  ${C.red}Cannot reach server — is it running? (npm run dev)${C.reset}\n`);
    process.exit(1);
  }
}

// ─── Test: Transcribe API ─────────────────────────────────────────────────────
async function testTranscribeAPI() {
  section("2. Transcribe API (/api/transcribe)");

  // Test 1: No audio file
  {
    const form = new FormData();
    const { status, json } = await fetchJSON(`${BASE_URL}/api/transcribe`, {
      method: "POST", body: form,
    });
    assert(status === 400, "Returns 400 when no audio provided", JSON.stringify(json));
  }

  // Test 2: Invalid file type (text file)
  {
    const form = new FormData();
    form.append("audio", new Blob(["not audio"], { type: "text/plain" }), "test.txt");
    const { status, json } = await fetchJSON(`${BASE_URL}/api/transcribe`, {
      method: "POST", body: form,
    });
    // Should either error gracefully or return empty — not crash
    assert(status < 500 || json.error, "Handles invalid file type gracefully", JSON.stringify(json));
  }

  // Test 3: Silent WAV (no speech)
  {
    info("Testing silent audio (no speech detected)...");
    const wav = generateSilentWav(2);
    const form = new FormData();
    form.append("audio", new Blob([wav], { type: "audio/wav" }), "silent.wav");
    const start = Date.now();
    const { status, json } = await fetchJSON(`${BASE_URL}/api/transcribe`, {
      method: "POST", body: form,
    });
    const ms = Date.now() - start;
    // Either returns empty text or 400 — both are acceptable
    const acceptable = (status === 200 && typeof json.text === "string") || status === 400;
    assert(acceptable, "Handles silent audio without crashing", `Status: ${status}, Response: ${JSON.stringify(json).slice(0, 100)}`);
    info(`Silent audio response time: ${ms}ms`);
  }

  // Test 4: Valid WAV with tone (tests Groq connection)
  {
    info("Testing audio with tone (tests Groq Whisper connection)...");
    const wav = generateToneWav(3);
    const form = new FormData();
    form.append("audio", new Blob([wav], { type: "audio/wav" }), "tone.wav");
    const start = Date.now();
    const { status, json } = await fetchJSON(`${BASE_URL}/api/transcribe`, {
      method: "POST", body: form,
    });
    const ms = Date.now() - start;
    assert(status < 500, "Groq Whisper API responds without server error", `Status: ${status}`);
    if (status === 200) {
      assert(typeof json.text === "string", "Returns text field", JSON.stringify(json).slice(0, 100));
      info(`Transcription result: "${json.text?.slice(0, 80) || "(empty)"}"`);
    } else {
      warn(`Transcription returned ${status}: ${JSON.stringify(json).slice(0, 100)}`);
    }
    info(`Groq Whisper response time: ${ms}ms`);
  }

  // Test 5: Large file chunking (simulated 25MB+ file)
  {
    info("Testing large file handling (chunking logic)...");
    // Create a ~22MB buffer (enough to trigger chunking)
    const largeBuffer = Buffer.alloc(22 * 1024 * 1024, 0);
    // Write WAV header at start
    const wavHeader = generateSilentWav(1).slice(0, 44);
    wavHeader.copy(largeBuffer, 0);
    
    const form = new FormData();
    form.append("audio", new Blob([largeBuffer], { type: "audio/mp4" }), "large.mp4");
    const start = Date.now();
    const { status, json } = await fetchJSON(`${BASE_URL}/api/transcribe`, {
      method: "POST", body: form,
    });
    const ms = Date.now() - start;
    // Should not crash — may error from Groq but shouldn't 500 with unhandled exception
    assert(status !== 500 || json?.error, "Large file handled gracefully (no unhandled crash)", `Status: ${status}`);
    info(`Large file response time: ${ms}ms`);
  }
}

// ─── Test: Generate MoM API ───────────────────────────────────────────────────
async function testGenerateMoMAPI() {
  section("3. Generate MoM API (/api/generate-mom)");

  const baseMeta = {
    topic: "Q2 Product Planning",
    venue: "Conference Room A",
    date: "2026-06-10",
    timeStart: "10:00",
    timeEnd: "11:00",
    attendees: [
      { id: "1", name: "Aayan Boradia", role: "Product Manager" },
      { id: "2", name: "Sarah Chen", role: "Engineering Lead" },
    ],
  };

  // Test 1: No transcript
  {
    const { status, json } = await fetchJSON(`${BASE_URL}/api/generate-mom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: "", meta: baseMeta }),
    });
    assert(status === 400, "Returns 400 when transcript is empty", JSON.stringify(json));
  }

  // Test 2: Valid English transcript
  {
    info("Testing English transcript...");
    const transcript = `
      Aayan: Good morning everyone. Today we're discussing the Q2 roadmap for our product.
      Sarah: We need to prioritize the authentication module. It's blocking three other features.
      Aayan: Agreed. Sarah, can you have the auth design ready by end of this week?
      Sarah: Yes, I'll have it done by Friday. I'll also need access to the staging environment.
      Aayan: I'll arrange that today. We also need to discuss the mobile app performance issues.
      Sarah: The main bottleneck is the image loading. We should implement lazy loading. That will improve load time by about 60 percent.
      Aayan: Let's make that a high priority item. Sarah, please create a technical spec for that too.
      Sarah: Will do. I can have that ready by next Wednesday.
      Aayan: Perfect. Let's wrap up — auth module by Friday, lazy loading spec by Wednesday, and I'll set up staging access today.
    `;
    const start = Date.now();
    const { status, json } = await fetchJSON(`${BASE_URL}/api/generate-mom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, meta: baseMeta }),
    });
    const ms = Date.now() - start;

    assert(status === 200, "Returns 200 for valid transcript", `Status: ${status}, Error: ${json.error || "none"}`);
    if (status === 200) {
      assert(typeof json.summary === "string" && json.summary.length > 20, "Summary is non-empty string", `Summary: "${json.summary?.slice(0, 80)}"`);
      assert(Array.isArray(json.momRows) && json.momRows.length > 0, `MoM rows generated (got ${json.momRows?.length})`, JSON.stringify(json.momRows?.[0]));
      assert(Array.isArray(json.actionItems) && json.actionItems.length > 0, `Action items generated (got ${json.actionItems?.length})`, JSON.stringify(json.actionItems?.[0]));
      
      if (json.momRows?.length > 0) {
        const row = json.momRows[0];
        assert(typeof row.pointsDiscussed === "string", "MoM row has pointsDiscussed");
        assert(["High", "Medium", "Low", ""].includes(row.priority), `MoM row priority is valid (got "${row.priority}")`);
        assert(["Open", "In Progress", "Done", ""].includes(row.status), `MoM row status is valid (got "${row.status}")`);
        assert(typeof row.pointNumber === "number", "MoM row has pointNumber");
      }

      if (json.actionItems?.length > 0) {
        const item = json.actionItems[0];
        assert(typeof item.task === "string" && item.task.length > 0, "Action item has task");
        assert(typeof item.done === "boolean", "Action item has done boolean");
      }

      info(`Summary: "${json.summary?.slice(0, 100)}..."`);
      info(`MoM rows: ${json.momRows?.length}, Action items: ${json.actionItems?.length}`);
    }
    info(`MoM generation time: ${ms}ms`);
  }

  // Test 3: Hindi + English mixed transcript (Hinglish)
  {
    info("Testing Hindi + English mixed transcript (Hinglish)...");
    const hinglishTranscript = `
      Aayan: Aaj hum Q3 planning ke baare mein baat karenge. Today we will discuss our Q3 targets.
      Sarah: Haan, mujhe lagta hai ki authentication module ko pehle complete karna chahiye. I think auth should be first priority.
      Aayan: Bilkul sahi. Sarah, kya aap Friday tak design ready kar sakti hain? Can you finish by Friday?
      Sarah: Ji haan, main Friday tak kar doongi. Yes I will complete by Friday. But I also need staging access.
      Aayan: Theek hai, main aaj staging access arrange kar deta hoon. I will arrange staging access today.
      Sarah: Bahut acha. Also, mobile app mein image loading slow hai. Image loading is too slow on mobile.
      Aayan: Haan yeh important issue hai. This is high priority. Please lazy loading implement karo.
    `;
    const start = Date.now();
    const { status, json } = await fetchJSON(`${BASE_URL}/api/generate-mom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: hinglishTranscript, meta: baseMeta }),
    });
    const ms = Date.now() - start;
    assert(status === 200, "Handles Hinglish transcript", `Status: ${status}`);
    if (status === 200) {
      assert(json.momRows?.length > 0, `Extracts points from Hinglish (${json.momRows?.length} rows)`);
      assert(json.actionItems?.length > 0, `Extracts actions from Hinglish (${json.actionItems?.length} items)`);
    }
    info(`Hinglish MoM generation time: ${ms}ms`);
  }

  // Test 4: Very short transcript
  {
    const { status, json } = await fetchJSON(`${BASE_URL}/api/generate-mom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: "Quick sync. All good. No issues.", meta: baseMeta }),
    });
    assert(status === 200, "Handles very short transcript", `Status: ${status}`);
    if (status === 200) {
      assert(typeof json.summary === "string", "Generates summary even for short transcript");
    }
  }

  // Test 5: Very long transcript (stress test)
  {
    info("Testing very long transcript (stress test)...");
    const longTranscript = Array(50).fill(null).map((_, i) => `
      Speaker ${i % 3 + 1}: This is discussion point number ${i + 1}. We need to address the issue with module ${i + 1}. 
      The deadline is end of month and the priority is ${i % 3 === 0 ? "high" : i % 3 === 1 ? "medium" : "low"}.
      Speaker ${(i + 1) % 3 + 1}: Agreed. I will take ownership of item ${i + 1} and complete it by ${i % 4 === 0 ? "Friday" : "next week"}.
    `).join("\n");

    const start = Date.now();
    const { status, json } = await fetchJSON(`${BASE_URL}/api/generate-mom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: longTranscript, meta: baseMeta }),
    });
    const ms = Date.now() - start;
    assert(status === 200, "Handles very long transcript without timeout", `Status: ${status}`);
    if (status === 200) {
      assert(json.momRows?.length > 0, `Extracts points from long transcript (${json.momRows?.length} rows)`);
    }
    info(`Long transcript processing time: ${ms}ms`);
  }

  // Test 6: No attendees (should still work)
  {
    const metaNoAttendees = { ...baseMeta, attendees: [] };
    const { status, json } = await fetchJSON(`${BASE_URL}/api/generate-mom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: "We discussed the product roadmap and decided to launch in Q3.",
        meta: metaNoAttendees,
      }),
    });
    assert(status === 200, "Works without attendees", `Status: ${status}`);
  }

  // Test 7: Missing meta fields
  {
    const minimalMeta = { topic: "", venue: "", date: "", timeStart: "", timeEnd: "", attendees: [] };
    const { status, json } = await fetchJSON(`${BASE_URL}/api/generate-mom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: "We discussed project timelines and assigned tasks to team members.",
        meta: minimalMeta,
      }),
    });
    assert(status === 200, "Works with empty meta fields", `Status: ${status}`);
  }
}

// ─── Test: End-to-end flow ────────────────────────────────────────────────────
async function testEndToEnd() {
  section("4. End-to-End Flow Simulation");

  info("Simulating full meeting flow: audio → transcribe → generate MoM");

  // Use a pre-transcribed text to simulate what Whisper would return
  const simulatedTranscript = `
    Good morning team. Today we are reviewing the product launch plan for July.
    The marketing team needs the final copy by June 20th. John will handle that.
    Engineering needs to complete the API integration by June 18th. That is Sarah's responsibility.
    We also discussed the budget. We have approved 50,000 dollars for the launch campaign.
    The QA team needs to finish testing by June 15th. Mike is leading that effort.
    Next steps: John to submit marketing copy by June 20th, Sarah to complete API by June 18th, Mike to finish QA by June 15th.
    Meeting adjourned.
  `;

  const meta = {
    topic: "July Product Launch Planning",
    venue: "Main Office",
    date: "2026-06-10",
    timeStart: "09:00",
    timeEnd: "09:45",
    attendees: [
      { id: "1", name: "John", role: "Marketing" },
      { id: "2", name: "Sarah", role: "Engineering" },
      { id: "3", name: "Mike", role: "QA" },
    ],
  };

  const start = Date.now();
  const { status, json } = await fetchJSON(`${BASE_URL}/api/generate-mom`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript: simulatedTranscript, meta }),
  });
  const ms = Date.now() - start;

  assert(status === 200, "End-to-end MoM generation succeeds");

  if (status === 200) {
    // Validate summary mentions key topics
    const summaryLower = json.summary?.toLowerCase() || "";
    assert(summaryLower.length > 50, "Summary has meaningful content");

    // Validate MoM rows
    assert(json.momRows?.length >= 2, `At least 2 discussion points extracted (got ${json.momRows?.length})`);

    // Validate action items — should find John, Sarah, Mike tasks
    assert(json.actionItems?.length >= 2, `At least 2 action items extracted (got ${json.actionItems?.length})`);

    // Check for date mentions in action items
    const hasDeadlines = json.actionItems?.some(a => a.dueDate && a.dueDate !== "TBD");
    assert(hasDeadlines, "Action items include deadlines from transcript");

    // Check owner assignment
    const hasOwners = json.actionItems?.some(a => a.owner && a.owner.length > 0);
    assert(hasOwners, "Action items have owners assigned");

    info(`\n  Summary preview: "${json.summary?.slice(0, 120)}..."`);
    info(`  MoM rows (${json.momRows?.length}):`);
    json.momRows?.slice(0, 3).forEach(r => info(`    ${r.pointNumber}. ${r.pointsDiscussed?.slice(0, 60)}...`));
    info(`  Action items (${json.actionItems?.length}):`);
    json.actionItems?.slice(0, 3).forEach(a => info(`    • ${a.task?.slice(0, 60)} — ${a.owner} by ${a.dueDate}`));
  }

  info(`End-to-end time: ${ms}ms`);
}

// ─── Test: Concurrent requests ────────────────────────────────────────────────
async function testConcurrentRequests() {
  section("5. Concurrent Request Handling");

  info("Sending 3 concurrent MoM generation requests...");

  const transcripts = [
    "Team discussed the new feature release. Alice will handle frontend by Friday. Bob will do backend by Thursday.",
    "Budget review completed. Approved 10000 dollars for Q3. Finance team to process by month end.",
    "Customer feedback session. Three main issues identified. Support team to respond within 48 hours.",
  ];

  const meta = {
    topic: "Concurrent Test",
    venue: "Online",
    date: "2026-06-10",
    timeStart: "10:00",
    timeEnd: "10:30",
    attendees: [],
  };

  const start = Date.now();
  const results = await Promise.allSettled(
    transcripts.map(transcript =>
      fetchJSON(`${BASE_URL}/api/generate-mom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, meta }),
      })
    )
  );
  const ms = Date.now() - start;

  const successes = results.filter(r => r.status === "fulfilled" && r.value.status === 200);
  assert(successes.length === 3, `All 3 concurrent requests succeeded (${successes.length}/3)`, 
    results.map((r, i) => `Request ${i+1}: ${r.status === "fulfilled" ? r.value.status : "rejected"}`).join(", "));
  info(`Concurrent requests completed in ${ms}ms (avg ${Math.round(ms/3)}ms each)`);
}

// ─── Test: Error handling ─────────────────────────────────────────────────────
async function testErrorHandling() {
  section("6. Error Handling & Edge Cases");

  // Wrong method
  {
    const { status } = await fetchJSON(`${BASE_URL}/api/transcribe`, { method: "GET" });
    assert(status === 405 || status === 404 || status !== 200, "GET on POST-only endpoint returns non-200", `Got ${status}`);
  }

  // Malformed JSON to generate-mom
  {
    const { status } = await fetchJSON(`${BASE_URL}/api/generate-mom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ invalid json {{{{",
    });
    assert(status >= 400, "Malformed JSON returns error status", `Got ${status}`);
  }

  // Empty body to generate-mom
  {
    const { status, json } = await fetchJSON(`${BASE_URL}/api/generate-mom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert(status === 400 || status === 500, "Empty body returns error", `Got ${status}: ${JSON.stringify(json)}`);
  }

  // Very large transcript (potential timeout)
  {
    const hugeTranscript = "Meeting discussion point. ".repeat(5000); // ~125KB
    const start = Date.now();
    const { status, json } = await fetchJSON(`${BASE_URL}/api/generate-mom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: hugeTranscript,
        meta: { topic: "Test", venue: "", date: "", timeStart: "", timeEnd: "", attendees: [] },
      }),
    });
    const ms = Date.now() - start;
    assert(status < 500, `Handles very large transcript without crashing (${ms}ms)`, `Status: ${status}`);
  }
}

// ─── Test: Response time benchmarks ──────────────────────────────────────────
async function testPerformance() {
  section("7. Performance Benchmarks");

  const meta = {
    topic: "Performance Test",
    venue: "Test Room",
    date: "2026-06-10",
    timeStart: "10:00",
    timeEnd: "11:00",
    attendees: [{ id: "1", name: "Test User", role: "Tester" }],
  };

  const shortTranscript = "Team agreed to launch product next month. John will lead the effort.";
  const mediumTranscript = Array(10).fill("We discussed the roadmap and assigned tasks to team members. The deadline is end of month.").join(" ");

  // Short transcript benchmark
  {
    const times = [];
    for (let i = 0; i < 3; i++) {
      const start = Date.now();
      await fetchJSON(`${BASE_URL}/api/generate-mom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: shortTranscript, meta }),
      });
      times.push(Date.now() - start);
    }
    const avg = Math.round(times.reduce((a, b) => a + b) / times.length);
    assert(avg < 15000, `Short transcript avg response < 15s (avg: ${avg}ms)`, `Times: ${times.join("ms, ")}ms`);
    info(`Short transcript: avg ${avg}ms (${times.join("ms, ")}ms)`);
  }

  // Medium transcript benchmark
  {
    const start = Date.now();
    await fetchJSON(`${BASE_URL}/api/generate-mom`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: mediumTranscript, meta }),
    });
    const ms = Date.now() - start;
    assert(ms < 30000, `Medium transcript response < 30s (took: ${ms}ms)`);
    info(`Medium transcript: ${ms}ms`);
  }
}

// ─── Test: Groq API key validation ───────────────────────────────────────────
async function testGroqConfig() {
  section("8. Groq Configuration Check");

  if (!GROQ_API_KEY) {
    warn("GROQ_API_KEY not set in environment — skipping direct Groq tests");
    info("Set GROQ_API_KEY=your_key to test Groq directly");
    skipped += 2;
    return;
  }

  // Test Groq chat API directly
  {
    info("Testing Groq Llama API directly...");
    const start = Date.now();
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: 'Say "OK" and nothing else.' }],
        max_tokens: 10,
      }),
    });
    const ms = Date.now() - start;
    const json = await res.json();
    assert(res.ok, `Groq Llama API accessible (${ms}ms)`, JSON.stringify(json).slice(0, 100));
    if (res.ok) {
      info(`Groq response: "${json.choices?.[0]?.message?.content}"`);
      const usage = json.usage;
      if (usage) info(`Tokens used: ${usage.total_tokens}`);
    }
  }

  // Check Groq rate limit headers
  {
    info("Checking Groq rate limit status...");
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { "Authorization": `Bearer ${GROQ_API_KEY}` },
    });
    assert(res.ok, "Groq API key is valid");
    const remaining = res.headers.get("x-ratelimit-remaining-requests");
    const limit = res.headers.get("x-ratelimit-limit-requests");
    if (remaining && limit) {
      info(`Rate limit: ${remaining}/${limit} requests remaining`);
      assert(parseInt(remaining) > 0, "Rate limit not exceeded");
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}${C.cyan}╔═══════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║     MeetingMind Stress Test Suite     ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚═══════════════════════════════════════╝${C.reset}`);
  console.log(`\n  Target: ${C.cyan}${BASE_URL}${C.reset}`);
  console.log(`  Started: ${new Date().toLocaleTimeString()}\n`);

  const totalStart = Date.now();

  await testServerHealth();
  await testTranscribeAPI();
  await testGenerateMoMAPI();
  await testEndToEnd();
  await testConcurrentRequests();
  await testErrorHandling();
  await testPerformance();
  await testGroqConfig();

  const totalMs = Date.now() - totalStart;

  console.log(`\n${C.bold}${C.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
  console.log(`${C.bold}  Results${C.reset}`);
  console.log(`${C.bold}${C.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
  console.log(`  ${C.green}Passed:  ${passed}${C.reset}`);
  console.log(`  ${C.red}Failed:  ${failed}${C.reset}`);
  console.log(`  ${C.yellow}Skipped: ${skipped}${C.reset}`);
  console.log(`  Total time: ${(totalMs / 1000).toFixed(1)}s`);

  const pct = Math.round((passed / (passed + failed)) * 100);
  if (failed === 0) {
    console.log(`\n  ${C.green}${C.bold}✓ All tests passed! (${pct}%)${C.reset}\n`);
  } else if (pct >= 80) {
    console.log(`\n  ${C.yellow}${C.bold}⚠ ${pct}% passed — some issues to fix${C.reset}\n`);
  } else {
    console.log(`\n  ${C.red}${C.bold}✗ ${pct}% passed — significant issues detected${C.reset}\n`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`\n${C.red}Fatal error: ${err.message}${C.reset}\n`);
  process.exit(1);
});
