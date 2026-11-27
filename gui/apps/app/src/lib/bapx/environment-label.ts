import type { IconName } from "@cloudroom/shared-ui/icon";

export const LOCAL_PRIMARY_LABEL = "Local";
export const LOCAL_WORKTREE_LABEL = "Local Worktree";
export const CLOUD_PRIMARY_LABEL = "Cloud";
export const CLOUD_WORKTREE_LABEL = "Cloud Worktree";

export function environmentPresentation(
  providerId: string | null | undefined,
  place: "local" | "cloud",
): { label: string; icon: IconName } | null {
  if (providerId === "project-checkout") {
    return place === "cloud"
      ? { label: CLOUD_PRIMARY_LABEL, icon: "Cloud" }
      : { label: LOCAL_PRIMARY_LABEL, icon: "Laptop" };
  }
  if (providerId === "git-worktree") {
    return place === "cloud"
      ? { label: CLOUD_WORKTREE_LABEL, icon: "Cloud" }
      : { label: LOCAL_WORKTREE_LABEL, icon: "Laptop" };
  }
  return null;
}
