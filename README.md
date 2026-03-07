This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## EEG CSV Recording

After connecting to a Muse device, you can:

- Click **Start Recording** to begin collecting incoming EEG samples.
- Click **Stop Recording** to pause data capture.
- Click **Save EEG CSV** to download the currently recorded data as a CSV file.

The CSV is exported in wide format: one `timestamp_ms` column plus four EEG channel columns (`Tp9`, `AF7`, `AF8`, `TP10`). Each row represents a sample index across channels.


## Flow-Based Programming Editor (Rete.js)

The app now includes a Rete.js-powered flow editor beneath the EEG chart.

- Channel source nodes (`TP9`, `AF7`, `AF8`) expose draggable output ports.
- Filter nodes (for example, `60Hz Notch`, `1-40Hz Bandpass`) expose draggable input/output ports.
- Draw and rewire connections interactively to model EEG signal-processing pipelines.
- Click an existing connection line to delete it, or drag a new output into the same filter input to update (rewire) that edge.
- The editor uses a playful, colorful node style designed to be more engaging for K-12 learners.
- Incoming EEG samples are streamed from the Next.js app into the flow editor iframe via `postMessage`, and the editor displays a live per-channel value panel.

The editor is served from `public/rete-flow.html` and attempts to load Rete.js modules from external CDNs at runtime (`esm.sh` with `jsdelivr` fallback). If the CDNs are unavailable, the page falls back to an offline basic graph editor so users can still drag nodes and wire channels to filters while still receiving the live stream panel updates.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
