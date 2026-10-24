import { Router } from "express";
import { clerkClient } from "@clerk/express";
import { desc, eq } from "drizzle-orm";
import { billingLaunchMembers, billingOrders, db } from "@workspace/db";
import * as api from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { handler, input, param } from "../lib/mvpHttp";
import { billingPlans, paymentReadiness } from "../lib/billingCatalog";
import {
  adminOrderApi, createBillingOrder, createBillingQuote, listPendingBillingOrders,
  orderApi, ownedOrder, ownedQuote, quoteApi, reviewBillingOrder, submitBillingPayment,
} from "../lib/billingData";
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
  const orders = await db.select().from(billingOrders).where(eq(billingOrders.userId, userId))
    .orderBy(desc(billingOrders.createdAt)).limit(100);
  const now = new Date();
  const activeOrder = orders.filter((order) =>
    order.status === "approved" && order.periodStartsAt && order.periodEndsAt &&
    order.periodStartsAt <= now && order.periodEndsAt > now,
  ).sort((a, b) => (b.periodStartsAt?.getTime() ?? 0) - (a.periodStartsAt?.getTime() ?? 0))[0];
  const latestApproved = orders.find((order) => order.status === "approved");
  const latestPending = orders.find((order) => order.status === "pending_review" || order.status === "awaiting_payment");
  let plan: "free" | "plus" | "pro" = "free";
  let status: "no_paid_subscription" | "awaiting_payment" | "pending_review" | "active" | "expired" | "payment_rejected" = "no_paid_subscription";
  let periodEndsAt: string | null = null;
  if (activeOrder) {
    plan = activeOrder.plan;
    status = "active";
    periodEndsAt = activeOrder.periodEndsAt?.toISOString() ?? null;
  } else if (latestPending) {
    plan = latestPending.plan;
    status = latestPending.status === "awaiting_payment" ? "awaiting_payment" : "pending_review";
  } else if (latestApproved?.periodEndsAt) {
    plan = latestApproved.plan;
    status = "expired";
    periodEndsAt = latestApproved.periodEndsAt.toISOString();
  } else if (orders.some((order) => order.status === "rejected")) {
    status = "payment_rejected";
  }
  res.json(api.GetBillingSubscriptionResponse.parse({
    plan, status, periodEndsAt, usageLimitsEnforced: false,
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
  const readiness = paymentReadiness();
  if (!readiness.checkoutEnabled) {
    res.status(503).json({
      error: "Manual payment review is not configured. No payment order was created.",
      code: "PAYMENTS_NOT_READY", ...readiness,
    });
    return;
  }
  const quote = await ownedQuote(userId, data.quoteId);
  if (quote.expiresAt <= new Date()) throw new MvpError(409, "Quote expired. Request a new quote before checkout.");
  const order = await createBillingOrder(userId, quote);
  res.status(201).json(api.StartBillingCheckoutResponse.parse(orderApi(order)));
}));

router.get("/orders/:orderId", handler(async (req, res, userId) => {
  const order = await ownedOrder(userId, param(req, "orderId"));
  res.json(api.GetBillingOrderResponse.parse(orderApi(order)));
}));

router.post("/orders/:orderId", handler(async (req, res, userId) => {
  const data = input(api.SubmitBillingPaymentBody, req.body);
  if (Object.keys(req.body).some((key) => key !== "transactionReference")) {
    throw new MvpError(400, "Only a UPI transaction reference is accepted.");
  }
  const order = await submitBillingPayment(userId, param(req, "orderId"), data.transactionReference);
  res.json(api.SubmitBillingPaymentResponse.parse(orderApi(order)));
}));

async function requireBillingAdmin(userId: string) {
  const configuredEmail = process.env.DOHAY_BILLING_ADMIN_EMAIL?.trim().toLowerCase();
  if (!configuredEmail) throw new MvpError(503, "Manual payment review is not configured.");
  let user;
  try {
    user = await clerkClient.users.getUser(userId);
  } catch {
    throw new MvpError(503, "The billing owner account could not be verified. Retry shortly.");
  }
  const primary = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== "verified" ||
      primary.emailAddress.trim().toLowerCase() !== configuredEmail) {
    throw new MvpError(403, "This account is not authorized to review payments.");
  }
}

router.get("/admin/orders", handler(async (_req, res, userId) => {
  await requireBillingAdmin(userId);
  const orders = await listPendingBillingOrders();
  res.json(api.ListBillingAdminOrdersResponse.parse(orders.map(adminOrderApi)));
}));

router.post("/admin/orders/:orderId/review", handler(async (req, res, userId) => {
  await requireBillingAdmin(userId);
  const data = input(api.ReviewBillingAdminOrderBody, req.body);
  if (Object.keys(req.body).some((key) => key !== "decision")) {
    throw new MvpError(400, "Only approve or reject is accepted.");
  }
  const order = await reviewBillingOrder(param(req, "orderId"), userId, data.decision);
  res.json(api.ReviewBillingAdminOrderResponse.parse(adminOrderApi(order)));
}));

export default router;
