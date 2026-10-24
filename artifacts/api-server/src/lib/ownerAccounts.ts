import { clerkClient } from "@clerk/express";
import { desc } from "drizzle-orm";
import { db, billingOrders } from "@workspace/db";
import { ListBillingAdminOrdersResponse, type OwnerSummary } from "@workspace/api-zod";
import { MvpError } from "./mvpData";
import { adminOrderApi } from "./billingData";
import { accountCounts, ownerAccounts, type AccountIdentity } from "./ownerAccountModel";

async function readSnapshot() {
  const users: AccountIdentity[] = [];
  let expected: number | undefined;
  try {
    for (let offset = 0; ; offset += 100) {
      const page = await clerkClient.users.getUserList({ limit: 100, offset, orderBy: "-created_at" });
      expected ??= page.totalCount;
      if (expected > 10000) throw new Error("Account snapshot limit reached");
      if (page.totalCount !== expected) throw new Error("Accounts changed during pagination");
      // Keep only dashboard identity fields, never metadata or customer content.
      users.push(...page.data.map((u) => ({
        id: u.id, firstName: u.firstName, lastName: u.lastName, username: u.username,
        createdAt: u.createdAt, primaryEmailAddressId: u.primaryEmailAddressId,
        emailAddresses: u.emailAddresses.map((e) => ({ id: e.id, emailAddress: e.emailAddress })),
      })));
      if (users.length >= expected) break;
      if (!page.data.length) throw new Error("Incomplete account page");
    }
    if (new Set(users.map((user) => user.id)).size !== expected) throw new Error("Incomplete account snapshot");
  } catch {
    throw new MvpError(503, "The complete account directory could not be loaded. Retry shortly; no partial totals are shown.");
  }
  const orders = await db.select().from(billingOrders).orderBy(desc(billingOrders.createdAt)).limit(100001);
  if (orders.length > 100000) throw new MvpError(503, "Billing history exceeds the dashboard snapshot limit.");
  const now = new Date();
  const accounts = ownerAccounts(users, orders, now);
  const summary: OwnerSummary = {
    totalAccounts: accounts.length, ...accountCounts(accounts),
    pendingPaymentReviews: orders.filter((order) => order.status === "pending_review").length,
    recentSignups: accounts.slice(0, 5), recentBilling: ListBillingAdminOrdersResponse.parse(orders.slice(0, 8).map(adminOrderApi)),
    asOf: now.toISOString(),
  };
  return { accounts, summary, asOf: summary.asOf };
}

// Coalesce simultaneous summary/list reads only. No stale fallback or persistent identity cache.
let inFlight: ReturnType<typeof readSnapshot> | undefined;
export function getOwnerSnapshot() {
  if (!inFlight) inFlight = readSnapshot().finally(() => { inFlight = undefined; });
  return inFlight;
}
