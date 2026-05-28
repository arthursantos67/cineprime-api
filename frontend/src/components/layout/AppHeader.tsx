"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "@/contexts/AuthContext";
import { Button, ButtonLink } from "@/components/ui/Button";
import { cn } from "@/components/ui/classNames";

const navigationItems = [
  { href: "/", label: "Início" },
  { href: "/#catalogo", label: "Catálogo" },
];

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
  const { isAuthenticated, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-10 border-b border-white/[0.07] bg-[rgb(10_13_20/0.97)] [backdrop-filter:blur(20px)]">
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
            aria-label="CinePrime, início"
            className="inline-flex items-center gap-2.5 text-[18px] font-[850] text-white"
            href="/"
          >
            <span
              aria-hidden="true"
              className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[6px] bg-brand text-[12px] font-[850] text-white"
            >
              CP
            </span>
            <span>CinePrime</span>
          </Link>
          <span
            aria-label="Cinema selecionado: CinePrime Natal"
            className="inline-flex items-center gap-1.5 rounded-pill border border-white/10 bg-white/[0.08] px-2.5 py-1.5 text-[12px] font-[750] leading-none text-white/60 whitespace-nowrap transition-colors hover:bg-white/[0.12] hover:text-white/80 max-[420px]:hidden"
          >
            <span aria-hidden="true">&#x1F4CD;</span>
            Natal
          </span>
        </div>

        {/* Nav */}
        <nav
          aria-label="Navegação principal"
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
                  "rounded-[6px] px-3 py-2.5 text-sm font-bold leading-none whitespace-nowrap transition-colors",
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
          aria-label="Ações da conta"
          className="flex flex-wrap items-center justify-end gap-2 max-md:py-3 max-md:col-start-2 max-md:row-start-1"
          role="group"
        >
          {isAuthenticated ? (
            <>
              <ButtonLink
                className="border-white/[0.16] text-white/80 hover:bg-white/10 hover:border-white/[0.24] hover:text-white"
                href="/my-tickets"
                variant="ghost"
              >
                Meus ingressos
              </ButtonLink>
              <Button
                className="border-white/[0.16] text-white/80 hover:bg-white/10 hover:border-white/[0.24] hover:text-white"
                onClick={signOut}
                variant="ghost"
              >
                Sair
              </Button>
            </>
          ) : (
            <>
              <ButtonLink
                className="border-white/[0.16] text-white/80 hover:bg-white/10 hover:border-white/[0.24] hover:text-white"
                href="/login"
                variant="ghost"
              >
                Entrar
              </ButtonLink>
              <ButtonLink href="/register" variant="primary">
                Criar conta
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
