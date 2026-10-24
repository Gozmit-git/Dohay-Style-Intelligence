export const BILLING_CURRENCY = "INR";
export const LAUNCH_SLOTS = 20;
export const QUOTE_TTL_MS = 15 * 60 * 1000;

export const billingPlans = [
  { id: "free", name: "Free", monthlyAmount: 0, annualAmount: 0,
    limits: { chatReplies: 10, photoReviews: 2, wardrobeItems: 25, outfitRequests: 1 } },
  { id: "plus", name: "Plus", monthlyAmount: 19900, annualAmount: 199000,
    limits: { chatReplies: 100, photoReviews: 20, wardrobeItems: 150, outfitRequests: 20 } },
  { id: "pro", name: "Pro", monthlyAmount: 49900, annualAmount: 499000,
    limits: { chatReplies: 300, photoReviews: 60, wardrobeItems: 500, outfitRequests: 60 } },
] as const;

export function quotePrice(planId: "plus" | "pro", interval: "month" | "year", eligible: boolean) {
  const plan = billingPlans.find((item) => item.id === planId);
  if (!plan || plan.id === "free") throw new Error("Unknown paid plan");
  const regularAmount = interval === "year" ? plan.annualAmount : plan.monthlyAmount;
  return {
    regularAmount,
    firstTermAmount: eligible ? Math.round(regularAmount * 30 / 100) : regularAmount,
    discountPercent: eligible ? 70 : 0,
  };
}

// Existing grants are permanent. A deleted account never releases a slot.
// candidates must be supplied in ascending authoritative signup order.
export function launchAdditions(
  existing: readonly { userId: string; slot: number }[],
  candidates: readonly { userId: string; registeredAt: Date }[],
) {
  const known = new Set(existing.map((row) => row.userId));
  let slot = Math.max(0, ...existing.map((row) => row.slot));
  const additions: { userId: string; slot: number; registeredAt: Date }[] = [];
  for (const candidate of candidates) {
    if (slot >= LAUNCH_SLOTS) break;
    if (known.has(candidate.userId)) continue;
    known.add(candidate.userId);
    additions.push({ ...candidate, slot: ++slot });
  }
  return additions;
}

export function paymentReadiness() {
  const blockers = [
    "Subscription checkout, payment verification, webhooks, and renewal scheduling require a verified Pine Labs merchant contract.",
    "Confirm introductory pricing, launch-cohort history, and tax treatment before enabling charges.",
  ];
  if (!process.env.PINELABS_SANDBOX_CLIENT_ID || !process.env.PINELABS_SANDBOX_CLIENT_SECRET) {
    blockers.unshift("Pine Labs subscription sandbox credentials are not configured.");
  }
  // Deliberately cannot be enabled by setting an environment flag. No payment
  // adapter is verified yet; an AgenticOrg agent result is not payment proof.
  return { checkoutEnabled: false as const, mode: "disabled" as const, blockers };
}
