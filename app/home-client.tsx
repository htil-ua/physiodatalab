"use client";

import { useRef, useState } from "react";
import EegPlot from "./eeg-plot";
import {
  connectMuse,
  EEG_FREQUENCY,
  type MuseEegReading,
} from "../lib/museClient";

type EegSample = {
  t: number;
  value: number;
};

const DEFAULT_SAMPLING_FREQUENCY = EEG_FREQUENCY ?? 256;
const DEFAULT_SECONDS_TO_PLOT = 5;

const CHANNEL_LABELS = ["Tp9", "AF7", "AF8", "TP10"] as const;

type CsvRow = {
  timestampMs: number;
  packetIndex: number;
  sampleIndex: number;
  channelValues: Array<number | null>;
};

export default function HomeClient() {
  const [error, setError] = useState<string | null>(null);
  const [museStatus, setMuseStatus] = useState<string>("Disconnected");
  const [eegSeriesByChannel, setEegSeriesByChannel] = useState<EegSample[][]>(
    () => CHANNEL_LABELS.map(() => [])
  );
  const [isRecording, setIsRecording] = useState(false);
  const [recordedSampleCount, setRecordedSampleCount] = useState(0);
  const recordedRowsRef = useRef<Map<string, CsvRow>>(new Map());
  const isRecordingRef = useRef(false);

  const buildCsvFileName = () => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `eeg-recording-${stamp}.csv`;
  };

  const downloadCsv = () => {
    if (recordedRowsRef.current.size === 0) {
      setError("No EEG samples available to save yet.");
      return;
    }

    const header = ["timestamp_ms", ...CHANNEL_LABELS].join(",");
    const sortedRows = [...recordedRowsRef.current.values()].sort((a, b) => {
      if (a.packetIndex !== b.packetIndex) return a.packetIndex - b.packetIndex;
      return a.sampleIndex - b.sampleIndex;
    });

    const csvRows = sortedRows.map((row) => {
      const values = row.channelValues.map((value) =>
        value === null ? "" : value.toFixed(6)
      );
      return [row.timestampMs.toFixed(3), ...values].join(",");
    });

    const csvBody = [header, ...csvRows].join("\n");
    const blob = new Blob([csvBody], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", buildCsvFileName());
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleToggleRecording = () => {
    setError(null);

    if (isRecordingRef.current) {
      isRecordingRef.current = false;
      setIsRecording(false);
      return;
    }

    recordedRowsRef.current = new Map();
    setRecordedSampleCount(0);
    isRecordingRef.current = true;
    setIsRecording(true);
  };

  const handleConnectMuseClick = async () => {
    setError(null);

    try {
      await connectMuse({
        onStatusChange: (status) => setMuseStatus(status),
        onEeg: (reading: MuseEegReading) => {
          const channelIndex = reading.electrode;
          if (channelIndex < 0 || channelIndex >= CHANNEL_LABELS.length) return;

          const now = performance.now();
          const newSamples: EegSample[] = reading.samples.map((v, index) => ({
            t: now + index,
            value: v,
          }));

          setEegSeriesByChannel((prev) => {
            const bufferSize =
              DEFAULT_SAMPLING_FREQUENCY * DEFAULT_SECONDS_TO_PLOT;

            // Treat each channel series as a fixed-size FIFO queue:
            // new samples are pushed to the end, and oldest samples
            // are dropped from the front when the buffer overflows.
            const next = prev.map((series) => [...series]);
            const existing = next[channelIndex] ?? [];

            const combined = [...existing, ...newSamples];
            const overflow = Math.max(0, combined.length - bufferSize);
            const trimmed =
              overflow > 0 ? combined.slice(overflow) : combined;

            next[channelIndex] = trimmed;
            return next;
          });

          if (isRecordingRef.current) {
            const nowEpochMs = Date.now();
            const samplePeriodMs = 1000 / DEFAULT_SAMPLING_FREQUENCY;

            reading.samples.forEach((value, sampleIndex) => {
              const key = `${reading.index}-${sampleIndex}`;
              const existingRow = recordedRowsRef.current.get(key);

              if (existingRow) {
                existingRow.channelValues[channelIndex] = value;
                return;
              }

              const channelValues = CHANNEL_LABELS.map(() => null as number | null);
              channelValues[channelIndex] = value;

              recordedRowsRef.current.set(key, {
                timestampMs: nowEpochMs + sampleIndex * samplePeriodMs,
                packetIndex: reading.index,
                sampleIndex,
                channelValues,
              });
            });

            setRecordedSampleCount(recordedRowsRef.current.size);
          }
        },
      });
    } catch (err: unknown) {
      if ((err as { name?: string } | null)?.name === "NotFoundError") {
        setMuseStatus("Disconnected");
        return;
      }

      console.error("Failed to connect to Muse", err);
      const message = err instanceof Error ? err.message : "Failed to connect to Muse device.";
      setError(message);
      setMuseStatus("Disconnected");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-5xl font-bold">Physio Data Lab</h1>

        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={handleConnectMuseClick}
            className="rounded bg-purple-600 px-4 py-2 text-white font-semibold hover:bg-purple-700 disabled:opacity-60"
          >
            {museStatus === "Streaming EEG…"
              ? "Connected to Muse"
              : "Connect to Muse 2 (EEG)"}
          </button>

          <p className="text-xs text-gray-600">
            Status: <span className="font-semibold">{museStatus}</span>
          </p>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleToggleRecording}
              className="rounded bg-emerald-600 px-4 py-2 text-white font-semibold hover:bg-emerald-700"
            >
              {isRecording ? "Stop Recording" : "Start Recording"}
            </button>

            <button
              type="button"
              onClick={downloadCsv}
              disabled={recordedSampleCount === 0}
              className="rounded bg-slate-700 px-4 py-2 text-white font-semibold hover:bg-slate-800 disabled:opacity-60"
            >
              Save EEG CSV
            </button>
          </div>

          <p className="text-xs text-gray-600">
            Recorded samples: <span className="font-semibold">{recordedSampleCount}</span>
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-600 max-w-md text-center">{error}</p>
        )}

        <EegPlot
          channelLabels={CHANNEL_LABELS}
          eegSeriesByChannel={eegSeriesByChannel}
        />
      </div>
    </div>
  );
}

