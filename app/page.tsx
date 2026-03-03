"use client";

import { useState } from "react";

export default function Home() {
  const [scanNearby, setScanNearby] = useState(false);
  const [status, setStatus] = useState("No device selected yet.");

  const handleFindDevice = async () => {
    if (typeof navigator === "undefined" || !navigator.bluetooth) {
      setStatus("Web Bluetooth is not available in this browser.");
      return;
    }

    try {
      const device = await navigator.bluetooth.requestDevice(
        scanNearby
          ? {
              acceptAllDevices: true,
              optionalServices: ["battery_service"],
            }
          : {
              filters: [{ namePrefix: "Physio" }],
              optionalServices: ["battery_service"],
            },
      );

      setStatus(`Selected device: ${device.name || "Unnamed BLE device"}`);
    } catch {
      setStatus("Device search was cancelled or no BLE device could be selected.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <main className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-900">Physio Data Lab</h1>
        <p className="mt-2 text-sm text-slate-600">
          Connect to a wearable and stream data from nearby Bluetooth Low Energy
          devices.
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
          onClick={handleFindDevice}
          className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
        >
          Find BLE Device
        </button>

        <p className="mt-4 text-sm text-slate-600">{status}</p>
      </main>
    </div>
  );
}
