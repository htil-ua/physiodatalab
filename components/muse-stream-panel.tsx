'use client';

import { useMemo, useRef, useState } from 'react';
import { createMuseStreamHandle, type MuseSample, type MuseStreamHandle } from '@/lib/bci-client';

const MAX_SAMPLES = 20;

export function MuseStreamPanel() {
  const [status, setStatus] = useState('Idle');
  const [samples, setSamples] = useState<MuseSample[]>([]);
  const [working, setWorking] = useState(false);
  const handleRef = useRef<MuseStreamHandle | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const sampleText = useMemo(
    () =>
      samples
        .map((sample) =>
          JSON.stringify(
            {
              timestamp: sample.timestamp,
              channelData: sample.channelData,
              batteryLevel: sample.batteryLevel
            },
            null,
            2
          )
        )
        .join('\n\n'),
    [samples]
  );

  const runAction = async (label: string, fn: () => Promise<void>) => {
    setWorking(true);
    try {
      setStatus(label);
      await fn();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unexpected error while talking to Muse');
    } finally {
      setWorking(false);
    }
  };

  const connect = async () =>
    runAction('Connecting…', async () => {
      if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth is unavailable. Use Chrome/Edge on HTTPS or localhost.');
      }

      const handle = await createMuseStreamHandle();
      await handle.connect();
      handleRef.current = handle;
      setStatus('Connected. Ready to stream.');
    });

  const start = async () =>
    runAction('Starting stream…', async () => {
      if (!handleRef.current) {
        throw new Error('Connect to Muse first.');
      }
      unsubscribeRef.current?.();
      unsubscribeRef.current = await handleRef.current.onSample((sample) => {
        setSamples((current) => [sample, ...current].slice(0, MAX_SAMPLES));
      });
      await handleRef.current.start();
      setStatus('Streaming…');
    });

  const stop = async () =>
    runAction('Stopping stream…', async () => {
      await handleRef.current?.stop();
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      setStatus('Stream stopped.');
    });

  const disconnect = async () =>
    runAction('Disconnecting…', async () => {
      await handleRef.current?.disconnect();
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      handleRef.current = null;
      setStatus('Disconnected.');
    });

  return (
    <div>
      <div className="controls">
        <button type="button" onClick={connect} disabled={working}>
          Connect
        </button>
        <button type="button" onClick={start} disabled={working}>
          Start Stream
        </button>
        <button type="button" onClick={stop} disabled={working}>
          Stop Stream
        </button>
        <button type="button" onClick={disconnect} disabled={working}>
          Disconnect
        </button>
      </div>
      <p className="status">Status: {status}</p>
      <pre>{sampleText || 'No samples yet. Click “Connect” then “Start Stream”.'}</pre>
    </div>
  );
}
