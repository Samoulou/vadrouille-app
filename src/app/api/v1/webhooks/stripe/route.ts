import { webhookStripe } from "@/server/routes/stripe-webhook";

/**
 * Webhook Stripe en mode test (spécification B4, B4c point 5 ; décision 0140 § 2.1) : tout est dans `src/server/routes/` ;
 * ce fichier n'importe rien d'autre de `src/server` (`ligne/route-handlers`). Les sept méthodes mènent au même
 * gestionnaire, pour que la route fermée réponde `404` à toute méthode (Next.js répondrait sinon `405` ou traiterait
 * `OPTIONS`).
 */

export const dynamic = "force-dynamic";

export const GET = webhookStripe;
export const HEAD = webhookStripe;
export const POST = webhookStripe;
export const PUT = webhookStripe;
export const PATCH = webhookStripe;
export const DELETE = webhookStripe;
export const OPTIONS = webhookStripe;
