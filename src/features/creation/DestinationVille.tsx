"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { format } from "@/i18n";
import { IconCoche } from "@/components/ligne/icons";
import * as messages from "@/i18n/messages";
import type { IssueChoix, IssueSuggestions, SuggestionVille } from "@/contracts/villes";
import { cleVille, paysParCode } from "@/lib/fuseaux";
import { choisirVilleApi, suggererVillesApi } from "@/server/actions/villes";
import { choisirVille, suggererVilles } from "@/server/actions/villes-essai";

import { describedBy, errorId, FieldHelp, FieldLabel, FieldMessage, fieldId, helpId, INPUT_CLASS } from "./fields";

const e1 = messages.creation.ecran1;
const v = e1.ville;
const err = e1.erreurs;

/** Délai entre la dernière frappe et la recherche : une requête Google par pause, pas par touche. */
export const DELAI_RECHERCHE_MS = 300;
const SAISIE_MIN = 2;

/** Ville choisie, valeurs maison et `placeId` : seules valeurs remontées au brouillon. */
export type ChoixVille = { readonly destination: string; readonly placeId: string; readonly country: string; readonly timeZone: string };

/**
 * Actions serveur de la recherche : site d'essai (`src/server/actions/villes-essai.ts`) ou `api`
 * (`src/server/actions/villes.ts`, décision 0141) ; doublées par les tests et les captures. Réponses : union des types
 * des deux adaptateurs (`@/contracts/villes`).
 */
export type ActionsVilles = {
  readonly suggerer: (entree: Parameters<typeof suggererVilles>[0]) => Promise<IssueSuggestions>;
  readonly choisir: (entree: Parameters<typeof choisirVille>[0]) => Promise<IssueChoix>;
};
/** Recherche montée : site d'essai (barrière du lancement, cookie d'accès) ou `api` (décision 0141 § 6.4). */
export type RechercheVille = "essai" | "api";
const ACTIONS_SERVEUR: Readonly<Record<RechercheVille, ActionsVilles>> = {
  essai: { suggerer: suggererVilles, choisir: choisirVille },
  api: { suggerer: suggererVillesApi, choisir: choisirVilleApi },
};

type Etat = "repos" | "recherche" | "liste" | "aucune" | "acces" | "indisponible" | "limite" | "limiteJour" | "choix" | "choisie";

/**
 * Pourquoi la recherche ne sert pas (revue du head de4ab92, mineur 3) : elle ne répond pas (`panne`), ou elle refuse au
 * plafond de la minute (`minute`) ou du jour (`jour`). L'appelant en tire le message de « Continuer ».
 */
export type MotifIndisponible = "panne" | "minute" | "jour";

/** Statut de refus du serveur → état affiché et motif remonté. */
function refusDe(statut: Exclude<IssueChoix["statut"] | IssueSuggestions["statut"], "ok">): { readonly etat: Etat; readonly motif: MotifIndisponible } {
  if (statut === "limite") return { etat: "limite", motif: "minute" };
  if (statut === "limite_jour") return { etat: "limiteJour", motif: "jour" };
  return { etat: "indisponible", motif: "panne" };
}

export interface DestinationVilleProps {
  value: string;
  /** Pays et fuseau maison de la ville choisie (brouillon), ou `null` sans choix. */
  choisie: { readonly country: string; readonly timeZone: string } | null;
  /** Message d'erreur de la validation de l'écran 1. */
  error: string | null;
  /** Texte tapé : le choix précédent est effacé par l'appelant. */
  onSaisie: (destination: string) => void;
  onChoix: (choix: ChoixVille) => void;
  /**
   * La recherche a répondu (un choix devient obligatoire) ou ne sert pas (repli sur la table maison), avec le motif :
   * panne, plafond de la minute ou plafond du jour.
   */
  onDisponibilite: (disponible: boolean, motif?: MotifIndisponible) => void;
  /** Cookie d'accès absent ou expiré (site d'essai seulement) : l'appelant affiche la saisie du code. */
  onAcces: () => void;
  /**
   * Ville hors des 62 villes du MVP (`api`, décision 0141 § 8.2) : le champ affiche et annonce `err.horsTable` ;
   * l'appelant retient la saisie refusée, pour que « Continuer » répète ce message tant qu'elle n'a pas changé.
   */
  onHorsTable?: (saisie: string) => void;
  /** Incrémenté par l'appelant après la saisie du code : la recherche est relancée. */
  relance: number;
  /** Recherche montée (défaut : site d'essai) ; choisit les actions serveur. Sur `api`, jamais l'état « accès ». */
  recherche?: RechercheVille;
  /** Actions de la recherche ; par défaut les actions serveur de `recherche`. */
  actions?: ActionsVilles;
  /**
   * Champ du brouillon servi (identifiant, erreurs, focus) : la destination par défaut, ou le nom d'une autre ville
   * (`otherCities.{i}.name`, `api` seulement : spécification M4 § 4.2 et § 7.1 ; verdict 0149 § 3).
   */
  champ?: string;
  /** Libellé visible du champ ; « Destination » par défaut. */
  libelle?: string;
  /** Longueur maximale de la saisie ; 80 par défaut (destination). */
  maxLength?: number;
}

/** Nom tapé incomplet : préfixe strict du texte principal de la suggestion (comparaison en mémoire seulement). */
function nomIncomplet(saisie: string, principal: string): boolean {
  const tape = cleVille(saisie);
  const suggere = cleVille(principal);
  return tape !== suggere && suggere.startsWith(tape);
}

/**
 * Champ « Destination » du site d'essai (décision 0129 § 5) : liste de suggestions de villes de Google Places, motif
 * « combobox » de l'APG WAI-ARIA 1.2 (liste en flux sous le champ, rendue seulement quand elle est ouverte ; option
 * active par `aria-activedescendant`, contour `line` de 2 px ; flèches, Entrée, Échap ; chaque option est aussi
 * cliquable, cible tactile de `--touch-target`). Les suggestions s'affichent avec l'attribution textuelle « Google Maps »
 * (règles de Google pour des données Places sans carte), seulement quand elles sont visibles.
 *
 * Au choix, le champ est **rempli** avec le nom retenu : le nom maison de la table des villes, ou le texte tapé si la
 * ville est hors de la table ; une ligne le confirme, précédée d'une coche `line` (« Ville retenue : Valence
 * (Espagne). »). Seuls le `placeId` et les
 * valeurs maison rendues par le serveur sont remontés.
 *
 * États (recherche, aucune ville, indisponible, limite de la minute, limite du jour, accès) : texte visible en flux sous le champ, dans une région
 * `status` présente dès l'affichage. Aucun état sans issue : sans réponse de la recherche, une ville de la table maison
 * est acceptée (repli) ; sans cookie, la saisie du code s'affiche sous le champ.
 */
export function DestinationVille({
  value,
  choisie,
  error,
  onSaisie,
  onChoix,
  onDisponibilite,
  onAcces,
  onHorsTable,
  relance,
  recherche = "essai",
  actions = ACTIONS_SERVEUR[recherche],
  champ = "destination",
  libelle = e1.destination,
  maxLength = 80,
}: DestinationVilleProps) {
  // `api` (décision 0141 § 6.1 point 5) : aucun cookie d'accès, l'état « accès » n'existe pas ; un tel statut se replie.
  const accesPossible = recherche === "essai";
  const id = fieldId(champ);
  const listeId = `${id}-liste`;
  const statutId = `${id}-statut`;
  // Suggestions affichées (données Google, en mémoire du composant seulement, jamais dans le brouillon).
  const [suggestions, setSuggestions] = useState<readonly SuggestionVille[]>([]);
  const [ouverte, setOuverte] = useState(false);
  const [active, setActive] = useState(-1);
  const [etat, setEtat] = useState<Etat>("repos");
  const [erreurChoix, setErreurChoix] = useState<string | null>(null);
  const session = useRef<string | null>(null);
  const requete = useRef(0);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Dernier texte tapé, lu par la relance après la saisie du code (synchronisé après le rendu).
  const valeur = useRef(value);
  useEffect(() => {
    valeur.current = value;
  }, [value]);

  useEffect(
    () => () => {
      if (minuterie.current) clearTimeout(minuterie.current);
      requete.current += 1;
    },
    [],
  );

  async function rechercher(saisie: string) {
    const numero = ++requete.current;
    session.current ??= crypto.randomUUID();
    setEtat("recherche");
    let issue: IssueSuggestions;
    try {
      issue = await actions.suggerer({ saisie, session: session.current });
    } catch {
      issue = { statut: "indisponible" };
    }
    if (numero !== requete.current) return;
    if (issue.statut === "ok") {
      setSuggestions(issue.suggestions);
      setActive(-1);
      setOuverte(issue.suggestions.length > 0);
      setEtat(issue.suggestions.length > 0 ? "liste" : "aucune");
      onDisponibilite(true);
      return;
    }
    setSuggestions([]);
    setOuverte(false);
    if (issue.statut === "acces" && accesPossible) {
      setEtat("acces");
      onAcces();
    } else {
      const refus = refusDe(issue.statut);
      setEtat(refus.etat);
      onDisponibilite(false, refus.motif);
    }
  }

  function programmer(saisie: string) {
    if (minuterie.current) clearTimeout(minuterie.current);
    if (saisie.trim().length < SAISIE_MIN) {
      requete.current += 1;
      setSuggestions([]);
      setOuverte(false);
      setEtat("repos");
      return;
    }
    minuterie.current = setTimeout(() => void rechercher(saisie), DELAI_RECHERCHE_MS);
  }

  // Code d'accès saisi : la recherche reprend sur le texte déjà tapé.
  useEffect(() => {
    if (relance > 0 && valeur.current.trim().length >= SAISIE_MIN) void rechercher(valeur.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relance]);

  async function choisir(index: number) {
    const suggestion = suggestions[index];
    const jeton = session.current;
    if (suggestion === undefined || jeton === null) return;
    const numero = ++requete.current;
    setOuverte(false);
    setEtat("choix");
    // La fiche clôt la session Google : la prochaine frappe en ouvre une nouvelle.
    session.current = null;
    let issue: IssueChoix;
    try {
      issue = await actions.choisir({ placeId: suggestion.placeId, session: jeton, saisie: value, principal: suggestion.principal });
    } catch {
      issue = { statut: "indisponible" };
    }
    if (numero !== requete.current) return;
    if (issue.statut === "ok") {
      if (issue.ville.nomMaison === null && nomIncomplet(value, suggestion.principal)) {
        setErreurChoix(err.nomIncomplet);
        setEtat("repos");
        return;
      }
      setErreurChoix(null);
      setSuggestions([]);
      setEtat("choisie");
      onChoix({ destination: issue.ville.nomMaison ?? value.trim(), placeId: issue.ville.placeId, country: issue.ville.country, timeZone: issue.ville.timeZone });
    } else if (issue.statut === "hors_table") {
      // `api` (0141 § 8.2) : la recherche a répondu, mais la ville n'est pas l'une des 62 villes du MVP.
      setErreurChoix(err.horsTable);
      setEtat("repos");
      onHorsTable?.(value);
    } else if (issue.statut === "pays_inconnu") {
      setErreurChoix(err.paysInconnu);
      setEtat("repos");
    } else if (issue.statut === "acces" && accesPossible) {
      setEtat("acces");
      onAcces();
    } else {
      const refus = refusDe(issue.statut);
      setEtat(refus.etat);
      onDisponibilite(false, refus.motif);
    }
  }

  function surTouche(evenement: KeyboardEvent<HTMLInputElement>) {
    const n = suggestions.length;
    if (evenement.key === "ArrowDown" && n > 0) {
      evenement.preventDefault();
      setOuverte(true);
      setActive((precedente) => (precedente + 1) % n);
    } else if (evenement.key === "ArrowUp" && n > 0) {
      evenement.preventDefault();
      setOuverte(true);
      setActive((precedente) => (precedente <= 0 ? n - 1 : precedente - 1));
    } else if (evenement.key === "Enter" && ouverte && active >= 0) {
      evenement.preventDefault();
      void choisir(active);
    } else if (evenement.key === "Escape" && ouverte) {
      evenement.preventDefault();
      setOuverte(false);
      setActive(-1);
    }
  }

  const pays = choisie ? paysParCode(choisie.country) : null;
  // Ville et pays seulement (revue du head de4ab92, mineur 10) : le fuseau, valeur maison, n'est pas répété ici.
  const confirmation = pays ? format(v.choisie, { ville: value.trim(), pays: pays.nom }) : null;
  const message = error ?? erreurChoix;
  const textes: Partial<Record<Etat, string>> = {
    recherche: v.recherche,
    liste: suggestions.length === 1 ? v.uneSuggestion : format(v.suggestions, { n: suggestions.length }),
    aucune: v.aucune,
    indisponible: v.indisponible,
    limite: v.limite,
    limiteJour: v.limiteJour,
    acces: v.acces,
    choix: v.choix,
  };
  // Ville choisie (à l'instant, ou gardée dans le brouillon) : la confirmation, en `ink` semi-gras ; sinon l'état. Une
  // erreur affichée remplace l'état (même texte qu'« indisponible » au repli : une seule ligne, jamais deux).
  const montrerConfirmation = confirmation !== null && message === null && (etat === "choisie" || etat === "repos");
  // Erreur rendue par la recherche après un choix (nom incomplet, pays ou ville non proposés) : elle n'a pas de
  // « Continuer » pour la faire lire ; la région d'état l'annonce, pour les lecteurs d'écran seulement (texte visible
  // une seule fois, sous le champ).
  const annonceErreur = error === null && erreurChoix !== null;
  const statut = annonceErreur ? erreurChoix : message !== null ? null : montrerConfirmation ? confirmation : (textes[etat] ?? null);
  const visible = ouverte && suggestions.length > 0;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <FieldLabel htmlFor={id}>{libelle}</FieldLabel>
      <FieldHelp id={helpId(id)}>{v.aide}</FieldHelp>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={visible ? listeId : undefined}
        aria-activedescendant={visible && active >= 0 ? `${listeId}-${active}` : undefined}
        aria-invalid={message ? true : undefined}
        aria-describedby={describedBy(helpId(id), message && errorId(id), montrerConfirmation && statutId)}
        autoComplete="off"
        maxLength={maxLength}
        value={value}
        onChange={(evenement) => {
          setErreurChoix(null);
          onSaisie(evenement.target.value);
          programmer(evenement.target.value);
        }}
        onKeyDown={surTouche}
        onBlur={() => setOuverte(false)}
        className={INPUT_CLASS}
      />
      <FieldMessage id={errorId(id)} message={message} />
      {/* Région présente dès l'affichage ; texte en flux, masqué pour les yeux seulement quand elle est vide. */}
      <p id={statutId} role="status" className={annonceErreur ? "sr-only" : montrerConfirmation ? "flex items-start gap-2 text-corps-s font-semibold text-ink" : "text-corps-s text-ink-soft empty:sr-only"}>
        {/* Coche `line` (revue du head de4ab92, mineur 11) : la confirmation ne se lit pas comme l'erreur du champ. */}
        {montrerConfirmation ? <IconCoche data-part="ville-coche" className="size-5 text-line" /> : null}
        {statut}
      </p>
      {visible ? (
        <div className="flex flex-col gap-2 overflow-hidden rounded-block border border-outline bg-raised py-1">
          <ul id={listeId} role="listbox" aria-label={v.liste} className="flex flex-col">
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion.placeId}
                id={`${listeId}-${index}`}
                role="option"
                aria-selected={index === active}
                // Le focus reste dans le champ : la liste se fermerait sinon avant le clic.
                onMouseDown={(evenement) => evenement.preventDefault()}
                onClick={() => void choisir(index)}
                className={`flex min-h-(--touch-target) cursor-pointer flex-col justify-center px-4 py-2 ${index === active ? "bg-muted outline-2 -outline-offset-2 outline-line" : ""}`}
              >
                <span className="text-corps text-ink">{suggestion.principal}</span>
                {suggestion.secondaire ? <span className="text-corps-s text-ink-soft">{suggestion.secondaire}</span> : null}
              </li>
            ))}
          </ul>
          {/* Attribution des données Places sans carte Google : texte « Google Maps », non traduit, sans retour à la ligne,
              en `ink` (0129 § 5.7). */}
          <p translate="no" className="px-4 pb-1 text-legende font-normal whitespace-nowrap text-ink">
            {v.attribution}
          </p>
        </div>
      ) : null}
    </div>
  );
}
