import { ArrowLeft, Check, X } from "lucide-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getGetOwnerSummaryQueryKey, getListOwnerAccountsQueryKey, getListBillingAdminOrdersQueryKey, useListBillingAdminOrders, useReviewBillingAdminOrder } from "@workspace/api-client-react";
import { OwnerGate, OwnerError, OwnerSkeleton, ownerDate } from "../components/owner-state";
import { ownerFreshness, useClearPrivilegedData } from "../hooks/use-owner";
import "./billing.css";

function inr(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: paise % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(paise / 100);
}

export function BillingAdminPage() {
  return <OwnerGate><PaymentReview /></OwnerGate>;
}

function PaymentReview() {
  const cache = useQueryClient();
  const orders = useListBillingAdminOrders({ query: { queryKey: getListBillingAdminOrdersQueryKey(), ...ownerFreshness } });
  const review = useReviewBillingAdminOrder();
  const failed = orders.isError || review.isError;
  useClearPrivilegedData(failed);

  function refresh() {
    review.reset();
    void orders.refetch();
  }

  function decide(orderId: string, decision: "approve" | "reject") {
    const prompt = decision === "approve"
      ? "Confirm that you matched this reference and amount to a completed GPay transfer?"
      : "Reject this payment request? The customer will not receive the plan.";
    if (!window.confirm(prompt)) return;
    review.mutate({ orderId, data: { decision } }, {
      onSuccess: () => {
        void cache.invalidateQueries({ queryKey: getGetOwnerSummaryQueryKey() });
        void cache.invalidateQueries({ queryKey: getListOwnerAccountsQueryKey() });
        void orders.refetch();
      },
    });
  }

  return <main className="page-content billing-page billing-admin-page">
    <Link href="/admin" className="billing-back-link" data-testid="link-review-dashboard"><ArrowLeft size={15} /> Owner dashboard</Link>
    <div className="billing-eyebrow">OWNER TOOLS</div>
    <header className="billing-heading">
      <div><h1>Review UPI payments.</h1><p>Check the transaction and amount in GPay before approving. Only an approved payment grants a paid plan period.</p></div>
      <button type="button" className="button button-quiet button-small" data-testid="button-review-refresh" disabled={orders.isFetching || review.isPending} onClick={refresh}>Refresh requests</button>
    </header>
    {orders.isLoading && <OwnerSkeleton />}
    {failed && <OwnerError error={orders.error ?? review.error} retry={refresh} />}
    {review.isError && <p className="billing-error" role="alert" data-testid="status-review-error">The review could not be confirmed. Reload the current requests before making another decision.</p>}
    {review.isSuccess && <p className="billing-active-note" role="status" data-testid="status-review-success">Payment review saved. Account and dashboard records will refresh.</p>}
    {!failed && orders.data?.length === 0 && <div className="billing-order-panel" data-testid="status-payment-empty">No submitted payments are waiting for review.</div>}
    <div className="billing-admin-list">
      {!failed && orders.data?.map((order) => <article key={order.id} className="billing-admin-order" data-testid={`payment-review-${order.id}`}>
        <div>
          <span className="billing-section-label">{order.plan.toUpperCase()} · {order.interval}</span>
          <h2>{inr(order.firstTermAmount)}</h2>
          <p>UPI reference: <strong>{order.transactionReference}</strong></p>
          <small>Account: {order.userId}</small>
           <p>Submitted {ownerDate(order.submittedAt, true)}</p>
           <small>Created {ownerDate(order.createdAt, true)} · {order.status.replaceAll("_", " ")}</small>
        </div>
        <div className="billing-admin-actions">
          <button className="button" type="button" data-testid={`button-approve-${order.id}`} disabled={review.isPending || orders.isFetching || order.status !== "pending_review"} onClick={() => decide(order.id, "approve")}><Check size={15} /> Verify & approve</button>
          <button className="button button-quiet" type="button" data-testid={`button-reject-${order.id}`} disabled={review.isPending || orders.isFetching || order.status !== "pending_review"} onClick={() => decide(order.id, "reject")}><X size={15} /> Reject</button>
        </div>
      </article>)}
    </div>
  </main>;
}
