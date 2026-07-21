export type MeetingMode = "inperson" | "virtual";

export interface Attendee {
  id: string;
  name: string;
  role: string;
}

export interface MeetingMeta {
  topic: string;
  venue: string;
  date: string;
  timeStart: string;
  timeEnd: string;
  attendees: Attendee[];
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

export interface MeetingResult {
  meta: MeetingMeta;
  summary: string;
  momRows: MoMRow[];
  actionItems: ActionItem[];
  generatedAt: string;
}