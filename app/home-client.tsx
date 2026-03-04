"use client";

import { useRef, useState } from "react";
import EegPlot from "./eeg-plot";
import PsdPlot from "./psd-plot";
import BandScatter from "./band-scatter";
import {
  connectMuse,
  EEG_FREQUENCY,
  type MuseEegReading,
} from "../lib/museClient";
import {
  appendMuseReadingToBuffer,
  downloadMuseCsv,
  type CsvRow,
} from "../lib/muse-data-handler";

type EegSample = {
  t: number;
  value: number;
};

const DEFAULT_SAMPLING_FREQUENCY = EEG_FREQUENCY ?? 256;
const DEFAULT_SECONDS_TO_PLOT = 5;

const CHANNEL_LABELS = ["Tp9", "AF7", "AF8", "TP10"] as const;

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

  const handleDownloadCsv = () => {
    try {
      downloadMuseCsv(recordedRowsRef.current, CHANNEL_LABELS);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save EEG CSV.";
      setError(message);
    }
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
            appendMuseReadingToBuffer({
              buffer: recordedRowsRef.current,
              reading,
              channelIndex,
              channelLabels: CHANNEL_LABELS,
              samplingFrequency: DEFAULT_SAMPLING_FREQUENCY,
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
              onClick={handleDownloadCsv}
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

        <div className="mt-6 w-[94vw] max-w-none grid grid-cols-2 gap-4 items-start">
          <EegPlot
            channelLabels={CHANNEL_LABELS}
            eegSeriesByChannel={eegSeriesByChannel}
          />
          <PsdPlot
            channelLabels={CHANNEL_LABELS}
            eegSeriesByChannel={eegSeriesByChannel}
            samplingFrequency={DEFAULT_SAMPLING_FREQUENCY}
          />
          <div className="col-span-2">
            <BandScatter
              channelLabels={CHANNEL_LABELS}
              eegSeriesByChannel={eegSeriesByChannel}
              samplingFrequency={DEFAULT_SAMPLING_FREQUENCY}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

