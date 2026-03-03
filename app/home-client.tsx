 "use client";

import { useState } from "react";

type BleDeviceInfo = {
  id: string;
  name: string | null;
};

// Muse service and characteristics – aligned to the structure used in
// the reference client at:
// https://github.com/htil/neuroscope/blob/main/src/renderer/js/muse-client.js
const MUSE_SERVICE_UUID = "0000fe8d-0000-1000-8000-00805f9b34fb";
const TELEMETRY_CHARACTERISTIC = "273e000b-4c4d-454d-96be-f03bac821358";
const EEG_CHARACTERISTICS = [
  "273e0003-4c4d-454d-96be-f03bac821358",
  "273e0004-4c4d-454d-96be-f03bac821358",
  "273e0005-4c4d-454d-96be-f03bac821358",
  "273e0006-4c4d-454d-96be-f03bac821358",
  "273e0007-4c4d-454d-96be-f03bac821358",
];
const CONTROL_CHARACTERISTIC = "273e0001-4c4d-454d-96be-f03bac821358";

const EEG_FREQUENCY = 256;
const EEG_SAMPLES_PER_READING = 12;

function decodeUnsigned12BitData(samples: Uint8Array): number[] {
  const samples12Bit: number[] = [];
  for (let i = 0; i < samples.length; i++) {
    if (i % 3 === 0) {
      samples12Bit.push((samples[i] << 4) | (samples[i + 1] >> 4));
    } else {
      samples12Bit.push(((samples[i] & 0xf) << 8) | samples[i + 1]);
      i++;
    }
  }
  return samples12Bit;
}

function decodeEEGSamples(samples: Uint8Array): number[] {
  return decodeUnsigned12BitData(samples).map((n) => 0.48828125 * (n - 0x800));
}

function encodeCommand(cmd: string): Uint8Array {
  const encoded = new TextEncoder().encode(`X${cmd}\n`);
  encoded[0] = encoded.length - 1;
  return encoded;
}

type EegSample = {
  t: number;
  value: number;
};

export default function HomeClient() {
  const [error, setError] = useState<string | null>(null);
  const [museStatus, setMuseStatus] = useState<string>("Disconnected");
  const [lastEegSample, setLastEegSample] = useState<string | null>(null);
  const [eegSeries, setEegSeries] = useState<EegSample[]>([]);

  const handleConnectMuseClick = async () => {
    setError(null);

    if (typeof navigator === "undefined" || !("bluetooth" in navigator)) {
      setError("Web Bluetooth is not supported in this browser.");
      return;
    }

    try {
      setMuseStatus("Requesting device…");
      const device: BluetoothDevice = await (navigator as any).bluetooth.requestDevice(
        {
          filters: [
            { namePrefix: "Ganglion-" },
            { namePrefix: "Muse-" },
          ],
          optionalServices: [MUSE_SERVICE_UUID],
        }
      );

      device.addEventListener("gattserverdisconnected", () => {
        setMuseStatus("Disconnected");
      });

      setMuseStatus("Connecting…");
      const server = await device.gatt!.connect();

      setMuseStatus("Getting Muse service…");
      const service = await server.getPrimaryService(MUSE_SERVICE_UUID);

      // Control characteristic and start sequence, mirroring the reference client.
      setMuseStatus("Configuring stream…");
      const controlChar = await service.getCharacteristic(CONTROL_CHARACTERISTIC);
      await controlChar.writeValue(encodeCommand("h"));
      const preset = "p21";
      await controlChar.writeValue(encodeCommand(preset));
      await controlChar.writeValue(encodeCommand("s"));
      await controlChar.writeValue(encodeCommand("d"));

      // Telemetry (battery etc.) – optional; we just log a bit for debugging.
      try {
        const telemetryChar = await service.getCharacteristic(
          TELEMETRY_CHARACTERISTIC
        );
        await telemetryChar.startNotifications();
        telemetryChar.addEventListener("characteristicvaluechanged", (event) => {
          const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
          if (!value) return;
          const dv = new DataView(value.buffer);
          const sequenceId = dv.getUint16(0);
          const batteryLevel = dv.getUint16(2) / 512;
          console.log("Muse telemetry", { sequenceId, batteryLevel });
        });
      } catch {
        // Ignore telemetry errors – not critical for EEG streaming.
      }

      // EEG channels – same characteristic set and decoding as in the reference.
      setMuseStatus("Subscribing to EEG channels…");
      const channelCount = 4; // follows the example client

      for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
        const characteristicId = EEG_CHARACTERISTICS[channelIndex];
        const eegChar = await service.getCharacteristic(characteristicId);
        await eegChar.startNotifications();

        eegChar.addEventListener("characteristicvaluechanged", (event: Event) => {
          const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
          const value = characteristic.value;
          if (!value) return;

          const bytes = new Uint8Array(value.buffer);
          const dv = new DataView(bytes.buffer);
          const eventIndex = dv.getUint16(0);
          const sampleBytes = bytes.subarray(2);
          const samples = decodeEEGSamples(sampleBytes);

          console.log("Muse EEG reading", {
            electrode: channelIndex,
            index: eventIndex,
            samples,
          });

          // For plotting, use channel 0 as a preview.
          if (channelIndex === 0) {
            const now = performance.now();
            const newSamples: EegSample[] = samples.map((v, index) => ({
              t: now + index,
              value: v,
            }));

            setEegSeries((prev) => {
              const maxPoints = EEG_SAMPLES_PER_READING * 16; // ~192 points
              const combined = [...prev, ...newSamples];
              return combined.slice(-maxPoints);
            });

            setLastEegSample(
              samples
                .slice(0, EEG_SAMPLES_PER_READING)
                .map((v) => v.toFixed(2))
                .join(", ")
            );
          }
        });
      }

      setMuseStatus("Streaming EEG…");
    } catch (err: any) {
      if (err?.name === "NotFoundError") {
        // User cancelled the device chooser; don't treat as an error.
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

        {eegSeries.length > 1 && (
          <div className="mt-4 w-full max-w-xl">
            <h2 className="mb-1 text-sm font-semibold text-center">
              Live EEG bytes (simple preview)
            </h2>
            <div className="border border-gray-300 rounded bg-white">
              <svg viewBox="0 0 400 100" className="w-full h-24">
                {(() => {
                  const values = eegSeries.map((p) => p.value);
                  const minV = Math.min(...values);
                  const maxV = Math.max(...values);
                  const range = maxV - minV || 1;
                  const points = eegSeries
                    .map((p, i) => {
                      const x =
                        (i / Math.max(eegSeries.length - 1, 1)) * 400;
                      const norm = (p.value - minV) / range;
                      const y = 100 - norm * 80 - 10; // padding top/bottom
                      return `${x},${y}`;
                    })
                    .join(" ");
                  return (
                    <polyline
                      fill="none"
                      stroke="#4f46e5"
                      strokeWidth="2"
                      points={points}
                    />
                  );
                })()}
              </svg>
            </div>
          </div>
        )}

        {lastEegSample && (
          <div className="mt-2 text-xs text-gray-700 max-w-xl text-center break-all">
            <div className="font-semibold mb-1">
              Last EEG packet bytes (first 16)
            </div>
            <div>{lastEegSample}</div>
          </div>
        )}
      </div>
    </div>
  );
}


