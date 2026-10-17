import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Clock3, FileCheck2, LoaderCircle, X } from "lucide-react";
import {
  fetchItemClaims,
  fetchItems,
  fetchMyClaims,
  reviewClaim,
  submitClaim,
  type ApiClaim,
  type ApiItem,
} from "../lib/api";
import "./ClaimsDialog.css";

export type ClaimsDialogMode = "claim" | "mine" | "review";

type ClaimsDialogProps = {
  mode: ClaimsDialogMode;
  itemId?: number;
  itemTitle?: string;
  itemType?: "lost" | "found";
  onClose: () => void;
  onSuccess: () => void;
};

function readableDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function ClaimsDialog({
  mode,
  itemId,
  itemTitle = "this item",
  itemType = "found",
  onClose,
  onSuccess,
}: ClaimsDialogProps) {
  const [message, setMessage] = useState("");
  const [claims, setClaims] = useState<ApiClaim[]>([]);
  const [items, setItems] = useState<ApiItem[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(mode !== "claim");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (mode === "claim") return;
    let active = true;

    async function loadClaims() {
      setLoading(true);
      setError("");
      try {
        if (mode === "mine") {
          const [myClaims, allItems] = await Promise.all([fetchMyClaims(), fetchItems()]);
          if (!active) return;
          setClaims(myClaims);
          setItems(allItems);
        } else {
          const itemClaims = await fetchItemClaims(itemId as number);
          if (!active) return;
          setClaims(itemClaims);
        }
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load claims.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadClaims();
    return () => { active = false; };
  }, [mode, itemId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!itemId) return;
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      await submitClaim(itemId, message.trim());
      setNotice("Your claim has been submitted. The report owner has been notified.");
      setSubmitted(true);
      onSuccess();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not submit your claim.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReview(claimId: number, status: "approved" | "rejected") {
    setBusyId(claimId);
    setError("");
    setNotice("");
    try {
      await reviewClaim(claimId, status);
      setClaims((current) => current.map((claim) =>
        claim.id === claimId
          ? { ...claim, status }
          : status === "approved" && claim.status === "pending"
            ? { ...claim, status: "rejected" }
            : claim,
      ));
      setNotice(status === "approved"
        ? "Claim approved. The item is now marked as resolved."
        : "Claim rejected. The item is available again if no other claims are pending.");
      onSuccess();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Could not update this claim.");
    } finally {
      setBusyId(null);
    }
  }

  const title = mode === "claim"
    ? itemType === "lost" ? "Respond to lost-item report" : "Submit a claim"
    : mode === "mine" ? "My claims"
      : "Review claims";
  const subtitle = mode === "claim"
    ? itemType === "lost"
      ? `Tell the report owner how you found “${itemTitle}”. Share useful identifying details, but do not include sensitive personal information.`
      : `Tell the report owner why “${itemTitle}” belongs to you. Do not include sensitive personal information.`
    : mode === "mine"
      ? "Track the decisions on claims and responses you have submitted."
      : `Review responses for “${itemTitle}”.`;

  return (
    <div className="claims-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="claims-dialog" role="dialog" aria-modal="true" aria-labelledby="claims-dialog-title">
        <button className="claims-dialog-close" type="button" onClick={onClose} aria-label="Close claims dialog"><X size={20} /></button>
        <div className="claims-dialog-icon">{mode === "claim" ? <FileCheck2 size={23} /> : <CheckCircle2 size={23} />}</div>
        <p className="claims-dialog-eyebrow">CAMPUSLOOP · CLAIMS CENTRE</p>
        <h2 id="claims-dialog-title">{title}</h2>
        <p className="claims-dialog-subtitle">{subtitle}</p>

        {error && <div className="claims-dialog-message claims-dialog-error" role="alert">{error}</div>}
        {notice && <div className="claims-dialog-message claims-dialog-success" role="status">{notice}</div>}

        {mode === "claim" && (
          <form className="claims-dialog-form" onSubmit={handleSubmit}>
            <label htmlFor="claim-message">{itemType === "lost" ? "Where and how did you find this item?" : "Why do you believe this item is yours?"}</label>
            <textarea id="claim-message" required minLength={10} maxLength={1000} rows={5} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={itemType === "lost" ? "Describe where you found it and any details that help identify it…" : "Describe identifying details that only the owner is likely to know…"} />
            <div className="claims-dialog-character-count">{message.length}/1000 characters</div>
            <button className="button button-primary claims-dialog-submit" type="submit" disabled={submitting || submitted}>
              {submitting ? "Submitting…" : submitted ? (itemType === "lost" ? "Response sent" : "Claim submitted") : (itemType === "lost" ? "Send response" : "Submit claim")}
            </button>
          </form>
        )}

        {mode !== "claim" && loading && (
          <div className="claims-dialog-loading"><LoaderCircle size={20} /> Loading claims…</div>
        )}

        {mode !== "claim" && !loading && !error && claims.length === 0 && (
          <div className="claims-dialog-empty">
            <Clock3 size={28} />
            <strong>{mode === "mine" ? "No claims yet" : "No requests yet"}</strong>
            <span>{mode === "mine" ? "Claims you submit on found-item reports will appear here." : "When a student submits a claim, it will appear here for review."}</span>
          </div>
        )}

        {mode !== "claim" && !loading && claims.length > 0 && (
          <div className="claims-list">
            {claims.map((claim) => {
              const relatedItem = items.find((item) => item.id === claim.item_id);
              return (
                <article className="claim-row" key={claim.id}>
                  <div className="claim-row-top">
                    <div>
                      <span className="claim-row-id">CLAIM #{String(claim.id).padStart(4, "0")}</span>
                      <h3>{mode === "mine" ? relatedItem?.title || `Report #${claim.item_id}` : `Claim from student #${claim.claimant_id}`}</h3>
                      {mode === "review" && <p className="claim-row-related">Report #{claim.item_id}</p>}
                    </div>
                    <span className={`claim-status claim-status-${claim.status}`}>{statusLabel(claim.status)}</span>
                  </div>
                  <p className="claim-row-message">{claim.message}</p>
                  <span className="claim-row-date">Submitted {readableDate(claim.created_at)}</span>
                  {mode === "review" && claim.status === "pending" && (
                    <div className="claim-row-actions">
                      <button className="claim-reject-button" type="button" disabled={busyId !== null} onClick={() => void handleReview(claim.id, "rejected")}>
                        {busyId === claim.id ? "Updating…" : "Reject"}
                      </button>
                      <button className="claim-approve-button" type="button" disabled={busyId !== null} onClick={() => void handleReview(claim.id, "approved")}>
                        {busyId === claim.id ? "Updating…" : "Approve claim"}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        <div className="claims-dialog-footer">
          <button className="claims-dialog-back" type="button" onClick={onClose}><ArrowLeft size={15} /> Back to reports</button>
        </div>
      </section>
    </div>
  );
}
