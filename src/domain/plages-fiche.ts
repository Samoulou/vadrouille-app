import { INCONNU, type Inconnu, type Plage, type Relectures } from "./relectures";

/**
 * Plages d'ouverture d'une fiche relue pour une date (B8-PO-6 et B8-PO-7), **extraites sans changement de comportement**
 * de `versRelectures` (`src/server/relecture/relectures.ts`) pour être partagées avec la relecture des horaires à
 * l'affichage du prototype (décision 0116 § 5.3, T8 : réutiliser plutôt qu'écrire un troisième calcul ; la règle
 * `ligne/relecture-imports` interdit d'importer `@/server/relecture/*` depuis `src/server/p0`). Pure : aucune
 * entrée-sortie ; les valeurs (données Google) ne sortent jamais de la mémoire de l'appelant.
 *
 * - fiche absente, introuvable ou fermée définitivement : `inconnu` ;
 * - fermée temporairement : plages **vides** en `planification`, `inconnu` en `lecture` ;
 * - horaires absents ou date invalide : `inconnu` ;
 * - sinon, plages du jour de la semaine de la date ; une plage qui passe minuit finit à `1 440 + finLendemain` (≤ 2 880).
 */

export type UsagePlages = "planification" | "lecture";

/** Forme structurelle d'une issue de fiche (`IssueFiche` de `@/grounding/fiches`, que `src/domain` n'importe pas). */
export type FichePlages =
  | { readonly issue: "introuvable" }
  | {
      readonly issue: "chargee";
      readonly statut?: string;
      readonly horaires: readonly { readonly jour: number; readonly debut: number; readonly fin: number; readonly finLendemain?: number }[] | null;
    };

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Jour de la semaine d'une date AAAA-MM-JJ (0 = dimanche), ou `null` si la date est invalide. */
export function jourDeLaSemaine(date: string): number | null {
  const lu = DATE.exec(date);
  if (lu === null) return null;
  const [annee, mois, jour] = [Number(lu[1]), Number(lu[2]), Number(lu[3])];
  const instant = new Date(Date.UTC(annee, mois - 1, jour));
  if (instant.getUTCFullYear() !== annee || instant.getUTCMonth() !== mois - 1 || instant.getUTCDate() !== jour) return null;
  return instant.getUTCDay();
}

export function plagesDeFiche(fiche: FichePlages | undefined, date: string, usage: UsagePlages): readonly Plage[] | Inconnu {
  if (fiche === undefined || fiche.issue === "introuvable" || fiche.statut === "CLOSED_PERMANENTLY") return INCONNU;
  if (fiche.statut === "CLOSED_TEMPORARILY") return usage === "planification" ? [] : INCONNU;
  if (fiche.horaires === null) return INCONNU;
  const jour = jourDeLaSemaine(date);
  if (jour === null) return INCONNU;
  return fiche.horaires
    .filter((plage) => plage.jour === jour)
    .map((plage) => ({ debut: plage.debut, fin: plage.finLendemain === undefined ? plage.fin : Math.min(1440 + plage.finLendemain, 2880) }));
}

/**
 * Rangs des jours dont le lieu est **fermé pendant toute la fenêtre** (correction 1 de la PR #490, regroupement par
 * jour) : ses plages d'ouverture de la date sont connues et aucune ne recouvre `[debut, fin]` du jour. Horaires
 * inconnus : aucun jour (aucune contrainte, B5-PO-5). Extrait sans changement de `src/server/p0/vers-moteur.ts`
 * (décision 0116 § 5.3 : la règle `ligne/relecture-imports` et le graphe d'import de l'application ne permettent pas
 * à la relecture du prototype de l'importer depuis là ; `vers-moteur.ts` le réexporte).
 */
export function joursDeFermeture(
  relectures: Pick<Relectures, "plages">,
  placeId: string,
  jours: readonly { readonly date: string; readonly debut: number; readonly fin: number }[],
): number[] {
  return jours.flatMap((jour, rang) => {
    const plages = relectures.plages(placeId, jour.date);
    if (plages === INCONNU) return [];
    return plages.some((plage) => plage.debut < jour.fin && jour.debut < plage.fin) ? [] : [rang];
  });
}

/** Lieu tel que le relit la fiche Place Details (`DetailsLieu` de `@/grounding/interfaces`, forme structurelle). */
export type FicheRelue = {
  readonly statut?: string;
  readonly horaires: readonly { readonly jour: number; readonly debut: number; readonly fin: number; readonly finLendemain?: number }[] | null;
};

/**
 * Badge « à confirmer » d'un lieu relu pour une date (décision 0116 § 5.3, T8) : fermé définitivement, ou **fermé toute
 * la journée** (`joursDeFermeture` sur la fenêtre `{ date, debut: 0, fin: 1440 }`, plages de `plagesDeFiche` en usage
 * `planification` : fermé temporairement = aucune plage). Horaires inconnus ou lieu introuvable (`undefined`) : aucun
 * badge. Seul le booléen sort.
 */
export function aConfirmerALaLecture(fiche: FicheRelue | undefined, date: string): boolean {
  if (fiche === undefined) return false;
  if (fiche.statut === "CLOSED_PERMANENTLY") return true;
  const issue: FichePlages = { issue: "chargee", ...(fiche.statut === undefined ? {} : { statut: fiche.statut }), horaires: fiche.horaires };
  return joursDeFermeture({ plages: (_placeId, jour) => plagesDeFiche(issue, jour, "planification") }, "", [{ date, debut: 0, fin: 1440 }]).length > 0;
}
