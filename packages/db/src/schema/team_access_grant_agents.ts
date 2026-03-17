import { pgTable, uuid, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { teamAccessGrants } from "./team_access_grants.js";
import { agents } from "./agents.js";

export const teamAccessGrantAgents = pgTable(
  "team_access_grant_agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    grantId: uuid("grant_id").notNull().references(() => teamAccessGrants.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    grantAgentUniqueIdx: uniqueIndex("team_access_grant_agents_grant_agent_unique_idx").on(
      table.grantId,
      table.agentId,
    ),
    grantIdIdx: index("team_access_grant_agents_grant_id_idx").on(table.grantId),
    agentIdIdx: index("team_access_grant_agents_agent_id_idx").on(table.agentId),
  }),
);
