import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Info, X, Loader2 } from "lucide-react";
import styles from "./ContextRing.module.css";

interface SegmentTokens {
  label: string;
  tokens: number;
  color: string;
}

interface TokenizeResult {
  segments: SegmentTokens[];
  total: number;
  error?: string;
}

interface ContextRingProps {
  usageTokens: number;
  maxTokens: number;
  serverUrl: string;
  model: string;
  systemPrompt: string;
  toolsJson: string;
  messagesText: string;
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
    const t = (pct - 50) / 25;
    return interpolateColor(t, [102, 102, 102], [240, 192, 64]);
  }
  const t = (pct - 75) / 25;
  return interpolateColor(t, [240, 192, 64], [224, 64, 64]);
}

function getSegmentColor(index: number): string {
  const colors = [
    [74, 108, 247],
    [120, 80, 220],
    [160, 64, 200],
    [200, 64, 170],
    [230, 80, 140],
    [240, 120, 100],
    [240, 160, 70],
    [240, 192, 64],
  ];
  const i = Math.min(index, colors.length - 1);
  return `#${colors[i].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function formatTokens(n: number): string {
  return n.toLocaleString();
}

async function tokenize(
  serverUrl: string,
  model: string,
  content: string
): Promise<number> {
  const baseUrl = serverUrl.replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/tokenize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      content,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error("[ContextRing] tokenize error:", {
      url: `${baseUrl}/tokenize`,
      status: response.status,
      model,
      contentLength: content.length,
      body: errorText,
    });
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  const data = await response.json();
  return data.tokens?.length ?? 0;
}

export default function ContextRing({
  usageTokens,
  maxTokens,
  serverUrl,
  model,
  systemPrompt,
  toolsJson,
  messagesText,
}: ContextRingProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tokenResult, setTokenResult] = useState<TokenizeResult | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const computeTokens = useCallback(async () => {
    setIsComputing(true);
    setTokenResult(null);
    try {
      const results = await Promise.allSettled([
        tokenize(serverUrl, model, systemPrompt),
        tokenize(serverUrl, model, toolsJson),
        tokenize(serverUrl, model, messagesText),
      ]);

      const values = results.map((r) =>
        r.status === "fulfilled" ? r.value : 0
      );
      const total = values.reduce((a, b) => a + b, 0);

      const segments: SegmentTokens[] = [
        { label: "System Prompt", tokens: values[0], color: getSegmentColor(0) },
        { label: "Tools", tokens: values[1], color: getSegmentColor(1) },
        { label: "Messages", tokens: values[2], color: getSegmentColor(2) },
      ];

      setTokenResult({ segments, total });
    } catch (err) {
      setTokenResult({
        segments: [],
        total: 0,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsComputing(false);
    }
  }, [serverUrl, model, systemPrompt, toolsJson, messagesText]);

  useEffect(() => {
    if (!isOpen) return;
    computeTokens();
  }, [isOpen, computeTokens]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={styles.ring} ref={dropdownRef}>
      <div
        className={`${styles.trigger} ${isOpen ? styles.active : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        title={tooltip}
      >
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
      {isOpen && (
        <div className={styles.popup}>
          <div className={styles.popupHeader}>
            <span>Context Window</span>
            <button className={styles.closeBtn} onClick={() => setIsOpen(false)}>
              <X size={14} />
            </button>
          </div>
          <div className={styles.popupBody}>
            {isComputing ? (
              <div className={styles.loading}>
                <Loader2 size={16} className={styles.spin} />
                <span>Computing token counts...</span>
              </div>
            ) : tokenResult?.error ? (
              <div className={styles.error}>
                <span>Failed to tokenize: {tokenResult.error}</span>
              </div>
            ) : tokenResult ? (
              <>
                {/* Stacked bar */}
                <div className={styles.barContainer}>
                  {tokenResult.segments.map((seg) => {
                    const width =
                      maxTokens > 0
                        ? (seg.tokens / maxTokens) * 100
                        : 0;
                    if (width === 0) return null;
                    return (
                      <div
                        key={seg.label}
                        className={styles.barSegment}
                        style={{
                          width: `${width}%`,
                          backgroundColor: seg.color,
                        }}
                        title={`${seg.label}: ${formatTokens(seg.tokens)} tokens`}
                      />
                    );
                  })}
                  {tokenResult.total < maxTokens && (
                    <div
                      className={`${styles.barSegment} ${styles.barFree}`}
                      style={{
                        width: `${((maxTokens - tokenResult.total) / maxTokens) * 100}%`,
                      }}
                      title={`Free: ${formatTokens(maxTokens - tokenResult.total)} tokens`}
                    />
                  )}
                </div>

                {/* Breakdown list */}
                <div className={styles.breakdown}>
                  {tokenResult.segments.map((seg) => (
                    <div key={seg.label} className={styles.breakdownRow}>
                      <div className={styles.breakdownLabel}>
                        <span
                          className={styles.dot}
                          style={{ backgroundColor: seg.color }}
                        />
                        {seg.label}
                      </div>
                      <div className={styles.breakdownValue}>
                        {formatTokens(seg.tokens)} tokens
                        {tokenResult.total > 0 && (
                          <span className={styles.pct}>
                            ({((seg.tokens / tokenResult.total) * 100).toFixed(1)}%)
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className={`${styles.breakdownRow} ${styles.breakdownTotal}`}>
                    <div className={styles.breakdownLabel}>Total</div>
                    <div className={styles.breakdownValue}>
                      {formatTokens(tokenResult.total)} / {formatTokens(maxTokens)} tokens
                      <span className={styles.pct}>
                        ({((tokenResult.total / maxTokens) * 100).toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Info tooltip */}
                <div className={styles.info}>
                  <Info size={12} />
                  <span>
                    Token counts are approximate
                  </span>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
