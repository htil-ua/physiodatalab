"use client";

import { useState } from "react";
import {
  connectMuse,
  EEG_FREQUENCY,
  EEG_SAMPLES_PER_READING,
  type MuseEegReading,
} from "../lib/museClient";

type EegSample = {
  t: number;
  value: number;
};

const DEFAULT_SAMPLING_FREQUENCY = EEG_FREQUENCY ?? 256;
const DEFAULT_SECONDS_TO_PLOT = 5;

const CHANNEL_LABELS = ["Tp9", "AF7", "AF8", "TP10"];

export default function HomeClient() {
  const [error, setError] = useState<string | null>(null);
  const [museStatus, setMuseStatus] = useState<string>("Disconnected");
  const [eegSeriesByChannel, setEegSeriesByChannel] = useState<EegSample[][]>(
    () => CHANNEL_LABELS.map(() => [])
  );

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
        },
      });
    } catch (err: any) {
      if (err?.name === "NotFoundError") {
        setMuseStatus("Disconnected");
        return;
      }

      console.error("Failed to connect to Muse", err);
      setError(err?.message ?? "Failed to connect to Muse device.");
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
        </div>

        {error && (
          <p className="text-sm text-red-600 max-w-md text-center">{error}</p>
        )}

        {eegSeriesByChannel.some((series) => series.length > 1) && (
          <div className="mt-6 w-[94vw] max-w-none">
            <div className="flex flex-col gap-0 w-full">
              {CHANNEL_LABELS.map((label, idx) => {
                const series = eegSeriesByChannel[idx];
                return (
                  <div
                    key={label}
                    className="flex items-center gap-2 w-full"
                  >
                    <div className="w-10 text-sm font-semibold text-right pr-2">
                      {label}
                    </div>
                    <div className="flex-1 bg-white">
                      <svg
                        viewBox="0 0 100 30"
                        preserveAspectRatio="none"
                        className="w-full h-24"
                      >
                        {/* EEG trace */}
                        {series.length > 1 && (() => {
                          const values = series.map((p) => p.value);
                          const minV = Math.min(...values);
                          const maxV = Math.max(...values);
                          const range = maxV - minV || 1;
                          const mid = (minV + maxV) / 2;

                          const points = series
                            .map((p, i) => {
                              const x =
                                (i / Math.max(series.length - 1, 1)) * 100;
                              // center around mid and use fixed vertical scale
                              const normalized = (p.value - mid) / (range / 2 || 1);
                              const clamped = Math.max(-1.2, Math.min(1.2, normalized));
                              const y = 15 - clamped * 10; // center line at 15
                              return `${x},${y}`;
                            })
                            .join(" ");

                          return (
                            <polyline
                              fill="none"
                              stroke="#2563eb"
                              strokeWidth="0.12"
                              points={points}
                            />
                          );
                        })()}
                      </svg>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


