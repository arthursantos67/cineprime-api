import { Suspense } from "react";

import { ConfirmEmailChangeStatus } from "@/components/auth/ConfirmEmailChangeStatus";
import { PageSection } from "@/components/ui/PageSection";
import { StateMessage } from "@/components/ui/StateMessage";
import { getServerLocale, getTranslator } from "@/i18n/server";

export default async function ConfirmEmailChangePage() {
  const t = getTranslator(await getServerLocale());

  return (
    <PageSection eyebrow={t("auth.eyebrow")} title={t("profile.emailChangeTitle")}>
      <Suspense
        fallback={
          <StateMessage tone="loading" title={t("auth.checkingAccess")}>
            {t("auth.checkingAccessDescription")}
          </StateMessage>
        }
      >
        <ConfirmEmailChangeStatus />
      </Suspense>
    </PageSection>
  );
}
