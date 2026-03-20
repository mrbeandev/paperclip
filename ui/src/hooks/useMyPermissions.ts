import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { accessApi } from "../api/access";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";

/**
 * Returns the current user's permission set for the selected company.
 * Fetches once and caches for 30 seconds.
 *
 * Usage:
 *   const { hasPermission } = useMyPermissions();
 *   if (hasPermission("projects:create")) { ... }
 */
export function useMyPermissions() {
  const { selectedCompanyId } = useCompany();

  const { data: permissions, isLoading } = useQuery({
    queryKey: queryKeys.access.myPermissions(selectedCompanyId!),
    queryFn: () => accessApi.getMyPermissions(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
  });

  const hasPermission = useCallback(
    (key: string) => (permissions ?? []).includes(key),
    [permissions],
  );

  return {
    permissions: permissions ?? [],
    hasPermission,
    isLoading,
  };
}
