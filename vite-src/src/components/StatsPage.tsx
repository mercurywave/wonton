import { useState, useEffect, useMemo, useRef } from "react";
import { BarChart3, Clock, Zap, Hash, ArrowUpRight } from "lucide-react";
import { StatsEntry } from "../types/chat";
import styles from "../components/StatsPage.module.css";
import { useSettings, useProjects } from "../contexts";
import { statsStore } from "../store/stats";
import { isBackendConnected } from "../utils/platformUtils";
import { getDisplayName } from "../utils/modelUtils";

interface DailyTokens {
  date: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
}

interface ModelStats {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
  totalMs: number;
  cacheHits: number;
}

interface ProjectStats {
  projectId: string;
  projectName: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function formatRate(tokens: number, ms: number): string {
  if (ms <= 0) return "—";
  const rate = (tokens / (ms / 1000)).toFixed(1);
  return `${rate} tok/s`;
}

export default function StatsPage() {
  const { settings } = useSettings();
  const { getProjectById } = useProjects();
  const [entries, setEntries] = useState<StatsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [browserMode, setBrowserMode] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isBackendConnected()) {
      setBrowserMode(true);
      setLoading(false);
      return;
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 29);

    const startStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`;
    const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;

    statsStore.loadRange(startStr, endStr).then((data) => {
      setEntries(data);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (scrollContainerRef.current && entries.length > 0) {
      scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
    }
  }, [entries]);

  const dailyTokens = useMemo((): DailyTokens[] => {
    const map = new Map<string, DailyTokens>();
    for (const e of entries) {
      const d = new Date(e.timestamp);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const existing = map.get(dateStr);
      if (existing) {
        existing.promptTokens += e.promptTokens;
        existing.completionTokens += e.completionTokens;
        existing.totalTokens += e.totalTokens;
        existing.calls += 1;
      } else {
        map.set(dateStr, {
          date: dateStr,
          promptTokens: e.promptTokens,
          completionTokens: e.completionTokens,
          totalTokens: e.totalTokens,
          calls: 1,
        });
      }
    }
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 29);
    const result: DailyTokens[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const existing = map.get(dateStr);
      if (existing) {
        result.push(existing);
      } else {
        result.push({ date: dateStr, promptTokens: 0, completionTokens: 0, totalTokens: 0, calls: 0 });
      }
    }
    return result;
  }, [entries]);

  const modelStats = useMemo((): ModelStats[] => {
    const map = new Map<string, ModelStats>();
    for (const e of entries) {
      const existing = map.get(e.model);
      if (existing) {
        existing.promptTokens += e.promptTokens;
        existing.completionTokens += e.completionTokens;
        existing.totalTokens += e.totalTokens;
        existing.calls += 1;
        existing.totalMs += e.timeMs;
        existing.cacheHits += e.cacheN || 0;
      } else {
        map.set(e.model, {
          model: e.model,
          promptTokens: e.promptTokens,
          completionTokens: e.completionTokens,
          totalTokens: e.totalTokens,
          calls: 1,
          totalMs: e.timeMs,
          cacheHits: e.cacheN || 0,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalTokens - a.totalTokens);
  }, [entries]);

  const projectStats = useMemo((): ProjectStats[] => {
    const map = new Map<string, ProjectStats>();
    for (const e of entries) {
      const existing = map.get(e.projectId);
      if (existing) {
        existing.promptTokens += e.promptTokens;
        existing.completionTokens += e.completionTokens;
        existing.totalTokens += e.totalTokens;
        existing.calls += 1;
      } else {
        const project = getProjectById(e.projectId);
        map.set(e.projectId, {
          projectId: e.projectId,
          projectName: project?.name || "(unknown)",
          promptTokens: e.promptTokens,
          completionTokens: e.completionTokens,
          totalTokens: e.totalTokens,
          calls: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalTokens - a.totalTokens);
  }, [entries]);

  const totalTokens = useMemo(() => entries.reduce((s, e) => s + e.totalTokens, 0), [entries]);
  const totalCalls = useMemo(() => entries.length, [entries]);
  const totalCompletionTokens = useMemo(() => entries.reduce((s, e) => s + e.completionTokens, 0), [entries]);
  const totalTimeMs = useMemo(() => entries.reduce((s, e) => s + e.timeMs, 0), [entries]);
  const avgTps = useMemo(() => formatRate(totalCompletionTokens, totalTimeMs), [totalCompletionTokens, totalTimeMs]);
  const topModel = modelStats[0]?.model || "—";
  const topModelDisplayName = getDisplayName(topModel, settings.modelAliases);

  const maxDailyTokens = useMemo(
    () => Math.max(...dailyTokens.map((d) => d.totalTokens), 1),
    [dailyTokens]
  );

  function formatChartLabel(day: DailyTokens, index: number, prevMonth?: string): string {
    const d = new Date(day.date + "T00:00:00");
    const month = d.toLocaleDateString("en-US", { month: "short" });
    const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
    if (index === 0 || monthKey !== prevMonth) {
      return `${month}`;
    }
    return `${d.getDate()}`;
  }

  const chartLabels = useMemo(() => {
    const labels: string[] = [];
    let prevMonth: string | undefined;
    for (let i = 0; i < dailyTokens.length; i++) {
      labels.push(formatChartLabel(dailyTokens[i], i, prevMonth));
      const d = new Date(dailyTokens[i].date + "T00:00:00");
      prevMonth = `${d.getFullYear()}-${d.getMonth()}`;
    }
    return labels;
  }, [dailyTokens]);

  if (browserMode) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.header}>
            <BarChart3 size={22} />
            <h2>Stats</h2>
          </div>
          <div className={styles.browserWarning}>
            <p>Stats tracking requires desktop mode (Electron). It is not available in browser dev mode.</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.header}>
            <BarChart3 size={22} />
            <h2>Stats</h2>
          </div>
          <div className={styles.loading}>Loading stats...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <BarChart3 size={22} />
          <h2>Stats</h2>
        </div>

        {/* Summary Cards */}
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryIcon}>
              <Hash size={18} />
            </div>
            <div className={styles.summaryValue}>{formatNumber(totalTokens)}</div>
            <div className={styles.summaryLabel}>Total Tokens</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryIcon}>
              <Clock size={18} />
            </div>
            <div className={styles.summaryValue}>{totalCalls.toLocaleString()}</div>
            <div className={styles.summaryLabel}>API Calls</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryIcon}>
              <Zap size={18} />
            </div>
            <div className={styles.summaryValue}>{avgTps}</div>
            <div className={styles.summaryLabel}>Avg Tokens/sec</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryIcon}>
              <ArrowUpRight size={18} />
            </div>
            <div className={styles.summaryValue} style={{ fontSize: "13px" }}>{topModelDisplayName}</div>
            <div className={styles.summaryLabel}>Top Model</div>
          </div>
        </div>

        {/* Daily Tokens Chart */}
        {dailyTokens.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Daily Token Usage (Last 30 Days)</h3>
            <div className={styles.chartScrollContainer} ref={scrollContainerRef}>
              <div className={styles.chartContainer}>
                {dailyTokens.map((day, i) => (
                  <div key={day.date} className={styles.chartBarWrapper}>
                    <div className={styles.chartBarGroup}>
                      <div
                        className={styles.chartBarPrompt}
                        style={{ height: `${(day.promptTokens / maxDailyTokens) * 100}%` }}
                        title={`Prompt: ${day.promptTokens.toLocaleString()}`}
                      />
                      <div
                        className={styles.chartBarCompletion}
                        style={{ height: `${(day.completionTokens / maxDailyTokens) * 100}%` }}
                        title={`Completion: ${day.completionTokens.toLocaleString()}`}
                      />
                    </div>
                    <div className={styles.chartLabel}>{chartLabels[i]}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.chartLegend}>
              <div className={styles.legendItem}>
                <div className={styles.legendDot} style={{ background: "#4a6cf7" }} />
                <span>Prompt</span>
              </div>
              <div className={styles.legendItem}>
                <div className={styles.legendDot} style={{ background: "#22c55e" }} />
                <span>Completion</span>
              </div>
            </div>
          </div>
        )}

        {/* Model Breakdown */}
        {modelStats.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Model Breakdown</h3>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Model</th>
                    <th className={styles.th}>Calls</th>
                    <th className={styles.th}>Input Tokens</th>
                    <th className={styles.th}>Output Tokens</th>
                    <th className={styles.th}>Total Tokens</th>
                    <th className={styles.th}>Avg Latency</th>
                    <th className={styles.th}>Avg TPS</th>
                    {modelStats.some((m) => m.cacheHits > 0) && (
                      <th className={styles.th}>Cache Hits</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {modelStats.map((ms) => (
                    <tr key={ms.model}>
                      <td className={styles.td}>{getDisplayName(ms.model, settings.modelAliases)}</td>
                      <td className={styles.td}>{ms.calls.toLocaleString()}</td>
                      <td className={styles.td}>{ms.promptTokens.toLocaleString()}</td>
                      <td className={styles.td}>{ms.completionTokens.toLocaleString()}</td>
                      <td className={styles.td}>{ms.totalTokens.toLocaleString()}</td>
                      <td className={styles.td}>{formatMs(ms.totalMs / ms.calls)}</td>
                      <td className={styles.td}>{formatRate(ms.completionTokens, ms.totalMs)}</td>
                      {ms.cacheHits > 0 && (
                        <td className={styles.td}>{ms.cacheHits.toLocaleString()}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Project Breakdown */}
        {projectStats.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Project Breakdown</h3>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>Project</th>
                    <th className={styles.th}>Calls</th>
                    <th className={styles.th}>Input Tokens</th>
                    <th className={styles.th}>Output Tokens</th>
                    <th className={styles.th}>Total Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {projectStats.map((ps) => (
                    <tr key={ps.projectId}>
                      <td className={styles.td} title={ps.projectId}>{ps.projectName}</td>
                      <td className={styles.td}>{ps.calls.toLocaleString()}</td>
                      <td className={styles.td}>{ps.promptTokens.toLocaleString()}</td>
                      <td className={styles.td}>{ps.completionTokens.toLocaleString()}</td>
                      <td className={styles.td}>{ps.totalTokens.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Agent Breakdown */}
        {(() => {
          const map = new Map<string, { count: number; totalTokens: number; totalMs: number; promptTokens: number; completionTokens: number }>();
          for (const e of entries) {
            const agentKey = e.agentId || "(no agent)";
            const existing = map.get(agentKey);
            if (existing) {
              existing.count += 1;
              existing.totalTokens += e.totalTokens;
              existing.totalMs += e.timeMs;
              existing.promptTokens += e.promptTokens;
              existing.completionTokens += e.completionTokens;
            } else {
              map.set(agentKey, { count: 1, totalTokens: e.totalTokens, totalMs: e.timeMs, promptTokens: e.promptTokens, completionTokens: e.completionTokens });
            }
          }
          const agents = Array.from(map.entries()).sort((a, b) => b[1].totalTokens - a[1].totalTokens);
          if (agents.length === 0) return null;
          return (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Agent Breakdown</h3>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Agent</th>
                      <th className={styles.th}>Calls</th>
                      <th className={styles.th}>Input Tokens</th>
                      <th className={styles.th}>Output Tokens</th>
                      <th className={styles.th}>Total Tokens</th>
                      <th className={styles.th}>Avg Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map(([agent, data]) => (
                      <tr key={agent}>
                        <td className={styles.td}>{agent}</td>
                        <td className={styles.td}>{data.count.toLocaleString()}</td>
                        <td className={styles.td}>{data.promptTokens.toLocaleString()}</td>
                        <td className={styles.td}>{data.completionTokens.toLocaleString()}</td>
                        <td className={styles.td}>{data.totalTokens.toLocaleString()}</td>
                        <td className={styles.td}>{formatMs(data.totalMs / data.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {entries.length === 0 && (
          <div className={styles.noData}>No stats data available for the last 30 days.</div>
        )}
      </div>
    </div>
  );
}
