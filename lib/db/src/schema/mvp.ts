import {
  boolean, doublePrecision, index, jsonb, pgTable, primaryKey, text, timestamp, uuid,
} from "drizzle-orm/pg-core";
import { wardrobeItems } from "./wardrobe";

export const mvpProfiles = pgTable("dohay_profiles", {
  userId: text("user_id").primaryKey(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  consentAt: timestamp("consent_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const mvpThreads = pgTable("dohay_threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("dohay_threads_owner_idx").on(t.userId)]);

export const mvpMessages = pgTable("dohay_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id").notNull().references(() => mvpThreads.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  attachments: jsonb("attachments").$type<string[]>().notNull().default([]),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("dohay_messages_thread_idx").on(t.threadId, t.createdAt)]);

export const mvpJobs = pgTable("dohay_scan_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  threadId: uuid("thread_id").references(() => mvpThreads.id, { onDelete: "set null" }),
  objectPaths: jsonb("object_paths").$type<string[]>().notNull(),
  status: text("status").notNull().default("pending"),
  result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("dohay_scan_jobs_owner_idx").on(t.userId)]);

export const mvpOutfits = pgTable("dohay_outfits", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  context: jsonb("context").$type<Record<string, unknown>>().notNull(),
  score: doublePrecision("score").notNull(),
  breakdown: jsonb("breakdown").$type<Record<string, number>>().notNull(),
  explanation: text("explanation").notNull(),
  saved: boolean("saved").notNull().default(false),
  feedback: text("feedback"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("dohay_outfits_owner_idx").on(t.userId)]);

export const mvpOutfitItems = pgTable("dohay_outfit_items", {
  outfitId: uuid("outfit_id").notNull().references(() => mvpOutfits.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").notNull().references(() => wardrobeItems.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.outfitId, t.itemId] })]);

export const mvpFeedback = pgTable("dohay_outfit_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  outfitId: uuid("outfit_id").notNull().references(() => mvpOutfits.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
