"use client";

import {
  useState,
  useCallback,
  useEffect,
} from "react";

import {
  MeetingMeta,
  MoMRow,
  ActionItem,
  MeetingResult,
} from "@/types";

import {
  MeetingForm,
} from "@/components/recorder/MeetingForm";

import {
  RecorderPanel,
} from "@/components/recorder/RecorderPanel";

import {
  MoMTable,
} from "@/components/mom/MoMTable";

import {
  ActionItems,
} from "@/components/mom/ActionItems";

import {
  Button,
  Card,
  SectionLabel,
} from "@/components/ui";

import {
  Mic,
  Monitor,
  FileText,
  Download,
  Copy,
  Loader2,
  AlertCircle,
  History,
} from "lucide-react";

import {
  cn,
  generateId,
  saveMoMToLocal,
  loadMoMHistory,
} from "@/lib/utils";

import {
  chunkSavedRecording,
} from "../audioChunker";

type AppTab =
  | "inperson"
  | "virtual"
  | "minutes"
  | "history";

interface TranscriptCache {
  fingerprint: string;

  totalParts: number;

  parts: string[];

  completedParts: boolean[];

  complete: boolean;

  transcript?: string;

  savedAt: string;
}

interface ExtractedDiscussionPoint {
  pointsDiscussed: string;

  contactPerson: string;

  dependency: string;

  priority:
    | "High"
    | "Medium"
    | "Low";

  status:
    | "Open"
    | "In Progress"
    | "Done";
}

interface ExtractedActionItem {
  task: string;

  owner: string;

  dueDate: string;
}

interface AnalysisResult {
  discussionPoints:
    ExtractedDiscussionPoint[];

  actionItems:
    ExtractedActionItem[];
}

interface MomAnalysisCache {
  transcriptHash: string;

  totalChunks: number;

  chunks:
    (
      | AnalysisResult
      | null
    )[];

  complete: boolean;

  savedAt: string;
}

const TRANSCRIPT_CHUNK_CHARS =
  12000;

const QWEN_CALL_SPACING_MS =
  65000;

const defaultMeta =
  (): MeetingMeta => ({
    topic: "",

    venue: "",

    date:
      new Date()
        .toISOString()
        .split("T")[0],

    timeStart: "",

    timeEnd: "",

    attendees: [],
  });

function sleep(
  ms: number
) {
  return new Promise<void>(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );
}

function readJsonSafely(
  text: string
): Record<
  string,
  unknown
> | null {
  try {
    return text
      ? JSON.parse(text)
      : null;
  } catch {
    return null;
  }
}

async function sha256Text(
  text: string
): Promise<string> {
  const encoded =
    new TextEncoder().encode(
      text
    );

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      encoded
    );

  return Array.from(
    new Uint8Array(
      digest
    )
  )
    .map((b) =>
      b
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}

async function createRecordingFingerprint(
  blob: Blob
): Promise<string> {
  const SAMPLE_SIZE =
    64 * 1024;

  const first =
    await blob
      .slice(
        0,
        Math.min(
          SAMPLE_SIZE,
          blob.size
        )
      )
      .arrayBuffer();

  const lastStart =
    Math.max(
      0,
      blob.size -
        SAMPLE_SIZE
    );

  const last =
    await blob
      .slice(
        lastStart,
        blob.size
      )
      .arrayBuffer();

  const metadata =
    new TextEncoder().encode(
      `${blob.size}|${blob.type}|`
    );

  const combined =
    new Uint8Array(
      metadata.byteLength +
        first.byteLength +
        last.byteLength
    );

  combined.set(
    metadata,
    0
  );

  combined.set(
    new Uint8Array(
      first
    ),
    metadata.byteLength
  );

  combined.set(
    new Uint8Array(
      last
    ),
    metadata.byteLength +
      first.byteLength
  );

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      combined
    );

  return Array.from(
    new Uint8Array(
      digest
    )
  )
    .map((b) =>
      b
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}

function splitTranscript(
  text: string,
  maxChars =
    TRANSCRIPT_CHUNK_CHARS
): string[] {
  const clean =
    text.trim();

  if (
    clean.length <=
    maxChars
  ) {
    return [clean];
  }

  const chunks:
    string[] = [];

  let remaining =
    clean;

  while (
    remaining.length >
    maxChars
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

      if (
        splitAt !== -1
      ) {
        splitAt += 1;
      }
    }

    if (
      splitAt <
      maxChars * 0.6
    ) {
      splitAt =
        maxChars;
    }

    const chunk =
      remaining
        .slice(
          0,
          splitAt
        )
        .trim();

    if (chunk) {
      chunks.push(
        chunk
      );
    }

    remaining =
      remaining
        .slice(
          splitAt
        )
        .trim();
  }

  if (remaining) {
    chunks.push(
      remaining
    );
  }

  return chunks;
}

function getExtension(
  blob: Blob
) {
  if (
    blob.type.includes(
      "wav"
    )
  ) {
    return "wav";
  }

  if (
    blob.type.includes(
      "mp4"
    )
  ) {
    return "mp4";
  }

  if (
    blob.type.includes(
      "ogg"
    )
  ) {
    return "ogg";
  }

  if (
    blob.type.includes(
      "webm"
    )
  ) {
    return "webm";
  }

  if (
    blob.type.includes(
      "mpeg"
    )
  ) {
    return "mp3";
  }

  return "audio";
}

function getRetryWaitMs(
  responseText: string
) {
  const match =
    responseText.match(
      /try again in\s+([\d.]+)s/i
    );

  if (match) {
    const seconds =
      Number(
        match[1]
      );

    if (
      Number.isFinite(
        seconds
      )
    ) {
      return (
        Math.ceil(
          seconds * 1000
        ) + 4000
      );
    }
  }

  return 65000;
}

async function transcribeWithRetry(
  audioPart: Blob,
  partNumber: number,
  onStatus?: (
    status: string
  ) => void
): Promise<string> {
  const MAX_RETRIES =
    40;

  for (
    let attempt = 0;
    attempt <=
    MAX_RETRIES;
    attempt++
  ) {
    const formData =
      new FormData();

    formData.append(
      "audio",

      audioPart,

      `recording-part-${partNumber}.${getExtension(
        audioPart
      )}`
    );

    const response =
      await fetch(
        "/api/transcribe",
        {
          method:
            "POST",

          body:
            formData,
        }
      );

    const responseText =
      await response.text();

    const data =
      readJsonSafely(
        responseText
      ) as {
        text?: string;
        error?: string;
      } | null;

    if (
      response.ok
    ) {
      return (
        data?.text?.trim() ||
        ""
      );
    }

    const errorText =
      `${data?.error || ""} ${responseText}`;

    const rateLimited =
      response.status ===
        429 ||
      /rate.?limit/i.test(
        errorText
      ) ||
      /rate_limit_exceeded/i.test(
        errorText
      );

    if (
      rateLimited &&
      attempt <
        MAX_RETRIES
    ) {
      const waitMs =
        getRetryWaitMs(
          errorText
        );

      onStatus?.(
        `Groq transcription limit reached. Part ${partNumber} is safe. Waiting ${Math.ceil(
          waitMs / 1000
        )} seconds before continuing...`
      );

      await sleep(
        waitMs
      );

      continue;
    }

    throw new Error(
      data?.error ||
        responseText ||
        `Transcription part ${partNumber} failed.`
    );
  }

  throw new Error(
    `Part ${partNumber} could not complete after repeated retries. Saved progress will be reused next time.`
  );
}

async function postJsonWithRetry<
  T
>(
  url: string,

  payload:
    unknown,

  label:
    string,

  onStatus?: (
    status: string
  ) => void
): Promise<T> {
  const MAX_RETRIES =
    20;

  for (
    let attempt = 0;
    attempt <=
    MAX_RETRIES;
    attempt++
  ) {
    const response =
      await fetch(
        url,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify(
              payload
            ),
        }
      );

    const responseText =
      await response.text();

    const parsed =
      readJsonSafely(
        responseText
      );

    if (
      response.ok
    ) {
      return parsed as T;
    }

    const errorMessage =
      (
        parsed as {
          error?: string;
        } | null
      )?.error ||
      responseText;

    const rateLimited =
      response.status ===
        429 ||
      /rate.?limit/i.test(
        errorMessage
      ) ||
      /rate_limit_exceeded/i.test(
        errorMessage
      );

    if (
      rateLimited &&
      attempt <
        MAX_RETRIES
    ) {
      const waitMs =
        getRetryWaitMs(
          errorMessage
        );

      onStatus?.(
        `${label} hit the Groq rate limit. Waiting ${Math.ceil(
          waitMs / 1000
        )} seconds before retrying...`
      );

      await sleep(
        waitMs
      );

      continue;
    }

    throw new Error(
      errorMessage ||
        `${label} failed with HTTP ${response.status}.`
    );
  }

  throw new Error(
    `${label} could not complete after repeated retries.`
  );
}

function normalizeForDedupe(
  value: string
) {
  return value
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .trim()
    .replace(
      /\s+/g,
      " "
    );
}

function dedupeDiscussionPoints(
  points:
    ExtractedDiscussionPoint[]
) {
  const seen =
    new Set<string>();

  return points.filter(
    (point) => {
      const key =
        normalizeForDedupe(
          point.pointsDiscussed ||
            ""
        );

      if (!key) {
        return false;
      }

      if (
        seen.has(key)
      ) {
        return false;
      }

      seen.add(key);

      return true;
    }
  );
}

function dedupeActionItems(
  actions:
    ExtractedActionItem[]
) {
  const seen =
    new Set<string>();

  return actions.filter(
    (action) => {
      const key =
        normalizeForDedupe(
          `${action.task || ""} ${action.owner || ""}`
        );

      if (!key) {
        return false;
      }

      if (
        seen.has(key)
      ) {
        return false;
      }

      seen.add(key);

      return true;
    }
  );
}

export default function Home() {
  const [
    activeTab,
    setActiveTab,
  ] =
    useState<AppTab>(
      "inperson"
    );

  const [
    meta,
    setMeta,
  ] =
    useState<MeetingMeta>(
      defaultMeta()
    );

  const [
    summary,
    setSummary,
  ] =
    useState("");

  const [
    momRows,
    setMomRows,
  ] =
    useState<
      MoMRow[]
    >([]);

  const [
    actionItems,
    setActionItems,
  ] =
    useState<
      ActionItem[]
    >([]);

  const [
    hasMoM,
    setHasMoM,
  ] =
    useState(false);

  const [
    isGenerating,
    setIsGenerating,
  ] =
    useState(false);

  const [
    processingStatus,
    setProcessingStatus,
  ] =
    useState("");

  const [
    generateError,
    setGenerateError,
  ] =
    useState<
      string | null
    >(null);

  const [
    copied,
    setCopied,
  ] =
    useState(false);

  const [
    history,
    setHistory,
  ] =
    useState<
      MeetingResult[]
    >([]);

  const [
    savedTranscriptAvailable,
    setSavedTranscriptAvailable,
  ] =
    useState(false);

  useEffect(
    () => {
      setHistory(
        loadMoMHistory()
      );

      setSavedTranscriptAvailable(
        Boolean(
          localStorage.getItem(
            "meetingmind_last_transcript"
          )
        )
      );
    },
    []
  );

  const updateMeta =
    useCallback(
      (
        patch:
          Partial<MeetingMeta>
      ) => {
        setMeta(
          (current) => ({
            ...current,
            ...patch,
          })
        );
      },
      []
    );

  const addAttendee =
    useCallback(
      () => {
        setMeta(
          (current) => ({
            ...current,

            attendees: [
              ...current.attendees,

              {
                id:
                  generateId(),

                name:
                  "",

                role:
                  "",
              },
            ],
          })
        );
      },
      []
    );

  const updateAttendee =
    useCallback(
      (
        id: string,

        patch: {
          name?:
            string;

          role?:
            string;
        }
      ) => {
        setMeta(
          (current) => ({
            ...current,

            attendees:
              current.attendees.map(
                (
                  attendee
                ) =>
                  attendee.id ===
                  id
                    ? {
                        ...attendee,
                        ...patch,
                      }
                    : attendee
              ),
          })
        );
      },
      []
    );

  const removeAttendee =
    useCallback(
      (
        id: string
      ) => {
        setMeta(
          (current) => ({
            ...current,

            attendees:
              current.attendees.filter(
                (
                  attendee
                ) =>
                  attendee.id !==
                  id
              ),
          })
        );
      },
      []
    );

  const applyFinishedMom =
    useCallback(
      (
        finalSummary:
          string,

        discussionPoints:
          ExtractedDiscussionPoint[],

        extractedActions:
          ExtractedActionItem[]
      ) => {
        const cleanPoints =
          dedupeDiscussionPoints(
            discussionPoints
          );

        const cleanActions =
          dedupeActionItems(
            extractedActions
          );

        const rows:
          MoMRow[] =
          cleanPoints.map(
            (
              point,
              index
            ) => {
              const priority =
                [
                  "High",
                  "Medium",
                  "Low",
                ].includes(
                  point.priority
                )
                  ? point.priority
                  : "Medium";

              const status =
                [
                  "Open",
                  "In Progress",
                  "Done",
                ].includes(
                  point.status
                )
                  ? point.status
                  : "Open";

              return {
                id:
                  generateId(),

                pointNumber:
                  index + 1,

                pointsDiscussed:
                  point.pointsDiscussed ||
                  "",

                contactPerson:
                  point.contactPerson ||
                  "",

                dependency:
                  point.dependency ||
                  "No Dependency",

                priority:
                  priority as MoMRow["priority"],

                status:
                  status as MoMRow["status"],
              };
            }
          );

        const actions:
          ActionItem[] =
          cleanActions.map(
            (
              action
            ) => ({
              id:
                generateId(),

              task:
                action.task ||
                "",

              owner:
                action.owner ||
                "",

              dueDate:
                action.dueDate ||
                "TBD",

              done:
                false,
            })
          );

        setSummary(
          finalSummary
        );

        setMomRows(
          rows
        );

        setActionItems(
          actions
        );

        setHasMoM(
          true
        );

        setActiveTab(
          "minutes"
        );

        const result:
          MeetingResult =
          {
            meta,

            summary:
              finalSummary,

            momRows:
              rows,

            actionItems:
              actions,

            generatedAt:
              new Date().toISOString(),
          };

        saveMoMToLocal(
          result
        );

        setHistory(
          loadMoMHistory()
        );
      },
      [meta]
    );

  const generateMomFromTranscript =
    useCallback(
      async (
        transcript:
          string
      ) => {
        setProcessingStatus(
          "Preparing transcript for MOM analysis..."
        );

        const transcriptHash =
          await sha256Text(
            transcript
          );

        const chunks =
          splitTranscript(
            transcript
          );

        const cacheKey =
          `meetingmind_mom_analysis_${transcriptHash}`;

        let cache:
          MomAnalysisCache =
          {
            transcriptHash,

            totalChunks:
              chunks.length,

            chunks:
              new Array(
                chunks.length
              ).fill(
                null
              ),

            complete:
              false,

            savedAt:
              new Date().toISOString(),
          };

        const existing =
          localStorage.getItem(
            cacheKey
          );

        if (
          existing
        ) {
          try {
            const parsed =
              JSON.parse(
                existing
              ) as MomAnalysisCache;

            if (
              parsed.totalChunks ===
              chunks.length
            ) {
              cache =
                parsed;
            }
          } catch {
            // Ignore damaged cache
          }
        }

        for (
          let index = 0;
          index <
          chunks.length;
          index++
        ) {
          if (
            cache.chunks[
              index
            ]
          ) {
            setProcessingStatus(
              `MOM analysis ${index + 1}/${chunks.length} already saved — skipping.`
            );

            continue;
          }

          setProcessingStatus(
            `Analyzing meeting section ${index + 1} of ${chunks.length}...`
          );

          const result =
            await postJsonWithRetry<AnalysisResult>(
              "/api/generate-mom",

              {

                mode:
                  "analyze",
                
                transcriptChunk:
                  chunks[
                    index
                  ],

                chunkNumber:
                  index + 1,

                totalChunks:
                  chunks.length,

                meta,
              },

              `MOM section ${index + 1}`,

              setProcessingStatus
            );

          cache.chunks[
            index
          ] =
            result;

          cache.savedAt =
            new Date().toISOString();

          localStorage.setItem(
            cacheKey,

            JSON.stringify(
              cache
            )
          );

          /*
           * IMPORTANT:
           *
           * The WAIT happens in the browser.
           * Vercel is not doing anything during this time.
           */
          if (
            index <
            chunks.length -
              1
          ) {
            setProcessingStatus(
              `Section ${index + 1}/${chunks.length} saved. Waiting for Groq rate limit window before the next section...`
            );

            await sleep(
              QWEN_CALL_SPACING_MS
            );
          }
        }

        cache.complete =
          true;

        cache.savedAt =
          new Date().toISOString();

        localStorage.setItem(
          cacheKey,

          JSON.stringify(
            cache
          )
        );

        const analysisResults =
          cache.chunks.filter(
            (
              item
            ): item is AnalysisResult =>
              item !==
              null
          );

        const allPoints =
          dedupeDiscussionPoints(
            analysisResults.flatMap(
              (
                result
              ) =>
                result.discussionPoints ||
                []
            )
          );

        const allActions =
          dedupeActionItems(
            analysisResults.flatMap(
              (
                result
              ) =>
                result.actionItems ||
                []
            )
          );

        /*
         * Give Groq's minute window time to reset
         * before the summary call.
         */
        if (
          chunks.length >
          0
        ) {
          setProcessingStatus(
            "All meeting sections analyzed. Waiting before generating final executive summary..."
          );

          await sleep(
            QWEN_CALL_SPACING_MS
          );
        }

        setProcessingStatus(
          "Generating final meeting summary..."
        );

        const finalResult =
          await postJsonWithRetry<{
            summary?: string;
          }>(
            "/api/generate-mom",

            {
              mode: "finalize",
              
              discussionPoints:
                allPoints,

              actionItems:
                allActions,

              meta,
            },

            "Final MOM summary",

            setProcessingStatus
          );

        applyFinishedMom(
          finalResult.summary ||
            "",

          allPoints,

          allActions
        );
      },
      [
        meta,
        applyFinishedMom,
      ]
    );

  const handleRecordingStop =
    async (
      blob:
        Blob,

      _duration:
        number,

      transcriptionBlobs?:
        Blob[]
    ) => {
      setIsGenerating(
        true
      );

      setGenerateError(
        null
      );

      try {
        setProcessingStatus(
          "Preparing recording..."
        );

        const fingerprint =
          await createRecordingFingerprint(
            blob
          );

        const cacheKey =
          `meetingmind_transcript_${fingerprint}`;

        let audioFiles:
          Blob[];

        if (
          transcriptionBlobs &&
          transcriptionBlobs.length >
            0
        ) {
          audioFiles =
            transcriptionBlobs;
        } else if (
          blob.size >
          20 *
            1024 *
            1024
        ) {
          setProcessingStatus(
            "Large saved recording detected. Splitting audio locally into safe transcription segments..."
          );

          audioFiles =
            await chunkSavedRecording(
              blob
            );
        } else {
          audioFiles = [
            blob,
          ];
        }

        let cache:
          TranscriptCache | null =
          null;

        const existing =
          localStorage.getItem(
            cacheKey
          );

        if (
          existing
        ) {
          try {
            cache =
              JSON.parse(
                existing
              ) as TranscriptCache;
          } catch {
            cache =
              null;
          }
        }

        let text =
          "";

        if (
          cache?.complete &&
          cache.transcript?.trim()
        ) {
          setProcessingStatus(
            "Completed transcript found in browser cache. Skipping Whisper transcription."
          );

          text =
            cache.transcript;
        } else {
          const transcriptParts =
            new Array<string>(
              audioFiles.length
            ).fill(
              ""
            );

          const completedParts =
            new Array<boolean>(
              audioFiles.length
            ).fill(
              false
            );

          if (
            cache &&
            cache.totalParts ===
              audioFiles.length
          ) {
            for (
              let index =
                0;
              index <
              audioFiles.length;
              index++
            ) {
              transcriptParts[
                index
              ] =
                cache.parts?.[
                  index
                ] ||
                "";

              completedParts[
                index
              ] =
                cache.completedParts?.[
                  index
                ] ||
                false;
            }
          }

          for (
            let index =
              0;
            index <
            audioFiles.length;
            index++
          ) {
            if (
              completedParts[
                index
              ]
            ) {
              setProcessingStatus(
                `Transcription part ${index + 1}/${audioFiles.length} already saved — skipping.`
              );

              continue;
            }

            setProcessingStatus(
              `Transcribing audio part ${index + 1} of ${audioFiles.length}...`
            );

            const partText =
              await transcribeWithRetry(
                audioFiles[
                  index
                ],

                index + 1,

                setProcessingStatus
              );

            transcriptParts[
              index
            ] =
              partText.trim();

            completedParts[
              index
            ] =
              true;

            const progress:
              TranscriptCache =
              {
                fingerprint,

                totalParts:
                  audioFiles.length,

                parts:
                  transcriptParts,

                completedParts,

                complete:
                  false,

                savedAt:
                  new Date().toISOString(),
              };

            localStorage.setItem(
              cacheKey,

              JSON.stringify(
                progress
              )
            );
          }

          text =
            transcriptParts
              .filter(
                (
                  part
                ) =>
                  part.trim()
              )
              .join(
                "\n\n"
              );

          if (
            !text.trim()
          ) {
            throw new Error(
              "No speech detected in the recording."
            );
          }

          const completedCache:
            TranscriptCache =
            {
              fingerprint,

              totalParts:
                audioFiles.length,

              parts:
                transcriptParts,

              completedParts,

              complete:
                true,

              transcript:
                text,

              savedAt:
                new Date().toISOString(),
            };

          localStorage.setItem(
            cacheKey,

            JSON.stringify(
              completedCache
            )
          );
        }

        /*
         * Maintain a simple copy of the latest complete transcript.
         */
        localStorage.setItem(
          "meetingmind_last_transcript",

          text
        );

        localStorage.setItem(
          "meetingmind_last_transcript_saved_at",

          new Date().toISOString()
        );

        setSavedTranscriptAvailable(
          true
        );

        /*
         * Whisper is finished from this point forward.
         */
        await generateMomFromTranscript(
          text
        );
      } catch (err) {
        setGenerateError(
          err instanceof Error
            ? err.message
            : "Unknown error"
        );
      } finally {
        setIsGenerating(
          false
        );

        setProcessingStatus(
          ""
        );
      }
    };

  const retryMomFromSavedTranscript =
    async () => {
      const transcript =
        localStorage.getItem(
          "meetingmind_last_transcript"
        );

      if (
        !transcript?.trim()
      ) {
        setGenerateError(
          "No completed transcript is currently saved."
        );

        return;
      }

      setIsGenerating(
        true
      );

      setGenerateError(
        null
      );

      try {
        await generateMomFromTranscript(
          transcript
        );
      } catch (err) {
        setGenerateError(
          err instanceof Error
            ? err.message
            : "MOM generation failed"
        );
      } finally {
        setIsGenerating(
          false
        );

        setProcessingStatus(
          ""
        );
      }
    };

  const addMomRow =
    () => {
      setMomRows(
        (
          rows
        ) => [
          ...rows,

          {
            id:
              generateId(),

            pointNumber:
              rows.length +
              1,

            pointsDiscussed:
              "",

            contactPerson:
              "",

            dependency:
              "",

            priority:
              "",

            status:
              "Open",
          },
        ]
      );
    };

  const updateMomRow =
    (
      id:
        string,

      patch:
        Partial<MoMRow>
    ) => {
      setMomRows(
        (
          rows
        ) =>
          rows.map(
            (
              row
            ) =>
              row.id ===
              id
                ? {
                    ...row,
                    ...patch,
                  }
                : row
          )
      );
    };

  const deleteMomRow =
    (
      id:
        string
    ) => {
      setMomRows(
        (
          rows
        ) =>
          rows
            .filter(
              (
                row
              ) =>
                row.id !==
                id
            )
            .map(
              (
                row,
                index
              ) => ({
                ...row,

                pointNumber:
                  index +
                  1,
              })
            )
      );
    };

  const moveMomRow =
    (
      id:
        string,

      direction:
        "up" |
        "down"
    ) => {
      setMomRows(
        (
          rows
        ) => {
          const index =
            rows.findIndex(
              (
                row
              ) =>
                row.id ===
                id
            );

          if (
            index ===
            -1
          ) {
            return rows;
          }

          const nextIndex =
            direction ===
            "up"
              ? index -
                1
              : index +
                1;

          if (
            nextIndex <
              0 ||
            nextIndex >=
              rows.length
          ) {
            return rows;
          }

          const updated =
            [
              ...rows,
            ];

          [
            updated[
              index
            ],
            updated[
              nextIndex
            ],
          ] = [
            updated[
              nextIndex
            ],
            updated[
              index
            ],
          ];

          return updated.map(
            (
              row,
              rowIndex
            ) => ({
              ...row,

              pointNumber:
                rowIndex +
                1,
            })
          );
        }
      );
    };

  const addActionItem =
    () => {
      setActionItems(
        (
          items
        ) => [
          ...items,

          {
            id:
              generateId(),

            task:
              "",

            owner:
              "",

            dueDate:
              "",

            done:
              false,
          },
        ]
      );
    };

  const updateActionItem =
    (
      id:
        string,

      patch:
        Partial<ActionItem>
    ) => {
      setActionItems(
        (
          items
        ) =>
          items.map(
            (
              item
            ) =>
              item.id ===
              id
                ? {
                    ...item,
                    ...patch,
                  }
                : item
          )
      );
    };

  const deleteActionItem =
    (
      id:
        string
    ) => {
      setActionItems(
        (
          items
        ) =>
          items.filter(
            (
              item
            ) =>
              item.id !==
              id
          )
      );
    };

  const exportText =
    () => {
      const lines =
        [
          "MINUTES OF MEETING",

          "==================",

          `Topic: ${meta.topic || "—"}`,

          `Date: ${meta.date || "—"}`,

          `Time: ${meta.timeStart || "—"} – ${meta.timeEnd || "—"}`,

          `Venue: ${meta.venue || "—"}`,

          `Attendees: ${
            meta.attendees
              .map(
                (
                  attendee
                ) =>
                  attendee.name
              )
              .filter(
                Boolean
              )
              .join(
                ", "
              ) ||
            "—"
          }`,

          "",

          "SUMMARY",

          "-------",

          summary,

          "",

          "MINUTES",

          "-------",

          ...momRows.map(
            (
              row
            ) =>
              `${row.pointNumber}. ${row.pointsDiscussed}\n   Contact: ${row.contactPerson || "—"} | Dependency: ${row.dependency || "—"} | Priority: ${row.priority || "—"} | Status: ${row.status}`
          ),

          "",

          "ACTION ITEMS",

          "------------",

          ...actionItems.map(
            (
              action,
              index
            ) =>
              `${index + 1}. ${action.task}\n   Owner: ${action.owner || "—"} | Due: ${action.dueDate || "TBD"} | ${action.done ? "✓ Done" : "○ Open"}`
          ),
        ];

      const blob =
        new Blob(
          [
            lines.join(
              "\n"
            ),
          ],
          {
            type:
              "text/plain",
          }
        );

      const url =
        URL.createObjectURL(
          blob
        );

      const anchor =
        document.createElement(
          "a"
        );

      anchor.href =
        url;

      anchor.download =
        `MoM_${meta.topic || "meeting"}_${meta.date || "today"}.txt`;

      anchor.click();

      URL.revokeObjectURL(
        url
      );
    };

  const copyText =
    async () => {
      const lines =
        [
          `Topic: ${meta.topic || "—"}`,

          `Date: ${meta.date}`,

          "",

          `Summary: ${summary}`,

          "",

          "Minutes:",

          ...momRows.map(
            (
              row
            ) =>
              `${row.pointNumber}. ${row.pointsDiscussed}`
          ),
        ];

      await navigator.clipboard.writeText(
        lines.join(
          "\n"
        )
      );

      setCopied(
        true
      );

      setTimeout(
        () =>
          setCopied(
            false
          ),

        2000
      );
    };

  const loadFromHistory =
    (
      result:
        MeetingResult
    ) => {
      setMeta(
        result.meta
      );

      setSummary(
        result.summary
      );

      setMomRows(
        result.momRows
      );

      setActionItems(
        result.actionItems
      );

      setHasMoM(
        true
      );

      setActiveTab(
        "minutes"
      );
    };

  const tabs =
    [
      {
        id:
          "inperson" as AppTab,

        label:
          "In-person",

        icon:
          Mic,
      },

      {
        id:
          "virtual" as AppTab,

        label:
          "Virtual",

        icon:
          Monitor,
      },

      {
        id:
          "minutes" as AppTab,

        label:
          "Minutes",

        icon:
          FileText,

        badge:
          hasMoM,
      },

      {
        id:
          "history" as AppTab,

        label:
          "History",

        icon:
          History,

        badge:
          history.length >
          0,
      },
    ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-gray-900 dark:bg-gray-100 flex items-center justify-center">
              <Mic className="h-4 w-4 text-white dark:text-gray-900" />
            </div>

            <span className="font-semibold text-gray-900 dark:text-gray-100">
              MeetingMind
            </span>
          </div>

          {hasMoM && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={
                  copyText
                }
              >
                <Copy className="h-3.5 w-3.5" />

                {copied
                  ? "Copied!"
                  : "Copy"}
              </Button>

              <Button
                size="sm"
                onClick={
                  exportText
                }
              >
                <Download className="h-3.5 w-3.5" />

                Export
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800/60 rounded-xl p-1">
          {tabs.map(
            ({
              id,
              label,
              icon:
                Icon,
              badge,
            }) => (
              <button
                key={
                  id
                }
                onClick={() =>
                  setActiveTab(
                    id
                  )
                }
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-all",

                  activeTab ===
                    id
                    ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                )}
              >
                <Icon className="h-4 w-4" />

                {
                  label
                }

                {badge && (
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                )}
              </button>
            )
          )}
        </div>

        {(activeTab ===
          "inperson" ||
          activeTab ===
            "virtual") && (
          <div className="space-y-4">
            <MeetingForm
              meta={
                meta
              }
              onUpdateMeta={
                updateMeta
              }
              onAddAttendee={
                addAttendee
              }
              onUpdateAttendee={
                updateAttendee
              }
              onRemoveAttendee={
                removeAttendee
              }
            />

            <RecorderPanel
              mode={
                activeTab ===
                "virtual"
                  ? "virtual"
                  : "inperson"
              }
              onStop={
                handleRecordingStop
              }
              onStartTime={(
                date,
                time
              ) =>
                updateMeta(
                  {
                    date,

                    timeStart:
                      time,
                  }
                )
              }
              onStopTime={(
                time
              ) =>
                updateMeta(
                  {
                    timeEnd:
                      time,
                  }
                )
              }
            />

            {isGenerating && (
              <Card>
                <div className="flex items-start gap-3 py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400 mt-0.5" />

                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Processing
                      meeting...
                    </p>

                    <p className="text-xs text-gray-400 mt-1">
                      {processingStatus ||
                        "Working..."}
                    </p>

                    <p className="text-xs text-gray-400 mt-2">
                      You can leave
                      this tab open
                      while
                      MeetingMind
                      automatically
                      handles API
                      rate limits.
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {generateError && (
              <Card>
                <div className="space-y-3">
                  <div className="flex items-start gap-2 text-red-600">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />

                    <p className="text-sm break-words">
                      {
                        generateError
                      }
                    </p>
                  </div>

                  {savedTranscriptAvailable && (
                    <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
                      <p className="text-xs text-gray-500 mb-2">
                        Your completed
                        transcript is
                        already saved.
                        Retry the MOM
                        without running
                        Whisper again.
                      </p>

                      <Button
                        size="sm"
                        variant="primary"
                        onClick={
                          retryMomFromSavedTranscript
                        }
                      >
                        Retry MOM from
                        saved transcript
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        )}

        {activeTab ===
          "minutes" && (
          <div className="space-y-6">
            {!hasMoM &&
            !isGenerating ? (
              <Card>
                <div className="py-8 text-center">
                  <FileText className="h-10 w-10 text-gray-300 mx-auto mb-3" />

                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    No minutes yet
                  </p>

                  <p className="text-xs text-gray-400 mb-4">
                    Record or upload a
                    meeting first.
                  </p>

                  <Button
                    onClick={() =>
                      setActiveTab(
                        "inperson"
                      )
                    }
                  >
                    Start a recording
                  </Button>
                </div>
              </Card>
            ) : isGenerating ? (
              <Card>
                <div className="flex items-start gap-3 py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400 mt-0.5" />

                  <div>
                    <p className="text-sm font-medium">
                      Generating your
                      minutes...
                    </p>

                    <p className="text-xs text-gray-400 mt-1">
                      {
                        processingStatus
                      }
                    </p>
                  </div>
                </div>
              </Card>
            ) : (
              <>
                <Card>
                  <SectionLabel>
                    Meeting overview
                  </SectionLabel>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-4">
                    {meta.topic && (
                      <div className="col-span-2">
                        <span className="text-gray-400 text-xs">
                          Topic
                        </span>

                        <p className="font-medium">
                          {
                            meta.topic
                          }
                        </p>
                      </div>
                    )}

                    {meta.date && (
                      <div>
                        <span className="text-gray-400 text-xs">
                          Date
                        </span>

                        <p>
                          {
                            meta.date
                          }
                        </p>
                      </div>
                    )}

                    {(meta.timeStart ||
                      meta.timeEnd) && (
                      <div>
                        <span className="text-gray-400 text-xs">
                          Time
                        </span>

                        <p>
                          {
                            meta.timeStart
                          }

                          {meta.timeEnd
                            ? ` – ${meta.timeEnd}`
                            : ""}
                        </p>
                      </div>
                    )}

                    {meta.venue && (
                      <div>
                        <span className="text-gray-400 text-xs">
                          Venue
                        </span>

                        <p>
                          {
                            meta.venue
                          }
                        </p>
                      </div>
                    )}
                  </div>

                  {meta.attendees.length >
                    0 && (
                    <div>
                      <span className="text-gray-400 text-xs">
                        Attendees
                      </span>

                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {meta.attendees.map(
                          (
                            attendee
                          ) => (
                            <span
                              key={
                                attendee.id
                              }
                              className="rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-0.5 text-xs"
                            >
                              {
                                attendee.name
                              }

                              {attendee.role
                                ? ` · ${attendee.role}`
                                : ""}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </Card>

                {summary && (
                  <Card>
                    <SectionLabel>
                      Summary
                    </SectionLabel>

                    <p className="text-sm leading-relaxed">
                      {
                        summary
                      }
                    </p>
                  </Card>
                )}

                <Card>
                  <MoMTable
                    rows={
                      momRows
                    }
                    onUpdate={
                      updateMomRow
                    }
                    onDelete={
                      deleteMomRow
                    }
                    onMove={
                      moveMomRow
                    }
                    onAdd={
                      addMomRow
                    }
                  />
                </Card>

                <Card>
                  <ActionItems
                    items={
                      actionItems
                    }
                    onUpdate={
                      updateActionItem
                    }
                    onDelete={
                      deleteActionItem
                    }
                    onAdd={
                      addActionItem
                    }
                  />
                </Card>
              </>
            )}
          </div>
        )}

        {activeTab ===
          "history" && (
          <div className="space-y-4">
            {history.length ===
            0 ? (
              <Card>
                <div className="py-8 text-center">
                  <History className="h-10 w-10 text-gray-300 mx-auto mb-3" />

                  <p className="text-sm text-gray-400">
                    No meeting history
                    yet
                  </p>
                </div>
              </Card>
            ) : (
              history.map(
                (
                  result,
                  index
                ) => (
                  <Card
                    key={
                      index
                    }
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {result.meta.topic ||
                            "Untitled meeting"}
                        </p>

                        <p className="text-xs text-gray-400 mt-0.5">
                          {
                            result.meta.date
                          }

                          {result.meta.timeStart
                            ? ` · ${result.meta.timeStart}`
                            : ""}
                        </p>

                        {result.summary && (
                          <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                            {
                              result.summary
                            }
                          </p>
                        )}

                        <div className="flex gap-3 mt-2 text-xs text-gray-400">
                          <span>
                            {
                              result.momRows.length
                            }{" "}
                            points
                          </span>

                          <span>
                            {
                              result.actionItems.length
                            }{" "}
                            actions
                          </span>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        onClick={() =>
                          loadFromHistory(
                            result
                          )
                        }
                      >
                        View
                      </Button>
                    </div>
                  </Card>
                )
              )
            )}
          </div>
        )}
      </main>
    </div>
  );
}
