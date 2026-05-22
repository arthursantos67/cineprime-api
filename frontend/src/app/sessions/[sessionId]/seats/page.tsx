import { SeatMap } from "@/components/seats/SeatMap";
import { PageSection } from "@/components/ui/PageSection";

type SeatSelectionPageProps = {
  params: Promise<{
    sessionId: string;
  }>;
};

export default async function SeatSelectionPage({
  params,
}: SeatSelectionPageProps) {
  const { sessionId } = await params;

  return (
    <PageSection
      description="Consulte a disposição da sala, veja os estados dos assentos e navegue pelo mapa com teclado ou toque."
      eyebrow="Sessão"
      title="Mapa de assentos"
    >
      <SeatMap sessionId={sessionId} />
    </PageSection>
  );
}
