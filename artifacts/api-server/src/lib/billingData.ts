import { clerkClient } from "@clerk/express";
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { billingLaunchMembers, billingOrders, billingQuotes, db, type BillingOrder, type BillingQuote } from "@workspace/db";
import { LAUNCH_SLOTS, launchAdditions, paymentReadiness, QUOTE_TTL_MS, quotePrice } from "./billingCatalog";
import { MvpError } from "./mvpData";

export const quoteApi = (quote: BillingQuote) => ({
  id: quote.id, plan: quote.plan, interval: quote.interval, currency: "INR" as const,
  amountUnit: "paise" as const, regularAmount: quote.regularAmount,
  firstTermAmount: quote.firstTermAmount, discountPercent: quote.discountPercent,
  renewalAmount: quote.regularAmount, taxStatus: "not_configured" as const,
  payable: paymentReadiness().checkoutEnabled, createdAt: quote.createdAt.toISOString(), expiresAt: quote.expiresAt.toISOString(),
});

export const orderApi = (order: BillingOrder) => ({
  id: order.id, quoteId: order.quoteId, plan: order.plan, interval: order.interval,
  currency: "INR" as const, amountUnit: "paise" as const,
  firstTermAmount: order.firstTermAmount, regularAmount: order.regularAmount,
  discountPercent: order.discountPercent, status: order.status,
  transactionReference: order.transactionReference,
  submittedAt: order.submittedAt?.toISOString() ?? null,
  reviewedAt: order.reviewedAt?.toISOString() ?? null,
  periodStartsAt: order.periodStartsAt?.toISOString() ?? null,
  periodEndsAt: order.periodEndsAt?.toISOString() ?? null,
  createdAt: order.createdAt.toISOString(),
});

export const adminOrderApi = (order: BillingOrder) => ({ ...orderApi(order), userId: order.userId });

export async function ownedQuote(userId: string, id: string) {
  const [quote] = await db.select().from(billingQuotes)
    .where(and(eq(billingQuotes.id, id), eq(billingQuotes.userId, userId)));
  if (!quote) throw new MvpError(404, "Quote not found.");
  return quote;
}

export async function ownedOrder(userId: string, id: string) {
  const [order] = await db.select().from(billingOrders)
    .where(and(eq(billingOrders.id, id), eq(billingOrders.userId, userId)));
  if (!order) throw new MvpError(404, "Payment order not found.");
  return order;
}

export async function createBillingOrder(userId: string, quote: BillingQuote) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`dohay-billing:${userId}`}))`);
    const [existing] = await tx.select().from(billingOrders).where(eq(billingOrders.quoteId, quote.id));
    if (existing) return existing;
    const [openOrder] = await tx.select().from(billingOrders).where(and(
      eq(billingOrders.userId, userId),
      inArray(billingOrders.status, ["awaiting_payment", "pending_review"]),
    ));
    if (openOrder) throw new MvpError(409, "You already have a payment awaiting review.");
    const [member] = await tx.select().from(billingLaunchMembers)
      .where(eq(billingLaunchMembers.userId, userId));
    if (quote.discountPercent > 0 && member?.redeemedAt) {
      throw new MvpError(409, "This launch discount has already been used. Request a fresh quote.");
    }
    const [order] = await tx.insert(billingOrders).values({
      userId, quoteId: quote.id, plan: quote.plan, interval: quote.interval,
      firstTermAmount: quote.firstTermAmount, regularAmount: quote.regularAmount,
      discountPercent: quote.discountPercent, status: "awaiting_payment",
    }).returning();
    return order;
  });
}

export async function submitBillingPayment(userId: string, id: string, transactionReference: string) {
  try {
    return await db.transaction(async (tx) => {
      const [order] = await tx.select().from(billingOrders)
        .where(and(eq(billingOrders.id, id), eq(billingOrders.userId, userId))).for("update");
      if (!order) throw new MvpError(404, "Payment order not found.");
      if (order.status === "pending_review") return order;
      if (order.status !== "awaiting_payment") throw new MvpError(409, "This payment order can no longer be submitted.");
      const [duplicateReference] = await tx.select({ id: billingOrders.id }).from(billingOrders)
        .where(eq(billingOrders.transactionReference, transactionReference));
      if (duplicateReference) throw new MvpError(409, "That transaction reference has already been submitted.");
      const [updated] = await tx.update(billingOrders).set({
        transactionReference, status: "pending_review", submittedAt: new Date(),
      }).where(eq(billingOrders.id, id)).returning();
      return updated;
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      throw new MvpError(409, "That transaction reference has already been submitted.");
    }
    throw error;
  }
}

export async function listPendingBillingOrders() {
  return db.select().from(billingOrders)
    .where(eq(billingOrders.status, "pending_review"))
    .orderBy(billingOrders.createdAt).limit(100);
}

function addBillingPeriod(start: Date, interval: "month" | "year") {
  const months = interval === "year" ? 12 : 1;
  const monthIndex = start.getUTCMonth() + months;
  const year = start.getUTCFullYear() + Math.floor(monthIndex / 12);
  const month = monthIndex % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    year, month, Math.min(start.getUTCDate(), lastDay),
    start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), start.getUTCMilliseconds(),
  ));
}

export async function reviewBillingOrder(id: string, reviewerId: string, decision: "approve" | "reject") {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(billingOrders).where(eq(billingOrders.id, id)).for("update");
    if (!order) throw new MvpError(404, "Payment order not found.");
    if (order.status === (decision === "approve" ? "approved" : "rejected")) return order;
    if (order.status !== "pending_review") throw new MvpError(409, "Only submitted payments can be reviewed.");
    const now = new Date();
    if (decision === "reject") {
      const [updated] = await tx.update(billingOrders).set({
        status: "rejected", reviewedAt: now, reviewedBy: reviewerId,
      }).where(eq(billingOrders.id, id)).returning();
      return updated;
    }

    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`dohay-billing:${order.userId}`}))`);
    const [latestApproved] = await tx.select().from(billingOrders).where(and(
      eq(billingOrders.userId, order.userId), eq(billingOrders.status, "approved"),
    )).orderBy(desc(billingOrders.periodEndsAt)).limit(1);
    const periodStartsAt = latestApproved?.periodEndsAt && latestApproved.periodEndsAt > now
      ? latestApproved.periodEndsAt
      : now;
    const periodEndsAt = addBillingPeriod(periodStartsAt, order.interval);
    const [updated] = await tx.update(billingOrders).set({
      status: "approved", reviewedAt: now, reviewedBy: reviewerId, periodStartsAt, periodEndsAt,
    }).where(eq(billingOrders.id, id)).returning();
    if (order.discountPercent > 0) {
      await tx.update(billingLaunchMembers).set({ redeemedAt: now }).where(and(
        eq(billingLaunchMembers.userId, order.userId),
        sql`${billingLaunchMembers.redeemedAt} is null`,
      ));
    }
    return updated;
  });
}

export async function createBillingQuote(userId: string, data: {
  plan: "plus" | "pro"; interval: "month" | "year"; requestKey: string;
}) {
  return db.transaction(async (tx) => {
    // Serializes cohort allocation and quote idempotency across server instances.
    // Transaction rollback releases the lock, including when Clerk is unavailable.
    await tx.execute(sql`select pg_advisory_xact_lock(73002120)`);
    const [prior] = await tx.select().from(billingQuotes)
      .where(and(eq(billingQuotes.userId, userId), eq(billingQuotes.requestKey, data.requestKey)));
    if (prior) {
      if (prior.plan !== data.plan || prior.interval !== data.interval) {
        throw new MvpError(409, "This request key was already used for a different plan or interval.");
      }
      if (prior.expiresAt <= new Date()) throw new MvpError(409, "Quote expired. Request a new quote with a new request key.");
      return prior;
    }
    const [recent] = await tx.select({ value: count() }).from(billingQuotes).where(and(
      eq(billingQuotes.userId, userId), gte(billingQuotes.createdAt, new Date(Date.now() - QUOTE_TTL_MS)),
    ));
    if (recent.value >= 10) throw new MvpError(429, "Too many quotes. Please wait 15 minutes before requesting another.");

    let members = await tx.select().from(billingLaunchMembers);
    if (members.length < LAUNCH_SLOTS) {
      let candidates;
      try {
        // Fetch the cohort, not just this caller: first to request a quote must
        // not become first to register. Never return these identities to clients.
        const result = await clerkClient.users.getUserList({ orderBy: "+created_at", limit: LAUNCH_SLOTS });
        candidates = result.data.map((user) => ({
          userId: user.id, registeredAt: new Date(user.createdAt),
        }));
      } catch {
        throw new MvpError(503, "Launch-discount eligibility could not be verified. Please retry later.");
      }
      const additions = launchAdditions(members, candidates);
      if (additions.length) {
        await tx.insert(billingLaunchMembers).values(additions);
        members = await tx.select().from(billingLaunchMembers);
      }
    }
    const membership = members.find((row) => row.userId === userId);
    const amounts = quotePrice(data.plan, data.interval, !!membership && !membership.redeemedAt);
    const [quote] = await tx.insert(billingQuotes).values({
      userId, ...data, ...amounts, expiresAt: new Date(Date.now() + QUOTE_TTL_MS),
    }).returning();
    return quote;
  });
}
