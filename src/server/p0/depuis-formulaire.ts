import "server-only";

import type { Brief as BriefDeLApp, Lodging, TripCommitment, TripDraft } from "@/contracts";
import { PROTOTYPE_STAY_DAYS_MAX } from "@/contracts/values";
import { heuresDeVol } from "@/domain/squelette";
import { joursEntre, versHeure } from "@/domain/temps";
import { fuseauDeVille, paysDeVille } from "@/lib/fuseaux";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";

/**
 * Conversion du formulaire de l'app vers le brief de la chaîne inversée (spécification E2E-essai, lot 3, tableau « Du
 * formulaire au brief de la chaîne inversée » et décision D1 ; décision 0125 § 3). **Fonction pure** : aucune lecture,
 * aucun réseau, aucune donnée Google (le pays vient de la table maison `src/lib/fuseaux/pays.json`, l'heure par défaut
 * de la configuration du moteur). La forme rendue est celle de `BriefSchema` (`src/prototype/brief.ts`), que le pont
 * `p0Run` valide ensuite (l'application n'importe pas `src/prototype`, 0048 § 1 : le type est recopié ici et tenu égal
 * par un contrôle de type du pont, `src/workflows/p0-run.ts`).
 *
 * Refus, chacun sur son champ de la forme de `parseInput`, avant toute réservation : ville absente de la table des
 * fuseaux ou des pays (`draft.destination`), plus de `PROTOTYPE_STAY_DAYS_MAX` jours (`draft.end`), une autre ville
 * (`draft.otherCities`). Le refus du récit (e-mail ou téléphone, `story`) est celui de `BriefSchema`, rendu par le pont.
 * Les catégories « à éviter » (`limits`) sont recopiées dans `aEviter` (lot 5), absent quand rien n'est coché.
 */

/** Rythme du brief de l'essai (`RYTHMES` de `src/prototype/brief.ts`). */
export type RythmeEssai = "tranquille" | "equilibre" | "intense";

/** Brief de l'essai (forme de `BriefSchema`, schéma 1). */
export type BriefEssai = {
  readonly schema: 1;
  readonly destination: string;
  readonly pays: string;
  readonly fuseau: string;
  readonly arrivee: string;
  readonly depart: string;
  readonly heureArrivee: string;
  readonly heureDepart: string;
  readonly voyageurs: { readonly adultes: number; readonly enfants: number };
  readonly rythme: RythmeEssai;
  readonly envies: BriefDeLApp["wishes"];
  readonly aEviter?: BriefDeLApp["limits"];
  readonly deplacements: BriefDeLApp["mobility"];
  readonly budgetRepas?: 1 | 2 | 3;
  readonly logements: readonly { readonly texte: string; readonly nuits: number }[];
  readonly engagements?: readonly { readonly libelle: string; readonly date: string; readonly heure: string; readonly type: "reservation" | "ticket" }[];
  readonly recit?: string;
};

/** Champ refusé, chemin de la forme de `parseInput` (`draft.destination`), rendu à l'écran du lancement. */
export type ChampRefuse = "draft.destination" | "draft.end" | "draft.otherCities";

export type ResultatConversion = { readonly ok: true; readonly brief: BriefEssai } | { readonly ok: false; readonly champ: ChampRefuse };

const RYTHME: Readonly<Record<BriefDeLApp["pace"], RythmeEssai>> = { relaxed: "tranquille", balanced: "equilibre", intense: "intense" };

/** Déplacements par défaut quand la personne n'en a coché aucun (D1). */
export const DEPLACEMENTS_PAR_DEFAUT: BriefEssai["deplacements"] = ["walk", "transit"];

/** Niveau de budget par repas (D1) : 25 CHF au plus → 1 ; 26 à 60 → 2 ; au-delà → 3. */
export function niveauBudgetRepas(chf: number): 1 | 2 | 3 {
  if (chf <= 25) return 1;
  return chf <= 60 ? 2 : 3;
}

/** Texte du logement pour l'ancrage (D1) : nom saisi, quartier « <quartier>, <destination> », ou la destination. */
export function texteDuLogement(logement: Lodging, destination: string): string {
  switch (logement.kind) {
    case "known":
      return logement.label.trim();
    case "area":
      return `${logement.label.trim()}, ${destination}`;
    case "suggestedLodging":
      return logement.name.trim();
    case "suggestedArea":
      return `${logement.name.trim()}, ${destination}`;
    case "none":
      return destination;
  }
}

/** Engagements à heure fixe : réservations et billets ; un vol ne donne que les heures du séjour (B5-PO-7). */
function engagementsDuBrief(commitments: readonly TripCommitment[]): NonNullable<BriefEssai["engagements"]> {
  return commitments.flatMap((engagement) =>
    engagement.kind === "flight"
      ? []
      : [{ libelle: engagement.label.trim(), date: engagement.date, heure: engagement.start, type: engagement.kind === "booking" ? ("reservation" as const) : ("ticket" as const) }],
  );
}

/**
 * Brief de l'essai depuis le brouillon (écran 1 et 3), la vérification (écran 2) et le récit saisi (écran 2). Le
 * brouillon et le brief ont déjà passé leurs schémas (`TripRequestSchema`) ; seules les règles propres au site d'essai
 * sont contrôlées ici.
 */
export function briefDepuisFormulaire(draft: TripDraft, brief: BriefDeLApp, recit: string | undefined): ResultatConversion {
  const destination = draft.destination.trim();
  const fuseau = fuseauDeVille(destination);
  const pays = paysDeVille(destination);
  if (fuseau === null || pays === null) return { ok: false, champ: "draft.destination" };
  if (draft.otherCities.length > 0) return { ok: false, champ: "draft.otherCities" };
  const nuits = joursEntre(draft.start, draft.end);
  if (nuits > PROTOTYPE_STAY_DAYS_MAX - 1) return { ok: false, champ: "draft.end" };
  const vols = heuresDeVol({ start: draft.start, end: draft.end }, draft.commitments);
  const engagements = engagementsDuBrief(draft.commitments);
  const texte = recit?.trim() ?? "";
  return {
    ok: true,
    brief: {
      schema: 1,
      destination,
      pays,
      fuseau,
      arrivee: draft.start,
      depart: draft.end,
      heureArrivee: vols.arrivee === undefined ? CONFIGURATION_MOTEUR.fenetreJour.debut : versHeure(vols.arrivee),
      heureDepart: vols.depart === undefined ? CONFIGURATION_MOTEUR.fenetreJour.fin : versHeure(vols.depart),
      voyageurs: { adultes: brief.travellers.adults, enfants: brief.travellers.children },
      rythme: RYTHME[brief.pace],
      envies: [...brief.wishes],
      ...(brief.limits.length > 0 ? { aEviter: [...brief.limits] } : {}),
      deplacements: brief.mobility.length > 0 ? [...brief.mobility] : [...DEPLACEMENTS_PAR_DEFAUT],
      ...(brief.mealBudgetPerPerson === undefined ? {} : { budgetRepas: niveauBudgetRepas(brief.mealBudgetPerPerson) }),
      logements: [{ texte: texteDuLogement(draft.lodging, destination), nuits }],
      ...(engagements.length > 0 ? { engagements } : {}),
      ...(texte === "" ? {} : { recit: texte }),
    },
  };
}
