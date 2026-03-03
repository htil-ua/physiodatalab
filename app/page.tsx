"use client";

import { useMemo, useState } from "react";

const MUSE_GATT_SERVICE = "273e0001-4c4d-454d-96be-f03bac821358";

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

function decodeMuseEegPacket(dataView: DataView) {
  const sequence = dataView.getUint16(0);
  const samples: number[] = [];

  for (let index = 2; index < dataView.byteLength; index += 2) {
    samples.push(dataView.getUint16(index));
  }

  return { sequence, samples };
}

export default function Home() {
  const [scanNearby, setScanNearby] = useState(false);
  const [status, setStatus] = useState("Not connected to a Muse device.");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [samples, setSamples] = useState<MuseSample[]>([]);

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

      setDeviceName(device.name || "Unnamed Muse device");
      setIsConnected(true);
      setStatus("Connected. Streaming EEG notifications...");
      setSamples([]);

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

            setSamples((previousSamples) => {
              const nextSample: MuseSample = {
                channel: characteristicInfo.label,
                sequence: decoded.sequence,
                samples: decoded.samples,
                receivedAt: new Date().toLocaleTimeString(),
              };

              return [nextSample, ...previousSamples].slice(0, 20);
            });
          },
        );

        await characteristic.startNotifications();
      }
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
      <main className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
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
          <section className="mt-6 rounded-lg border border-slate-200">
            <header className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">
              Live data from {deviceName}
            </header>

            {samples.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-600">
                Waiting for EEG samples...
              </p>
            ) : (
              <ul className="max-h-80 divide-y divide-slate-100 overflow-auto">
                {samples.map((sample, index) => (
                  <li key={`${sample.channel}-${sample.sequence}-${index}`} className="px-4 py-2 text-xs text-slate-700">
                    <span className="font-semibold">{sample.receivedAt}</span> · {sample.channel} · seq {sample.sequence} · raw [{sample.samples.join(", ")}]
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
