import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents } from "@paperclipai/db";

/**
 * Given one or more root agent IDs, recursively walks the org chart
 * (via reports_to) and returns the full set of agent IDs in those subtrees
 * (including the root agents themselves).
 *
 * Uses iterative BFS over safe parameterized Drizzle queries.
 */
export async function expandAgentSubtrees(
  db: Db,
  rootAgentIds: string[],
  companyId: string,
): Promise<Set<string>> {
  if (rootAgentIds.length === 0) return new Set();

  const visited = new Set(rootAgentIds);
  let frontier = [...rootAgentIds];

  while (frontier.length > 0) {
    const children = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.companyId, companyId), inArray(agents.reportsTo, frontier)));

    const newIds = children.map((r) => r.id).filter((id) => !visited.has(id));
    for (const id of newIds) visited.add(id);
    frontier = newIds;
  }

  return visited;
}
