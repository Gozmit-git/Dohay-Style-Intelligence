import { ArrowLeft, Check, X } from "lucide-react";
import { Link } from "wouter";
import { useListBillingAdminOrders, useReviewBillingAdminOrder } from "@workspace/api-client-react";
import "./billing.css";

function inr(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);
}

export function BillingAdminPage() {
  const orders = useListBillingAdminOrders();
  const review = useReviewBillingAdminOrder();

  function decide(orderId: string, decision: "approve" | "reject") {
    const prompt = decision === "approve"
      ? "Confirm that you matched this reference and amount to a completed GPay transfer?"
      : "Reject this payment request? The customer will not receive the plan.";
    if (!window.confirm(prompt)) return;
    review.mutate({ orderId, data: { decision } }, {
      onSuccess: () => void orders.refetch(),
    });
  }

  return <main className="page-content billing-page billing-admin-page">
    <Link href="/billing" className="billing-back-link"><ArrowLeft size={15} /> Plans & billing</Link>
    <div className="billing-eyebrow">OWNER TOOLS</div>
    <header className="billing-heading">
      <div><h1>Review UPI payments.</h1><p>Check the transaction and amount in GPay before approving.</p></div>
    </header>
    {orders.isLoading && <p>Loading payment requests…</p>}
    {orders.isError && <div className="billing-setup-note" role="alert">
      <div><strong>Owner access is unavailable.</strong><p>Only the verified account configured for DOHAY billing can review payments.</p></div>
    </div>}
    {review.isError && <p className="billing-error" role="alert">Could not save that review. Refresh the list and try again.</p>}
    {orders.data?.length === 0 && <div className="billing-order-panel">No submitted payments are waiting for review.</div>}
    <div className="billing-admin-list">
      {orders.data?.map((order) => <article key={order.id} className="billing-admin-order">
        <div>
          <span className="billing-section-label">{order.plan.toUpperCase()} · {order.interval}</span>
          <h2>{inr(order.firstTermAmount)}</h2>
          <p>UPI reference: <strong>{order.transactionReference}</strong></p>
          <small>Account: {order.userId}</small>
        </div>
        <div className="billing-admin-actions">
          <button className="button" type="button" disabled={review.isPending} onClick={() => decide(order.id, "approve")}><Check size={15} /> Verify & approve</button>
          <button className="button button-quiet" type="button" disabled={review.isPending} onClick={() => decide(order.id, "reject")}><X size={15} /> Reject</button>
        </div>
      </article>)}
    </div>
  </main>;
}
