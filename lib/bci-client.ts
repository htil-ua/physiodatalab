export type MuseSample = {
  timestamp: number;
  channelData: number[];
  batteryLevel?: number;
};

type Unsubscribe = () => void;

export interface MuseStreamHandle {
  connect: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  disconnect: () => Promise<void>;
  onSample: (listener: (sample: MuseSample) => void) => Promise<Unsubscribe>;
}

export async function createMuseStreamHandle(): Promise<MuseStreamHandle> {
  const mod = await import('bcidevice');
  const DeviceCtor =
    (mod as Record<string, unknown>).MuseDevice ??
    (mod as Record<string, unknown>).BCIDevice ??
    (mod as Record<string, unknown>).default;

  if (typeof DeviceCtor !== 'function') {
    throw new Error('Could not find a Muse-compatible class export in bcidevice.');
  }

  const device = new (DeviceCtor as new (config: Record<string, unknown>) => Record<string, unknown>)({
    type: 'muse'
  });

  const callMaybe = async (method: string) => {
    const fn = device[method] as (() => Promise<void>) | undefined;
    if (typeof fn === 'function') {
      await fn.call(device);
    }
  };

  return {
    connect: async () => callMaybe('connect'),
    start: async () => {
      await callMaybe('startStreaming');
      await callMaybe('start');
    },
    stop: async () => {
      await callMaybe('stopStreaming');
      await callMaybe('stop');
    },
    disconnect: async () => callMaybe('disconnect'),
    onSample: async (listener) => {
      const eegReadings = device.eegReadings as
        | { subscribe?: (cb: (sample: MuseSample) => void) => { unsubscribe?: () => void } }
        | undefined;
      if (eegReadings?.subscribe) {
        const subscription = eegReadings.subscribe(listener);
        return () => subscription.unsubscribe?.();
      }

      const on = device.on as ((event: string, cb: (sample: MuseSample) => void) => void) | undefined;
      const off =
        device.off as ((event: string, cb: (sample: MuseSample) => void) => void) | undefined;

      if (on) {
        on('sample', listener);
        return () => off?.('sample', listener);
      }

      throw new Error('bcidevice does not expose a recognized streaming API.');
    }
  };
}
