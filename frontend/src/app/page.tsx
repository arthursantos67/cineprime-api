import Link from "next/link";

import { HomeCatalog } from "./HomeCatalog";
import { PageSection } from "@/components/ui/PageSection";

export default function HomePage() {
  return (
    <PageSection
      actions={
        <>
          <Link className="button button-primary" href="#catalogo">
            Ver catálogo
          </Link>
          <Link className="button button-ghost" href="/login">
            Entrar
          </Link>
        </>
      }
      description="Encontre sessões em Natal, escolha seus assentos e avance para a compra de ingressos com uma experiência preparada para celular e desktop."
      eyebrow="Catálogo"
      title="Cinepolis Natal"
    >
      <HomeCatalog />
    </PageSection>
  );
}
