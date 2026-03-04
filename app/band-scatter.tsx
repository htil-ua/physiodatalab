 "use client";

import { useRef } from "react";
type EegSample = {
  t: number;
  value: number;
};

type BandScatterProps = {
  channelLabels: readonly string[];
  eegSeriesByChannel: EegSample[][];
  samplingFrequency: number;
};

type SpectrumPoint = {
  f: number;
  p: number;
};

function computePsd(values: number[], fs: number): SpectrumPoint[] {
  const nMax = 512;
  const n = Math.min(values.length, nMax);
  if (n < 32) return [];

  const segment = values.slice(-n);
  const nFreq = Math.floor(n / 2);
  const result: SpectrumPoint[] = [];

  for (let k = 0; k < nFreq; k++) {
    let re = 0;
    let im = 0;
    for (let nIdx = 0; nIdx < n; nIdx++) {
      const angle = (2 * Math.PI * k * nIdx) / n;
      const v = segment[nIdx];
      re += v * Math.cos(angle);
      im -= v * Math.sin(angle);
    }
    const mag2 = (re * re + im * im) / n; // ≈ power in µV^2/Hz
    const freq = (k * fs) / n;
    if (freq <= 60) {
      const eps = 1e-12;
      const powerDb = 10 * Math.log10(Math.max(mag2, eps));
      result.push({ f: freq, p: powerDb });
    }
  }

  return result;
}

export default function BandScatter({
  channelLabels,
  eegSeriesByChannel,
  samplingFrequency,
}: BandScatterProps) {
  const smoothRef = useRef<
    Record<string, { alpha: number; beta: number }>
  >({});

  // Need enough samples to form a stable PSD estimate
  if (!eegSeriesByChannel.some((series) => series.length > 32)) {
    return null;
  }

  const smoothing = 0.2; // 0 < smoothing <= 1, smaller = smoother

  const points = channelLabels.map((label, idx) => {
    const series = eegSeriesByChannel[idx] ?? [];
    const values = series.map((p) => p.value);
    const spectrum = computePsd(values, samplingFrequency);
    const alpha = spectrum.filter((pt) => pt.f >= 8 && pt.f < 13);
    const beta = spectrum.filter((pt) => pt.f >= 13 && pt.f < 30);

    const alphaVal =
      alpha.length > 0
        ? alpha.reduce((acc, pt) => acc + pt.p, 0) / alpha.length
        : Number.NEGATIVE_INFINITY;

    const betaVal =
      beta.length > 0
        ? beta.reduce((acc, pt) => acc + pt.p, 0) / beta.length
        : Number.NEGATIVE_INFINITY;

    const prev = smoothRef.current[label];
    let alphaSmooth = alphaVal;
    let betaSmooth = betaVal;

    if (
      prev &&
      Number.isFinite(prev.alpha) &&
      Number.isFinite(prev.beta) &&
      Number.isFinite(alphaVal) &&
      Number.isFinite(betaVal)
    ) {
      alphaSmooth = prev.alpha + smoothing * (alphaVal - prev.alpha);
      betaSmooth = prev.beta + smoothing * (betaVal - prev.beta);
    }

    smoothRef.current[label] = {
      alpha: alphaSmooth,
      beta: betaSmooth,
    };

    return { label, alpha: alphaSmooth, beta: betaSmooth };
  });

  const finitePoints = points.filter(
    (p) => Number.isFinite(p.alpha) && Number.isFinite(p.beta)
  );

  if (finitePoints.length === 0) {
    return null;
  }

  const alphaVals = finitePoints.map((p) => p.alpha);
  const betaVals = finitePoints.map((p) => p.beta);

  const minAlpha = Math.min(...alphaVals);
  const maxAlpha = Math.max(...alphaVals);
  const minBeta = Math.min(...betaVals);
  const maxBeta = Math.max(...betaVals);

  const alphaRange = maxAlpha - minAlpha || 1;
  const betaRange = maxBeta - minBeta || 1;

  const pad = 0.1;

  return (
    <div className="w-full max-w-xl mx-auto bg-white">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-full h-64"
      >
        {/* Axes */}
        <line x1={10} y1={90} x2={95} y2={90} stroke="#9ca3af" strokeWidth={0.6} />
        <line x1={10} y1={90} x2={10} y2={5} stroke="#9ca3af" strokeWidth={0.6} />

        {/* Axis labels */}
        <text x={52} y={98} fontSize={7} textAnchor="middle" fill="#4b5563">
          Alpha power (dB)
        </text>
        <text
          x={4}
          y={50}
          fontSize={7}
          textAnchor="middle"
          fill="#4b5563"
          transform="rotate(-90 4 50)"
        >
          Beta power (dB)
        </text>

        {/* Points */}
        {finitePoints.map((p, idx) => {
          const xNorm = (p.alpha - minAlpha) / alphaRange;
          const yNorm = (p.beta - minBeta) / betaRange;

          const x = 10 + pad * 80 + xNorm * (80 * (1 - 2 * pad));
          const y = 90 - (pad * 80 + yNorm * (80 * (1 - 2 * pad)));

          return (
            <g key={p.label}>
              <circle cx={x} cy={y} r={1.5} fill="#2563eb" />
              <text
                x={x + 2}
                y={y - 2}
                fontSize={6}
                fill="#111827"
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

