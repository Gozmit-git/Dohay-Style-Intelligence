import { clerkClient } from "@clerk/express";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { billingLaunchMembers, billingQuotes, db, type BillingQuote } from "@workspace/db";
import { LAUNCH_SLOTS, launchAdditions, QUOTE_TTL_MS, quotePrice } from "./billingCatalog";
import { MvpError } from "./mvpData";

export const quoteApi = (quote: BillingQuote) => ({
  id: quote.id, plan: quote.plan, interval: quote.interval, currency: "INR" as const,
  amountUnit: "paise" as const, regularAmount: quote.regularAmount,
  firstTermAmount: quote.firstTermAmount, discountPercent: quote.discountPercent,
  renewalAmount: quote.regularAmount, taxStatus: "not_configured" as const,
  payable: false as const, createdAt: quote.createdAt.toISOString(), expiresAt: quote.expiresAt.toISOString(),
});

export async function ownedQuote(userId: string, id: string) {
  const [quote] = await db.select().from(billingQuotes)
    .where(and(eq(billingQuotes.id, id), eq(billingQuotes.userId, userId)));
  if (!quote) throw new MvpError(404, "Quote not found.");
  return quote;
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
