type EegSample = {
  t: number;
  value: number;
};

type EegPlotProps = {
  channelLabels: readonly string[];
  eegSeriesByChannel: EegSample[][];
};

export default function EegPlot({
  channelLabels,
  eegSeriesByChannel,
}: EegPlotProps) {
  if (!eegSeriesByChannel.some((series) => series.length > 1)) {
    return null;
  }

  return (
    <div className="mt-6 w-[94vw] max-w-none">
      <div className="flex flex-col gap-0 w-full">
        {channelLabels.map((label, idx) => {
          const series = eegSeriesByChannel[idx];
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
                  viewBox="0 0 100 30"
                  preserveAspectRatio="none"
                  className="w-full h-24"
                >
                  {series.length > 1 && (() => {
                    const values = series.map((p) => p.value);
                    const minV = Math.min(...values);
                    const maxV = Math.max(...values);
                    const range = maxV - minV || 1;
                    const mid = (minV + maxV) / 2;

                    const points = series
                      .map((p, i) => {
                        const x =
                          (i / Math.max(series.length - 1, 1)) * 100;
                        const normalized = (p.value - mid) / (range / 2 || 1);
                        const clamped = Math.max(-1.2, Math.min(1.2, normalized));
                        const y = 15 - clamped * 10;
                        return `${x},${y}`;
                      })
                      .join(" ");

                    return (
                      <polyline
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth="0.12"
                        points={points}
                      />
                    );
                  })()}
                </svg>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

