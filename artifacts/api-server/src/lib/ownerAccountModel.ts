import type { BillingOrder } from "@workspace/db";
import type { OwnerAccount, OwnerPlanCounts, OwnerStatusCounts } from "@workspace/api-zod";

export type AccountIdentity = {
  id: string; firstName: string | null; lastName: string | null; username: string | null;
  createdAt: number; primaryEmailAddressId: string | null;
  emailAddresses: { id: string; emailAddress: string; verification?: { status: string } | null }[];
};
export type AccountBilling = Pick<BillingOrder,
  "userId" | "plan" | "status" | "createdAt" | "reviewedAt" | "periodStartsAt" | "periodEndsAt">;

export function isVerifiedOwner(user: Pick<AccountIdentity, "primaryEmailAddressId" | "emailAddresses">, email: string): boolean {
  const primary = user.emailAddresses.find((item) => item.id === user.primaryEmailAddressId);
  return !!email.trim() && primary?.verification?.status === "verified"
    && primary.emailAddress.trim().toLowerCase() === email.trim().toLowerCase();
}

export function ownerAccounts(users: AccountIdentity[], orders: AccountBilling[], now: Date): OwnerAccount[] {
  const grouped = new Map<string, AccountBilling[]>();
  for (const order of orders) {
    const rows = grouped.get(order.userId) ?? [];
    rows.push(order);
    grouped.set(order.userId, rows);
  }
  return users.map((user): OwnerAccount => {
    const rows = (grouped.get(user.id) ?? []).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const approved = rows.filter((o) => o.status === "approved" && o.periodStartsAt && o.periodEndsAt);
    const active = approved.filter((o) => o.periodStartsAt! <= now && o.periodEndsAt! > now)
      .sort((a, b) => b.periodStartsAt!.getTime() - a.periodStartsAt!.getTime())[0];
    const expired = approved.filter((o) => o.periodEndsAt! <= now)
      .sort((a, b) => b.periodEndsAt!.getTime() - a.periodEndsAt!.getTime())[0];
    const scheduled = approved.filter((o) => o.periodStartsAt! > now)
      .sort((a, b) => a.periodStartsAt!.getTime() - b.periodStartsAt!.getTime())[0];
    const pending = rows.find((o) => o.status === "pending_review" || o.status === "awaiting_payment");
    const period = active ?? scheduled ?? expired;
    const lastPaid = approved.filter((o) => o.reviewedAt)
      .sort((a, b) => b.reviewedAt!.getTime() - a.reviewedAt!.getTime())[0];
    return {
      id: user.id,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "Unnamed account",
      email: user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId)?.emailAddress ?? null,
      createdAt: new Date(user.createdAt).toISOString(),
      plan: active?.plan ?? "free",
      status: active ? "active" : pending || scheduled ? "pending" : expired ? "expired"
        : rows.some((o) => o.status === "rejected") ? "rejected" : "free",
      pendingPlan: pending?.plan ?? scheduled?.plan ?? null,
      periodStartsAt: period?.periodStartsAt?.toISOString() ?? null,
      periodEndsAt: period?.periodEndsAt?.toISOString() ?? null,
      lastPaymentAt: lastPaid?.reviewedAt?.toISOString() ?? null,
      billingStatus: rows[0]?.status ?? null,
    };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

export function accountCounts(accounts: OwnerAccount[]) {
  const plans: OwnerPlanCounts = { free: 0, plus: 0, pro: 0 };
  const subscriptions: OwnerStatusCounts = { free: 0, active: 0, expired: 0, pending: 0, rejected: 0 };
  for (const account of accounts) {
    plans[account.plan]++;
    subscriptions[account.status]++;
  }
  return { plans, subscriptions };
}

export function filterAccounts(accounts: OwnerAccount[], query: { search?: string; plan?: string; status?: string; page?: number; pageSize?: number }) {
  const search = query.search?.trim().toLowerCase() ?? "";
  const filtered = accounts.filter((account) =>
    (!query.plan || query.plan === "all" || account.plan === query.plan)
    && (!query.status || query.status === "all" || account.status === query.status)
    && (!search || [account.id, account.name, account.email ?? ""].some((value) => value.toLowerCase().includes(search))));
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  return { accounts: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize };
}
