import type { Metadata } from "next";

import { SejourScreen, sejourMetadata } from "@/features/sejour/screens";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  return sejourMetadata(id);
}

/** Écran 11 « Séjour » (spécification F5). */
export default async function SejourPage({ params }: { params: Params }) {
  const { id } = await params;
  return <SejourScreen tripId={id} />;
}
