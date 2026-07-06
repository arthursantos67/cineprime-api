"use client";

import { useCallback, useMemo } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { MyTicketsClient } from "@/components/tickets/MyTicketsClient";
import { Tabs } from "@/components/ui/Tabs";
import { useI18n } from "@/i18n";

import { ProfileDetailsSection } from "./ProfileDetailsSection";
import {
  getProfileTabFromSearchParams,
  type ProfileTabValue,
} from "./profile-tabs";
import { SecuritySection } from "./SecuritySection";
import { WalletSection } from "./WalletSection";

export function ProfileTabsClient() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  const activeTab = useMemo(
    () => getProfileTabFromSearchParams(searchParams),
    [searchParams]
  );

  const handleTabChange = useCallback(
    (value: string) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("tab", value);

      // Ticket filters (?type=) only make sense inside the tickets tab.
      if (value !== "ingressos") {
        nextParams.delete("type");
      }

      router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const items: { content: React.ReactNode; label: string; value: ProfileTabValue }[] = [
    { content: <ProfileDetailsSection />, label: t("profile.tabDetails"), value: "dados" },
    { content: <SecuritySection />, label: t("profile.tabSecurity"), value: "seguranca" },
    { content: <MyTicketsClient />, label: t("profile.tabTickets"), value: "ingressos" },
    { content: <WalletSection />, label: t("profile.tabWallet"), value: "carteira" },
  ];

  return (
    <Tabs
      ariaLabel={t("profile.tabsAriaLabel")}
      items={items}
      onValueChange={handleTabChange}
      value={activeTab}
    />
  );
}
