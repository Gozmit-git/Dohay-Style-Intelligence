import { integer, pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
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

export const insertBillingQuoteSchema = createInsertSchema(billingQuotes).omit({ id: true, createdAt: true });
export type BillingQuote = typeof billingQuotes.$inferSelect;
export type BillingLaunchMember = typeof billingLaunchMembers.$inferSelect;
