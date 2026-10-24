import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetOwnerAccessQueryKey, getGetOwnerSummaryQueryKey, getListOwnerAccountsQueryKey, getListBillingAdminOrdersQueryKey, useGetOwnerAccess } from "@workspace/api-client-react";

export const ownerFreshness = { staleTime: 30_000, gcTime: 0, refetchInterval: 60_000, retry: false as const };

export function useClearPrivilegedData(failed: boolean) {
  const cache = useQueryClient();
  useEffect(() => {
    if (!failed) return;
    for (const queryKey of [getGetOwnerSummaryQueryKey(), getListOwnerAccountsQueryKey(), getListBillingAdminOrdersQueryKey()]) {
      void cache.cancelQueries({ queryKey });
      // Active screens hide failed data themselves. Removing their observed query
      // here can recreate it immediately and loop on a persistent service error.
      // Unmounted privileged data is evicted (active queries also have gcTime: 0).
      cache.removeQueries({ queryKey, predicate: (query) => query.getObserversCount() === 0 });
    }
  }, [cache, failed]);
}

export function useOwnerAccess() {
  const access = useGetOwnerAccess({ query: { queryKey: getGetOwnerAccessQueryKey(), ...ownerFreshness } });
  const isOwner = !access.isError && access.data?.isOwner === true;
  useClearPrivilegedData(access.isError || access.data?.isOwner === false);
  return { ...access, isOwner };
}

export function ownerErrorStatus(error: unknown): number | undefined {
  return error && typeof error === "object" && "status" in error ? Number(error.status) : undefined;
}
