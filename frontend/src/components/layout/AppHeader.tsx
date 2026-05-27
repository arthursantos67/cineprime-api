"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "@/contexts/AuthContext";

const navigationItems = [
  { href: "/", label: "Início" },
  { href: "/#catalogo", label: "Catálogo" },
  { href: "/ticket-types", label: "Ingressos" },
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
    <header className="site-header">
      <div className="shell-container header-container">
        <Link className="brand-link" href="/" aria-label="CinePrime, início">
          <span className="brand-mark" aria-hidden="true">
            CP
          </span>
          <span>CinePrime</span>
        </Link>

        <nav className="primary-nav" aria-label="Navegação principal">
          {navigationItems.map((item) => {
            const isActive = isActiveLink(pathname, item.href);

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={isActive ? "nav-link nav-link-active" : "nav-link"}
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="header-actions" aria-label="Ações da conta" role="group">
          {isAuthenticated ? (
            <>
              <Link className="button button-secondary" href="/my-tickets">
                Meus ingressos
              </Link>
              <button className="button button-ghost" onClick={signOut} type="button">
                Sair
              </button>
            </>
          ) : (
            <>
              <Link className="button button-ghost" href="/login">
                Entrar
              </Link>
              <Link className="button button-primary" href="/register">
                Criar conta
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
