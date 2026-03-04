type EegSample = {
  t: number;
  value: number;
};

type PsdPlotProps = {
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

export default function PsdPlot({
  channelLabels,
  eegSeriesByChannel,
  samplingFrequency,
}: PsdPlotProps) {
  if (!eegSeriesByChannel.some((series) => series.length > 32)) {
    return null;
  }

  return (
    <div className="flex flex-col gap-0 w-full">
      {channelLabels.map((label, idx) => {
        const series = eegSeriesByChannel[idx];
        const values = series.map((p) => p.value);
        const spectrum = computePsd(values, samplingFrequency);
        if (spectrum.length === 0) {
          return (
            <div
              key={label}
              className="flex items-center gap-2 w-full"
            >
              <div className="w-10 text-sm font-semibold text-right pr-2">
                {label}
              </div>
              <div className="flex-1 bg-white h-24" />
            </div>
          );
        }

        const bands = [
          { key: "delta", label: "Δ", fMin: 1, fMax: 4 },
          { key: "theta", label: "Θ", fMin: 4, fMax: 8 },
          { key: "alpha", label: "Α", fMin: 8, fMax: 13 },
          { key: "beta", label: "Β", fMin: 13, fMax: 30 },
        ] as const;

        const bandValues = bands.map((band) => {
          const pts = spectrum.filter(
            (pt) => pt.f >= band.fMin && pt.f < band.fMax
          );
          if (pts.length === 0) return Number.NEGATIVE_INFINITY;
          const sum = pts.reduce((acc, pt) => acc + pt.p, 0);
          return sum / pts.length;
        });

        const finiteVals = bandValues.filter((v) => Number.isFinite(v));
        const maxVal = finiteVals.length ? Math.max(...finiteVals) : 0;
        const minVal = finiteVals.length ? Math.min(...finiteVals) : maxVal - 1;
        const range = maxVal - minVal || 1;

        return (
          <div
            key={label}
            className="flex items-center gap-2 w-full"
          >
            <div className="w-10 text-sm font-semibold text-right pr-2">
              {label}
            </div>
            <div className="flex-1 bg-white">
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="w-full h-24"
              >
                {bands.map((band, i) => {
                  const bandNorm = Number.isFinite(bandValues[i])
                    ? (bandValues[i] - minVal) / range
                    : 0;
                  const bandWidth = 100 / bands.length;
                  const x = i * bandWidth + bandWidth * 0.15;
                  const w = bandWidth * 0.7;
                  const y = 90 - bandNorm * 70;
                  const h = 90 - y;

                  return (
                    <g key={band.key}>
                      <rect
                        x={x}
                        y={y}
                        width={w}
                        height={h}
                        fill="#16a34a"
                      />
                      <text
                        x={x + w / 2}
                        y={98}
                        fontSize="7"
                        textAnchor="middle"
                        fill="#4b5563"
                      >
                        {band.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}

