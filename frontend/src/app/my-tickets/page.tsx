import { redirect } from "next/navigation";

type MyTicketsPageProps = {
  searchParams: Promise<{ type?: string }>;
};

// /my-tickets is kept as a deep link into the unified profile area so that
// old bookmarks and emailed links keep working.
export default async function MyTicketsPage({ searchParams }: MyTicketsPageProps) {
  const { type } = await searchParams;
  const params = new URLSearchParams({ tab: "ingressos" });

  if (type === "upcoming" || type === "past") {
    params.set("type", type);
  }

  redirect(`/profile?${params.toString()}`);
}
