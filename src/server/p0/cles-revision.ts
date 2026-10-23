import "server-only";

import { createHash } from "node:crypto";

/**
 * Clés d'idempotence des révisions d'un voyage de l'app (spécification E2E-essai, lot 4 ; décision 0126 § 2) : la k-ième
 * révision d'un voyage (une seule aujourd'hui, décision 0126 § 2) a **toujours** la même clé `request_id`
 * (`prototype.run_briefs`, unique par organisation), tirée de l'identifiant du voyage et du rang. La base garde donc au plus une exécution par rang : un voyage n'a jamais plus de
 * `nombre` révisions, même arrêtées, et deux demandes simultanées du même rang se résolvent par l'idempotence de la
 * réservation (la seconde trouve l'exécution de la première). Pur, sans lecture ni réseau.
 *
 * Forme : empreinte SHA-256 de `vadrouille:revision:<tripId>:<k>`, mise en forme d'UUID (version 8, variante RFC 9562).
 * Aucun secret n'y entre : la clé ne protège rien, elle numérote.
 */
export function clesRevision(tripId: string, nombre: number): string[] {
  return Array.from({ length: nombre }, (_, rang) => {
    const octets = createHash("sha256").update(`vadrouille:revision:${tripId}:${rang + 1}`, "utf8").digest().subarray(0, 16);
    octets[6] = ((octets[6] ?? 0) & 0x0f) | 0x80;
    octets[8] = ((octets[8] ?? 0) & 0x3f) | 0x80;
    const hex = octets.toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  });
}
