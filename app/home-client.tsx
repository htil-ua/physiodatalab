 "use client";

import { useState } from "react";

type BleDeviceInfo = {
  id: string;
  name: string | null;
};

// Muse 2 / Muse S primary service and one EEG characteristic UUID.
// These UUIDs are taken from the open-source muse-js project and
// public reverse engineering of the Muse protocol.
const MUSE_SERVICE_UUID = "0000fe8d-0000-1000-8000-00805f9b34fb";
const EEG_CHARACTERISTIC_UUID = "273e0003-4c4d-454d-96be-f03bac821358";

export default function HomeClient() {
  const [devices, setDevices] = useState<BleDeviceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [museStatus, setMuseStatus] = useState<string>("Disconnected");
  const [lastEegSample, setLastEegSample] = useState<string | null>(null);

  const handleScanClick = async () => {
    setError(null);

    if (typeof navigator === "undefined" || !("bluetooth" in navigator)) {
      setError("Web Bluetooth is not supported in this browser.");
      return;
    }

    try {
      setIsScanning(true);
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
      });

      if (device) {
        setDevices((prev) => {
          const next: BleDeviceInfo = {
            id: device.id ?? (device as any).deviceId ?? "",
            name: device.name ?? null,
          };

          // Avoid duplicates by id
          const exists = prev.some((d) => d.id === next.id);
          return exists ? prev : [...prev, next];
        });
      }
    } catch (err: any) {
      if (err?.name !== "NotFoundError") {
        setError(err?.message ?? "Failed to scan for BLE devices.");
      }
    } finally {
      setIsScanning(false);
    }
  };

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
          filters: [{ namePrefix: "Muse" }],
          optionalServices: [MUSE_SERVICE_UUID],
        }
      );

      device.addEventListener("gattserverdisconnected", () => {
        setMuseStatus("Disconnected");
      });

      setMuseStatus("Connecting…");
      const server = await device.gatt!.connect();

      setMuseStatus("Getting EEG service…");
      const service = await server.getPrimaryService(MUSE_SERVICE_UUID);

      setMuseStatus("Subscribing to EEG characteristic…");
      const eegChar = await service.getCharacteristic(EEG_CHARACTERISTIC_UUID);

      await eegChar.startNotifications();

      eegChar.addEventListener(
        "characteristicvaluechanged",
        (event: Event) => {
          const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
          const value = characteristic.value;
          if (!value) return;

          const bytes = new Uint8Array(value.buffer);

          // For now, just log the raw bytes and keep a small text version in state.
          console.log("Muse EEG packet (raw bytes)", bytes);

          // Show first few bytes so the UI proves we're receiving data.
          const preview = Array.from(bytes.slice(0, 16)).join(", ");
          setLastEegSample(preview);
        }
      );

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
            onClick={handleScanClick}
            className="rounded bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700 disabled:opacity-60"
            disabled={isScanning}
          >
            {isScanning ? "Scanning…" : "Scan for BLE devices"}
          </button>

          <button
            type="button"
            onClick={handleConnectMuseClick}
            className="rounded bg-purple-600 px-4 py-2 text-white font-semibold hover:bg-purple-700 disabled:opacity-60"
          >
            Connect to Muse 2 (EEG)
          </button>

          <p className="text-sm text-gray-700">
            Muse status: <span className="font-semibold">{museStatus}</span>
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-600 max-w-md text-center">{error}</p>
        )}

        {lastEegSample && (
          <div className="mt-2 text-xs text-gray-700 max-w-md text-center break-all">
            <div className="font-semibold mb-1">
              Last EEG packet (first 16 bytes)
            </div>
            <div>{lastEegSample}</div>
          </div>
        )}

        {devices.length > 0 && (
          <div className="mt-4 w-full max-w-md">
            <h2 className="mb-2 text-lg font-semibold text-center">
              Discovered devices
            </h2>
            <ul className="space-y-1 text-sm">
              {devices.map((device) => (
                <li
                  key={device.id || device.name || Math.random().toString(36)}
                  className="rounded border border-gray-300 px-3 py-2"
                >
                  <div className="font-medium">
                    {device.name || "Unnamed device"}
                  </div>
                  {device.id && (
                    <div className="text-xs text-gray-600 break-all">
                      {device.id}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}


