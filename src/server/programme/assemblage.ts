import { LONGUEURS_CONTRAT, TripSchema, texteMaison, type Day, type DayLineItem, type Pace, type Proposal, type Segment, type Stop, type Trip } from "@/contracts";
import { budgetTrajetDuJour } from "@/domain/budget-trajet";
import { destinationColor } from "@/domain/calculs";
import type { ConfigurationMoteur } from "@/domain/configuration";
import { logementsDuJour } from "@/domain/relectures";
import { joursEntre } from "@/domain/temps";
import type { BriefEssai, RythmeEssai } from "@/server/programme/forme";

/**
 * Assemblage du programme écrit par l'IA (décision 0115 ; décision 0116 § 1.7, § 1.8, § 4.1, § 5 et § 6), partagé par
 * `p0Run` et la vraie app : code tiré de `src/server/p0/assemblage.ts` (et `rythmeVersPace` de `vers-moteur.ts`) par
 * M1a-1 (décision 0136 § 1.1), sans changement de comportement ; ces deux modules le réexportent. L'assembleur de
 * l'ancienne chaîne de P0 (`assembler`, `NOMBRE_PROPOSITIONS`) reste dans `src/server/p0/assemblage.ts`.
 *
 * Écarts de forme, aucun de comportement (0136 § 1.2) : le brief est la forme structurelle `BriefEssai` (plus le `Brief`
 * de `src/prototype/brief`), le rythme `RythmeEssai` ; l'organisation du voyage est **reçue** (`organizationId` : `p0Run`
 * passe `PROTOTYPE_ORG_ID`, la vraie app l'organisation de l'exécution) ; la longueur du libellé de source est une
 * constante du dossier (`LONGUEUR_LIBELLE_SOURCE`), tenue égale à `LONGUEURS.libelle` de `src/prototype/programme-reduit.ts`
 * par un test.
 *
 * Module pur, chargé par `pnpm p0` sous Node nu (exception nominative de `ligne/require-server-only`) : n'importe que
 * `@/contracts`, `src/domain` et `forme.ts`. Le programme complet contient les durées de trajet (`Segment.minutes`,
 * `Day.travelMinutes`) : il ne vit qu'en mémoire.
 */

/** Longueur maximale du libellé de source d'une étape (égale à `LONGUEURS.libelle` de `src/prototype/programme-reduit.ts`). */
export const LONGUEUR_LIBELLE_SOURCE = 120;

/** Rythme du brief de l'essai → rythme des contrats : `tranquille`, `equilibre`, `intense` → `relaxed`, `balanced`, `intense`. */
export function rythmeVersPace(rythme: RythmeEssai): Pace {
  switch (rythme) {
    case "tranquille":
      return "relaxed";
    case "equilibre":
      return "balanced";
    case "intense":
      return "intense";
  }
}

/**
 * Mode de trajet unique du programme (celui des segments écrits) : `transit` si coché, sinon `walk`, sinon `car`. Déplacé
 * de `src/server/p0/vers-moteur.ts` par M1a-2 (décision 0136 § 1 : la vraie app ne peut pas importer `src/server/p0`), sans
 * changement ; `vers-moteur.ts` le réexporte.
 */
export function modeDeTrajet(brief: Pick<BriefEssai, "deplacements">): Segment["mode"] {
  if (brief.deplacements.includes("transit")) return "transit";
  if (brief.deplacements.includes("walk")) return "walk";
  return "car";
}

/** Terminus d'une journée : identifiants des logements de départ et d'arrivée (`""` : logement sans identifiant). */
export type TerminusDuJour = { jour: number; depart: string; arrivee: string };

/**
 * Créneau du programme de l'IA tel que l'assemblage le reçoit (forme structurelle de `CreneauIa`, `src/ai/sorties.ts`,
 * que ce module n'importe pas) : textes déjà contrôlés et coupés (0117 § 1), plus le `placeId` **du créneau**, posé par
 * l'appelant seulement si le lieu est vérifié (0116 § 4.4).
 */
export type CreneauAssemble = {
  readonly debut: string;
  readonly fin?: string;
  readonly nature: "arrivee" | "visite" | "repas_midi" | "repas_soir" | "apero" | "soiree" | "pause" | "depart";
  readonly lieu?: string;
  readonly quartier?: string;
  readonly pourquoi?: string;
  /** Infos pratiques de l'IA (décision 0116 § 6, lot 1 bis) : `tip`, `priceNote`, `hoursNote` si la règle du contrat les admet. */
  readonly conseil?: string;
  readonly prix?: string;
  readonly horaires?: string;
  readonly aReserver?: boolean;
  readonly placeId?: string;
  /**
   * Adresse réduite du site **vérifié** (lot 2a, § 11.3 ; 0121 § 3.5) : posée par l'appelant seulement si la vérification
   * a répondu 2xx ; jamais l'adresse brute de l'IA ni une adresse de redirection (PPI-PO-7).
   */
  readonly site?: string;
};

export type EntreeAssemblageIa = {
  tripId: string;
  /** Organisation du voyage (décision 0136 § 1.2) : `PROTOTYPE_ORG_ID` pour `p0Run`, celle de l'exécution pour la vraie app. */
  organizationId: string;
  brief: BriefEssai;
  /** Journées lues, rangées par date ; créneaux **dans l'ordre écrit** (`ordreEcrit`, 0116 § 1.7), jamais retriés ici. */
  jours: readonly { readonly date: string; readonly titre?: string; readonly creneaux: readonly CreneauAssemble[] }[];
  /** Bons plans contrôlés (0117 § 1) : lignes « À faire » avant le départ (0116 § 6). */
  bonsPlans: readonly string[];
  /** Identifiant de chaque logement du brief, dans son ordre (logements vérifiés à l'ouverture de l'étape). */
  logements: readonly string[];
  configuration: ConfigurationMoteur;
  mode: Segment["mode"];
  /** Temps en mémoire entre deux identifiants ; `undefined` : sans durée (0092 § 4). */
  trajets: (depuis: string, vers: string) => number | undefined;
};

export type ProgrammeCompletIa = {
  trip: Trip;
  proposals: Proposal[];
  /** Justification maison de chaque proposition (écrite sur chacune dans la forme réduite). */
  justifications: Map<string, string>;
  terminus: TerminusDuJour[];
};

const NATURES_REPAS: ReadonlySet<string> = new Set(["repas_midi", "repas_soir", "apero"]);

/** Fin du jour : le contrat n'admet pas d'heure au-delà (0116 § 1.7). */
const FIN_DU_JOUR = "23:59";

/**
 * Texte de l'IA admis par la règle du contrat (`texteMaison`, `src/contracts/texte.ts`) à sa longueur, sinon `undefined` :
 * un texte refusé laisse le champ vide, jamais une erreur (0116 § 6, lot 1 bis). Second contrôle : la lecture
 * (`lireProgramme`) applique déjà la même règle ; celui-ci garde `TripSchema.parse` de toute entrée qui ne serait pas
 * passée par elle.
 */
function texteAdmis(valeur: string | undefined, max: number): string | undefined {
  if (valeur === undefined) return undefined;
  const lu = texteMaison(max).safeParse(valeur);
  return lu.success ? lu.data : undefined;
}

const minutesDe = (heure: string) => Number(heure.slice(0, 2)) * 60 + Number(heure.slice(3, 5));

/**
 * Source d'une étape depuis son site vérifié (§ 11.4 ; 0122 § 1 condition 14 et § 2.2 point 2) : `url` = adresse
 * réduite de l'IA, `label` = nom d'hôte calculé par le code, `www.` retiré **en tête seulement**, forme ASCII rendue par
 * `URL` (punycode pour un IDN, jamais reconverti), coupé à `LONGUEUR_LIBELLE_SOURCE`. Aucune date. Adresse illisible : aucune
 * source.
 */
export function sourceDuSite(site: string | undefined): Stop["source"] {
  if (site === undefined) return undefined;
  let hote: string;
  try {
    hote = new URL(site).hostname;
  } catch {
    return undefined;
  }
  const label = (hote.startsWith("www.") ? hote.slice(4) : hote).slice(0, LONGUEUR_LIBELLE_SOURCE);
  return label === "" ? undefined : { label, url: site };
}

/**
 * Fin d'une étape (0116 § 1.7) : `fin` postérieure à `debut` gardée ; `fin` antérieure ou égale à `debut` lue comme
 * passant minuit, **bornée à 23:59** ; absente (ou `debut` déjà à 23:59), pas de fin.
 */
function finDeLEtape(debut: string, fin: string | undefined): string | undefined {
  if (fin === undefined) return undefined;
  if (minutesDe(fin) > minutesDe(debut)) return fin;
  return minutesDe(debut) < minutesDe(FIN_DU_JOUR) ? FIN_DU_JOUR : undefined;
}

/**
 * Assemblage du programme écrit par l'IA en `Trip`, **sans replanifier** ni retirer (0115 § 3, 0116 § 1.6) :
 * - une journée par date lue, d'indice `date − arrivée + 1`, son titre en `Day.theme` (lot 1 bis, même règle) ;
 *   `arrivee` et `depart` donnent l'heure des lignes `terminus` (logement de la nuit, libellé maison), jamais une étape
 *   ni une vérification (0116 § 4.1) ;
 * - un créneau avec lieu devient une étape, dans l'ordre écrit : `meal` (midi, soir, apéro), `activity` (visite,
 *   soirée, pause avec lieu) ; nom, heures et `pourquoi` (`reason`) de l'IA, `quartier` en `facts.area`, `conseil`,
 *   `prix` et `horaires` en `facts.tip`, `facts.priceNote` et `facts.hoursNote` (0116 § 6, lot 1 bis ; texte refusé par
 *   la règle du contrat : champ vide), badge
 *   `toReserve` si `aReserver` ; `placeId` seulement si le lieu est vérifié ; **jamais `toConfirm`** (calculé à la
 *   lecture, 0116 § 5.1) ; `source` seulement si le créneau porte un site vérifié (lot 2a, `sourceDuSite`) ;
 * - une pause sans lieu devient une ligne `free` : jusqu'à sa `fin` lue comme celle d'une étape (passant minuit :
 *   23:59) ; sans `fin`, jusqu'au `debut` du créneau suivant de l'ordre écrit, sinon 23:59 (0116 § 1.8) ; aucun
 *   créneau n'est retiré ici ;
 * - un segment avant chaque étape **avec** `placeId` et avant le retour au logement, depuis le dernier point avec
 *   identifiant : durée de `trajets`, `null` sinon (A8, 0092 § 4) ; aucun segment vers ni depuis une étape sans
 *   `placeId` ;
 * - les engagements du brief en événements du jour, comme l'assemblage de la chaîne précédente ;
 * - bons plans en lignes « À faire » avant le départ, sans `bookingUrl`, `sponsored: false` (0116 § 6, 0117) ;
 * - aucune proposition au lot 1 (l'alternative nommée par l'IA est au lot 2, 0116 § 5.2).
 */
/**
 * Logement de départ et d'arrivée du jour `index` (1 = J1) : règle unique `logementsDuJour` (`src/domain/relectures.ts`,
 * 0045 § 2.2 ; jour `index − 1`), nuits du brief dans l'ordre.
 */
function logementsDeLaJournee(brief: BriefEssai, logements: readonly string[], index: number) {
  const nuits = brief.logements.flatMap((logement, rang) => Array.from({ length: logement.nuits }, () => ({ texte: logement.texte, placeId: logements.at(rang) ?? "" })));
  const { depart, arrivee } = logementsDuJour(index - 1, nuits.length);
  const nuit = (rang: number) => nuits.at(rang) ?? { texte: "Logement", placeId: "" };
  return { depart: nuit(depart), arrivee: nuit(arrivee) };
}

/**
 * Points de trajet de chaque journée, **seule source** des paires de trajets du programme de l'IA (décision 0116 § 3.3,
 * critère A8) : logement de départ, étapes **avec** `placeId` dans l'ordre écrit, logement d'arrivée ; une étape sans
 * `placeId` est sautée (aucun trajet vers ni depuis elle). Mêmes points que les segments de `assemblerProgrammeIa`.
 */
export function pointsDeTrajet(entree: Pick<EntreeAssemblageIa, "brief" | "jours" | "logements">): string[][] {
  return entree.jours.map((jour) => {
    const { depart, arrivee } = logementsDeLaJournee(entree.brief, entree.logements, joursEntre(entree.brief.arrivee, jour.date) + 1);
    const etapes = jour.creneaux.flatMap((creneau) =>
      creneau.nature === "arrivee" || creneau.nature === "depart" || creneau.lieu === undefined || creneau.placeId === undefined ? [] : [creneau.placeId],
    );
    return [depart.placeId, ...etapes, arrivee.placeId].filter((point) => point !== "");
  });
}

export function assemblerProgrammeIa(entree: EntreeAssemblageIa): ProgrammeCompletIa {
  const { brief } = entree;
  const dernierIndice = joursEntre(brief.arrivee, brief.depart) + 1;
  const terminus: TerminusDuJour[] = [];

  const days: Day[] = entree.jours.map((jour) => {
    const index = joursEntre(brief.arrivee, jour.date) + 1;
    const { depart: logementDepart, arrivee: logementArrivee } = logementsDeLaJournee(brief, entree.logements, index);
    const arrivee = jour.creneaux.find((creneau) => creneau.nature === "arrivee");
    const depart = jour.creneaux.find((creneau) => creneau.nature === "depart");
    const contenu = jour.creneaux.filter((creneau) => creneau.nature !== "arrivee" && creneau.nature !== "depart");
    const debutJour = arrivee?.debut ?? (index === 1 ? brief.heureArrivee : (contenu[0]?.debut ?? "09:00"));
    const items: DayLineItem[] = [{ type: "terminus", role: "start", time: debutJour, label: logementDepart.texte }];
    let precedent: string | undefined = logementDepart.placeId === "" ? undefined : logementDepart.placeId;
    let travelMinutes: number | null = 0;
    let derniere = debutJour;
    const segment = (vers: string | undefined): void => {
      const minutes = precedent !== undefined && vers !== undefined ? entree.trajets(precedent, vers) : undefined;
      const valeur = minutes !== undefined && Number.isInteger(minutes) && minutes >= 0 ? minutes : null;
      travelMinutes = travelMinutes === null || valeur === null ? null : travelMinutes + valeur;
      items.push({ type: "segment", segment: { mode: entree.mode, minutes: valeur, estimated: false } });
    };
    let rang = 0;
    for (const [position, creneau] of contenu.entries()) {
      if (creneau.lieu === undefined) {
        // Pause sans lieu (seule nature de `contenu` admise sans lieu par la lecture) : ligne `free`, jamais retirée.
        // 0116 § 1.8 : la `fin` lue selon § 1.7 prévaut (≤ `debut` : bornée à 23:59) ; seulement sans `fin`, le
        // `debut` du créneau suivant de l'ordre écrit, sinon 23:59.
        const suivant = contenu.at(position + 1)?.debut ?? depart?.debut;
        const jusqua =
          creneau.fin !== undefined
            ? (finDeLEtape(creneau.debut, creneau.fin) ?? FIN_DU_JOUR)
            : suivant !== undefined && minutesDe(suivant) > minutesDe(creneau.debut)
              ? suivant
              : FIN_DU_JOUR;
        items.push({ type: "free", from: creneau.debut, to: jusqua });
        derniere = jusqua;
        continue;
      }
      rang += 1;
      const kind: Stop["kind"] = NATURES_REPAS.has(creneau.nature) ? "meal" : "activity";
      const fin = finDeLEtape(creneau.debut, creneau.fin);
      const tip = texteAdmis(creneau.conseil, LONGUEURS_CONTRAT.tip);
      const priceNote = texteAdmis(creneau.prix, LONGUEURS_CONTRAT.priceNote);
      const hoursNote = texteAdmis(creneau.horaires, LONGUEURS_CONTRAT.hoursNote);
      const source = sourceDuSite(creneau.site);
      const stop: Stop = {
        id: `j${index}-${rang}`,
        kind,
        ...(creneau.placeId === undefined ? {} : { placeId: creneau.placeId }),
        name: creneau.lieu,
        start: creneau.debut,
        ...(fin === undefined ? {} : { end: fin }),
        facts: {
          ...(fin === undefined ? {} : { durationMinutes: minutesDe(fin) - minutesDe(creneau.debut) }),
          ...(creneau.quartier === undefined ? {} : { area: creneau.quartier }),
          ...(tip === undefined ? {} : { tip }),
          ...(priceNote === undefined ? {} : { priceNote }),
          ...(hoursNote === undefined ? {} : { hoursNote }),
        },
        ...(creneau.pourquoi === undefined ? {} : { reason: creneau.pourquoi }),
        ...(source === undefined ? {} : { source }),
        exceptions: creneau.aReserver === true ? ["toReserve"] : [],
        locked: false,
      };
      if (creneau.placeId !== undefined) {
        segment(creneau.placeId);
        precedent = creneau.placeId;
      }
      items.push({ type: "stop", stop });
      derniere = fin ?? creneau.debut;
    }
    segment(logementArrivee.placeId === "" ? undefined : logementArrivee.placeId);
    const finJour = depart?.debut ?? (index === dernierIndice ? brief.heureDepart : derniere);
    items.push({ type: "terminus", role: "end", time: minutesDe(finJour) >= minutesDe(derniere) ? finJour : derniere, label: logementArrivee.texte });
    terminus.push({ jour: index, depart: logementDepart.placeId, arrivee: logementArrivee.placeId });
    const events: Stop[] = (brief.engagements ?? [])
      .filter((engagement) => engagement.date === jour.date)
      .map((engagement, rangEvenement) => ({
        id: `j${index}-c${rangEvenement + 1}`,
        kind: "event",
        name: engagement.libelle,
        start: engagement.heure,
        facts: {},
        exceptions: [],
        locked: true,
        commitment: engagement.type,
      }));
    const theme = texteAdmis(jour.titre, LONGUEURS_CONTRAT.theme);
    return {
      index,
      date: jour.date,
      ...(theme === undefined ? {} : { theme }),
      items,
      events,
      generating: false,
      travelMinutes,
      travelBudgetMinutes: budgetTrajetDuJour(rythmeVersPace(brief.rythme), entree.configuration, false),
    };
  });

  const trip: Trip = {
    id: entree.tripId,
    organizationId: entree.organizationId,
    destination: brief.destination,
    destinationColor: destinationColor(brief.destination),
    start: brief.arrivee,
    end: brief.depart,
    timeZone: brief.fuseau,
    travellers: { adults: brief.voyageurs.adultes, children: brief.voyageurs.enfants },
    days,
    checklist: entree.bonsPlans.map((label, rang) => ({ id: `bon-plan-${rang + 1}`, label, when: { type: "beforeDeparture" }, done: false, sponsored: false })),
    unlocked: true,
  };
  TripSchema.parse(trip);
  return { trip, proposals: [], justifications: new Map(), terminus };
}

