"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";

import { PlacesAttribution } from "@/components/carte/PlacesAttribution";
import { Button } from "@/components/ligne/Button";
import { IconButton } from "@/components/ligne/IconButton";
import { IconCroix } from "@/components/ligne/icons";
import { SegmentedControl } from "@/components/ligne/SegmentedControl";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import type { ApiError, PatchResult, PlaceSearchResult, Result, RevisionPreview as RevisionPreviewData } from "@/contracts";
import { PLACE_SEARCH_QUERY_LENGTH } from "@/contracts/values";
import { describedBy, EMPTY_LIVE_REGION_CLASS, INPUT_CLASS } from "@/features/creation/fields";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";
import { applyAddPlace, previewAddPlace, searchPlaces } from "@/server/actions/lieux";
import { applyRevert } from "@/server/actions/retouches";

import {
  demandeDuMoment,
  etapeAjoutee,
  joursAvecEtapeEcrite,
  momentPropose,
  momentsDuJour,
  trajetsCalculesApres,
  type DureesPrevues,
  type EntreeAjout,
  type MomentAjout,
} from "./ajouter-lieu";
import { ARIA_DISABLED, RevisionPreview } from "./RevisionPreview";
import { useTripShell } from "./TripShell";

const t = messages.sejour.ajouter;
const rv = messages.revision;


/** Actions serveur injectées (tests) ; celles de `@/server/actions/lieux` et `@/server/actions/retouches` par défaut. */
export type AjouterLieuCalls = {
  searchPlaces(input: unknown): Promise<Result<PlaceSearchResult[]>>;
  previewAddPlace(input: unknown): Promise<Result<RevisionPreviewData>>;
  applyAddPlace(input: unknown): Promise<Result<PatchResult>>;
  applyRevert(input: unknown): Promise<Result<PatchResult>>;
};

const APPELS: AjouterLieuCalls = { searchPlaces, previewAddPlace, applyAddPlace, applyRevert };

/** État de la recherche ; les résultats vivent en mémoire de l'écran seulement (F7-PO-9, décision 0147 § 12 S2). */
type Recherche =
  | { type: "idle" }
  | { type: "waiting" }
  | { type: "results"; results: readonly PlaceSearchResult[] }
  | { type: "error"; message: string };

/** Refus d'un aperçu ou d'une application, affichés par un bandeau (décisions de la PR, Q770). */
type Refus = "noOption" | "conflict" | "indisponible" | "tropDeGestes" | "tropDeVersions" | "enPreparation" | "nonDebloque" | "error";

type Phase = { type: "idle" } | { type: "waiting" } | { type: "preview"; preview: RevisionPreviewData } | { type: "banner"; refus: Refus };

/** Code d'erreur d'un aperçu ou d'une application → bandeau (le nom refusé est rendu au champ, pas ici). */
function refusDe(error: ApiError): Refus {
  switch (error.code) {
    case "no_option":
      return "noOption";
    case "version_conflict":
      return "conflict";
    case "provider_error":
    case "cost_cap_reached":
      return "indisponible";
    case "rate_limited":
      return "tropDeGestes";
    case "generation_in_progress":
      return "enPreparation";
    case "not_unlocked":
      return "nonDebloque";
    case "validation_failed":
      return error.field === "baseVersion" ? "tropDeVersions" : "error";
    default:
      return "error";
  }
}

const TEXTE_REFUS: Readonly<Record<Exclude<Refus, "noOption" | "conflict">, string>> = {
  indisponible: t.calculIndisponible,
  tropDeGestes: t.tropDeGestes,
  tropDeVersions: t.tropDeVersions,
  enPreparation: t.enPreparation,
  nonDebloque: t.nonDebloque,
  error: rv.erreur,
};

function libelleMoment(moment: MomentAjout): string {
  if (moment.type === "libre") return format(t.tempsLibre, { from: moment.from, to: moment.to });
  return moment.meal === "lunch" ? t.dejeuner : t.diner;
}

function libelleResultat(result: PlaceSearchResult): string {
  return result.address === undefined ? result.name : format(t.resultat, { name: result.name, address: result.address });
}

export interface AjouterLieuViewProps {
  /** Jour de l'adresse, validé par la page. */
  dayIndex: number;
  /** Moment désigné par l'adresse (lien « Idées » ou repas pas encore choisi), sinon `null`. */
  entree: EntreeAjout | null;
  /** Paramètres d'adresse mal formés ou inconnus : l'adresse est remplacée sans eux, sans erreur (F7-PO-8). */
  cleanAddress?: boolean;
  /** Durées prévues par type (`dureesParDefaut`), pour l'heure proposée (M5-PO-12). */
  durees: DureesPrevues;
  /** `mock` : version fixe du jeu simulé ; `api` : `null`, la version courante du voyage (`revision.version()`). */
  versionSimulee: number | null;
  /** Noms et adresses venus de Google (`api`) : mention « Données de lieux : Google » sous les résultats. */
  resultatsGoogle: boolean;
  /** Actions injectées (tests). */
  calls?: AjouterLieuCalls;
  /** Identifiant de demande (tests) ; `crypto.randomUUID` par défaut. */
  newRequestId?: () => string;
}

/**
 * « Ajouter un lieu » (spécification M5 § 6, M5-PO-10 à M5-PO-12 ; F7, F7-PO-8 à F7-PO-11 ; décision 0147 § 3, § 11 et
 * addendum A.1 à A.7), dans le panneau du voyage : recherche par nom à la demande, résultats en groupe radio (jamais sur
 * la carte), nom dans ton programme toujours vide à l'ouverture (jamais le nom Google ni la requête), moment du jour avec
 * l'heure proposée, aperçu des effets, puis « Appliquer » : toast « Lieu ajouté. » et « Annuler » 5 s.
 *
 * Ni la requête, ni les noms et adresses des résultats ne sortent de la mémoire de l'écran : ni adresse, ni stockage du
 * navigateur, ni mesure. La demande d'aperçu et d'application ne porte que le `resultId` (le `placeId`) et le nom saisi
 * (objet strict côté serveur, critère 21).
 */
export function AjouterLieuView({
  dayIndex,
  entree,
  cleanAddress = false,
  durees,
  versionSimulee,
  resultatsGoogle,
  calls = APPELS,
  newRequestId,
}: AjouterLieuViewProps) {
  const shell = useTripShell();
  const { day, routes, trip } = shell;
  const router = useRouter();
  const online = useOnline();
  const requestId = useMemo(() => newRequestId ?? (() => crypto.randomUUID()), [newRequestId]);

  const ids = useId();
  const searchId = `${ids}-recherche`;
  const searchErrorId = `${ids}-recherche-erreur`;
  const resultsTitleId = `${ids}-resultats`;
  const nameId = `${ids}-nom`;
  const nameHelpId = `${ids}-nom-aide`;
  const nameErrorId = `${ids}-nom-erreur`;
  const momentTitleId = `${ids}-moment`;
  const momentErrorId = `${ids}-moment-erreur`;
  const offlineId = `${ids}-hors-ligne`;

  const moments = useMemo(() => (day ? momentsDuJour(day) : []), [day]);
  const [momentId, setMomentId] = useState<string | null>(() => (day ? momentPropose(momentsDuJour(day), entree, durees)?.id ?? null : null));
  const [momentError, setMomentError] = useState(false);

  const [query, setQuery] = useState("");
  const [queryError, setQueryError] = useState(false);
  const [recherche, setRecherche] = useState<Recherche>({ type: "idle" });
  const [resultId, setResultId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ type: "idle" });
  const [status, setStatus] = useState<string | null>(null);
  // Version vue par l'écran : celle du jeu simulé (`mock`), sinon celle de la révision enregistrée ; relue après un conflit.
  const [versionVue, setVersionVue] = useState<number | null>(null);

  const titleRef = useRef<HTMLHeadingElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const momentRef = useRef<HTMLDivElement>(null);
  const previewTitleRef = useRef<HTMLHeadingElement>(null);
  const noOptionRef = useRef<HTMLDivElement>(null);
  const token = useRef(0);
  const applying = useRef(false);
  const [focusTarget, setFocusTarget] = useState<{ target: "preview" | "noOption"; serial: number } | null>(null);

  // Ouverture : focus sur le titre (handover § 7) ; paramètres d'adresse invalides retirés sans erreur (F7-PO-8).
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  useEffect(() => {
    if (cleanAddress) router.replace(routes.ajouter(dayIndex), { scroll: false });
  }, [cleanAddress, router, routes, dayIndex]);
  useEffect(() => {
    if (!focusTarget) return;
    (focusTarget.target === "preview" ? previewTitleRef.current : noOptionRef.current)?.focus();
  }, [focusTarget]);
  // Démontage : toute réponse arrivée ensuite est ignorée.
  useEffect(
    () => () => {
      token.current += 1;
    },
    [],
  );

  const focus = (target: "preview" | "noOption") => setFocusTarget((previous) => ({ target, serial: (previous?.serial ?? 0) + 1 }));

  /** Un aperçu correspond toujours au lieu, au nom et au moment visibles (F7-PO-21). */
  const invalidate = () => {
    if (phase.type === "idle") return;
    token.current += 1;
    setPhase({ type: "idle" });
    setStatus(null);
  };

  const backToDay = () => {
    token.current += 1;
    router.replace(routes.jour(dayIndex), { scroll: false });
  };

  const header = (
    <header className="flex flex-col gap-1">
      <div className="flex items-start justify-between gap-3">
        <h1 ref={titleRef} tabIndex={-1} className="min-w-0 text-titre-fiche font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">
          {t.titre}
        </h1>
        <IconButton icon={<IconCroix />} label={t.retourJournee} onClick={backToDay} data-part="retour-journee" />
      </div>
      <p data-part="jour" className="text-corps-s text-ink-soft">
        {format(t.jour, { n: dayIndex })}
      </p>
    </header>
  );

  // Avant le déblocage (M5-PO-1) : explication et retour, sans recherche (le serveur refuse aussi, `not_unlocked`).
  if (!day || !shell.addPlaceAvailable || !trip.unlocked) {
    return (
      <div data-part="ajouter" className="flex flex-col gap-6 px-5 pt-2 pb-8">
        {header}
        <p data-part="non-debloque" className="text-corps text-ink-2">
          {t.nonDebloque}
        </p>
        <Button asChild variant="secondary" className="w-full">
          <Link href={routes.jour(dayIndex)}>{t.retourJournee}</Link>
        </Button>
      </div>
    );
  }

  const baseVersion = versionVue ?? versionSimulee ?? shell.revision.version();
  const results = recherche.type === "results" ? recherche.results : [];
  const chosen = results.find((result) => result.resultId === resultId) ?? null;
  const moment = moments.find((candidate) => candidate.id === momentId) ?? null;

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (!online) return;
    const trimmed = query.trim();
    if (trimmed.length < PLACE_SEARCH_QUERY_LENGTH.min) {
      setQueryError(true);
      searchRef.current?.focus();
      return;
    }
    setQueryError(false);
    token.current += 1;
    const current = token.current;
    setRecherche({ type: "waiting" });
    setResultId(null);
    setPhase({ type: "idle" });
    setStatus(t.enCours);
    let result: Result<PlaceSearchResult[]> | null;
    try {
      result = await calls.searchPlaces({ tripId: trip.id, day: dayIndex, query: trimmed });
    } catch {
      result = null;
    }
    if (token.current !== current) return;
    if (result?.ok) {
      setRecherche({ type: "results", results: result.value });
      const n = result.value.length;
      setStatus(n === 0 ? t.aucunResultat : n === 1 ? t.unResultat : format(t.nResultats, { n }));
      return;
    }
    const code = result?.error.code;
    const message = code === "rate_limited" ? t.plafondRecherche : code === "not_unlocked" ? t.nonDebloque : t.rechercheIndisponible;
    setRecherche({ type: "error", message });
    setStatus(null);
  };

  /** Demande d'aperçu ou d'application : jamais de nom Google, d'adresse ni de requête (critère 21). */
  const demande = () => {
    if (!chosen || !moment) return null;
    const { time, kind } = demandeDuMoment(moment);
    return { tripId: trip.id, baseVersion, day: dayIndex, time, kind, name: name.trim(), resultId: chosen.resultId };
  };

  const showRefus = (error: ApiError) => {
    if (error.code === "validation_failed" && error.field === "name") {
      setNameError(t.nomRefuse);
      setPhase({ type: "idle" });
      setStatus(null);
      nameRef.current?.focus();
      return;
    }
    if (error.code === "version_conflict" && error.currentVersion !== undefined) setVersionVue(error.currentVersion);
    const refus = refusDe(error);
    setPhase({ type: "banner", refus });
    setStatus(null);
    if (refus === "noOption") focus("noOption");
  };

  const ask = async () => {
    if (!online) return;
    const empty = name.trim().length === 0;
    setNameError(empty ? t.nomVide : null);
    setMomentError(moment === null);
    if (empty) {
      nameRef.current?.focus();
      return;
    }
    if (moment === null) {
      momentRef.current?.focus();
      return;
    }
    const input = demande();
    if (input === null) return;
    token.current += 1;
    const current = token.current;
    setPhase({ type: "waiting" });
    setStatus(t.calcul);
    let result: Result<RevisionPreviewData> | null;
    try {
      result = await calls.previewAddPlace(input);
    } catch {
      result = null;
    }
    if (token.current !== current) return;
    if (result === null) {
      setPhase({ type: "banner", refus: "error" });
      setStatus(null);
      return;
    }
    if (!result.ok) {
      showRefus(result.error);
      return;
    }
    setPhase({ type: "preview", preview: result.value });
    setStatus(t.pret);
    focus("preview");
  };

  const apply = async () => {
    // Un seul « Appliquer » à la fois : un second appui pendant l'application ne fait rien.
    if (!online || phase.type !== "preview" || applying.current) return;
    const input = demande();
    if (input === null) return;
    const { preview } = phase;
    applying.current = true;
    const id = requestId();
    let result: Result<PatchResult> | null;
    try {
      result = await calls.applyAddPlace({ ...input, requestId: id });
    } catch {
      result = null;
    }
    if (result === null || !result.ok) {
      applying.current = false;
      if (result === null) {
        setPhase({ type: "banner", refus: "error" });
        setStatus(null);
      } else {
        showRefus(result.error);
      }
      return;
    }
    const written = result.value.version;
    const stopId = `ajout-${id}`;
    const base = input.baseVersion;
    const surApi = versionSimulee === null;
    // Les jours de l'aperçu, avec l'identifiant de l'étape écrite, s'affichent aussitôt (puis la relecture sur `api`).
    shell.showAddedPlace(joursAvecEtapeEcrite(preview, stopId), surApi ? written : null);
    shell.notifyApplied({
      message: t.ajoute,
      dayIndex,
      highlighted: [stopId],
      targetStopId: stopId,
      // `api` : un retour vers la version d'avant l'ajout ; `mock` : l'ajout reste en mémoire, `actions.undo()` (Q762).
      ...(surApi
        ? {
            undo: async () => {
              const annule = await calls.applyRevert({ tripId: trip.id, requestId: requestId(), baseVersion: written, toVersion: base });
              if (!annule.ok) throw new Error("annulation refusée");
              shell.recordRevert(annule.value.version);
            },
          }
        : {}),
    });
    router.push(routes.jour(dayIndex), { scroll: false });
  };

  const cible = phase.type === "preview" ? etapeAjoutee(phase.preview) : null;
  const disabled = online ? undefined : true;
  const disabledBy = online ? undefined : offlineId;

  return (
    <div data-part="ajouter" className="flex flex-col gap-6 px-5 pt-2 pb-8">
      {header}

      {online ? null : (
        <div id={offlineId}>
          <StatusBanner kind="offline" message={rv.horsLigne} />
        </div>
      )}

      <form role="search" onSubmit={search} className="flex flex-col gap-2">
        <label htmlFor={searchId} className="text-corps font-bold text-ink">
          {t.champRecherche}
        </label>
        <input
          ref={searchRef}
          id={searchId}
          type="search"
          value={query}
          maxLength={PLACE_SEARCH_QUERY_LENGTH.max}
          autoComplete="off"
          aria-invalid={queryError || undefined}
          aria-describedby={describedBy(queryError && searchErrorId)}
          onChange={(event) => {
            setQuery(event.target.value);
            setQueryError(false);
          }}
          className={INPUT_CLASS}
        />
        <p id={searchErrorId} role="alert" className={cn("text-corps-s font-semibold text-ink", queryError ? undefined : EMPTY_LIVE_REGION_CLASS)}>
          {queryError ? t.deuxLettres : null}
        </p>
        <Button type="submit" variant="primary" className={cn("w-full", ARIA_DISABLED)} aria-disabled={disabled} aria-describedby={disabledBy} data-part="rechercher">
          {t.rechercher}
        </Button>
      </form>

      <section aria-labelledby={resultsTitleId} data-part="resultats" aria-busy={recherche.type === "waiting"} className="flex flex-col gap-3">
        <h2 id={resultsTitleId} className={recherche.type === "results" && results.length > 0 ? "text-section font-extrabold text-ink" : "sr-only"}>
          {t.resultats}
        </h2>
        {/* Nombre de résultats, puis état de l'aperçu : région présente dès le chargement (0018, « Attente »). */}
        <p role="status" data-part="annonce" className={cn("text-corps-s text-ink-soft", status ? undefined : EMPTY_LIVE_REGION_CLASS)}>
          {status}
        </p>
        {recherche.type === "error" ? <StatusBanner kind="error" message={recherche.message} /> : null}
        {results.length > 0 ? (
          <>
            <SegmentedControl
              options={results.map((result) => ({ value: result.resultId, label: libelleResultat(result) }))}
              value={resultId}
              onChange={(value) => {
                setResultId(value);
                invalidate();
              }}
              label={t.resultats}
              labelledBy={resultsTitleId}
              orientation="vertical"
            />
            {/* Noms et adresses de Google à l'écran : mention visible tant qu'ils le sont (F4-PO-9, critère 26). */}
            <PlacesAttribution placesFromGoogle={resultatsGoogle} />
          </>
        ) : null}
      </section>

      {chosen ? (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor={nameId} className="text-corps font-bold text-ink">
              {t.nom}
            </label>
            <p id={nameHelpId} className="text-corps-s text-ink-soft">
              {t.nomAide}
            </p>
            {/* Toujours vide à l'ouverture, sans texte indicatif ni copie du nom Google (M5-PO-10, F7-PO-10, C28). */}
            <input
              ref={nameRef}
              id={nameId}
              type="text"
              value={name}
              required
              autoComplete="off"
              aria-invalid={nameError !== null || undefined}
              aria-describedby={describedBy(nameHelpId, nameError !== null && nameErrorId)}
              onChange={(event) => {
                setName(event.target.value);
                setNameError(null);
                invalidate();
              }}
              className={INPUT_CLASS}
            />
            <p id={nameErrorId} role="alert" className={cn("text-corps-s font-semibold text-ink", nameError ? undefined : EMPTY_LIVE_REGION_CLASS)}>
              {nameError}
            </p>
          </div>

          <section aria-labelledby={momentTitleId} className="flex flex-col gap-3">
            <h2 id={momentTitleId} className="text-section font-extrabold text-ink">
              {t.quelMoment}
            </h2>
            {moments.length > 0 ? (
              <SegmentedControl
                groupRef={momentRef}
                options={moments.map((candidate) => ({ value: candidate.id, label: libelleMoment(candidate) }))}
                value={momentId}
                onChange={(value) => {
                  setMomentId(value);
                  setMomentError(false);
                  invalidate();
                }}
                label={t.quelMoment}
                labelledBy={momentTitleId}
                orientation="vertical"
                invalid={momentError}
                describedBy={momentErrorId}
              />
            ) : (
              <p data-part="aucun-moment" className="text-corps text-ink-2">
                {t.aucunMoment}
              </p>
            )}
            <p id={momentErrorId} role="alert" className={cn("text-corps-s font-semibold text-ink", momentError ? undefined : EMPTY_LIVE_REGION_CLASS)}>
              {momentError ? t.choisisMoment : null}
            </p>
          </section>

          {phase.type === "preview" || moments.length === 0 ? null : (
            <Button
              variant="primary"
              className={cn("w-full", ARIA_DISABLED)}
              aria-disabled={disabled}
              aria-describedby={disabledBy}
              data-part="voir-effet"
              onClick={ask}
            >
              {t.voirEffet}
            </Button>
          )}
        </>
      ) : null}

      <div data-part="zone-apercu" aria-busy={phase.type === "waiting"} className="flex flex-col gap-4">
        {phase.type === "waiting" ? (
          <div aria-hidden="true" data-part="squelette" className="flex flex-col gap-3">
            <span className="h-6 w-3/4 rounded-block bg-muted" />
            <span className="h-4 w-1/2 rounded-block bg-muted" />
            <span className="h-4 w-full rounded-block bg-muted" />
          </div>
        ) : null}
        {phase.type === "preview" ? (
          <>
            <section aria-labelledby={`${ids}-etape`} data-part="etape-ajoutee" className="flex flex-col gap-2 rounded-block border border-outline bg-raised p-4">
              <h2 id={`${ids}-etape`} ref={previewTitleRef} tabIndex={-1} className="text-section font-extrabold text-ink">
                {cible?.stop.name ?? name.trim()}
              </h2>
              {cible ? (
                <p data-part="moment" className="text-corps-s text-ink-soft tabular-nums">
                  {cible.stop.end ? format(t.moment, { start: cible.stop.start, end: cible.stop.end }) : cible.stop.start}
                </p>
              ) : null}
              {trajetsCalculesApres(phase.preview) ? (
                <p data-part="trajets-apres" className="text-corps-s text-ink-2">
                  {t.trajetsApres}
                </p>
              ) : null}
            </section>
            <RevisionPreview preview={phase.preview} onApply={apply} onCancel={backToDay} disabledBy={disabledBy} />
          </>
        ) : null}
        {phase.type === "banner" && phase.refus === "noOption" ? (
          <div ref={noOptionRef} tabIndex={-1} data-part="bandeau-pas-de-place" className="rounded-block">
            <StatusBanner kind="noOption" message={t.pasDePlace} />
          </div>
        ) : null}
        <div role="alert" className={phase.type === "banner" && phase.refus !== "noOption" ? undefined : EMPTY_LIVE_REGION_CLASS}>
          {phase.type === "banner" && phase.refus === "conflict" ? (
            <StatusBanner
              kind="conflict"
              announce={false}
              message={t.conflit}
              action={
                <Button variant="secondary" size="sm" className={ARIA_DISABLED} aria-disabled={disabled} aria-describedby={disabledBy} onClick={ask}>
                  {t.revoirEffet}
                </Button>
              }
            />
          ) : null}
          {phase.type === "banner" && phase.refus !== "noOption" && phase.refus !== "conflict" ? (
            <StatusBanner
              kind="error"
              announce={false}
              message={TEXTE_REFUS[phase.refus]}
              action={
                phase.refus === "nonDebloque" || phase.refus === "tropDeVersions" ? undefined : (
                  <Button variant="secondary" size="sm" className={ARIA_DISABLED} aria-disabled={disabled} aria-describedby={disabledBy} onClick={ask}>
                    {rv.reessayer}
                  </Button>
                )
              }
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
