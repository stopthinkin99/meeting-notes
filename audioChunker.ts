const CHUNK_SECONDS = 180; // 3 minutes
const TARGET_SAMPLE_RATE = 16000;

/**
 * Converts a saved audio/video recording into small,
 * valid WAV files entirely inside the browser.
 *
 * Nothing is uploaded until after the recording has
 * been divided into safe transcription chunks.
 */
export async function chunkSavedRecording(
  source: Blob
): Promise<Blob[]> {
  const sourceBuffer = await source.arrayBuffer();

  const audioContext = new AudioContext();

  try {
    const decoded = await audioContext.decodeAudioData(
      sourceBuffer.slice(0)
    );

    const chunks: Blob[] = [];

    const totalDuration = decoded.duration;

    for (
      let startSeconds = 0;
      startSeconds < totalDuration;
      startSeconds += CHUNK_SECONDS
    ) {
      const endSeconds = Math.min(
        startSeconds + CHUNK_SECONDS,
        totalDuration
      );

      const wavBlob = await createWavChunk(
        decoded,
        startSeconds,
        endSeconds
      );

      chunks.push(wavBlob);
    }

    return chunks;
  } finally {
    await audioContext.close();
  }
}

async function createWavChunk(
  source: AudioBuffer,
  startSeconds: number,
  endSeconds: number
): Promise<Blob> {
  const duration =
    endSeconds - startSeconds;

  const frameCount = Math.ceil(
    duration * TARGET_SAMPLE_RATE
  );

  /*
   * Convert everything to:
   *
   * 16 kHz
   * mono
   * PCM
   *
   * Ideal for speech transcription and dramatically
   * smaller than the original video/audio recording.
   */
  const offlineContext =
    new OfflineAudioContext(
      1,
      frameCount,
      TARGET_SAMPLE_RATE
    );

  const segmentSource =
    offlineContext.createBufferSource();

  segmentSource.buffer = source;

  segmentSource.connect(
    offlineContext.destination
  );

  segmentSource.start(
    0,
    startSeconds,
    duration
  );

  const rendered =
    await offlineContext.startRendering();

  return audioBufferToWav(rendered);
}

function audioBufferToWav(
  buffer: AudioBuffer
): Blob {
  const samples =
    buffer.getChannelData(0);

  const bytesPerSample = 2;
  const dataSize =
    samples.length * bytesPerSample;

  const wavBuffer =
    new ArrayBuffer(44 + dataSize);

  const view =
    new DataView(wavBuffer);

  writeString(view, 0, "RIFF");

  view.setUint32(
    4,
    36 + dataSize,
    true
  );

  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");

  // PCM header
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);

  // mono
  view.setUint16(22, 1, true);

  view.setUint32(
    24,
    TARGET_SAMPLE_RATE,
    true
  );

  view.setUint32(
    28,
    TARGET_SAMPLE_RATE *
      bytesPerSample,
    true
  );

  view.setUint16(
    32,
    bytesPerSample,
    true
  );

  // 16-bit
  view.setUint16(34, 16, true);

  writeString(view, 36, "data");

  view.setUint32(
    40,
    dataSize,
    true
  );

  let offset = 44;

  for (
    let i = 0;
    i < samples.length;
    i++
  ) {
    const sample = Math.max(
      -1,
      Math.min(1, samples[i])
    );

    view.setInt16(
      offset,
      sample < 0
        ? sample * 0x8000
        : sample * 0x7fff,
      true
    );

    offset += 2;
  }

  return new Blob(
    [wavBuffer],
    {
      type: "audio/wav",
    }
  );
}

function writeString(
  view: DataView,
  offset: number,
  value: string
) {
  for (
    let i = 0;
    i < value.length;
    i++
  ) {
    view.setUint8(
      offset + i,
      value.charCodeAt(i)
    );
  }
}
