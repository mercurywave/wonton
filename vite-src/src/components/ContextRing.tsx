import { useMemo } from "react";
import styles from "./ContextRing.module.css";

interface ContextRingProps {
  usageTokens: number;
  maxTokens: number;
}

function interpolateColor(
  t: number,
  c1: [number, number, number],
  c2: [number, number, number]
): string {
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function getColor(pct: number): string {
  if (pct <= 50) {
    return "#666666";
  }
  if (pct <= 75) {
    // gray (#666666) -> yellow (#f0c040)
    const t = (pct - 50) / 25;
    return interpolateColor(t, [102, 102, 102], [240, 192, 64]);
  }
  // yellow (#f0c040) -> red (#e04040)
  const t = (pct - 75) / 25;
  return interpolateColor(t, [240, 192, 64], [224, 64, 64]);
}

function formatTokens(n: number): string {
  return n.toLocaleString();
}

export default function ContextRing({ usageTokens, maxTokens }: ContextRingProps) {
  const { pct, color, tooltip } = useMemo(() => {
    if (maxTokens <= 0) return { pct: 0, color: "#666666", tooltip: "" };
    const raw = (usageTokens / maxTokens) * 100;
    const pct = Math.min(Math.max(raw, 0), 100);
    const color = getColor(pct);
    const tooltip = `${formatTokens(usageTokens)} / ${formatTokens(maxTokens)} tokens (${pct.toFixed(0)}%)`;
    return { pct, color, tooltip };
  }, [usageTokens, maxTokens]);

  const radius = 11;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);

  return (
    <div className={styles.ring} title={tooltip}>
      <svg viewBox="0 0 28 28" className={styles.svg}>
        <circle cx="14" cy="14" r={radius} className={styles.track} />
        <circle
          cx="14"
          cy="14"
          r={radius}
          className={styles.progress}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
    </div>
  );
}
