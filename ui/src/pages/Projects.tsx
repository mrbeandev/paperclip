import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { projectsApi } from "../api/projects";
import { accessApi } from "../api/access";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { authApi } from "../api/auth";
import { queryKeys } from "../lib/queryKeys";
import { EntityRow } from "../components/EntityRow";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { formatDate, projectUrl } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Hexagon, Plus } from "lucide-react";

export function Projects() {
  const { selectedCompanyId } = useCompany();
  const { openNewProject } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Projects" }]);
  }, [setBreadcrumbs]);

  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    retry: false,
  });

  const { data: members } = useQuery({
    queryKey: queryKeys.access.members(selectedCompanyId!),
    queryFn: () => accessApi.listCompanyMembers(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const isOwner = useMemo(() => {
    if (!session?.user || !members) return false;
    const me = members.find(
      (m) => m.principalType === "user" && m.principalId === session.user.id,
    );
    return me?.membershipRole === "owner";
  }, [session, members]);

  const { data: allProjects, isLoading, error } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const projects = useMemo(
    () => (allProjects ?? []).filter((p) => !p.archivedAt),
    [allProjects],
  );

  if (!selectedCompanyId) {
    return <EmptyState icon={Hexagon} message="Select a company to view projects." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4">
      {isOwner && (
        <div className="flex items-center justify-end">
          <Button size="sm" variant="outline" onClick={openNewProject}>
            <Plus className="h-4 w-4 mr-1" />
            Add Project
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {!isLoading && projects.length === 0 && (
        <EmptyState
          icon={Hexagon}
          message={isOwner ? "No projects yet." : "No projects assigned to you."}
          action={isOwner ? "Add Project" : undefined}
          onAction={isOwner ? openNewProject : undefined}
        />
      )}

      {projects.length > 0 && (
        <div className="border border-border">
          {projects.map((project) => (
            <EntityRow
              key={project.id}
              title={project.name}
              subtitle={project.description ?? undefined}
              to={projectUrl(project)}
              trailing={
                <div className="flex items-center gap-3">
                  {project.targetDate && (
                    <span className="text-xs text-muted-foreground">
                      {formatDate(project.targetDate)}
                    </span>
                  )}
                  <StatusBadge status={project.status} />
                </div>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
