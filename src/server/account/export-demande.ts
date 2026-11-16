import "server-only";

import type { AdapterContext, MemberRole } from "@/adapters/types";
import type { Result } from "@/contracts";
import { errorNameOf, logEvent } from "@/server/log";
import type { RateLimitVerdict } from "@/server/rate-limit";

import { EXPORT_TAILLE_MAX_OCTETS, ExportTropVolumineuxError, nomFichierExport, type ResultatExport, serialiserExport } from "./export";

/**
 * Cœur **unique** de « Exporter mes données » (M9a, M9c ; spécification M9 § 3.5, § 6.2 et § 6.4, critère 3 ; revue
 * consolidée du head `797df67`, bloquant 1), appelé par les deux points d'entrée :
 * - la route `GET /api/v1/compte/export` (`src/server/routes/compte-export.ts`), qui n'ajoute que les refus propres à HTTP
 *   (demande intersite, préchargement, paramètre dans l'adresse) et traduit les codes en statuts ;
 * - l'action `exportAccount` (`src/server/actions/compte.ts`), pour l'écran « Ton compte » (le régime de confinement de
 *   `src/features` n'admet pas de `fetch` vers la route).
 * Un contrôle ne s'écrit qu'ici ; le compteur du limiteur (`export`, par personne) est le même pour les deux.
 *
 * Aucune entrée : l'organisation et la personne viennent de la session seule. Contrôles, tous avant la moindre lecture de
 * l'export :
 * 1. adaptateur `api` et connexion réelle, sinon `not_found` ;
 * 2. session, sinon `unauthenticated` ;
 * 3. rôle `owner`, sinon `forbidden` ;
 * 4. organisation personnelle à un seul membre (M9-PO-2), sinon `forbidden` ;
 * 5. connexion récente (moins de 10 minutes), sinon `reauthentication_required` ;
 * 6. limite `export` par personne, sinon `rate_limited` : seul refus qui débite ;
 * 7. fichier construit dans une transaction en lecture ; échec, ou taille au-delà de `EXPORT_TAILLE_MAX_OCTETS` :
 *    `internal` et une ligne `compte.export_failed` (`errorName` seul).
 * Une exception d'un contrôle donne `internal`. Aucune copie, aucun journal du contenu, aucune mesure.
 */

/** Nom d'action du limiteur (`src/server/config/limites.ts`) : un seul compteur pour la route et l'action. */
export const ACTION_LIMITEUR_EXPORT = "export";

export type FichierExport = { fileName: string; content: string };

export type SessionDemandeExport = { readonly sessionId: string; readonly userId: string; readonly organizationId: string; readonly role: MemberRole };

/** Dépendances du cœur, injectables par les tests (aucune base, aucun `process.env`). */
export type DependancesDemandeExport = {
  readonly disponible: () => boolean;
  readonly session: () => Promise<SessionDemandeExport | null>;
  readonly organisationAdmise: (ctx: AdapterContext) => Promise<boolean>;
  readonly connexionRecente: (sessionId: string, maintenant: Date) => Promise<boolean>;
  readonly limiteur: (userId: string) => Promise<RateLimitVerdict>;
  readonly construire: (ctx: AdapterContext, maintenant: Date) => Promise<ResultatExport>;
  readonly maintenant: () => Date;
};

const refus = (code: "not_found" | "unauthenticated" | "forbidden" | "reauthentication_required"): Result<never> => ({ ok: false, error: { code } });

function echec(erreur: unknown): Result<never> {
  const errorName = errorNameOf(erreur);
  logEvent("compte.export_failed", errorName === undefined ? {} : { errorName }, "error");
  return { ok: false, error: { code: "internal", retryable: true } };
}

export async function exporterMonCompte(d: DependancesDemandeExport): Promise<Result<FichierExport>> {
  if (!d.disponible()) return refus("not_found");
  try {
    const session = await d.session();
    if (session === null) return refus("unauthenticated");
    const ctx: AdapterContext = { organizationId: session.organizationId, userId: session.userId, role: session.role };
    if (ctx.role !== "owner") return refus("forbidden");
    if (!(await d.organisationAdmise(ctx))) return refus("forbidden");
    const maintenant = d.maintenant();
    if (!(await d.connexionRecente(session.sessionId, maintenant))) return refus("reauthentication_required");
    if (!(await d.limiteur(ctx.userId)).ok) return { ok: false, error: { code: "rate_limited", retryable: true } };
    const resultat = await d.construire(ctx, maintenant);
    if (!resultat.ok) return refus(resultat.code);
    const content = serialiserExport(resultat.value);
    if (Buffer.byteLength(content, "utf8") > EXPORT_TAILLE_MAX_OCTETS) throw new ExportTropVolumineuxError();
    return { ok: true, value: { fileName: nomFichierExport(maintenant), content } };
  } catch (erreur) {
    return echec(erreur);
  }
}
