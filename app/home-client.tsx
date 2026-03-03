 "use client";

import { useState } from "react";

type BleDeviceInfo = {
  id: string;
  name: string | null;
};

export default function HomeClient() {
  const [devices, setDevices] = useState<BleDeviceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

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
            id: device.id ?? device.deviceId ?? "",
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

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <h1 className="text-5xl font-bold">Physio Data Lab</h1>

        <button
          type="button"
          onClick={handleScanClick}
          className="rounded bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700 disabled:opacity-60"
          disabled={isScanning}
        >
          {isScanning ? "Scanning…" : "Scan for BLE devices"}
        </button>

        {error && (
          <p className="text-sm text-red-600 max-w-md text-center">{error}</p>
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

