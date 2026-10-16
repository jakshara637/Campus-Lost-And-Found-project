import { useEffect, useState } from "react";
import { X, PackageSearch, LoaderCircle } from "lucide-react";
import { fetchMyReports, type ApiItem } from "../lib/api";
import "./MyReportsDialog.css";

type Props = { onClose: () => void };

export default function MyReportsDialog({ onClose }: Props) {
  const [reports, setReports] = useState<ApiItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetchMyReports().then((data) => { if (active) setReports(data); })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Could not load reports."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return <div className="my-reports-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="my-reports-dialog" role="dialog" aria-modal="true" aria-labelledby="my-reports-title">
      <button className="my-reports-close" type="button" onClick={onClose} aria-label="Close"><X size={20} /></button>
      <div className="my-reports-heading-icon"><PackageSearch size={24} /></div>
      <p className="my-reports-eyebrow">YOUR CAMPUSLOOP ACTIVITY</p>
      <h2 id="my-reports-title">My reports</h2>
      <p className="my-reports-subtitle">Keep track of lost and found items you’ve shared with the campus community.</p>
      <div className="my-reports-count">{reports.length} {reports.length === 1 ? "report" : "reports"} submitted</div>
      {error && <div className="my-reports-message my-reports-error" role="alert">{error}</div>}
      {loading && <div className="my-reports-loading"><LoaderCircle size={20} /> Loading your reports…</div>}
      {!loading && !error && reports.length === 0 && <div className="my-reports-empty"><PackageSearch size={32} /><strong>You haven’t reported anything yet</strong><span>Your reports will appear here after you submit one.</span></div>}
      {!loading && !error && reports.length > 0 && <div className="my-reports-list">{reports.map((item) => <article className="my-report-card" key={item.id}>
        <div className="my-report-image">{item.image_path ? <img src={`http://127.0.0.1:8000${item.image_path}`} alt={item.title} /> : <PackageSearch size={27} />}</div>
        <div className="my-report-details"><div className="my-report-topline"><span className={`my-report-type my-report-type-${item.item_type}`}>{item.item_type} item</span><span className={`my-report-status my-report-status-${item.status}`}>{item.status === "claim_requested" ? "Claim requested" : item.status}</span></div>
        <h3>{item.title}</h3><p className="my-report-category">{item.category}</p><p className="my-report-description">{item.description}</p><div className="my-report-meta"><span>{item.location}</span><span>{new Date(item.created_at).toLocaleDateString()}</span></div><div className="my-report-footer">REPORT #{String(item.id).padStart(4,"0")}</div></div>
      </article>)}</div>}
      <div className="my-reports-footer"><button className="button button-outline" type="button" onClick={onClose}>Back to CampusLoop</button></div>
    </section>
  </div>;
}
