import { prototypeRelectures } from "@/adapters";
import { devPagesEnabled } from "@/dev/flags";

/**
 * Compteur du relecteur simulé de l'adaptateur `prototype`, pour l'e2e « prototype sans cache » (décision 0032
 * § A6.6) : `{ "relectures": n }`. 404 sauf si les pages de développement **et** la liste blanche du prototype
 * sont ouvertes. Lu par `@/adapters`, jamais par un import de `src/mocks` (règle F1).
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const relectures = devPagesEnabled() ? prototypeRelectures() : null;
  if (relectures === null) return new Response(null, { status: 404 });
  return Response.json({ relectures }, { headers: { "Cache-Control": "private, no-store" } });
}
