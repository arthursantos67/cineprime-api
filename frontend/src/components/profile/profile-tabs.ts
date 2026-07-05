export const PROFILE_TAB_VALUES = [
  "dados",
  "seguranca",
  "ingressos",
  "carteira",
  "conta",
] as const;

export type ProfileTabValue = (typeof PROFILE_TAB_VALUES)[number];

export const DEFAULT_PROFILE_TAB: ProfileTabValue = "dados";

export function isProfileTabValue(value: unknown): value is ProfileTabValue {
  return PROFILE_TAB_VALUES.includes(value as ProfileTabValue);
}

export function getProfileTabFromSearchParams(
  searchParams: Pick<URLSearchParams, "get"> | null
): ProfileTabValue {
  const tab = searchParams?.get("tab");
  return isProfileTabValue(tab) ? tab : DEFAULT_PROFILE_TAB;
}

export function buildProfileTabHref(
  tab: ProfileTabValue,
  extraParams: Record<string, string> = {}
) {
  const searchParams = new URLSearchParams({ tab, ...extraParams });
  return `/profile?${searchParams.toString()}`;
}
