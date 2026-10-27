import { formatMoney } from "@/core/money";
import type { Snapshot } from "@/core/types";

export function paceCaption(snapshot: Snapshot): string {
  const money = (cents: number) => formatMoney(cents, snapshot.currency);
  return `Day ${snapshot.pace.dayNumber} of ${snapshot.pace.cycleDays}. ${money(snapshot.pace.thisSoFarCents)} has left spend accounts. At this point last cycle, ${money(snapshot.pace.lastAtSameDayCents)} had left.`;
}

export function PaceChart({ snapshot }: { snapshot: Snapshot }) {
  const { pace } = snapshot;
  const width = 640;
  const height = 176;
  const max = Math.max(1, ...pace.thisCycle, ...pace.lastCycle);
  const plotW = width - 12;
  const plotH = height - 16;
  const x = (index: number) => 6 + (index / Math.max(1, pace.cycleDays - 1)) * plotW;
  const y = (value: number) => 8 + (1 - value / max) * plotH;
  const path = (series: number[]) =>
    series
      .map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(value).toFixed(1)}`)
      .join(" ");
  const lastPoint = pace.thisCycle.length - 1;

  return (
    <svg
      className="pace-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={paceCaption(snapshot)}
    >
      <line x1="6" y1={y(0)} x2={width - 6} y2={y(0)} className="axis" />
      {pace.lastCycle.length > 1 ? <path d={path(pace.lastCycle)} className="last" /> : null}
      {pace.thisCycle.length > 1 ? <path d={path(pace.thisCycle)} className="current" /> : null}
      {lastPoint >= 0 ? <circle cx={x(lastPoint)} cy={y(pace.thisCycle[lastPoint] ?? 0)} r="3.5" className="now-dot" /> : null}
    </svg>
  );
}
