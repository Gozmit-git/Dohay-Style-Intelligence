import { useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, RefreshCw, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { getGetOwnerSummaryQueryKey, getListOwnerAccountsQueryKey, useGetOwnerSummary, useListOwnerAccounts, type ListOwnerAccountsParams } from "@workspace/api-client-react";
import { OwnerError, OwnerGate, OwnerSkeleton, ownerDate, ownerMoney } from "../components/owner-state";
import { ownerFreshness, useClearPrivilegedData } from "../hooks/use-owner";
import "./owner.css";

export function OwnerPage() {
  return <OwnerGate><OwnerDashboard /></OwnerGate>;
}

function OwnerDashboard() {
  const [search, setSearch] = useState("");
  const [params, setParams] = useState<ListOwnerAccountsParams>({ search: "", plan: "all", status: "all", page: 1, pageSize: 20 });
  const summary = useGetOwnerSummary({ query: { queryKey: getGetOwnerSummaryQueryKey(), ...ownerFreshness } });
  const accounts = useListOwnerAccounts(params, { query: { queryKey: getListOwnerAccountsQueryKey(params), ...ownerFreshness } });
  const failed = summary.isError || accounts.isError;
  useClearPrivilegedData(failed);
  const data = !failed ? summary.data : undefined;
  const list = !failed ? accounts.data : undefined;
  const busy = summary.isFetching || accounts.isFetching;
  function refresh() { void summary.refetch(); void accounts.refetch(); }
  function filter(next: Partial<ListOwnerAccountsParams>) { setParams((old) => ({ ...old, ...next, page: 1 })); }

  return <div className="page-content owner-page">
    <span className="owner-label">DOHAY / Owner workspace</span>
    <header className="owner-header"><div><h1>A clear view of your accounts.</h1><p>Account health, current access, and payment records. Customer wardrobes, photos, and styling conversations stay outside this workspace.</p></div><div className="owner-actions"><button type="button" className="button button-quiet button-small" disabled={busy} onClick={refresh} data-testid="button-owner-refresh"><RefreshCw size={13} /> Refresh</button><Link className="button button-small" href="/billing/admin" data-testid="link-owner-payments">Payment review <ArrowRight size={13} /></Link></div></header>
    {failed ? <OwnerError error={summary.error ?? accounts.error} retry={refresh} /> : <>
      {!data ? <OwnerSkeleton /> : <section aria-label="Owner overview" data-testid="section-owner-overview">
        <p className="owner-asof" data-testid="text-summary-asof">Overview as of {ownerDate(data.asOf, true)} · refreshes every minute</p>
        <div className="owner-overview"><article className="owner-total"><span className="owner-label">Registered accounts</span><strong data-testid="text-total-accounts">{data.totalAccounts.toLocaleString("en-IN")}</strong><p>All accounts, across every plan.</p></article><article className="owner-panel"><div className="owner-panel-heading"><h2>Current plan access</h2><small>Approved periods only</small></div><div className="owner-plans">{(["free", "plus", "pro"] as const).map((plan) => <div key={plan}><span>{plan === "free" ? "Free" : plan === "plus" ? "Plus" : "Pro"}</span><strong data-testid={`text-plan-count-${plan}`}>{data.plans[plan].toLocaleString("en-IN")}</strong></div>)}</div><div className="owner-statuses">{(["active", "expired", "pending", "free", "rejected"] as const).map((status) => <span key={status} data-testid={`text-subscription-count-${status}`}>{status}<b>{data.subscriptions[status].toLocaleString("en-IN")}</b></span>)}</div></article></div>
        <p className="owner-explanation"><ShieldCheck size={15} />Plans reflect active, approved subscription periods—not purchase intent. Pending and expired purchases do not grant paid access; those accounts remain on Free unless another approved period is active.</p>
        <div className="owner-review-strip"><div><strong data-testid="text-pending-reviews">{data.pendingPaymentReviews} payment {data.pendingPaymentReviews === 1 ? "request needs" : "requests need"} review</strong><p>Match the reference and exact amount in GPay before approving a payment.</p></div><Link href="/billing/admin" data-testid="link-owner-review-queue">Open review queue <ArrowRight size={14} /></Link></div>
      </section>}
    </>}

    <section className="owner-panel owner-accounts" aria-label="Account directory">
      <div className="owner-panel-heading"><h2>Account directory</h2><small>Read-only</small></div>
      <form className="owner-filters" onSubmit={(event) => { event.preventDefault(); filter({ search: search.trim() }); }}>
        <label htmlFor="owner-search">Search accounts<input id="owner-search" data-testid="input-owner-search" type="search" placeholder="Name, email, or account ID" maxLength={100} value={search} onChange={(event) => { setSearch(event.target.value); if (!event.target.value) filter({ search: "" }); }} /></label>
        <label htmlFor="owner-plan">Current plan<select id="owner-plan" data-testid="select-owner-plan" value={params.plan} onChange={(event) => filter({ plan: event.target.value as ListOwnerAccountsParams["plan"] })}><option value="all">All plans</option><option value="free">Free</option><option value="plus">Plus</option><option value="pro">Pro</option></select></label>
        <label htmlFor="owner-status">Subscription status<select id="owner-status" data-testid="select-owner-status" value={params.status} onChange={(event) => filter({ status: event.target.value as ListOwnerAccountsParams["status"] })}>{["all", "free", "active", "expired", "pending", "rejected"].map((status) => <option key={status} value={status}>{status === "all" ? "All statuses" : status[0].toUpperCase() + status.slice(1)}</option>)}</select></label>
        <button className="button button-small" type="submit" data-testid="button-owner-search">Search</button>
        {(params.search || params.plan !== "all" || params.status !== "all") && <button type="button" className="button button-quiet button-small" data-testid="button-owner-clear-filters" onClick={() => { setSearch(""); filter({ search: "", plan: "all", status: "all" }); }}>Clear</button>}
      </form>
      {failed ? <div className="owner-empty">Records are hidden until a fresh request succeeds. Use “Try again” above.</div> : !list ? <OwnerSkeleton /> : <>
        {list.accounts.length === 0 ? <div className="owner-empty" data-testid="status-owner-empty"><strong>{list.total === 0 ? "No accounts found." : "No accounts on this page."}</strong>{params.search || params.plan !== "all" || params.status !== "all" ? "Try a different search or clear the filters." : "New DOHAY accounts will appear here once they sign up."}</div> : <div className="owner-table-wrap"><table className="owner-table"><thead><tr><th>Account / joined</th><th>Current plan</th><th>Subscription</th><th>Plan period</th><th>Last payment / billing</th></tr></thead><tbody>{list.accounts.map((account) => <tr key={account.id} data-testid={`row-owner-account-${account.id}`}>
          <td data-label="Account"><strong>{account.name || "Unnamed account"}</strong><small>{account.email || "No email on record"}</small><small className="owner-account-id">{account.id}</small><small>Joined {ownerDate(account.createdAt)}</small></td>
          <td data-label="Current plan"><span className="owner-badge">{account.plan}</span>{account.pendingPlan && <small>{account.pendingPlan.toUpperCase()} requested · not active access</small>}</td>
          <td data-label="Subscription"><span className={`owner-badge ${account.status}`}>{account.status}</span></td>
          <td data-label="Plan period">{ownerDate(account.periodStartsAt)}<small>Through {ownerDate(account.periodEndsAt)}</small></td>
          <td data-label="Last payment / billing">{ownerDate(account.lastPaymentAt)}<small>{account.billingStatus?.replaceAll("_", " ") || "No billing record"}</small></td>
        </tr>)}</tbody></table></div>}
        <div className="owner-pagination"><span data-testid="text-account-results">{list.total.toLocaleString("en-IN")} {list.total === 1 ? "account" : "accounts"} · as of {ownerDate(list.asOf, true)}</span><div><button type="button" data-testid="button-owner-previous" disabled={list.page <= 1 || accounts.isFetching} onClick={() => setParams((old) => ({ ...old, page: Math.max(1, list.page - 1) }))}><ChevronLeft size={13} /> Previous</button><span data-testid="text-owner-page">Page {list.page} of {Math.max(1, Math.ceil(list.total / list.pageSize))}</span><button type="button" data-testid="button-owner-next" disabled={list.page * list.pageSize >= list.total || list.page >= 10000 || accounts.isFetching} onClick={() => setParams((old) => ({ ...old, page: list.page + 1 }))}>Next <ChevronRight size={13} /></button></div></div>
      </>}
    </section>
    {data && <div className="owner-recent"><section className="owner-panel"><div className="owner-panel-heading"><h2>Recent signups</h2><small>Newest accounts</small></div>{data.recentSignups.length ? data.recentSignups.map((account) => <article className="owner-activity" key={account.id} data-testid={`signup-${account.id}`}><div><strong>{account.name || "Unnamed account"}</strong><small>{account.email || "No email on record"}</small><small>{account.plan.toUpperCase()} · {account.status}</small></div><time dateTime={account.createdAt}>{ownerDate(account.createdAt, true)}</time></article>) : <div className="owner-empty"><strong>No recent signups.</strong>New accounts will appear here.</div>}</section><section className="owner-panel"><div className="owner-panel-heading"><h2>Recent billing</h2><small>Payment activity</small></div>{data.recentBilling.length ? data.recentBilling.map((order) => <article className="owner-activity" key={order.id} data-testid={`billing-activity-${order.id}`}><div><strong>{ownerMoney(order.firstTermAmount)} · {order.plan.toUpperCase()} / {order.interval === "month" ? "monthly" : "yearly"}</strong><small>Account: {order.userId}</small><small>Created {ownerDate(order.createdAt, true)}</small><small>Submitted {ownerDate(order.submittedAt, true)} · reviewed {ownerDate(order.reviewedAt, true)}</small><small>Period: {ownerDate(order.periodStartsAt)} – {ownerDate(order.periodEndsAt)}</small></div><div><span className={`owner-badge ${order.status}`}>{order.status.replaceAll("_", " ")}</span></div></article>) : <div className="owner-empty"><strong>No billing activity yet.</strong>Payment requests will appear here when created.</div>}</section></div>}
  </div>;
}
