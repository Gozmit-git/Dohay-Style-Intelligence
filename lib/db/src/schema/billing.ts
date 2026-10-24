import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// No cascading user FK: deleted accounts must not release launch-offer slots.
export const billingLaunchMembers = pgTable("dohay_billing_launch_members", {
  userId: text("user_id").primaryKey(),
  slot: integer("slot").notNull().unique(),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull(),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
});

export const billingQuotes = pgTable("dohay_billing_quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  requestKey: uuid("request_key").notNull(),
  plan: text("plan").$type<"plus" | "pro">().notNull(),
  interval: text("interval").$type<"month" | "year">().notNull(),
  regularAmount: integer("regular_amount").notNull(),
  firstTermAmount: integer("first_term_amount").notNull(),
  discountPercent: integer("discount_percent").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [uniqueIndex("dohay_billing_quote_request_idx").on(t.userId, t.requestKey)]);

export const billingOrders = pgTable("dohay_billing_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  quoteId: uuid("quote_id").notNull().references(() => billingQuotes.id, { onDelete: "restrict" }),
  plan: text("plan").$type<"plus" | "pro">().notNull(),
  interval: text("interval").$type<"month" | "year">().notNull(),
  firstTermAmount: integer("first_term_amount").notNull(),
  regularAmount: integer("regular_amount").notNull(),
  discountPercent: integer("discount_percent").notNull(),
  status: text("status").$type<"awaiting_payment" | "pending_review" | "approved" | "rejected">().notNull().default("awaiting_payment"),
  transactionReference: text("transaction_reference"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: text("reviewed_by"),
  periodStartsAt: timestamp("period_starts_at", { withTimezone: true }),
  periodEndsAt: timestamp("period_ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("dohay_billing_order_quote_idx").on(t.quoteId),
  uniqueIndex("dohay_billing_transaction_reference_idx").on(t.transactionReference)
    .where(sql`${t.transactionReference} is not null`),
  index("dohay_billing_orders_user_created_idx").on(t.userId, t.createdAt),
  index("dohay_billing_orders_status_created_idx").on(t.status, t.createdAt),
]);

export const insertBillingQuoteSchema = createInsertSchema(billingQuotes).omit({ id: true, createdAt: true });
export const insertBillingOrderSchema = createInsertSchema(billingOrders).omit({ id: true, createdAt: true, updatedAt: true });
export type BillingQuote = typeof billingQuotes.$inferSelect;
export type BillingOrder = typeof billingOrders.$inferSelect;
export type BillingLaunchMember = typeof billingLaunchMembers.$inferSelect;
