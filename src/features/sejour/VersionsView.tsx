"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ligne/Button";
import { ChangeSet, isShownChange } from "@/components/ligne/ChangeSet";
import { IconButton } from "@/components/ligne/IconButton";
import { IconCroix } from "@/components/ligne/icons";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import type { ApiError, PatchResult, Result, RevertPreview, TripVersionPage, TripVersionSummary } from "@/contracts";
import { EMPTY_LIVE_REGION_CLASS } from "@/features/creation/fields";
import { useClientNow } from "@/features/voyage/use-client-now";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";
import { applyRevert, listTripVersions, previewRevert } from "@/server/actions/retouches";

import { ARIA_DISABLED } from "./RevisionPreview";
import { useTripShell } from "./TripShell";
import { avantLeDeblocage, formatMomentPhrase, formatMomentVersion, libelleVersion } from "./versions";

const t = messages.sejour.versions;
const r = messages.revision;

/** Titres de niveau 3 en style `bloc` (décision 0018 § 7), comme l'aperçu des révisions. */
const BLOC = "text-(length:--ligne-texte-bloc) leading-(--ligne-texte-bloc-interligne) font-extrabold text-ink";

/** Actions serveur injectées (tests) ; celles de `@/server/actions/retouches` par défaut. */
export type VersionCalls = {
  listTripVersions(input: unknown): Promise<Result<TripVersionPage>>;
  previewRevert(input: unknown): Promise<Result<RevertPreview>>;
  applyRevert(input: unknown): Promise<Result<PatchResult>>;
};

const APPELS: VersionCalls = { listTripVersions, previewRevert, applyRevert };

/** Message d'un refus : conflit de version, borne du nombre de versions, ou erreur récupérable. */
type Bandeau = "conflit" | "trop" | "erreurApercu" | "erreurRetour" | "erreurListe";

function bandeauDe(error: ApiError | null, defaut: Bandeau): Bandeau {
  if (error?.code === "version_conflict") return "conflit";
  if (error?.code === "validation_failed" && error.field === "baseVersion") return "trop";
  return defaut;
}

type Phase =
  | { readonly type: "liste" }
  | { readonly type: "attente"; readonly cible: TripVersionSummary }
  | { readonly type: "apercu"; readonly cible: TripVersionSummary; readonly apercu: RevertPreview };

export interface VersionsViewProps {
  tripId: string;
  /** Première page, lue par la page ; `null` si la lecture a échoué (« Réessayer »). */
  initial: TripVersionPage | null;
  calls?: VersionCalls;
  /** Identifiant de demande (tests) ; `crypto.randomUUID` par défaut. */
  newRequestId?: () => string;
  /** Fuseau des dates (tests seulement) ; celui de l'appareil par défaut. */
  timeZone?: string;
}

/**
 * « Versions du programme » (tâche M5b ; spécification M5 § 4 ; décision 0147 § 5.3), dans le panneau du voyage : versions
 * de la plus récente à la plus ancienne, par pages de 20, « Version actuelle » sur la première, « Revenir à cette version »
 * sur chaque version proposée au retour ; les versions d'avant le déblocage sont listées à part, sans bouton. Revenir
 * ouvre l'aperçu « Ce qui change » (rien ne change sans lui, principe produit 5) ; « Appliquer » écrit une version, ramène
 * au Séjour avec le toast « Programme rétabli. » et « Annuler » 5 s (un retour vers la version d'avant) ; « Annuler » de
 * l'aperçu n'écrit rien. Les dates sont celles de l'appareil, rendues après le montage.
 */
export function VersionsView({ tripId, initial, calls = APPELS, newRequestId = () => crypto.randomUUID(), timeZone }: VersionsViewProps) {
  const shell = useTripShell();
  const { routes } = shell;
  const router = useRouter();
  const online = useOnline();
  const monte = useClientNow() !== null;
  const ids = useId();
  const offlineId = `${ids}-hors-ligne`;
  const listeHorsLigneId = `${ids}-liste-hors-ligne`;

  const [items, setItems] = useState<readonly TripVersionSummary[]>(initial?.items ?? []);
  const [nextBefore, setNextBefore] = useState<number | null>(initial?.nextBefore ?? null);
  const [lue, setLue] = useState(initial !== null);
  const [chargement, setChargement] = useState(false);
  const [phase, setPhase] = useState<Phase>({ type: "liste" });
  // Première page illisible (débit, panne) : le bandeau et « Réessayer » dès l'ouverture.
  const [bandeau, setBandeau] = useState<Bandeau | null>(initial === null ? "erreurListe" : null);
  const [statut, setStatut] = useState<string | null>(null);

  const titleRef = useRef<HTMLHeadingElement>(null);
  const apercuRef = useRef<HTMLHeadingElement>(null);
  const premiereNouvelle = useRef<number | null>(null);
  const retourFocus = useRef<number | null>(null);
  const applying = useRef(false);
  const token = useRef(0);

  // Ouverture : focus sur le titre (handover § 7) ; la fiche fermée pour venir ici ne reprend pas le focus.
  const { consumeClosedFiche } = shell;
  useEffect(() => {
    titleRef.current?.focus();
    consumeClosedFiche();
  }, [consumeClosedFiche]);

  // « Retour » sur la carte mène au Séjour tant que l'écran est monté.
  const { markVersionsOpen } = shell;
  useEffect(() => {
    markVersionsOpen(true);
    return () => markVersionsOpen(false);
  }, [markVersionsOpen]);

  // Aperçu affiché : focus sur son titre.
  const apercuAffiche = phase.type === "apercu" ? phase.apercu : null;
  useEffect(() => {
    if (apercuAffiche !== null) apercuRef.current?.focus();
  }, [apercuAffiche]);

  // Retour à la liste (« Annuler » de l'aperçu) : focus sur « Revenir à cette version » de la même ligne ; page suivante
  // chargée : focus sur la première version nouvelle.
  useEffect(() => {
    if (phase.type !== "liste") return;
    const cible = retourFocus.current ?? premiereNouvelle.current;
    if (cible === null) return;
    const selecteur = retourFocus.current !== null ? `[data-version="${cible}"] [data-part="revenir"]` : `[data-version="${cible}"]`;
    retourFocus.current = null;
    premiereNouvelle.current = null;
    document.querySelector<HTMLElement>(selecteur)?.focus();
  }, [phase, items]);

  // Démontage : aucune réponse arrivée ensuite n'est affichée.
  useEffect(() => () => void (token.current += 1), []);

  const actuelle = items.find((item) => item.current) ?? null;

  /** Première page relue (après un conflit, ou « Réessayer »). */
  const relire = async () => {
    const current = ++token.current;
    let result: Result<TripVersionPage> | null;
    try {
      result = await calls.listTripVersions({ tripId });
    } catch {
      result = null;
    }
    if (token.current !== current) return;
    if (result === null || !result.ok) {
      setBandeau("erreurListe");
      return;
    }
    setItems(result.value.items);
    setNextBefore(result.value.nextBefore);
    setLue(true);
    setBandeau((avant) => (avant === "erreurListe" ? null : avant));
  };

  const plusAnciennes = async () => {
    if (nextBefore === null || chargement) return;
    setChargement(true);
    // Bouton inactif pendant la lecture : l'attente est annoncée (revue de la PR 938, mineur 6).
    setStatut(t.chargement);
    const current = ++token.current;
    let result: Result<TripVersionPage> | null;
    try {
      result = await calls.listTripVersions({ tripId, before: nextBefore });
    } catch {
      result = null;
    }
    if (token.current !== current) return;
    setChargement(false);
    setStatut(null);
    if (result === null || !result.ok) {
      setBandeau("erreurListe");
      return;
    }
    const page = result.value;
    setBandeau(null);
    premiereNouvelle.current = page.items[0]?.version ?? null;
    setItems((avant) => [...avant, ...page.items.filter((item) => !avant.some((deja) => deja.version === item.version))]);
    setNextBefore(page.nextBefore);
  };

  const revenir = async (cible: TripVersionSummary) => {
    // Hors ligne, « Revenir à cette version » est inactif (`aria-disabled`, décrit par le bandeau hors ligne).
    if (actuelle === null || !online) return;
    const current = ++token.current;
    setBandeau(null);
    setPhase({ type: "attente", cible });
    setStatut(t.calcul);
    let result: Result<RevertPreview> | null;
    try {
      result = await calls.previewRevert({ tripId, baseVersion: actuelle.version, toVersion: cible.version });
    } catch {
      result = null;
    }
    if (token.current !== current) return;
    if (result === null || !result.ok) {
      setStatut(null);
      setBandeau(bandeauDe(result?.ok === false ? result.error : null, "erreurApercu"));
      retourFocus.current = cible.version;
      setPhase({ type: "liste" });
      if (result?.ok === false && result.error.code === "version_conflict") await relire();
      return;
    }
    setStatut(t.pret);
    setPhase({ type: "apercu", cible, apercu: result.value });
  };

  const annulerApercu = () => {
    if (phase.type === "liste") return;
    token.current += 1;
    retourFocus.current = phase.cible.version;
    setStatut(null);
    setBandeau(null);
    setPhase({ type: "liste" });
  };

  const appliquer = async () => {
    // Un seul « Appliquer » à la fois ; hors ligne, le bouton est inactif (`aria-disabled`).
    if (!online || phase.type !== "apercu" || applying.current) return;
    const { apercu, cible } = phase;
    applying.current = true;
    let result: Result<PatchResult> | null;
    try {
      result = await calls.applyRevert({ tripId, requestId: newRequestId(), baseVersion: apercu.baseVersion, toVersion: apercu.toVersion });
    } catch {
      result = null;
    }
    if (result === null || !result.ok) {
      applying.current = false;
      const kind = bandeauDe(result?.ok === false ? result.error : null, "erreurRetour");
      setBandeau(kind);
      if (kind === "conflit") {
        // Le programme a changé : retour à la liste relue, la version actuelle sert de base au prochain geste.
        retourFocus.current = cible.version;
        setStatut(null);
        setPhase({ type: "liste" });
        await relire();
      }
      return;
    }
    const ecrite = result.value.version;
    const avant = apercu.baseVersion;
    // « Annuler » du toast : un retour ordinaire vers la version d'avant, une seule demande (rejouée telle quelle).
    const annulation = newRequestId();
    shell.recordRevert(ecrite);
    shell.notifyReverted(t.retabli, async () => {
      const annule = await calls.applyRevert({ tripId, requestId: annulation, baseVersion: ecrite, toVersion: avant });
      if (!annule.ok) throw new Error("annulation refusée");
      shell.recordRevert(annule.value.version);
    });
    router.push(routes.sejour());
  };

  const bandeauAffiche =
    bandeau === null ? null : (
      <StatusBanner
        kind={bandeau === "conflit" ? "conflict" : "error"}
        message={t[bandeau]}
        action={
          // « Réessayer » relit la première page, aussi après un conflit dont la relecture a échoué (mineur 13).
          bandeau !== "erreurListe" ? undefined : (
            <Button variant="text" onClick={() => void relire()}>
              {r.reessayer}
            </Button>
          )
        }
      />
    );

  const ligne = (version: TripVersionSummary) => {
    return (
      <li key={version.version} data-version={version.version} tabIndex={-1} className="flex flex-col items-start gap-1 border-b border-hairline py-3 last:border-b-0">
        <span data-part="libelle" className="text-corps font-bold text-ink">
          {libelleVersion(version, timeZone)}
        </span>
        <span data-part="moment" className="text-corps-s text-ink-soft tabular-nums">
          {formatMomentVersion(version.createdAt, timeZone)}
        </span>
        {version.current ? (
          <span data-part="actuelle" className="text-corps-s font-bold text-ink-2">
            {t.actuelle}
          </span>
        ) : null}
        {version.revertible ? (
          <Button
            variant="secondary"
            size="sm"
            className={cn("mt-1", ARIA_DISABLED)}
            data-part="revenir"
            aria-label={format(t.revenirNomme, { libelle: libelleVersion(version, timeZone) })}
            aria-disabled={online ? undefined : true}
            aria-describedby={online ? undefined : listeHorsLigneId}
            onClick={() => void revenir(version)}
          >
            {t.revenir}
          </Button>
        ) : null}
      </li>
    );
  };

  const principales = items.filter((item) => !avantLeDeblocage(item));
  const anciennes = items.filter(avantLeDeblocage);
  const avantId = `${ids}-avant-deblocage`;
  const changesId = `${ids}-ce-qui-change`;
  const apercuTitreId = `${ids}-apercu`;

  return (
    <div data-part="versions" className="flex flex-col gap-5 px-5 pt-2 pb-8">
      <header className="flex items-start justify-between gap-3">
        <h1 ref={titleRef} tabIndex={-1} className="min-w-0 text-titre-fiche font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">
          {t.titre}
        </h1>
        <IconButton icon={<IconCroix />} label={t.retourSejour} onClick={() => router.push(routes.sejour())} data-part="retour-sejour" />
      </header>

      <p role="status" data-part="versions-statut" className={cn("text-corps-s text-ink-soft", statut === null ? EMPTY_LIVE_REGION_CLASS : "sr-only")}>
        {statut}
      </p>

      {bandeauAffiche}

      {phase.type === "apercu" ? (
        <section aria-labelledby={apercuTitreId} data-part="apercu-retour" className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 id={apercuTitreId} ref={apercuRef} tabIndex={-1} className="text-section font-extrabold text-ink">
              {format(t.apercuTitre, { date: formatMomentPhrase(phase.cible.createdAt, timeZone) })}
            </h2>
            <p className="text-corps-s text-ink-soft">{libelleVersion(phase.cible, timeZone)}</p>
          </div>
          {phase.apercu.currentHasLockedStop ? (
            <p data-part="verrouillees" className="text-corps text-ink-2">
              {t.verrouillees}
            </p>
          ) : null}
          {!online ? (
            <div id={offlineId}>
              <StatusBanner kind="offline" message={r.horsLigne} />
            </div>
          ) : null}
          <section aria-labelledby={changesId} data-part="ce-qui-change" className="flex flex-col gap-3">
            <h3 id={changesId} className={BLOC}>
              {r.ceQuiChange}
            </h3>
            {phase.apercu.changes.some(isShownChange) ? (
              <ChangeSet changes={phase.apercu.changes} />
            ) : (
              <p data-part="rien-ne-change" className="text-corps text-ink">
                {t.rienNeChange}
              </p>
            )}
          </section>
          <div className="mt-2 flex flex-col gap-3">
            <Button
              variant="primary"
              className={cn("w-full", ARIA_DISABLED)}
              aria-disabled={online ? undefined : true}
              aria-describedby={online ? undefined : offlineId}
              data-part="appliquer"
              onClick={() => void appliquer()}
            >
              {r.appliquer}
            </Button>
            <Button variant="secondary" className="w-full" data-part="annuler-apercu" onClick={annulerApercu}>
              {r.annuler}
            </Button>
          </div>
        </section>
      ) : lue && !monte ? (
        // Avant le montage (dates de l'appareil inconnues du serveur) : squelette `muted`, sans contenu lu (mineur 6).
        <div data-part="squelette-versions" aria-hidden="true" className="flex flex-col gap-4">
          {[0, 1, 2].map((n) => (
            <span key={n} className="flex flex-col gap-2">
              <span className="h-5 w-3/4 rounded-block bg-muted" />
              <span className="h-4 w-1/3 rounded-block bg-muted" />
            </span>
          ))}
        </div>
      ) : lue ? (
        <>
          {!online ? (
            <div id={listeHorsLigneId}>
              <StatusBanner kind="offline" message={r.horsLigne} />
            </div>
          ) : null}
          <ul data-part="liste-versions" className="flex flex-col">
            {principales.map(ligne)}
          </ul>
          {anciennes.length > 0 ? (
            <section aria-labelledby={avantId} data-part="avant-deblocage" className="flex flex-col gap-1">
              <h2 id={avantId} className="text-section font-extrabold text-ink">
                {t.avantDeblocage}
              </h2>
              <ul className="flex flex-col">{anciennes.map(ligne)}</ul>
            </section>
          ) : null}
          {nextBefore !== null ? (
            <Button variant="secondary" className="self-start" data-part="plus-anciennes" disabled={chargement} onClick={() => void plusAnciennes()}>
              {t.plusAnciennes}
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
