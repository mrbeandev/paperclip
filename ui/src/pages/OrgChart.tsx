import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useNavigate } from "@/lib/router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { agentsApi, type OrgNode } from "../api/agents";
import { accessApi, type CompanyMember } from "../api/access";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { agentUrl } from "../lib/utils";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { AgentIcon } from "../components/AgentIconPicker";
import { Network, User } from "lucide-react";
import { AGENT_ROLE_LABELS, type Agent } from "@paperclipai/shared";
import { cn } from "../lib/utils";

// ── Layout constants ──────────────────────────────────────────────────────────

const CARD_W = 200;
const CARD_H = 100;
const HUMAN_CARD_H = 70;
const GAP_X = 32;
const GAP_Y = 80;
const PADDING = 60;

// ── Unified node ──────────────────────────────────────────────────────────────

interface UnifiedNode {
  id: string;
  nodeType: "agent" | "human";
  name: string;
  subtitle: string;
  status: string;
  children: UnifiedNode[];
}

// ── Build unified tree from agents + human members ───────────────────────────

function buildUnifiedTree(
  orgTree: OrgNode[],
  humanMembers: CompanyMember[],
  agents: Agent[],
): UnifiedNode[] {
  // Build agent nodes from org tree (preserves server-computed hierarchy)
  function agentNodeFromOrg(node: OrgNode): UnifiedNode {
    return {
      id: `agent:${node.id}`,
      nodeType: "agent",
      name: node.name,
      subtitle: node.role,
      status: node.status,
      children: node.reports.map(agentNodeFromOrg),
    };
  }

  const roots: UnifiedNode[] = orgTree.map(agentNodeFromOrg);

  // Build a map of all agent nodes by agent ID for inserting humans
  const agentNodeMap = new Map<string, UnifiedNode>();
  function indexAgentNodes(nodes: UnifiedNode[]) {
    for (const n of nodes) {
      if (n.nodeType === "agent") {
        agentNodeMap.set(n.id.replace("agent:", ""), n);
      }
      indexAgentNodes(n.children);
    }
  }
  indexAgentNodes(roots);

  // Also build a map for human nodes (for humans reporting to other humans)
  const humanNodeMap = new Map<string, UnifiedNode>();
  const humanOrphans: UnifiedNode[] = [];

  // Check which agents report to humans (agents.reportsToUserId)
  const agentsByHumanSupervisor = new Map<string, string[]>();
  for (const agent of agents) {
    if (agent.reportsToUserId) {
      const existing = agentsByHumanSupervisor.get(agent.reportsToUserId) ?? [];
      existing.push(agent.id);
      agentsByHumanSupervisor.set(agent.reportsToUserId, existing);
    }
  }

  // Create human nodes
  const activeHumans = humanMembers.filter((m) => m.status === "active");
  for (const member of activeHumans) {
    const node: UnifiedNode = {
      id: `user:${member.principalId}`,
      nodeType: "human",
      name: member.userName ?? member.userEmail ?? "Unknown",
      subtitle: member.membershipRole ?? "member",
      status: "active",
      children: [],
    };
    humanNodeMap.set(member.principalId, node);
  }

  // Attach humans to their parents
  for (const member of activeHumans) {
    const node = humanNodeMap.get(member.principalId)!;

    if (member.reportsToAgentId) {
      // Human reports to an agent
      const parent = agentNodeMap.get(member.reportsToAgentId);
      if (parent) {
        parent.children.push(node);
        continue;
      }
    }
    if (member.reportsToUserId) {
      // Human reports to another human
      const parent = humanNodeMap.get(member.reportsToUserId);
      if (parent) {
        parent.children.push(node);
        continue;
      }
    }
    // No parent — this is a root human or unassigned
    humanOrphans.push(node);
  }

  // Move agent subtrees under human supervisors
  for (const [userId, agentIds] of agentsByHumanSupervisor) {
    const humanNode = humanNodeMap.get(userId);
    if (!humanNode) continue;

    for (const agentId of agentIds) {
      const agentNode = agentNodeMap.get(agentId);
      if (!agentNode) continue;

      // Remove from current parent and add under human
      removeFromTree(roots, agentNode.id);
      humanNode.children.push(agentNode);
    }
  }

  // Add orphan humans as roots
  return [...humanOrphans, ...roots];
}

function removeFromTree(nodes: UnifiedNode[], targetId: string): boolean {
  // Check if the target is a root-level node in the array
  const rootIdx = nodes.findIndex((n) => n.id === targetId);
  if (rootIdx !== -1) {
    nodes.splice(rootIdx, 1);
    return true;
  }
  // Otherwise search children recursively
  for (const node of nodes) {
    const idx = node.children.findIndex((c) => c.id === targetId);
    if (idx !== -1) {
      node.children.splice(idx, 1);
      return true;
    }
    if (removeFromTree(node.children, targetId)) return true;
  }
  return false;
}

// ── Layout types ──────────────────────────────────────────────────────────────

interface LayoutNode {
  id: string;
  nodeType: "agent" | "human";
  name: string;
  subtitle: string;
  status: string;
  x: number;
  y: number;
  h: number;
  children: LayoutNode[];
}

// ── Layout algorithm ──────────────────────────────────────────────────────────

function nodeHeight(node: UnifiedNode): number {
  return node.nodeType === "human" ? HUMAN_CARD_H : CARD_H;
}

function subtreeWidth(node: UnifiedNode): number {
  if (node.children.length === 0) return CARD_W;
  const childrenW = node.children.reduce((sum, c) => sum + subtreeWidth(c), 0);
  const gaps = (node.children.length - 1) * GAP_X;
  return Math.max(CARD_W, childrenW + gaps);
}

function layoutTree(node: UnifiedNode, x: number, y: number): LayoutNode {
  const h = nodeHeight(node);
  const totalW = subtreeWidth(node);
  const layoutChildren: LayoutNode[] = [];

  if (node.children.length > 0) {
    const childrenW = node.children.reduce((sum, c) => sum + subtreeWidth(c), 0);
    const gaps = (node.children.length - 1) * GAP_X;
    let cx = x + (totalW - childrenW - gaps) / 2;
    for (const child of node.children) {
      const cw = subtreeWidth(child);
      layoutChildren.push(layoutTree(child, cx, y + h + GAP_Y));
      cx += cw + GAP_X;
    }
  }

  return {
    id: node.id,
    nodeType: node.nodeType,
    name: node.name,
    subtitle: node.subtitle,
    status: node.status,
    x: x + (totalW - CARD_W) / 2,
    y,
    h,
    children: layoutChildren,
  };
}

function layoutForest(roots: UnifiedNode[]): LayoutNode[] {
  if (roots.length === 0) return [];
  let x = PADDING;
  const result: LayoutNode[] = [];
  for (const root of roots) {
    const w = subtreeWidth(root);
    result.push(layoutTree(root, x, PADDING));
    x += w + GAP_X;
  }
  return result;
}

function flattenLayout(nodes: LayoutNode[]): LayoutNode[] {
  const result: LayoutNode[] = [];
  function walk(n: LayoutNode) {
    result.push(n);
    n.children.forEach(walk);
  }
  nodes.forEach(walk);
  return result;
}

function collectEdges(nodes: LayoutNode[]): Array<{ parent: LayoutNode; child: LayoutNode }> {
  const edges: Array<{ parent: LayoutNode; child: LayoutNode }> = [];
  function walk(n: LayoutNode) {
    for (const c of n.children) {
      edges.push({ parent: n, child: c });
      walk(c);
    }
  }
  nodes.forEach(walk);
  return edges;
}

// ── Status dot colors ────────────────────────────────────────────────────────

const statusDotColor: Record<string, string> = {
  running: "#22d3ee",
  active: "#4ade80",
  paused: "#facc15",
  idle: "#facc15",
  error: "#f87171",
  terminated: "#a3a3a3",
};
const defaultDotColor = "#a3a3a3";

const adapterLabels: Record<string, string> = {
  claude_local: "Claude",
  codex_local: "Codex",
  gemini_local: "Gemini",
  opencode_local: "OpenCode",
  cursor: "Cursor",
  openclaw_gateway: "OpenClaw Gateway",
  process: "Process",
  http: "HTTP",
};

const roleLabels = AGENT_ROLE_LABELS as Record<string, string>;
function roleLabel(role: string): string {
  return roleLabels[role] ?? role;
}

// ── Main component ────────────────────────────────────────────────────────────

export function OrgChart() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();

  const { data: orgTree, isLoading } = useQuery({
    queryKey: queryKeys.org(selectedCompanyId!),
    queryFn: () => agentsApi.org(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agentsList } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: membersData } = useQuery({
    queryKey: queryKeys.access.members(selectedCompanyId!),
    queryFn: () => accessApi.listCompanyMembers(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const agentMap = useMemo(() => {
    const m = new Map<string, Agent>();
    for (const a of agentsList ?? []) m.set(a.id, a);
    return m;
  }, [agentsList]);

  const humanMembers = useMemo(
    () => (membersData ?? []).filter((m) => m.principalType === "user"),
    [membersData],
  );

  useEffect(() => {
    setBreadcrumbs([{ label: "Org Chart" }]);
  }, [setBreadcrumbs]);

  // Build unified tree
  const unifiedRoots = useMemo(
    () => buildUnifiedTree(orgTree ?? [], humanMembers, agentsList ?? []),
    [orgTree, humanMembers, agentsList],
  );

  const layout = useMemo(() => layoutForest(unifiedRoots), [unifiedRoots]);
  const allNodes = useMemo(() => flattenLayout(layout), [layout]);
  const edges = useMemo(() => collectEdges(layout), [layout]);

  // Compute SVG bounds
  const bounds = useMemo(() => {
    if (allNodes.length === 0) return { width: 800, height: 600 };
    let maxX = 0, maxY = 0;
    for (const n of allNodes) {
      maxX = Math.max(maxX, n.x + CARD_W);
      maxY = Math.max(maxY, n.y + n.h);
    }
    return { width: maxX + PADDING, height: maxY + PADDING };
  }, [allNodes]);

  // Pan & zoom
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const hasInitialized = useRef(false);
  useEffect(() => {
    if (hasInitialized.current || allNodes.length === 0 || !containerRef.current) return;
    hasInitialized.current = true;
    const container = containerRef.current;
    const cW = container.clientWidth;
    const cH = container.clientHeight;
    const scaleX = (cW - 40) / bounds.width;
    const scaleY = (cH - 40) / bounds.height;
    const fitZoom = Math.min(scaleX, scaleY, 1);
    const chartW = bounds.width * fitZoom;
    const chartH = bounds.height * fitZoom;
    setZoom(fitZoom);
    setPan({ x: (cW - chartW) / 2, y: (cH - chartH) / 2 });
  }, [allNodes, bounds]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-org-card]")) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setPan({
      x: dragStart.current.panX + (e.clientX - dragStart.current.x),
      y: dragStart.current.panY + (e.clientY - dragStart.current.y),
    });
  }, [dragging]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(Math.max(zoom * factor, 0.2), 2);
    const scale = newZoom / zoom;
    setPan({ x: mouseX - scale * (mouseX - pan.x), y: mouseY - scale * (mouseY - pan.y) });
    setZoom(newZoom);
  }, [zoom, pan]);

  function fitToScreen() {
    if (!containerRef.current) return;
    const cW = containerRef.current.clientWidth;
    const cH = containerRef.current.clientHeight;
    const scaleX = (cW - 40) / bounds.width;
    const scaleY = (cH - 40) / bounds.height;
    const fitZoom = Math.min(scaleX, scaleY, 1);
    setZoom(fitZoom);
    setPan({ x: (cW - bounds.width * fitZoom) / 2, y: (cH - bounds.height * fitZoom) / 2 });
  }

  function zoomBy(factor: number) {
    const newZoom = Math.min(Math.max(zoom * factor, 0.2), 2);
    const container = containerRef.current;
    if (container) {
      const cx = container.clientWidth / 2;
      const cy = container.clientHeight / 2;
      const scale = newZoom / zoom;
      setPan({ x: cx - scale * (cx - pan.x), y: cy - scale * (cy - pan.y) });
    }
    setZoom(newZoom);
  }

  if (!selectedCompanyId) {
    return <EmptyState icon={Network} message="Select a company to view the org chart." />;
  }
  if (isLoading) return <PageSkeleton variant="org-chart" />;
  if (orgTree && orgTree.length === 0 && humanMembers.length === 0) {
    return <EmptyState icon={Network} message="No organizational hierarchy defined." />;
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-[calc(100dvh-6rem)] overflow-hidden relative bg-muted/20 border border-border rounded-lg"
      style={{ cursor: dragging ? "grabbing" : "grab" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
        <button className="w-7 h-7 flex items-center justify-center bg-background border border-border rounded text-sm hover:bg-accent transition-colors" onClick={() => zoomBy(1.2)} aria-label="Zoom in">+</button>
        <button className="w-7 h-7 flex items-center justify-center bg-background border border-border rounded text-sm hover:bg-accent transition-colors" onClick={() => zoomBy(0.8)} aria-label="Zoom out">&minus;</button>
        <button className="w-7 h-7 flex items-center justify-center bg-background border border-border rounded text-[10px] hover:bg-accent transition-colors" onClick={fitToScreen} title="Fit to screen" aria-label="Fit chart to screen">Fit</button>
      </div>

      {/* SVG edges */}
      <svg className="absolute inset-0 pointer-events-none" style={{ width: "100%", height: "100%" }}>
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {edges.map(({ parent, child }) => {
            const x1 = parent.x + CARD_W / 2;
            const y1 = parent.y + parent.h;
            const x2 = child.x + CARD_W / 2;
            const y2 = child.y;
            const midY = (y1 + y2) / 2;
            return (
              <path
                key={`${parent.id}-${child.id}`}
                d={`M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`}
                fill="none"
                stroke="var(--border)"
                strokeWidth={1.5}
              />
            );
          })}
        </g>
      </svg>

      {/* Card layer */}
      <div
        className="absolute inset-0"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
      >
        {allNodes.map((node) => {
          if (node.nodeType === "human") {
            const userId = node.id.replace("user:", "");
            return (
              <div key={node.id} className="absolute" style={{ left: node.x, top: node.y, width: CARD_W }}>
                <div
                  data-org-card
                  className="bg-card border border-blue-200/60 dark:border-blue-800/40 rounded-lg shadow-sm hover:shadow-md hover:border-blue-400/60 transition-[box-shadow,border-color] duration-150 cursor-pointer select-none"
                  style={{ height: HUMAN_CARD_H }}
                  onClick={() => navigate(`../members/${userId}`)}
                >
                  <div className="flex items-center px-4 py-3 gap-3 h-full">
                    <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                      <User className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex flex-col items-start min-w-0 flex-1">
                      <span className="text-sm font-semibold text-foreground leading-tight truncate w-full">{node.name}</span>
                      <span className="text-[11px] text-blue-600/80 dark:text-blue-400/80 leading-tight mt-0.5 capitalize">{node.subtitle}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          // Agent card
          const agentId = node.id.replace("agent:", "");
          const agent = agentMap.get(agentId);
          const dotColor = statusDotColor[node.status] ?? defaultDotColor;

          return (
            <div key={node.id} className="absolute" style={{ left: node.x, top: node.y, width: CARD_W }}>
              <div
                data-org-card
                className="bg-card border border-border rounded-lg shadow-sm hover:shadow-md hover:border-foreground/20 transition-[box-shadow,border-color] duration-150 cursor-pointer select-none"
                style={{ height: CARD_H }}
                onClick={() => navigate(agent ? agentUrl(agent) : `agents/${agentId}`)}
              >
                <div className="flex items-center px-4 py-3 gap-3 h-full">
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                      <AgentIcon icon={agent?.icon} className="h-4.5 w-4.5 text-foreground/70" />
                    </div>
                    <span
                      className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card"
                      style={{ backgroundColor: dotColor }}
                    />
                  </div>
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <span className="text-sm font-semibold text-foreground leading-tight">{node.name}</span>
                    <span className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                      {agent?.title ?? roleLabel(node.subtitle)}
                    </span>
                    {agent && (
                      <span className="text-[10px] text-muted-foreground/60 font-mono leading-tight mt-1">
                        {adapterLabels[agent.adapterType] ?? agent.adapterType}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
