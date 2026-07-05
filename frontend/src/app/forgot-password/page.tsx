import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { PageSection } from "@/components/ui/PageSection";
import { StateMessage } from "@/components/ui/StateMessage";
import { getServerLocale, getTranslator } from "@/i18n/server";

export default async function ForgotPasswordPage() {
  const t = getTranslator(await getServerLocale());

  return (
    <PageSection
      description={t("auth.forgotPasswordPageDescription")}
      eyebrow={t("auth.eyebrow")}
      title={t("auth.forgotPassword")}
    >
      <ForgotPasswordForm />
      <StateMessage title={t("auth.haveAccount")}>
        <Link className="text-link" href="/login">
          {t("auth.loginLink")}
        </Link>
      </StateMessage>
    </PageSection>
  );
}
