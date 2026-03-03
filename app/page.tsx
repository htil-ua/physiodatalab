"use client";

import { useMemo, useState } from "react";

const MUSE_GATT_SERVICE = "fe8d0001-b5a3-f393-e0a9-e50e24dcca9e";
const MUSE_CONTROL_CHARACTERISTIC = "273e0001-4c4d-454d-96be-f03bac821358";

const EEG_CHARACTERISTICS = [
  { id: "tp9", label: "TP9", uuid: "273e0003-4c4d-454d-96be-f03bac821358" },
  { id: "af7", label: "AF7", uuid: "273e0004-4c4d-454d-96be-f03bac821358" },
  { id: "af8", label: "AF8", uuid: "273e0005-4c4d-454d-96be-f03bac821358" },
  { id: "tp10", label: "TP10", uuid: "273e0006-4c4d-454d-96be-f03bac821358" },
] as const;

type MuseSample = {
  channel: string;
  sequence: number;
  samples: number[];
  receivedAt: string;
};

type ChannelSeries = Record<(typeof EEG_CHARACTERISTICS)[number]["id"], number[]>;

const EMPTY_SERIES: ChannelSeries = {
  tp9: [],
  af7: [],
  af8: [],
  tp10: [],
};

const MAX_RECENT_PACKETS = 30;
const MAX_SERIES_POINTS = 120;

function decodeUnsigned12BitData(bytes: Uint8Array) {
  const samples: number[] = [];

  for (let index = 0; index + 2 < bytes.length; index += 3) {
    const first = (bytes[index] << 4) | (bytes[index + 1] >> 4);
    const second = ((bytes[index + 1] & 0x0f) << 8) | bytes[index + 2];
    samples.push(first, second);
  }

  return samples;
}

function decodeMuseEegPacket(dataView: DataView) {
  const sequence = dataView.getUint16(0);
  const payload = new Uint8Array(dataView.buffer, dataView.byteOffset + 2);
  const rawSamples = decodeUnsigned12BitData(payload);
  const microvolts = rawSamples.map((sample) => (sample - 2048) * 0.48828125);

  return { sequence, samples: microvolts };
}

function buildPath(values: number[], width: number, height: number) {
  if (values.length < 2) {
    return "";
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

async function sendMuseCommand(
  controlCharacteristic: BluetoothRemoteGATTCharacteristic,
  command: string,
) {
  const encoded = new TextEncoder().encode(command);
  const framed = new Uint8Array(encoded.length + 2);
  framed[0] = encoded.length + 1;
  framed.set(encoded, 1);
  framed[framed.length - 1] = 10;

  await controlCharacteristic.writeValueWithoutResponse(framed);
}

async function startMuseStreaming(
  controlCharacteristic: BluetoothRemoteGATTCharacteristic,
) {
  await sendMuseCommand(controlCharacteristic, "h");
  await sendMuseCommand(controlCharacteristic, "p20");
  await sendMuseCommand(controlCharacteristic, "s");
}

export default function Home() {
  const [scanNearby, setScanNearby] = useState(false);
  const [status, setStatus] = useState("Not connected to a Muse device.");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [samples, setSamples] = useState<MuseSample[]>([]);
  const [series, setSeries] = useState<ChannelSeries>(EMPTY_SERIES);

  const connectLabel = useMemo(() => {
    if (isConnecting) {
      return "Connecting...";
    }

    return isConnected ? "Reconnect Muse 2" : "Connect Muse 2";
  }, [isConnected, isConnecting]);

  const handleConnect = async () => {
    if (typeof navigator === "undefined" || !navigator.bluetooth) {
      setStatus("Web Bluetooth is not available in this browser.");
      return;
    }

    setIsConnecting(true);
    setStatus("Waiting for device selection...");

    try {
      const device = await navigator.bluetooth.requestDevice(
        scanNearby
          ? {
              acceptAllDevices: true,
              optionalServices: [MUSE_GATT_SERVICE],
            }
          : {
              filters: [{ namePrefix: "Muse" }],
              optionalServices: [MUSE_GATT_SERVICE],
            },
      );

      const server = await device.gatt?.connect();

      if (!server) {
        throw new Error("Could not connect to the selected BLE device.");
      }

      const service = await server.getPrimaryService(MUSE_GATT_SERVICE);
      const controlCharacteristic = await service.getCharacteristic(
        MUSE_CONTROL_CHARACTERISTIC,
      );

      setDeviceName(device.name || "Unnamed Muse device");
      setIsConnected(true);
      setStatus("Connected. Configuring Muse stream...");
      setSamples([]);
      setSeries(EMPTY_SERIES);

      device.addEventListener("gattserverdisconnected", () => {
        setIsConnected(false);
        setStatus("Device disconnected.");
      });

      for (const characteristicInfo of EEG_CHARACTERISTICS) {
        const characteristic = await service.getCharacteristic(
          characteristicInfo.uuid,
        );

        characteristic.addEventListener(
          "characteristicvaluechanged",
          (event) => {
            const target = event.target as BluetoothRemoteGATTCharacteristic;
            const packet = target.value;

            if (!packet) {
              return;
            }

            const decoded = decodeMuseEegPacket(packet);

            console.log(
              `[Muse EEG] ${characteristicInfo.label} seq=${decoded.sequence}`,
              decoded.samples,
            );

            setSamples((previousSamples) => {
              const nextSample: MuseSample = {
                channel: characteristicInfo.label,
                sequence: decoded.sequence,
                samples: decoded.samples,
                receivedAt: new Date().toLocaleTimeString(),
              };

              return [nextSample, ...previousSamples].slice(0, MAX_RECENT_PACKETS);
            });

            setSeries((previousSeries) => {
              const nextValues = [
                ...previousSeries[characteristicInfo.id],
                ...decoded.samples,
              ].slice(-MAX_SERIES_POINTS);

              return {
                ...previousSeries,
                [characteristicInfo.id]: nextValues,
              };
            });
          },
        );

        await characteristic.startNotifications();
      }

      await startMuseStreaming(controlCharacteristic);
      setStatus("Streaming EEG notifications...");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Connection cancelled or Muse EEG stream unavailable.";

      setStatus(message);
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-10">
      <main className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-900">Physio Data Lab</h1>
        <p className="mt-2 text-sm text-slate-600">
          Connect to a Muse 2 EEG headset and inspect incoming BLE data packets.
        </p>

        <label className="mt-6 flex items-center gap-3 rounded-lg border border-slate-200 p-4">
          <input
            type="checkbox"
            checked={scanNearby}
            onChange={(event) => setScanNearby(event.target.checked)}
            className="h-4 w-4 accent-slate-800"
          />
          <span className="text-sm text-slate-700">
            Look for BLE devices nearby (accept all visible devices)
          </span>
        </label>

        <button
          type="button"
          onClick={handleConnect}
          disabled={isConnecting}
          className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-500"
        >
          {connectLabel}
        </button>

        <p className="mt-4 text-sm text-slate-600">{status}</p>

        {isConnected && (
          <section className="mt-6 space-y-4 rounded-lg border border-slate-200 p-4">
            <header className="text-sm font-semibold text-slate-800">
              Live data from {deviceName}
            </header>

            <div className="grid gap-3 md:grid-cols-2">
              {EEG_CHARACTERISTICS.map((characteristic) => {
                const values = series[characteristic.id];
                const hasData = values.length > 1;

                return (
                  <article
                    key={characteristic.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <h3 className="text-xs font-semibold text-slate-800">
                      {characteristic.label}
                    </h3>
                    {hasData ? (
                      <svg
                        viewBox="0 0 320 90"
                        className="mt-2 h-24 w-full rounded bg-white"
                        role="img"
                        aria-label={`${characteristic.label} EEG waveform`}
                      >
                        <path
                          d={buildPath(values, 320, 90)}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          className="text-blue-600"
                        />
                      </svg>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">
                        Waiting for channel samples...
                      </p>
                    )}
                  </article>
                );
              })}
            </div>

            {samples.length === 0 ? (
              <p className="text-sm text-slate-600">Waiting for EEG samples...</p>
            ) : (
              <ul className="max-h-72 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-100">
                {samples.map((sample, index) => (
                  <li
                    key={`${sample.channel}-${sample.sequence}-${index}`}
                    className="px-4 py-2 text-xs text-slate-700"
                  >
                    <span className="font-semibold">{sample.receivedAt}</span> ·{" "}
                    {sample.channel} · seq {sample.sequence} · µV [
                    {sample.samples.map((value) => value.toFixed(2)).join(", ")}]
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
