import { z } from "zod";

import { advanceClock, configurePayment, isScopeName, resetScope, simulationEnabled, SIMULATION_HEADER } from "@/adapters/simulation";

/**
 * `R-sim` : contrôle des simulations, tests seulement (décision 0017 § 10.5, créée par F9a avec
 * `configurePayment` selon 0020 § 6). 404 sans pages de développement ou sur un déploiement de production ;
 * 415 sans JSON ; 413 au-delà de 1 024 octets (annoncés par `content-length`, avant toute lecture, ou lus) ; 400 hors schéma ou sans portée explicite valide (la portée
 * par défaut n'est jamais modifiée).
 */

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1024;

const IsoInstantSchema = z.iso
  .datetime({ offset: true })
  .refine((value) => {
    const year = new Date(value).getUTCFullYear();
    return year >= 2020 && year <= 2100;
  });

const BodySchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("reset"), now: IsoInstantSchema }),
  z.strictObject({ action: z.literal("advanceClock"), ms: z.number().int().min(0).max(604_800_000) }),
  z.strictObject({ action: z.literal("configurePayment"), confirmationDelayMs: z.number().int().min(0).max(600_000) }),
]);

const empty = (status: number) => new Response(null, { status });

export async function POST(request: Request): Promise<Response> {
  if (!simulationEnabled()) return empty(404);
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return empty(415);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return empty(413);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return empty(413);
  const scope = request.headers.get(SIMULATION_HEADER);
  if (!isScopeName(scope)) return empty(400);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return empty(400);
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return empty(400);
  const body = parsed.data;
  switch (body.action) {
    case "reset":
      resetScope(scope, new Date(body.now).getTime());
      break;
    case "advanceClock":
      advanceClock(scope, body.ms);
      break;
    case "configurePayment":
      configurePayment(scope, body.confirmationDelayMs);
      break;
  }
  return empty(204);
}
