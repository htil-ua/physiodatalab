"use client";

// Core Muse BLE streaming logic extracted from the page component.
// This follows the structure used in:
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

export type MuseEegReading = {
  electrode: number;
  index: number;
  samples: number[];
};

export type MuseTelemetry = {
  sequenceId: number;
  batteryLevel: number;
};

export type MuseConnectionOptions = {
  onStatusChange?: (status: string) => void;
  onEeg?: (reading: MuseEegReading) => void;
  onTelemetry?: (telemetry: MuseTelemetry) => void;
};

type GattCharacteristic = {
  value: DataView | null;
  startNotifications(): Promise<void>;
  writeValue(value: Uint8Array): Promise<void>;
  addEventListener(type: string, listener: (event: BluetoothValueEvent) => void): void;
};

type GattService = {
  getCharacteristic(characteristicUuid: string): Promise<GattCharacteristic>;
};

type GattServer = {
  getPrimaryService(serviceUuid: string): Promise<GattService>;
};

type NavigatorWithBluetooth = Navigator & {
  bluetooth: {
    requestDevice(options: {
      filters: Array<{ namePrefix: string }>;
      optionalServices: string[];
    }): Promise<{
      addEventListener(type: string, listener: () => void): void;
      gatt: {
        connect(): Promise<GattServer>;
      } | null;
    }>;
  };
};

type BluetoothValueEvent = Event & {
  target: {
    value: DataView | null;
  };
};

export async function connectMuse(options: MuseConnectionOptions = {}): Promise<void> {
  const { onStatusChange, onEeg, onTelemetry } = options;

  if (typeof navigator === "undefined" || !("bluetooth" in navigator)) {
    throw new Error("Web Bluetooth is not supported in this browser.");
  }

  const updateStatus = (s: string) => {
    if (onStatusChange) onStatusChange(s);
  };

  updateStatus("Requesting device…");

  const bluetooth = (navigator as NavigatorWithBluetooth).bluetooth;
  const device = await bluetooth.requestDevice(
    {
      filters: [
        { namePrefix: "Ganglion-" },
        { namePrefix: "Muse-" },
      ],
      optionalServices: [MUSE_SERVICE_UUID],
    }
  );

  device.addEventListener("gattserverdisconnected", () => {
    updateStatus("Disconnected");
  });

  updateStatus("Connecting…");
  const server = await device.gatt!.connect();

  updateStatus("Getting Muse service…");
  const service = await server.getPrimaryService(MUSE_SERVICE_UUID);

  updateStatus("Configuring stream…");
  const controlChar = await service.getCharacteristic(CONTROL_CHARACTERISTIC);
  await controlChar.writeValue(encodeCommand("h"));
  const preset = "p21";
  await controlChar.writeValue(encodeCommand(preset));
  await controlChar.writeValue(encodeCommand("s"));
  await controlChar.writeValue(encodeCommand("d"));

  // Telemetry (battery etc.)
  try {
    const telemetryChar = await service.getCharacteristic(
      TELEMETRY_CHARACTERISTIC
    );
    await telemetryChar.startNotifications();
    telemetryChar.addEventListener("characteristicvaluechanged", (event: BluetoothValueEvent) => {
      const value = event.target.value;
      if (!value) return;
      const dv = new DataView(value.buffer);
      const sequenceId = dv.getUint16(0);
      const batteryLevel = dv.getUint16(2) / 512;
      const telemetry = { sequenceId, batteryLevel };
      if (onTelemetry) onTelemetry(telemetry);
    });
  } catch {
    // Telemetry is optional; ignore errors here.
  }

  // EEG channels
  updateStatus("Subscribing to EEG channels…");
  const channelCount = 4;

  for (let channelIndex = 0; channelIndex < channelCount; channelIndex++) {
    const characteristicId = EEG_CHARACTERISTICS[channelIndex];
    const eegChar = await service.getCharacteristic(characteristicId);
    await eegChar.startNotifications();

    eegChar.addEventListener("characteristicvaluechanged", (event: BluetoothValueEvent) => {
      const value = event.target.value;
      if (!value) return;

      const bytes = new Uint8Array(value.buffer);
      const dv = new DataView(bytes.buffer);
      const eventIndex = dv.getUint16(0);
      const sampleBytes = bytes.subarray(2);
      const samples = decodeEEGSamples(sampleBytes);

      const reading: MuseEegReading = {
        electrode: channelIndex,
        index: eventIndex,
        samples,
      };

      if (onEeg) onEeg(reading);
    });
  }

  updateStatus("Streaming EEG…");
}

export { EEG_FREQUENCY, EEG_SAMPLES_PER_READING };
