import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowRight, Check, Copy, ExternalLink, ShieldCheck } from "lucide-react";
import {
  useCreateBillingQuote,
  useGetBillingOrder,
  useGetBillingSubscription,
  useListBillingPlans,
  useStartBillingCheckout,
  useSubmitBillingPayment,
} from "@workspace/api-client-react";
import qrImage from "../assets/gpay-qr.jpeg";
import "./billing.css";

type PlanId = "plus" | "pro";
type Interval = "month" | "year";
const UPI_ID = "sagarlamani23@okaxis";

function inr(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);
}

function readableDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value));
}

export function BillingPage() {
  const [, setLocation] = useLocation();
  const orderId = new URLSearchParams(window.location.search).get("order") ?? "";
  const catalog = useListBillingPlans();
  const subscription = useGetBillingSubscription({ query: { refetchInterval: orderId ? 10000 : false } });
  const order = useGetBillingOrder(orderId || "00000000-0000-0000-0000-000000000000", {
    query: { enabled: Boolean(orderId), refetchInterval: orderId ? 10000 : false },
  });
  const createQuote = useCreateBillingQuote();
  const checkout = useStartBillingCheckout();
  const submitPayment = useSubmitBillingPayment();
  const [planId, setPlanId] = useState<PlanId>("plus");
  const [interval, setInterval] = useState<Interval>("month");
  const [transactionReference, setTransactionReference] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const plans = catalog.data?.plans ?? [];
  const selectedPlan = plans.find((plan) => plan.id === planId);
  const listedAmount = selectedPlan
    ? (interval === "month" ? selectedPlan.monthlyAmount : selectedPlan.annualAmount)
    : 0;
  const purchaseBusy = createQuote.isPending || checkout.isPending;

  function beginCheckout() {
    if (!catalog.data?.checkoutEnabled || !selectedPlan) return;
    setError("");
    createQuote.mutate({
      data: { plan: planId, interval, requestKey: crypto.randomUUID() },
    }, {
      onSuccess: (quote) => checkout.mutate({ data: { quoteId: quote.id } }, {
        onSuccess: (newOrder) => setLocation(`/billing?order=${encodeURIComponent(newOrder.id)}`),
        onError: () => setError("Could not start the payment request. No payment was taken. Please try again."),
      }),
      onError: () => setError("Could not prepare this plan quote. Please try again."),
    });
  }

  async function copyUpiId() {
    try {
      await navigator.clipboard.writeText(UPI_ID);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Could not copy the UPI ID. You can read it below the QR code.");
    }
  }

  const statusLabels: Record<string, string> = {
    no_paid_subscription: "Free plan",
    awaiting_payment: "Payment not submitted",
    pending_review: "Payment under review",
    active: "Paid plan active",
    expired: "Plan expired",
    payment_rejected: "Payment needs attention",
  };

  return <main className="page-content billing-page">
    <div className="billing-eyebrow">YOUR ACCOUNT / PLANS</div>
    <header className="billing-heading">
      <div>
        <h1>Plans that fit your routine.</h1>
        <p>Choose a plan for your styling chats, outfit reviews, and wardrobe.</p>
      </div>
      <div className="billing-current">
        <span>Current status</span>
        <strong>{statusLabels[subscription.data?.status ?? ""] ?? "Loading…"}</strong>
        {subscription.data?.periodEndsAt && <small>Through {readableDate(subscription.data.periodEndsAt)}</small>}
      </div>
    </header>

    {!catalog.data?.checkoutEnabled && <div className="billing-setup-note" role="status">
      <ShieldCheck size={18} />
      <div>
        <strong>Payments are not open yet.</strong>
        <p>{catalog.data?.blockers?.[0] ?? (catalog.isError ? "Payment options could not be loaded. Refresh this page to try again." : "Loading payment setup…")}</p>
      </div>
    </div>}

    {subscription.data?.status === "active" && <div className="billing-active-note" role="status">
      <Check size={17} /> {subscription.data.plan.toUpperCase()} is active until {readableDate(subscription.data.periodEndsAt)}.
    </div>}

    <section className="billing-plan-grid" aria-label="Available plans">
      {plans.map((plan) => {
        const paid = plan.id === "plus" || plan.id === "pro";
        const amount = interval === "month" ? plan.monthlyAmount : plan.annualAmount;
        return <article key={plan.id} className={`billing-plan-card ${plan.id === planId ? "selected" : ""} ${plan.id === "pro" ? "featured" : ""}`}>
          {plan.id === "pro" && <span className="billing-plan-tag">MOST ROOM</span>}
          <div className="billing-plan-name">{plan.name}</div>
          <div className="billing-plan-price">{paid ? inr(amount) : "Free"}<span>{paid ? ` / ${interval === "month" ? "month" : "year"}` : " / always"}</span></div>
          <p>{plan.id === "free" ? "A simple place to start." : plan.id === "plus" ? "More space for regular outfit feedback." : "For frequent reviews and a larger wardrobe."}</p>
          <ul>
            <li>{plan.limits.chatReplies} styling chat replies</li>
            <li>{plan.limits.photoReviews} photo reviews</li>
            <li>{plan.limits.wardrobeItems} wardrobe items</li>
            <li>{plan.limits.outfitRequests} outfit requests</li>
          </ul>
          {paid
            ? <button className={`billing-select ${plan.id === planId ? "selected" : ""}`} type="button" onClick={() => setPlanId(plan.id as PlanId)}>
                {plan.id === planId ? "Selected" : `Choose ${plan.name}`}
              </button>
            : <span className="billing-free-label">Your starting plan</span>}
        </article>;
      })}
    </section>

    <section className="billing-checkout-strip">
      <div>
        <span className="billing-section-label">PAYMENT TERM</span>
        <div className="billing-interval-toggle">
          <button type="button" className={interval === "month" ? "active" : ""} onClick={() => setInterval("month")}>Monthly</button>
          <button type="button" className={interval === "year" ? "active" : ""} onClick={() => setInterval("year")}>Yearly</button>
        </div>
      </div>
      <div className="billing-checkout-summary">
        <span>{selectedPlan?.name ?? "Plus"} · {interval === "month" ? "monthly" : "yearly"}</span>
        <strong>{inr(listedAmount)}</strong>
        <small>Final first-term amount shown in your quote</small>
      </div>
      <button type="button" className="button billing-start-button" onClick={beginCheckout} disabled={!catalog.data?.checkoutEnabled || purchaseBusy}>
        {purchaseBusy ? "Preparing…" : "Continue to payment"} <ArrowRight size={16} />
      </button>
    </section>

    <div className="billing-disclosures">
      <span>Manual one-time UPI payment. No automatic renewal; renewals must be paid and reviewed manually.</span>
      <span>Tax treatment is not configured. Plan usage limits are not yet enforced in the app.</span>
    </div>

    {error && <p className="billing-error" role="alert">{error}</p>}

    {orderId && order.isLoading && <div className="billing-order-panel">Loading your payment request…</div>}
    {orderId && order.isError && <div className="billing-order-panel billing-error" role="alert">This payment request could not be loaded. Start a new request or contact DOHAY support.</div>}
    {order.data && <section className="billing-order-panel" aria-live="polite">
      <div className="billing-order-heading">
        <div><span className="billing-section-label">PAYMENT REQUEST</span><h2>{inr(order.data.firstTermAmount)} <span>INR</span></h2></div>
        <span className={`billing-order-status ${order.data.status}`}>{order.data.status.replaceAll("_", " ")}</span>
      </div>
      <p className="billing-order-details">{order.data.plan.toUpperCase()} · {order.data.interval === "month" ? "Monthly" : "Yearly"} · {order.data.discountPercent ? `${order.data.discountPercent}% launch discount` : "Standard price"}</p>
      <p className="billing-renewal-price">Renewal after this term: {inr(order.data.regularAmount)} per {order.data.interval === "month" ? "month" : "year"}. Renewal is manual.</p>

      {order.data.status === "awaiting_payment" && <>
        <p className="billing-instruction">Scan with any UPI app and pay the exact amount above. Then enter the transaction reference from your payment app.</p>
        <div className="billing-qr-layout">
          <div className="billing-qr-card">
            <img src={qrImage} alt="DOHAY UPI payment QR code" />
            <span>UPI ID</span>
            <div className="billing-upi-id">{UPI_ID}</div>
            <button type="button" className="billing-copy-button" onClick={() => void copyUpiId()}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy UPI ID"}
            </button>
          </div>
          <form className="billing-reference-form" onSubmit={(event) => {
            event.preventDefault();
            setError("");
            submitPayment.mutate({ orderId: order.data.id, data: { transactionReference: transactionReference.trim() } }, {
              onSuccess: () => { setTransactionReference(""); void order.refetch(); void subscription.refetch(); },
              onError: () => setError("Could not submit that reference. Check it and try again."),
            });
          }}>
            <label htmlFor="upi-reference">UPI transaction reference</label>
            <input id="upi-reference" value={transactionReference} onChange={(event) => setTransactionReference(event.target.value)} maxLength={80} minLength={6} pattern="[A-Za-z0-9-]+" required autoComplete="off" placeholder="Example: 123456789012" />
            <small>Usually shown as UTR, UPI reference, or transaction ID. Do not enter your UPI PIN.</small>
            <button type="submit" className="button" disabled={submitPayment.isPending || transactionReference.trim().length < 6}>
              {submitPayment.isPending ? "Submitting…" : "Submit for payment review"}
            </button>
            <p className="billing-manual-review">Your plan stays inactive until the DOHAY owner verifies the payment in GPay.</p>
          </form>
        </div>
      </>}
      {order.data.status === "pending_review" && <div className="billing-review-message"><ShieldCheck size={20} /><p>Reference received. Your plan stays inactive while the DOHAY owner checks the transfer. This page updates automatically.</p></div>}
      {order.data.status === "approved" && <div className="billing-review-message"><Check size={20} /><p>Payment verified. Your plan period ends {readableDate(order.data.periodEndsAt)}.</p></div>}
      {order.data.status === "rejected" && <div className="billing-review-message rejected"><p>The payment could not be confirmed. Please check the transaction details with DOHAY before paying again.</p></div>}
      <button type="button" className="billing-new-order" onClick={() => setLocation("/billing")}>Back to plans <ExternalLink size={13} /></button>
    </section>}

    <div className="billing-owner-link"><Link href="/billing/admin">Payment review for DOHAY owner <ArrowRight size={13} /></Link></div>
  </main>;
}
