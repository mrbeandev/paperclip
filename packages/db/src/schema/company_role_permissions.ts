import { pgTable, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { companyRoles } from "./company_roles.js";

export const companyRolePermissions = pgTable(
  "company_role_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roleId: uuid("role_id").notNull().references(() => companyRoles.id, { onDelete: "cascade" }),
    permissionKey: text("permission_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    rolePermissionUniqueIdx: uniqueIndex("company_role_permissions_role_key_unique_idx").on(
      table.roleId,
      table.permissionKey,
    ),
  }),
);
