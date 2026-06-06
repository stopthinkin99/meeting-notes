import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface SavedRecording {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number;
  duration: number;
  topic: string;
  created_at: string;
}

// Upload audio blob to Supabase Storage
export async function uploadRecording(
  blob: Blob,
  duration: number,
  topic: string
): Promise<SavedRecording | null> {
  try {
    const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("webm") ? "webm" : "ogg";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fileName = `meeting-${timestamp}.${ext}`;

    // Upload to Supabase Storage bucket
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("meeting-recordings")
      .upload(fileName, blob, { contentType: blob.type, upsert: false });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("meeting-recordings")
      .getPublicUrl(fileName);

    const recording: SavedRecording = {
      id: uploadData.id || fileName,
      file_name: fileName,
      file_url: urlData.publicUrl,
      file_size: blob.size,
      duration,
      topic: topic || "Untitled Meeting",
      created_at: new Date().toISOString(),
    };

    return recording;
  } catch (err) {
    console.error("Upload failed:", err);
    return null;
  }
}

// List all recordings from Supabase Storage
export async function listRecordings(): Promise<SavedRecording[]> {
  try {
    const { data, error } = await supabase.storage
      .from("meeting-recordings")
      .list("", { sortBy: { column: "created_at", order: "desc" }, limit: 20 });

    if (error) throw error;
    if (!data) return [];

    return data.map((file) => {
      const { data: urlData } = supabase.storage
        .from("meeting-recordings")
        .getPublicUrl(file.name);

      return {
        id: file.id || file.name,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_size: file.metadata?.size || 0,
        duration: file.metadata?.duration || 0,
        topic: file.name.replace(/^meeting-/, "").replace(/\.[^.]+$/, ""),
        created_at: file.created_at || new Date().toISOString(),
      };
    });
  } catch (err) {
    console.error("List recordings failed:", err);
    return [];
  }
}

// Fetch audio blob from a public URL
export async function fetchRecordingBlob(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch recording");
    return await res.blob();
  } catch (err) {
    console.error("Fetch blob failed:", err);
    return null;
  }
}