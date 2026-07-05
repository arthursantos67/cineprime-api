import { Suspense } from "react";

import { VerifyEmailStatus } from "@/components/auth/VerifyEmailStatus";
import { PageSection } from "@/components/ui/PageSection";
import { StateMessage } from "@/components/ui/StateMessage";
import { getServerLocale, getTranslator } from "@/i18n/server";

export default async function VerifyEmailPage() {
  const t = getTranslator(await getServerLocale());

  return (
    <PageSection eyebrow={t("auth.eyebrow")} title={t("auth.verifyEmailTitle")}>
      <Suspense
        fallback={
          <StateMessage tone="loading" title={t("auth.checkingAccess")}>
            {t("auth.checkingAccessDescription")}
          </StateMessage>
        }
      >
        <VerifyEmailStatus />
      </Suspense>
    </PageSection>
  );
}
