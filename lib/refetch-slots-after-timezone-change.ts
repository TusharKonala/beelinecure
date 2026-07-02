import type { QueryClient } from "@tanstack/react-query";

/**
 * Clears cached slot data and refetches so the grid shows a loading state
 * immediately after a doctor timezone change (instead of stale keepPreviousData).
 */
export async function refetchSlotsAfterTimezoneChange(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
) {
  queryClient.removeQueries({ queryKey, exact: true });
  await queryClient.refetchQueries({ queryKey, type: "active" });
}
