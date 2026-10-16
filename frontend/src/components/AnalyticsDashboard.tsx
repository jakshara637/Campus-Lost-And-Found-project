import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Package,
  RefreshCw,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import { fetchAnalytics, type AnalyticsDashboardData } from "../lib/api";
import "./AnalyticsDashboard.css";

type Props = { onClose: () => void };

function formatDay(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Package;
  tone: "purple" | "green" | "blue" | "amber";
}) {
  return (
    <article className="analytics-metric-card">
      <div className={`analytics-metric-icon analytics-tone-${tone}`}><Icon size={21} /></div>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

export default function AnalyticsDashboard({ onClose }: Props) {
  const [data, setData] = useState<AnalyticsDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchAnalytics();
      setData(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAnalytics(); }, [loadAnalytics, reloadKey]);

  const overview = data?.overview;
  const maxDaily = Math.max(
    1,
    ...(data?.daily_activity ?? []).map((day) => day.lost + day.found),
  );
  const maxCategory = Math.max(1, ...(data?.categories ?? []).map((item) => item.count));

  return (
    <div className="analytics-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="analytics-dialog" role="dialog" aria-modal="true" aria-labelledby="analytics-title">
        <button className="analytics-close" type="button" onClick={onClose} aria-label="Close analytics"><X size={20} /></button>
        <div className="analytics-heading-row">
          <div>
            <div className="analytics-eyebrow"><Activity size={14} /> CAMPUSLOOP INSIGHTS</div>
            <h2 id="analytics-title">Analytics dashboard<span>.</span></h2>
            <p className="analytics-subtitle">A live snapshot of reports, claims and campus activity.</p>
          </div>
          <button className="analytics-refresh" type="button" onClick={() => setReloadKey((key) => key + 1)} disabled={loading}>
            <RefreshCw size={15} className={loading ? "analytics-refresh-spinning" : ""} /> Refresh
          </button>
        </div>

        {loading && !data && <div className="analytics-state" role="status"><span className="loading-spinner" /> Calculating campus statistics…</div>}
        {error && <div className="analytics-error" role="alert"><AlertCircle size={19} /><div><strong>Analytics couldn’t load</strong><p>{error}</p><button type="button" onClick={() => setReloadKey((key) => key + 1)}>Try again</button></div></div>}

        {data && overview && <>
          <div className="analytics-live-note"><span className="analytics-live-dot" /> Live database summary <span>Updated {new Date(data.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>
          <div className="analytics-metrics-grid">
            <MetricCard label="Total reports" value={overview.total_reports} detail="All campus reports" icon={Package} tone="purple" />
            <MetricCard label="Resolved" value={overview.resolved_reports} detail={`${overview.resolution_rate}% resolution rate`} icon={CheckCircle2} tone="green" />
            <MetricCard label="Claims submitted" value={overview.total_claims} detail={`${overview.pending_claims} awaiting review`} icon={Search} tone="blue" />
            <MetricCard label="Awaiting action" value={overview.open_reports + overview.claim_requested_reports} detail={`${overview.open_reports} open · ${overview.claim_requested_reports} claim requested`} icon={Clock3} tone="amber" />
          </div>

          <div className="analytics-main-grid">
            <section className="analytics-panel analytics-activity-panel">
              <div className="analytics-panel-heading"><div><span className="analytics-panel-icon"><TrendingUp size={17} /></span><div><h3>Report activity</h3><p>Lost and found reports · last 7 days</p></div></div></div>
              <div className="analytics-legend"><span><i className="analytics-legend-lost" /> Lost</span><span><i className="analytics-legend-found" /> Found</span></div>
              <div className="analytics-chart" role="img" aria-label="Daily lost and found report counts for the last seven days">
                {(data.daily_activity ?? []).map((day) => {
                  const total = day.lost + day.found;
                  const lostHeight = total ? (day.lost / maxDaily) * 100 : 0;
                  const foundHeight = total ? (day.found / maxDaily) * 100 : 0;
                  return <div className="analytics-chart-column" key={day.date}>
                    <div className="analytics-chart-value">{total || ""}</div>
                    <div className="analytics-bar-track">
                      <div className="analytics-stacked-bar">
                        <span className="analytics-bar-lost" style={{ height: `${lostHeight}%` }} />
                        <span className="analytics-bar-found" style={{ height: `${foundHeight}%` }} />
                      </div>
                    </div>
                    <span className="analytics-chart-day">{formatDay(day.date)}</span>
                  </div>;
                })}
              </div>
              <div className="analytics-chart-summary"><CalendarDays size={15} /> <span><strong>{data.daily_activity.reduce((sum, day) => sum + day.lost + day.found, 0)}</strong> reports posted during this period</span></div>
            </section>

            <section className="analytics-panel">
              <div className="analytics-panel-heading"><div><span className="analytics-panel-icon analytics-panel-icon-blue"><BarChart3 size={17} /></span><div><h3>Lost vs. found</h3><p>Report type distribution</p></div></div></div>
              <div className="analytics-type-total">{overview.total_reports}<span> total reports</span></div>
              <div className="analytics-type-row"><div><span className="analytics-type-dot analytics-dot-lost" />Lost items</div><strong>{overview.lost_reports}</strong></div>
              <div className="analytics-progress"><span className="analytics-progress-lost" style={{ width: `${overview.total_reports ? overview.lost_reports / overview.total_reports * 100 : 0}%` }} /></div>
              <div className="analytics-type-row"><div><span className="analytics-type-dot analytics-dot-found" />Found items</div><strong>{overview.found_reports}</strong></div>
              <div className="analytics-progress"><span className="analytics-progress-found" style={{ width: `${overview.total_reports ? overview.found_reports / overview.total_reports * 100 : 0}%` }} /></div>
              <div className="analytics-status-divider" />
              <div className="analytics-status-heading">Report status</div>
              <div className="analytics-status-row"><span><i className="analytics-status-open" />Open</span><strong>{overview.open_reports}</strong></div>
              <div className="analytics-status-row"><span><i className="analytics-status-pending" />Claim requested</span><strong>{overview.claim_requested_reports}</strong></div>
              <div className="analytics-status-row"><span><i className="analytics-status-resolved" />Resolved</span><strong>{overview.resolved_reports}</strong></div>
            </section>
          </div>

          <section className="analytics-panel analytics-category-panel">
            <div className="analytics-panel-heading"><div><span className="analytics-panel-icon analytics-panel-icon-amber"><BarChart3 size={17} /></span><div><h3>Top categories</h3><p>Most frequently reported item categories</p></div></div></div>
            {data.categories.length === 0 ? <p className="analytics-empty">Category data will appear when reports are submitted.</p> : <div className="analytics-category-list">
              {data.categories.map((category) => <div className="analytics-category-row" key={category.category}>
                <span title={category.category}>{category.category}</span>
                <div className="analytics-category-track"><i style={{ width: `${category.count / maxCategory * 100}%` }} /></div>
                <strong>{category.count}</strong>
              </div>)}
            </div>}
          </section>
          <p className="analytics-footnote">Statistics are aggregated from CampusLoop reports and claims. Individual user details are not shown.</p>
        </>}
        {!loading && !error && !data && <div className="analytics-state">No analytics data is available yet.</div>}
      </section>
    </div>
  );
}
