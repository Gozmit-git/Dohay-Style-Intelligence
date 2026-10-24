import type { ReactNode } from "react";
import { Link } from "wouter";
import { useOwnerAccess, ownerErrorStatus } from "../hooks/use-owner";
import "../pages/owner.css";

export function OwnerSkeleton() {
  return <div className="owner-skeleton" role="status" aria-label="Loading owner information" data-testid="status-owner-loading"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /><span className="sr-only">Loading owner information…</span></div>;
}

export function OwnerError({ error, retry }: { error: unknown; retry: () => void }) {
  const forbidden = ownerErrorStatus(error) === 403;
  return <section className="owner-feedback" role="alert" data-testid="status-owner-error">
    <h2>{forbidden ? "This space is owner-only." : "We couldn’t verify these records."}</h2>
    <p>{forbidden ? "Only the verified DOHAY owner can view accounts and payment records." : "Account or billing data is temporarily unavailable. Previous records are hidden rather than shown as current. Try again to request fresh information."}</p>
    <button type="button" className="button button-small" onClick={retry} data-testid="button-owner-retry">Try again</button>
  </section>;
}

export function OwnerGate({ children }: { children: ReactNode }) {
  const access = useOwnerAccess();
  if (access.isError) return <div className="page-content owner-page"><OwnerError error={access.error} retry={() => void access.refetch()} /></div>;
  if (access.isPending) return <div className="page-content owner-page"><OwnerSkeleton /></div>;
  if (!access.isOwner) return <section className="page-content owner-page"><div className="owner-feedback" data-testid="status-owner-denied"><span className="owner-label">Restricted workspace</span><h2>This space is owner-only.</h2><p>Sign in with the verified DOHAY owner account to view account and payment records.</p><Link href="/" className="button button-small" data-testid="link-owner-home">Back to DOHAY</Link></div></section>;
  return children;
}

export function ownerDate(value?: string | null, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", ...(withTime ? { timeStyle: "short" as const } : {}) }).format(date);
}

export function ownerMoney(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);
}
