import "server-only";

import type { Brief as BriefDeLApp, Lodging, TripCommitment, TripDraft } from "@/contracts";
import { destinationEssaiFiltree, PROTOTYPE_STAY_DAYS_MAX } from "@/contracts/values";
import { changementsDuVoyage, villesDuVoyage } from "@/domain/changement-de-ville";
import type { ConfigurationMoteur } from "@/domain/configuration";
import { heuresDeVol } from "@/domain/squelette";
import { joursEntre, versHeure } from "@/domain/temps";
import { fuseauDeVille, fuseauDuPays, nomMaisonDeVille, paysDeVille, paysParCode, villeDuPays } from "@/lib/fuseaux";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import type { BriefEssai, BriefProgramme, RythmeEssai } from "@/server/programme/forme";

export type { BriefEssai, BriefProgramme, RythmeEssai };

/**
 * Conversion du formulaire de l'app vers le brief de la chaîne inversée (spécification E2E-essai, lot 3, tableau « Du
 * formulaire au brief de la chaîne inversée » et décision D1 ; décision 0125 § 3). **Fonction pure** : aucune lecture,
 * aucun réseau, aucune donnée Google (le pays vient de la table maison `src/lib/fuseaux/pays.json`, l'heure par défaut
 * de la configuration du moteur). La forme rendue est celle de `BriefSchema` (`src/prototype/brief.ts`), que le pont
 * `p0Run` valide ensuite (l'application n'importe pas `src/prototype`, 0048 § 1 : le type est recopié ici et tenu égal
 * par un contrôle de type du pont, `src/workflows/p0-run.ts`).
 *
 * Pays et fuseau : ceux de la ville choisie à l'écran 1 dans les suggestions (`draft.destinationRegion`, demande de
 * Samuel du 23 octobre 2026), **bornés** par la table maison des pays (`fuseauDuPays`, liste fermée) : le brief
 * reçoit le nom et le fuseau de la table, jamais la chaîne reçue ; sans choix valide (recherche indisponible), ceux de
 * la table maison des villes. La région est **déclarée par le client, bornée par les tables** (décision 0129 § 4) : rien
 * ne prouve que le `placeId` désigne la destination, qui n'entre pas dans le brief.
 *
 * Destination d'une ville choisie (décision 0129 § 4, écart avec 0125 § 3 « texte du formulaire ») : le **nom maison**
 * de la table des villes de ce pays, ou, hors de la table, le texte tapé **filtré** (`destinationEssaiFiltree` : aucun
 * retour à la ligne ni tabulation, puis lettres, espaces, apostrophes, tirets et points, 80 caractères au plus, espaces
 * répétés réduits) ; tout autre texte est refusé.
 * Sans région, la destination est une clé de la table des villes, donc déjà bornée.
 *
 * Refus, chacun sur son champ de la forme de `parseInput`, avant toute réservation : ville absente de la table des
 * villes sans ville choisie, ou ville choisie hors des tables maison (`draft.destination`), plus de `PROTOTYPE_STAY_DAYS_MAX` jours (`draft.end`), une autre ville
 * (`draft.otherCities`). Le refus du récit (e-mail ou téléphone, `story`) est celui de `BriefSchema`, rendu par le pont.
 * Les catégories « à éviter » (`limits`) sont recopiées dans `aEviter` (lot 5), absent quand rien n'est coché.
 *
 * Déplacé de `src/server/p0/depuis-formulaire.ts` par M1a-1 (décision 0136 § 1.1), sans changement : partagé par `p0Run`
 * et la vraie app ; `depuis-formulaire.ts` le réexporte. Les types `BriefEssai` et `RythmeEssai` sont dans `forme.ts`
 * (chargé par `pnpm p0`, qui ne charge pas ce module).
 */

/** Champ refusé, chemin de la forme de `parseInput` (`draft.destination`), rendu à l'écran du lancement. */
export type ChampRefuse = "draft.destination" | "draft.end" | "draft.otherCities" | `draft.otherCities.${number}.name`;

export type ResultatConversion = { readonly ok: true; readonly brief: BriefEssai } | { readonly ok: false; readonly champ: ChampRefuse };

export type ResultatConversionProgramme = { readonly ok: true; readonly brief: BriefProgramme } | { readonly ok: false; readonly champ: ChampRefuse };

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
 * Destination, fuseau et pays : la ville choisie, revérifiée (nom maison, ou texte tapé filtré), sinon la table des
 * villes ; `null` sinon.
 */
function lieuDeLaDestination(saisie: string, region: TripDraft["destinationRegion"]): { destination: string; fuseau: string; pays: string } | null {
  if (region !== undefined) {
    const fuseau = fuseauDuPays(region.country, region.timeZone);
    const pays = paysParCode(region.country)?.nom;
    if (fuseau === null || pays === undefined) return null;
    const maison = villeDuPays(saisie, region.country);
    if (maison !== null) return { destination: maison.nom, fuseau, pays };
    const filtre = destinationEssaiFiltree(saisie);
    return filtre === null ? null : { destination: filtre, fuseau, pays };
  }
  const fuseauVille = fuseauDeVille(saisie);
  const paysVille = paysDeVille(saisie);
  return fuseauVille === null || paysVille === null ? null : { destination: saisie, fuseau: fuseauVille, pays: paysVille };
}

/**
 * Contrôles et champs communs des deux conversions (décision 0148 § 8 point 2 : « une fonction interne commune, aucune
 * copie ») : destination, pays et fuseau (`lieuDeLaDestination`), durée (`PROTOTYPE_STAY_DAYS_MAX`), heures de vol du
 * premier et du dernier jour, voyageurs, rythme, envies, à éviter, déplacements, budget et récit. Ni logements ni
 * engagements : chaque conversion pose les siens.
 */
function communDuBrief(
  draft: TripDraft,
  brief: BriefDeLApp,
  recit: string | undefined,
): { readonly ok: true; readonly commun: Omit<BriefEssai, "logements" | "engagements">; readonly nuits: number } | { readonly ok: false; readonly champ: ChampRefuse } {
  const lieu = lieuDeLaDestination(draft.destination.trim(), draft.destinationRegion);
  if (lieu === null) return { ok: false, champ: "draft.destination" };
  const { destination, fuseau, pays } = lieu;
  const nuits = joursEntre(draft.start, draft.end);
  if (nuits > PROTOTYPE_STAY_DAYS_MAX - 1) return { ok: false, champ: "draft.end" };
  const vols = heuresDeVol({ start: draft.start, end: draft.end }, draft.commitments);
  const texte = recit?.trim() ?? "";
  return {
    ok: true,
    nuits,
    commun: {
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
      ...(texte === "" ? {} : { recit: texte }),
    },
  };
}

/**
 * Brief de l'essai depuis le brouillon (écran 1 et 3), la vérification (écran 2) et le récit saisi (écran 2). Le
 * brouillon et le brief ont déjà passé leurs schémas (`TripRequestSchema`) ; seules les règles propres au site d'essai
 * sont contrôlées ici. Une autre ville est toujours refusée (`draft.otherCities`, M4-PO-1, critère 19) : le site d'essai et
 * `p0Run` restent à une seule ville (décision 0148 § 8 point 1).
 */
export function briefDepuisFormulaire(draft: TripDraft, brief: BriefDeLApp, recit: string | undefined): ResultatConversion {
  const commun = communDuBrief(draft, brief, recit);
  // Ordre des refus inchangé : destination, autre ville, puis durée.
  if (!commun.ok && commun.champ === "draft.destination") return commun;
  if (draft.otherCities.length > 0) return { ok: false, champ: "draft.otherCities" };
  if (!commun.ok) return commun;
  const { destination } = commun.commun;
  const engagements = engagementsDuBrief(draft.commitments);
  const { recit: recitLu, ...sansRecit } = commun.commun;
  return {
    ok: true,
    brief: {
      ...sansRecit,
      logements: [{ texte: texteDuLogement(draft.lodging, destination), nuits: commun.nuits }],
      ...(engagements.length > 0 ? { engagements } : {}),
      ...(recitLu === undefined ? {} : { recit: recitLu }),
    },
  };
}

/**
 * Brief de la chaîne inversée sur `api`, une à `MAX_CITIES` villes (décision 0148 § 8 point 2 ; spécification M4 § 5 point
 * 1) : pour `createTrip`, l'étape `a` et `e` de `generateProgramme` et la révision M1b (`voyageEtBriefSansRecit`). Mêmes
 * contrôles que `briefDepuisFormulaire` (`communDuBrief`), sans le refus des autres villes ; puis :
 * - `villes` : nom **maison** de chaque ville (`nomMaisonDeVille` ; hors de la table : refus sur son champ, que
 *   `controlerVilles` refuserait aussi), date d'arrivée, nuits, texte du logement avec **sa** ville ; `destination` devient
 *   le nom maison de la première ville ;
 * - `logements` : un par ville, avec `ville` ;
 * - `changements` : `changementsDuVoyage` du domaine (départ saisi par la règle du billet de trajet, sinon estimé), sans
 *   libellé ; `billets` : les libellés des engagements devenus changement de ville, pour l'assemblage seulement ;
 * - `engagements` : « Sortie » et « Billet » avec leur fin, **sans** ceux devenus changement de ville ; les autres vols restent
 *   écartés comme aujourd'hui (0148 § 9 point 3).
 * Fonction pure ; la configuration du moteur est celle du serveur, sauf dans les tests.
 */
export function briefProgrammeDepuisFormulaire(
  draft: TripDraft,
  brief: BriefDeLApp,
  recit: string | undefined,
  configuration: ConfigurationMoteur = CONFIGURATION_MOTEUR,
): ResultatConversionProgramme {
  const commun = communDuBrief(draft, brief, recit);
  if (!commun.ok) return commun;
  const premiere = nomMaisonDeVille(commun.commun.destination) ?? commun.commun.destination;
  const autres: { nom: string; arrivee: string }[] = [];
  for (const [indice, ville] of draft.otherCities.entries()) {
    const nom = nomMaisonDeVille(ville.name.trim());
    if (nom === null) return { ok: false, champ: `draft.otherCities.${indice}.name` };
    autres.push({ nom, arrivee: ville.arrival });
  }
  const ordre = villesDuVoyage(premiere, autres, { start: draft.start, end: draft.end });
  const logements = [draft.lodging, ...draft.otherCities.map((ville) => ville.lodging)];
  const villes = ordre.map((ville, rang) => ({ ...ville, logement: texteDuLogement(logements[rang] ?? draft.lodging, ville.nom) }));
  const changements = changementsDuVoyage(ordre, draft.commitments, { pace: brief.pace, deplacements: commun.commun.deplacements }, configuration);
  const devenus = new Set(changements.flatMap((changement) => (changement.engagement === undefined ? [] : [changement.engagement])));
  const engagements = draft.commitments.flatMap((engagement, rang) =>
    engagement.kind === "flight" || devenus.has(rang)
      ? []
      : [
          {
            libelle: engagement.label.trim(),
            date: engagement.date,
            heure: engagement.start,
            ...(engagement.end === undefined ? {} : { fin: engagement.end }),
            type: engagement.kind === "booking" ? ("reservation" as const) : ("ticket" as const),
          },
        ],
  );
  return {
    ok: true,
    brief: {
      ...commun.commun,
      destination: premiere,
      villes,
      logements: villes.map((ville) => ({ texte: ville.logement, nuits: ville.nuits, ville: ville.nom })),
      changements: changements.map((changement) => ({
        date: changement.date,
        de: changement.de,
        vers: changement.vers,
        source: changement.source,
        depart: changement.depart,
        ...(changement.arrivee === undefined ? {} : { arrivee: changement.arrivee }),
        ...(changement.mode === undefined ? {} : { mode: changement.mode }),
        activitesMax: changement.activitesMax,
      })),
      billets: changements.flatMap((changement) => {
        const engagement = changement.engagement === undefined ? undefined : draft.commitments.at(changement.engagement);
        return engagement === undefined ? [] : [{ date: changement.date, libelle: engagement.label.trim() }];
      }),
      ...(engagements.length > 0 ? { engagements } : {}),
    },
  };
}
