import { webhookSimule } from "@/server/routes/simulated-webhook";

/**
 * Webhook simulé (spécification B4, B4a point 4 ; décision 0097 B4-TL-11) : tout est dans `src/server/routes/` ; ce
 * fichier n'importe rien d'autre de `src/server` (`ligne/route-handlers`). Les sept méthodes mènent au même gestionnaire,
 * pour que la route fermée réponde `404` à toute méthode (Next.js répondrait sinon `405` ou traiterait `OPTIONS`).
 */

export const dynamic = "force-dynamic";

export const GET = webhookSimule;
export const HEAD = webhookSimule;
export const POST = webhookSimule;
export const PUT = webhookSimule;
export const PATCH = webhookSimule;
export const DELETE = webhookSimule;
export const OPTIONS = webhookSimule;
