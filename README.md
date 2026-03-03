# Muse Streamer (Next.js + BCIDevice)

This repository is a minimal Next.js app that connects to a Muse headset over Web Bluetooth and streams live EEG samples through the `BCIDevice` library.

## Features

- Connect / start / stop / disconnect controls for a Muse device.
- Real-time sample preview of the most recent 20 packets.
- Browser-only loading of `bcidevice` via dynamic import.

## Prerequisites

- Node.js 20+
- Chromium-based browser with Web Bluetooth support.
- HTTPS origin or `http://localhost`.
- A Muse headset in pairing mode.

## Install

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Notes on BCIDevice compatibility

Because `BCIDevice` can export different class names/APIs depending on version, this app attempts a few common patterns:

- Class export lookup: `MuseDevice`, `BCIDevice`, or default export.
- Streaming hooks: Rx-like `eegReadings.subscribe(...)` or EventEmitter-style `on('sample', ...)`.

If your BCIDevice fork uses different method/event names, update `lib/bci-client.ts` accordingly.


## Troubleshooting TypeScript install/build errors

If you see parser errors from `node_modules/@types/node/*.d.ts` (for example `TS1128`/`TS1005` inside `http.d.ts`), make sure your local TypeScript compiler is not older than the one pinned in this repo and reinstall cleanly:

```bash
rm -rf node_modules package-lock.json
npm install
```

This project pins `typescript@5.4.5` and `@types/node@18.19.45` to avoid parser incompatibilities seen with some environments.
