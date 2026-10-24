import { Router } from "express";
import { eq } from "drizzle-orm";
import { billingLaunchMembers, db } from "@workspace/db";
import * as api from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { handler, input, param } from "../lib/mvpHttp";
import { billingPlans, paymentReadiness } from "../lib/billingCatalog";
import { createBillingQuote, ownedQuote, quoteApi } from "../lib/billingData";
import { MvpError } from "../lib/mvpData";

const router = Router();
router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

router.get("/plans", (_req, res) => {
  res.json(api.ListBillingPlansResponse.parse({
    currency: "INR", amountUnit: "paise", taxStatus: "not_configured",
    usageLimitsEnforced: false, plans: billingPlans, ...paymentReadiness(),
  }));
});

router.use(requireAuth);
router.get("/subscription", handler(async (_req, res, userId) => {
  const [member] = await db.select().from(billingLaunchMembers).where(eq(billingLaunchMembers.userId, userId));
  res.json(api.GetBillingSubscriptionResponse.parse({
    // There is intentionally no route accepting client-reported paid status.
    // Verified subscriptions will be introduced with the provider adapter.
    plan: "free", status: "no_paid_subscription", usageLimitsEnforced: false,
    launchOffer: member ? (member.redeemedAt ? "redeemed" : "eligible") : "not_yet_evaluated",
    ...paymentReadiness(),
  }));
}));

router.post("/quotes", handler(async (req, res, userId) => {
  const data = input(api.CreateBillingQuoteBody, req.body);
  // Reject client-owned price, identity or entitlement fields, rather than
  // letting Zod strip them and implying they were accepted.
  if (Object.keys(req.body).some((key) => !["plan", "interval", "requestKey"].includes(key))) {
    throw new MvpError(400, "Only plan, interval, and requestKey are accepted.");
  }
  const quote = await createBillingQuote(userId, data);
  res.status(201).json(api.CreateBillingQuoteResponse.parse(quoteApi(quote)));
}));

router.get("/quotes/:quoteId", handler(async (req, res, userId) => {
  const quote = await ownedQuote(userId, param(req, "quoteId"));
  res.json(api.GetBillingQuoteResponse.parse(quoteApi(quote)));
}));

router.post("/checkout", handler(async (req, res, userId) => {
  const data = input(api.StartBillingCheckoutBody, req.body);
  if (Object.keys(req.body).some((key) => key !== "quoteId")) throw new MvpError(400, "Only quoteId is accepted.");
  const quote = await ownedQuote(userId, data.quoteId);
  if (quote.expiresAt <= new Date()) throw new MvpError(409, "Quote expired. Request a new quote before checkout.");
  res.status(503).json({
    error: "Pine Labs checkout is not available yet. No payment was taken and your discount has not been redeemed.",
    code: "PAYMENTS_NOT_READY", ...paymentReadiness(),
  });
}));

export default router;
