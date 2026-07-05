"use client";

import { useState } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { authApi } from "@/api/auth";
import { getApiErrorUserMessage } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/classNames";
import { LogoCp } from "@/components/ui/LogoCp";
import { useI18n } from "@/i18n";

import { LanguageSwitcher } from "./LanguageSwitcher";

function UnverifiedEmailBanner() {
  const { locale, t } = useI18n();
  const [status, setStatus] = useState<"error" | "idle" | "sending" | "sent">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleResend() {
    setStatus("sending");
    try {
      await authApi.resendVerificationEmail();
      setStatus("sent");
    } catch (error) {
      setErrorMessage(getApiErrorUserMessage(error, locale));
      setStatus("error");
    }
  }

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-2 border-b border-white/[0.07] bg-[rgb(180_120_24/0.16)] px-[var(--layout-gutter)] py-2 text-center text-sm font-bold text-white/80"
      role="status"
    >
      <span>
        {status === "sent"
          ? t("auth.emailVerificationResent")
          : status === "error"
            ? errorMessage
            : t("auth.emailNotVerified")}
      </span>
      {status !== "sent" ? (
        <button
          className="font-extrabold text-link underline-offset-2 hover:underline disabled:opacity-60"
          disabled={status === "sending"}
          onClick={handleResend}
          type="button"
        >
          {t("auth.resendVerification")}
        </button>
      ) : null}
    </div>
  );
}

function isActiveLink(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  if (href.startsWith("/#")) {
    return false;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppHeader() {
  const pathname = usePathname();
  const { isAuthenticated, signOut, user } = useAuth();
  const { t } = useI18n();
  const isAdmin = isAuthenticated && Boolean(user?.is_staff);
  const showUnverifiedBanner = isAuthenticated && user?.is_verified === false;
  const navigationItems = [
    { href: "/", label: t("nav.home") },
    { href: "/#catalogo", label: t("nav.catalog") },
  ];

  return (
    <header className="sticky top-0 z-10 border-b border-white/[0.07] bg-[rgb(10_13_20/0.97)] [backdrop-filter:blur(20px)]">
      {showUnverifiedBanner ? <UnverifiedEmailBanner /> : null}
      <div
        className={cn(
          "w-full px-[var(--layout-gutter)] grid items-center gap-4",
          "grid-cols-[auto_minmax(0,1fr)_auto] min-h-[var(--header-height)]",
          "max-md:grid-cols-[1fr_auto] max-md:grid-rows-[auto_auto] max-md:gap-x-4 max-md:gap-y-0 max-md:min-h-0"
        )}
      >
        {/* Brand */}
        <div className="inline-flex items-center gap-2.5 min-w-max max-md:py-3 max-md:col-start-1 max-md:row-start-1">
          <Link
            aria-label={t("nav.logo")}
            className="inline-flex items-center gap-2.5 text-[18px] font-[850] text-white"
            href="/"
          >
            <LogoCp className="h-[34px] w-[34px]" />
            <span>Cine Prime</span>
          </Link>
          <span
            aria-label={t("nav.venue")}
            className="inline-flex items-center gap-1.5 rounded-pill border border-white/10 bg-white/[0.08] px-2.5 py-1.5 text-[12px] font-[750] leading-none text-white/60 whitespace-nowrap transition-colors hover:bg-white/[0.12] hover:text-white/80 max-[420px]:hidden"
          >
            <span aria-hidden="true">&#x1F4CD;</span>
            Natal
          </span>
        </div>

        {/* Nav */}
        <nav
          aria-label={t("nav.main")}
          className={cn(
            "flex flex-wrap items-center gap-2 justify-center min-w-0",
            "max-md:col-span-full max-md:row-start-2",
            "max-md:border-t max-md:border-white/[0.06]",
            "max-md:overflow-x-auto max-md:flex-nowrap max-md:justify-start",
            "max-md:py-1 max-md:[scrollbar-width:none]"
          )}
        >
          {navigationItems.map((item) => {
            const isActive = isActiveLink(pathname, item.href);

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "rounded-[6px] px-3 py-2.5 text-sm font-bold leading-none whitespace-nowrap transition duration-150 active:scale-[0.97]",
                  isActive
                    ? "bg-white/[0.08] text-white"
                    : "text-white/60 hover:bg-white/[0.08] hover:text-white"
                )}
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Actions */}
        <div
          aria-label={t("nav.accountActions")}
          className="flex flex-wrap items-center justify-end gap-2 max-md:py-3 max-md:col-start-2 max-md:row-start-1"
          role="group"
        >
          <LanguageSwitcher />
          {isAuthenticated ? (
            <>
              {isAdmin && (
                <ButtonLink
                  className="border-white/[0.16] text-white/80 hover:bg-white/10 hover:border-white/[0.24] hover:text-white"
                  href="/admin"
                  variant="ghost"
                >
                  {t("common.admin")}
                </ButtonLink>
              )}
              <ButtonLink
                className="border-white/[0.16] text-white/80 hover:bg-white/10 hover:border-white/[0.24] hover:text-white"
                href="/my-tickets"
                variant="ghost"
              >
                {t("nav.myTickets")}
              </ButtonLink>
              <Button
                className="border-white/[0.16] text-white/80 hover:bg-white/10 hover:border-white/[0.24] hover:text-white"
                onClick={signOut}
                variant="ghost"
              >
                {t("nav.signOut")}
              </Button>
            </>
          ) : (
            <>
              <ButtonLink
                className="border-white/[0.16] text-white/80 hover:bg-white/10 hover:border-white/[0.24] hover:text-white"
                href="/login"
                variant="ghost"
              >
                {t("auth.login")}
              </ButtonLink>
              <ButtonLink href="/register" variant="primary">
                {t("auth.createAccount")}
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
