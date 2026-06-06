export type MeetingMode = "inperson" | "virtual";

export type Platform = "googlemeet" | "zoom" | "teams" | "other";

export interface Attendee {
  id: string;
  name: string;
  role: string;
}

export interface TranscriptSegment {
  id: string;
  speaker: string;
  speakerIndex: number;
  text: string;
  startTime: number; // seconds
  endTime: number;
}

export interface MoMRow {
  id: string;
  pointNumber: number;
  pointsDiscussed: string;
  contactPerson: string;
  dependency: string;
  priority: "High" | "Medium" | "Low" | "";
  status: "Open" | "In Progress" | "Done" | "";
}

export interface ActionItem {
  id: string;
  task: string;
  owner: string;
  dueDate: string;
  done: boolean;
}

export interface MeetingMeta {
  topic: string;
  venue: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  platform?: Platform;
  attendees: Attendee[];
}

export interface MeetingData {
  meta: MeetingMeta;
  transcript: TranscriptSegment[];
  summary: string;
  momRows: MoMRow[];
  actionItems: ActionItem[];
  mode: MeetingMode;
  recordingDuration: number;
}

export interface TranscribeResponse {
  segments: TranscriptSegment[];
  rawText: string;
}

export interface GenerateMoMResponse {
  summary: string;
  momRows: MoMRow[];
  actionItems: ActionItem[];
}
