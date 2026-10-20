import { classer, type ParametresClassement } from "@/domain/classement";
import type { CandidatMoteur } from "@/domain/entrees";
import { lieuValide, sourceDe } from "@/domain/generation";
import type { Trajet } from "@/domain/planification";
import type { Point, Relectures } from "@/domain/relectures";

/**
 * Candidats offerts à l'idée « Surprends-moi » de l'aperçu (décision 0105 § 5.1 point 2, 0106 § 1) : fonction pure, sans
 * appel ni configuration (la borne est passée en paramètre). Elle ne choisit pas l'idée : `ideeDuJour` le fait au second
 * passage de `generer`, avec son filtre R1 et ses exclusions ; elle borne seulement l'ensemble offert, pour borner le coût.
 *
 * Pour chaque jour planifié, dans l'ordre : candidats `place` ancrés et notés, admissibles à R1 hors la raison (pas encore
 * écrite) : lieu **valide à la relecture** (`lieuValide`) et au moins une source `https:` (`sourceDe`) ; absents du plan
 * (identifiant et lieu, tous jours confondus, comme les exclusions d'`ideeDuJour`) ; pas déjà offerts pour un jour
 * précédent (dédoublonnage entre jours, par identifiant et par lieu) ; classés par `classer` (type `surprise`, trajet mesuré
 * depuis le `logementArrivee` **de ce jour**, égalités par identifiant) ; les `parJour` premiers. Un candidat sans trajet
 * connu depuis ce logement n'est pas classé (`classer` l'écarte), donc pas offert pour ce jour.
 *
 * Relectures et trajet sont ceux du premier passage (mêmes objets, aucune mesure redemandée). Sortie : liste plate (jour 1
 * puis jour 2, dans l'ordre du classement), sans doublon ; l'entrée n'est pas modifiée.
 */

export type JourPourIdees = {
  /** Nuit du logement du soir (index dans les nuits), comme `JourSquelette.logementArrivee`. */
  readonly logementArrivee: number;
  /** Identifiants des candidats retenus par le plan ce jour-là. */
  readonly ids: readonly string[];
  /** Lieux (`placeId`) de ses étapes et de ses événements. */
  readonly lieux: readonly string[];
};

export type EntreeCandidatsDIdees = {
  readonly jours: readonly JourPourIdees[];
  readonly candidats: readonly CandidatMoteur[];
  readonly relectures: Relectures;
  readonly trajet: Trajet;
  readonly parametres: ParametresClassement;
  /** `IDEES_PAR_JOUR` de la configuration. */
  readonly parJour: number;
};

export function candidatsDIdees(entree: EntreeCandidatsDIdees): CandidatMoteur[] {
  const parJour = Math.max(0, Math.floor(entree.parJour));
  const idsExclus = new Set(entree.jours.flatMap((jour) => jour.ids));
  const lieuxExclus = new Set(entree.jours.flatMap((jour) => jour.lieux));
  const admissibles = entree.candidats.filter(
    (candidat) => lieuValide(entree.relectures, candidat.placeId) && sourceDe(candidat) !== undefined && !idsExclus.has(candidat.id) && !lieuxExclus.has(candidat.placeId),
  );
  const offerts: CandidatMoteur[] = [];
  const idsOfferts = new Set<string>();
  const lieuxOfferts = new Set<string>();
  if (parJour === 0) return offerts;
  for (const jour of entree.jours) {
    const logement: Point = { logement: jour.logementArrivee };
    const restants = admissibles.filter((candidat) => !idsOfferts.has(candidat.id) && !lieuxOfferts.has(candidat.placeId as string));
    const classes = classer(restants, "surprise", (candidat) => (candidat.placeId === undefined ? undefined : entree.trajet(logement, { lieu: candidat.placeId })?.minutes), entree.parametres);
    let pris = 0;
    for (const candidat of classes) {
      if (pris >= parJour) break;
      const placeId = candidat.placeId as string;
      // Deux candidats sur le même lieu dans un même jour : le mieux classé seulement.
      if (lieuxOfferts.has(placeId)) continue;
      idsOfferts.add(candidat.id);
      lieuxOfferts.add(placeId);
      offerts.push(candidat);
      pris += 1;
    }
  }
  return offerts;
}
