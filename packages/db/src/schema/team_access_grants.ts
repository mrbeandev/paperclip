import { pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const teamAccessGrants = pgTable(
  "team_access_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    userId: text("user_id"),
    status: text("status").notNull().default("pending"),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyEmailUniqueIdx: uniqueIndex("team_access_grants_company_email_unique_idx").on(
      table.companyId,
      table.email,
    ),
    companyStatusIdx: index("team_access_grants_company_status_idx").on(table.companyId, table.status),
    userIdIdx: index("team_access_grants_user_id_idx").on(table.userId),
    emailIdx: index("team_access_grants_email_idx").on(table.email),
  }),
);
