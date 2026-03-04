"use client";

import type { MuseEegReading } from "./museClient";

export type CsvRow = {
  timestampMs: number;
  packetIndex: number;
  sampleIndex: number;
  channelValues: Array<number | null>;
};

type AppendOptions = {
  buffer: Map<string, CsvRow>;
  reading: MuseEegReading;
  channelIndex: number;
  channelLabels: readonly string[];
  samplingFrequency: number;
  nowEpochMs?: number;
};

export function appendMuseReadingToBuffer({
  buffer,
  reading,
  channelIndex,
  channelLabels,
  samplingFrequency,
  nowEpochMs,
}: AppendOptions): void {
  const baseTimestampMs = nowEpochMs ?? Date.now();
  const samplePeriodMs = 1000 / samplingFrequency;

  reading.samples.forEach((value, sampleIndex) => {
    const key = `${reading.index}-${sampleIndex}`;
    const existingRow = buffer.get(key);

    if (existingRow) {
      existingRow.channelValues[channelIndex] = value;
      return;
    }

    const channelValues = channelLabels.map(() => null as number | null);
    channelValues[channelIndex] = value;

    buffer.set(key, {
      timestampMs: baseTimestampMs + sampleIndex * samplePeriodMs,
      packetIndex: reading.index,
      sampleIndex,
      channelValues,
    });
  });
}

export function buildMuseCsv(
  buffer: Map<string, CsvRow>,
  channelLabels: readonly string[]
): string {
  if (buffer.size === 0) {
    throw new Error("No EEG samples available to save yet.");
  }

  const header = ["timestamp_ms", ...channelLabels].join(",");

  const sortedRows = [...buffer.values()].sort((a, b) => {
    if (a.packetIndex !== b.packetIndex) return a.packetIndex - b.packetIndex;
    return a.sampleIndex - b.sampleIndex;
  });

  const csvRows = sortedRows.map((row) => {
    const values = row.channelValues.map((value) =>
      value === null ? "" : value.toFixed(6)
    );
    return [row.timestampMs.toFixed(3), ...values].join(",");
  });

  return [header, ...csvRows].join("\n");
}

export function downloadMuseCsv(
  buffer: Map<string, CsvRow>,
  channelLabels: readonly string[]
): void {
  const csvBody = buildMuseCsv(buffer, channelLabels);
  const blob = new Blob([csvBody], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `eeg-recording-${stamp}.csv`;

  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

