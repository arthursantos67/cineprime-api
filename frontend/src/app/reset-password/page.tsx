import { Suspense } from "react";

import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { PageSection } from "@/components/ui/PageSection";
import { StateMessage } from "@/components/ui/StateMessage";
import { getServerLocale, getTranslator } from "@/i18n/server";

export default async function ResetPasswordPage() {
  const t = getTranslator(await getServerLocale());

  return (
    <PageSection
      description={t("auth.resetPasswordPageDescription")}
      eyebrow={t("auth.eyebrow")}
      title={t("auth.resetPassword")}
    >
      <Suspense
        fallback={
          <StateMessage tone="loading" title={t("auth.checkingAccess")}>
            {t("auth.checkingAccessDescription")}
          </StateMessage>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </PageSection>
  );
}
