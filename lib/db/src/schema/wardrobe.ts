import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const wardrobeUploads = pgTable(
  "wardrobe_uploads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    objectPath: text("object_path").notNull().unique(),
    originalName: text("original_name").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("wardrobe_uploads_user_idx").on(table.userId)],
);

export const wardrobeItems = pgTable(
  "wardrobe_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    imagePath: text("image_path").notNull(),
    additionalImagePaths: jsonb("additional_image_paths")
      .$type<string[]>()
      .notNull()
      .default([]),
    record: jsonb("record").$type<Record<string, unknown>>().notNull(),
    imageDigest: text("image_digest").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("wardrobe_items_user_created_idx").on(table.userId, table.createdAt),
    index("wardrobe_items_user_digest_idx").on(table.userId, table.imageDigest),
  ],
);
