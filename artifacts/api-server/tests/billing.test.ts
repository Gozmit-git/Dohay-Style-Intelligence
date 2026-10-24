import assert from "node:assert/strict";
import { test } from "node:test";
import { billingPlans, launchAdditions, paymentReadiness, quotePrice } from "../src/lib/billingCatalog";
import {
  CreateBillingQuoteBody, CreateBillingQuoteResponse, ListBillingPlansResponse,
  ReviewBillingAdminOrderBody, StartBillingCheckoutBody, StartBillingCheckoutResponse,
  SubmitBillingPaymentBody,
} from "@workspace/api-zod";

test("all monthly and annual launch prices use integer paise", () => {
  const cases = [
    ["plus", "month", 19900, 5970], ["plus", "year", 199000, 59700],
    ["pro", "month", 49900, 14970], ["pro", "year", 499000, 149700],
  ] as const;
  for (const [plan, interval, regular, discounted] of cases) {
    assert.deepEqual(quotePrice(plan, interval, true), { regularAmount: regular, firstTermAmount: discounted, discountPercent: 70 });
    assert.deepEqual(quotePrice(plan, interval, false), { regularAmount: regular, firstTermAmount: regular, discountPercent: 0 });
  }
});

const candidates = Array.from({ length: 25 }, (_, i) => ({ userId: `test-${i}`, registeredAt: new Date(1700000000000 + i) }));
test("launch cohort caps at 20 and follows supplied signup order", () => {
  const additions = launchAdditions([], candidates);
  assert.equal(additions.length, 20);
  assert.deepEqual(additions.map((row) => row.userId), candidates.slice(0, 20).map((row) => row.userId));
  assert.deepEqual(additions.map((row) => row.slot), Array.from({ length: 20 }, (_, i) => i + 1));
});
test("repeat requests cannot allocate extra slots", () => {
  const existing = launchAdditions([], candidates.slice(0, 10));
  assert.deepEqual(launchAdditions(existing, candidates.slice(0, 10)), []);
  assert.equal(launchAdditions(existing, candidates).length, 10);
});
test("deleted accounts in permanent cohort do not release slots", () => {
  const existing = launchAdditions([], candidates);
  assert.deepEqual(launchAdditions(existing, candidates.slice(5)), []);
});
test("duplicate candidate identities never get two slots", () => {
  assert.equal(launchAdditions([], [candidates[0], candidates[0]]).length, 1);
});
test("catalog conforms to contract and reflects manual-review setup", () => {
  const catalog = { currency: "INR", amountUnit: "paise", taxStatus: "not_configured", usageLimitsEnforced: false,
    plans: billingPlans, ...paymentReadiness() };
  assert.equal(ListBillingPlansResponse.safeParse(catalog).success, true);
  assert.equal(catalog.checkoutEnabled, Boolean(process.env.DOHAY_BILLING_ADMIN_EMAIL?.trim()));
  assert.equal(catalog.mode, catalog.checkoutEnabled ? "manual_qr" : "disabled");
  assert.equal(ListBillingPlansResponse.safeParse({ ...catalog, checkoutEnabled: true, mode: "manual_qr", blockers: [] }).success, true);
});
test("request validators reject free checkout, invalid intervals, and malformed UUIDs", () => {
  const request = { plan: "plus", interval: "month", requestKey: "a4d3a9e5-4491-4bd3-bc9c-7120cbf30fc0" };
  assert.equal(CreateBillingQuoteBody.safeParse(request).success, true);
  for (const input of [{ ...request, plan: "free" }, { ...request, interval: "week" }, { ...request, requestKey: "bad" }]) {
    assert.equal(CreateBillingQuoteBody.safeParse(input).success, false);
  }
  assert.equal(StartBillingCheckoutBody.safeParse({ quoteId: "bad" }).success, false);
});
test("quote contract supports configured manual checkout and renews at full price", () => {
  const prices = quotePrice("pro", "year", true);
  const quote = { id: "a4d3a9e5-4491-4bd3-bc9c-7120cbf30fc0", plan: "pro", interval: "year",
    currency: "INR", amountUnit: "paise", ...prices, renewalAmount: prices.regularAmount,
    taxStatus: "not_configured", payable: false, createdAt: new Date().toISOString(), expiresAt: new Date().toISOString() };
  assert.equal(CreateBillingQuoteResponse.safeParse(quote).success, true);
  assert.equal(CreateBillingQuoteResponse.safeParse({ ...quote, payable: true }).success, true);
  assert.equal(quote.renewalAmount, 499000);
});

test("manual QR payment requires a transaction reference and admin decision", () => {
  assert.equal(SubmitBillingPaymentBody.safeParse({ transactionReference: "123456789012" }).success, true);
  assert.equal(SubmitBillingPaymentBody.safeParse({ transactionReference: "abc" }).success, false);
  assert.equal(SubmitBillingPaymentBody.safeParse({ transactionReference: "12345678 90" }).success, false);
  assert.equal(ReviewBillingAdminOrderBody.safeParse({ decision: "approve" }).success, true);
  assert.equal(ReviewBillingAdminOrderBody.safeParse({ decision: "I paid" }).success, false);
  const order = {
    id: "a4d3a9e5-4491-4bd3-bc9c-7120cbf30fc0",
    quoteId: "a4d3a9e5-4491-4bd3-bc9c-7120cbf30fc1",
    plan: "plus", interval: "month", currency: "INR", amountUnit: "paise",
    firstTermAmount: 5970, regularAmount: 19900, discountPercent: 70,
    status: "awaiting_payment", transactionReference: null, submittedAt: null,
    reviewedAt: null, periodStartsAt: null, periodEndsAt: null, createdAt: new Date().toISOString(),
  };
  assert.equal(StartBillingCheckoutResponse.safeParse(order).success, true);
  assert.equal(StartBillingCheckoutResponse.safeParse({ ...order, status: "pending_review" }).success, true);
});
