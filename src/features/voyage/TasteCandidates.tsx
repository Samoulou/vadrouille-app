"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { LazyTrack } from "@/analytics/lazy";
import { Button } from "@/components/ligne/Button";
import { Chip } from "@/components/ligne/Chip";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import type { RetainedPreference } from "@/contracts";
import { EMPTY_LIVE_REGION_CLASS } from "@/features/creation/fields";
import { mesVoyagesRoute } from "@/features/sejour/routes";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { cn } from "@/lib/utils";

import type { ReviewActions } from "./review-actions";
import { tasteAccessibleName, tasteLabel } from "./tastes";

const t = messages.apres.gouts;

const LINK = "inline-flex min-h-(--touch-target) items-center self-start rounded-control text-corps font-bold text-line underline underline-offset-2";

export interface TasteCandidatesProps {
  tripId: string;
  /** Candidats calculés par le serveur (`TripReview.tasteCandidates`), triés par `preferenceKey`. */
  candidates: readonly RetainedPreference[];
  /** Clés des goûts déjà retenus par la personne au chargement (« Déjà retenu »). */
  retainedIds: readonly string[];
  /** Accès `open` : sinon (lecture seule) ni case ni bouton, seulement les goûts déjà retenus. */
  editable: boolean;
  /** Hors ligne : cases et bouton en `aria-disabled`, décrits par le bandeau `describedBy`. */
  offline: boolean;
  describedBy: string;
  retainTastes: ReviewActions["retainTastes"];
  track: LazyTrack;
}

type Phase = "idle" | "sending" | "failed" | "done";

/**
 * « Retenir mes goûts » de l'écran 16 (M8c-1, ticket 1121 ; spécification M8 § 5.1, § 5.2 et § 7 ; F11, écran 16 point 5).
 * Accord **explicite** : le texte d'accord, puis un choix par candidat, **tous décochés au départ** ; rien n'est retenu sans
 * un choix coché et un appui sur « Retenir ces goûts ». Un candidat déduit a le contour pointillé de `Chip` `inferred` et
 * un nom accessible qui contient « déduit » ; un candidat déjà retenu est coché, indisponible, « Déjà retenu », aussi
 * quand tous les candidats le sont (le bouton « Retenir ces goûts » n'est alors plus rendu : il n'y a plus rien à retenir).
 *
 * **Juste après l'accord seulement** : « Goûts retenus : », leurs libellés et « Voir dans Mes voyages » ; le focus va sur
 * « Goûts retenus : » (le bouton qui l'avait est démonté) et « {n} goûts retenus. » est annoncé, `n` étant le nombre de
 * goûts nouvellement retenus par le serveur.
 * Erreur : rien n'est affiché comme retenu, message du § 7 et « Réessayer ». Un envoi à la fois. Mesure :
 * `tastes_retained { count, inferred_count }` sur les goûts nouvellement retenus. Rendu provisoire (UX/UI, U3) : composants
 * Ligne existants seulement (`Chip`, `Button`, `StatusBanner`).
 */
export function TasteCandidates({ tripId, candidates, retainedIds, editable, offline, describedBy, retainTastes, track }: TasteCandidatesProps) {
  const [retained, setRetained] = useState<ReadonlySet<string>>(() => new Set(retainedIds));
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [phase, setPhase] = useState<Phase>("idle");
  const [missing, setMissing] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const retainedHeading = useRef<HTMLParagraphElement>(null);

  // Après l'accord, la liste et le bouton qui avait le focus sont démontés : le focus va sur « Goûts retenus : ».
  useEffect(() => {
    if (phase === "done") retainedHeading.current?.focus();
  }, [phase]);

  const alreadyRetained = candidates.filter((candidate) => retained.has(candidate.id));
  const allRetained = alreadyRetained.length === candidates.length;
  const sending = phase === "sending";

  const toggle = (id: string, selected: boolean) => {
    if (offline || sending) return;
    setMissing(false);
    setChecked((current) => {
      const next = new Set(current);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const submit = () => {
    if (offline || sending) return;
    const ids = candidates.filter((candidate) => checked.has(candidate.id) && !retained.has(candidate.id)).map((candidate) => candidate.id);
    if (ids.length === 0) {
      setMissing(true);
      return;
    }
    setMissing(false);
    setPhase("sending");
    setAnnouncement("");
    void retainTastes(tripId, ids).then(
      (result) => {
        if (!result.ok) {
          setPhase("failed");
          return;
        }
        setRetained((current) => new Set([...current, ...ids]));
        setChecked(new Set());
        setPhase("done");
        const count = result.value.length;
        // Aucun goût nouveau (tous retenus entre-temps, ailleurs) : rien n'est annoncé comme retenu à l'instant.
        setAnnouncement(count === 0 ? "" : count === 1 ? t.annonceUn : format(t.annoncePlusieurs, { n: count }));
        if (count > 0) {
          const inferred_count = result.value.filter((taste) => taste.origin === "inferred").length;
          track({ name: "tastes_retained", properties: { count, inferred_count } }).catch(() => {
            // Mesure perdue (chargement impossible) : rien à montrer, elle n'est pas réessayée.
          });
        }
      },
      () => setPhase("failed"),
    );
  };

  let body;
  if (candidates.length === 0) {
    body = (
      <p data-part="aucun-gout" className="text-corps text-ink-soft">
        {t.aucun}
      </p>
    );
  } else if (phase === "done" || !editable) {
    body =
      alreadyRetained.length === 0 ? (
        <p data-part="aucun-gout" className="text-corps text-ink-soft">
          {t.aucunRetenu}
        </p>
      ) : (
        <div data-part="gouts-retenus" className="flex flex-col gap-2">
          <p ref={retainedHeading} tabIndex={-1} data-part="gouts-retenus-titre" className="rounded-control text-corps font-bold text-ink">
            {t.retenus}
          </p>
          <ul className="flex flex-col gap-1">
            {alreadyRetained.map((candidate) => (
              <li key={candidate.id} data-taste={candidate.id} className="text-corps text-ink">
                {tasteLabel(candidate.subject)}
              </li>
            ))}
          </ul>
          <Link href={mesVoyagesRoute()} data-part="voir-mes-voyages" className={LINK}>
            {t.voirMesVoyages}
          </Link>
        </div>
      );
  } else {
    body = (
      <>
        <ul aria-label={t.groupe} className="flex flex-col gap-3">
          {candidates.map((candidate, index) => {
            const isRetained = retained.has(candidate.id);
            const unavailable = isRetained || offline;
            // La source du goût (ou « Déjà retenu ») décrit le choix, avant le bandeau hors ligne.
            const sourceId = `apres-gout-source-${index}`;
            return (
              <li key={candidate.id} data-taste={candidate.id} className="flex flex-col items-start gap-1">
                <Chip
                  label={tasteLabel(candidate.subject)}
                  aria-label={tasteAccessibleName(candidate)}
                  inferred={candidate.origin === "inferred"}
                  selected={isRetained || checked.has(candidate.id)}
                  aria-disabled={unavailable || undefined}
                  aria-describedby={offline && !isRetained ? `${sourceId} ${describedBy}` : sourceId}
                  onSelectedChange={(selected) => toggle(candidate.id, selected)}
                  // Mise en page seulement : un libellé long passe à la ligne au lieu de déborder à 390 px.
                  className="max-w-full justify-start py-2 text-left"
                />
                <p id={sourceId} className="text-legende text-ink-soft">
                  {isRetained ? t.dejaRetenu : t.origine[candidate.origin]}
                </p>
              </li>
            );
          })}
        </ul>
        {/* Région d'alerte présente dès l'affichage (règle des annonces de 0018), vide tant qu'un goût est coché. */}
        <p role="alert" data-part="aucune-case" className={cn("text-corps-s text-ink", missing ? null : EMPTY_LIVE_REGION_CLASS)}>
          {missing ? t.aucuneCase : null}
        </p>
        {phase === "failed" ? (
          <StatusBanner
            kind="error"
            message={t.erreur}
            action={
              <Button
                variant="text"
                size="sm"
                className="px-0"
                aria-disabled={offline || undefined}
                aria-describedby={offline ? describedBy : undefined}
                onClick={submit}
              >
                {messages.apres.reessayer}
              </Button>
            }
          />
        ) : null}
        {/* Tous les candidats déjà retenus : plus rien à retenir, le bouton n'est pas rendu. */}
        {allRetained ? null : (
          <Button
            className="w-full"
            data-part="retenir"
            aria-disabled={offline || sending || undefined}
            aria-describedby={offline ? describedBy : undefined}
            aria-busy={sending || undefined}
            onClick={submit}
          >
            {t.retenir}
          </Button>
        )}
      </>
    );
  }

  return (
    <section aria-labelledby="apres-gouts" data-part="retenir-gouts" className="mt-8 flex flex-col gap-3">
      <h2 id="apres-gouts" className="text-section font-extrabold text-ink">
        {t.titre}
      </h2>
      {editable ? <p className="text-corps-s text-ink-soft">{t.accord}</p> : null}
      {/* Annonce discrète de la retenue, lue par les lecteurs d'écran seulement. */}
      <p role="status" data-part="annonce-gouts" className="sr-only">
        {announcement}
      </p>
      {body}
    </section>
  );
}
