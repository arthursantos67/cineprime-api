import { HomeCatalog } from "./HomeCatalog";
import { ButtonLink } from "@/components/ui/Button";
import { PageSection } from "@/components/ui/PageSection";

export default function HomePage() {
  return (
    <PageSection
      actions={
        <>
          <ButtonLink href="#catalogo">
            Ver catálogo
          </ButtonLink>
          <ButtonLink href="/login" variant="ghost">
            Entrar
          </ButtonLink>
        </>
      }
      description="Encontre sessões em Natal, escolha seus assentos e avance para a compra de ingressos com uma experiência preparada para celular e desktop."
      eyebrow="Catálogo"
      title="CinePrime"
    >
      <HomeCatalog />
    </PageSection>
  );
}
