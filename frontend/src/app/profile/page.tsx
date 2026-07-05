import { Suspense } from "react";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ProfileTabsClient } from "@/components/profile/ProfileTabsClient";
import { PageSection } from "@/components/ui/PageSection";
import { StateMessage } from "@/components/ui/StateMessage";
import { getServerLocale, getTranslator } from "@/i18n/server";

export default async function ProfilePage() {
  const t = getTranslator(await getServerLocale());

  return (
    <ProtectedRoute>
      <PageSection
        description={t("profile.description")}
        eyebrow={t("profile.eyebrow")}
        title={t("profile.title")}
      >
        <Suspense
          fallback={
            <StateMessage tone="loading" title={t("profile.loadingTitle")}>
              {t("profile.loadingDescription")}
            </StateMessage>
          }
        >
          <ProfileTabsClient />
        </Suspense>
      </PageSection>
    </ProtectedRoute>
  );
}
