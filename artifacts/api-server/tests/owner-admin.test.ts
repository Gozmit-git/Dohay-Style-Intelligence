import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { accountCounts, filterAccounts, isVerifiedOwner, ownerAccounts, type AccountBilling, type AccountIdentity } from "../src/lib/ownerAccountModel";
import { ownerAdminRouter } from "../src/routes/ownerAdmin";
import { MvpError } from "../src/lib/mvpData";
import { ListOwnerAccountsQueryParams, GetOwnerSummaryResponse } from "@workspace/api-zod";

const now = new Date("2026-10-24T12:00:00Z");
const identity = (id: string): AccountIdentity => ({
  id, firstName: id, lastName: null, username: null, createdAt: now.getTime(), primaryEmailAddressId: "primary",
  emailAddresses: [{ id: "primary", emailAddress: `${id}@example.test`, verification: { status: "verified" } }],
});
const order = (userId: string, overrides: Partial<AccountBilling> = {}): AccountBilling => ({
  userId, plan: "plus", status: "approved", createdAt: new Date("2026-10-01"),
  reviewedAt: new Date("2026-10-01"), periodStartsAt: new Date("2026-10-01"),
  periodEndsAt: new Date("2026-11-01"), ...overrides,
});
test("only a matching verified PRIMARY email qualifies as owner", () => {
  const user = identity("owner");
  assert.equal(isVerifiedOwner(user, " OWNER@example.test "), true);
  assert.equal(isVerifiedOwner(user, ""), false);
  assert.equal(isVerifiedOwner(user, "other@example.test"), false);
  user.emailAddresses[0].verification = { status: "unverified" };
  assert.equal(isVerifiedOwner(user, "owner@example.test"), false);
  user.emailAddresses.push({ id: "secondary", emailAddress: "owner@example.test", verification: { status: "verified" } });
  assert.equal(isVerifiedOwner(user, "owner@example.test"), false);
});
test("pending, expired and future purchases never grant current paid access", () => {
  const users = ["free", "active", "expired", "pending", "scheduled", "rejected"].map(identity);
  const orders = [
    order("active"), order("expired", { periodEndsAt: now }),
    order("pending", { status: "pending_review", periodStartsAt: null, periodEndsAt: null }),
    order("scheduled", { periodStartsAt: new Date("2026-11-01"), periodEndsAt: new Date("2026-12-01") }),
    order("rejected", { status: "rejected", periodStartsAt: null, periodEndsAt: null }),
    order("deleted-account"),
  ];
  const accounts = ownerAccounts(users, orders, now);
  const counts = accountCounts(accounts);
  assert.deepEqual(counts.plans, { free: 5, plus: 1, pro: 0 });
  assert.deepEqual(counts.subscriptions, { free: 1, active: 1, expired: 1, pending: 2, rejected: 1 });
  assert.equal(accounts.find((a) => a.id === "expired")?.periodEndsAt, now.toISOString());
  assert.equal(accounts.find((a) => a.id === "pending")?.pendingPlan, "plus");
});
test("active term wins over pending renewal; future upgrade does not replace active plan", () => {
  const accounts = ownerAccounts([identity("owner")], [
    order("owner"),
    order("owner", { plan: "pro", status: "pending_review", createdAt: now, periodStartsAt: null, periodEndsAt: null }),
    order("owner", { plan: "pro", periodStartsAt: new Date("2026-11-01"), periodEndsAt: new Date("2026-12-01") }),
  ], now);
  assert.equal(accounts[0].plan, "plus");
  assert.equal(accounts[0].status, "active");
  assert.equal(accounts[0].pendingPlan, "pro");
});
test("search, plan/status filters and pagination agree with totals", () => {
  const accounts = ownerAccounts(["a", "b", "c"].map(identity), [order("b")], now);
  assert.equal(filterAccounts(accounts, { search: "B@EXAMPLE" }).total, 1);
  assert.equal(filterAccounts(accounts, { plan: "free" }).total, 2);
  assert.equal(filterAccounts(accounts, { status: "active" }).accounts[0].id, "b");
  assert.equal(filterAccounts(accounts, { page: 2, pageSize: 2 }).accounts.length, 1);
  assert.equal(filterAccounts(accounts, { page: 9, pageSize: 2 }).accounts.length, 0);
  for (const input of [{ page: 0 }, { pageSize: 101 }, { page: 1.5 }, { search: "x".repeat(101) }, { plan: "admin" }]) {
    assert.equal(ListOwnerAccountsQueryParams.safeParse(input).success, false);
  }
});
test("real owner routes deny missing identity/non-owner before loading any privileged values", async () => {
  let reads = 0;
  const accounts = ownerAccounts([identity("owner")], [], now);
  const summary = { totalAccounts: 1, ...accountCounts(accounts), recentSignups: accounts, recentBilling: [], pendingPaymentReviews: 0, asOf: now.toISOString() };
  assert.equal(GetOwnerSummaryResponse.safeParse(summary).success, true);
  const app = express();
  // Test-only identities; the production parent router uses Clerk requireAuth.
  app.use((req, _res, next) => {
    req.userId = req.headers["x-test-user"] as string | undefined;
    req.log = { warn() {}, error() {} } as typeof req.log;
    next();
  });
  app.use(ownerAdminRouter(async (userId) => {
    if (userId !== "owner") throw new MvpError(403, "Owner required");
  }, async () => { reads++; return { accounts, summary, asOf: now.toISOString() }; }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  try {
    for (const path of ["/summary", "/accounts"]) {
      assert.equal((await fetch(base + path)).status, 401);
      assert.equal((await fetch(base + path, { headers: { "x-test-user": "stranger" } })).status, 403);
    }
    assert.equal(reads, 0);
    const access = await fetch(base + "/access", { headers: { "x-test-user": "stranger" } });
    assert.deepEqual(await access.json(), { isOwner: false });
    assert.equal(reads, 0);
    const result = await fetch(base + "/accounts?search=OWNER&pageSize=1", { headers: { "x-test-user": "owner" } });
    assert.equal(result.status, 200);
    const body = await result.json();
    assert.equal(body.total, 1);
    assert.deepEqual(Object.keys(body.accounts[0]).sort(), [
      "id", "name", "email", "createdAt", "plan", "status", "pendingPlan", "periodStartsAt", "periodEndsAt", "lastPaymentAt", "billingStatus",
    ].sort());
    assert.equal((await fetch(base + "/accounts?pageSize=999", { headers: { "x-test-user": "owner" } })).status, 400);
    assert.equal(reads, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
