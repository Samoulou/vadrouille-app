"use client";

import { useId, useRef, useState } from "react";

import { Button } from "@/components/ligne/Button";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import type { Result, TripRemindersStatus } from "@/contracts";
import * as messages from "@/i18n/messages";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";
import { setTripReminders } from "@/server/actions/rappels";

const t = messages.sejour.sejour.rappels;

/** Action de l'interrupteur, injectable par les tests ; `setTripReminders` par défaut. */
export type ModifierRappels = (input: { tripId: string; enabled: boolean }) => Promise<Result<TripRemindersStatus>>;

/**
 * Interrupteur « Rappel par e-mail la veille » du Séjour (M6c, ticket 1021 ; spécification M6 § 5.2 et § 7 ; décision 0157
 * § 1.7 point 5). Éteint par défaut ; l'activer donne l'accord, l'éteindre le retire (`setTripReminders`). Rendu par
 * `SejourPanel` seulement quand la page a lu l'état de l'accord (`getTripReminders` : adaptateur `api`, port des
 * notifications branché, personne propriétaire) ; sinon rien, sans texte de remplacement (§ 5.2 point 4).
 *
 * - `role="switch"` et `aria-checked` ; le texte d'aide décrit l'interrupteur (`aria-describedby`) ; cible ≥ 44 px.
 * - Pendant l'enregistrement, l'interrupteur garde son état, est atténué (`aria-busy`) et ignore un second geste ; il ne
 *   bascule qu'à la réponse.
 * - Réussite : annonce « Rappels activés. » ou « Rappels arrêtés. » dans une région `role="status"` toujours présente.
 * - Échec : bandeau d'erreur (`alert`) « Impossible de modifier les rappels pour le moment. » avec « Réessayer », qui rejoue
 *   le dernier geste ; l'interrupteur garde l'état enregistré ; le bandeau est effacé au début de chaque nouvel essai.
 * - Hors ligne : interrupteur et « Réessayer » en `aria-disabled="true"`, décrits par le bandeau hors ligne, sans effet.
 * Place (sous « Ajouter au calendrier »), rendu et textes : décision UX/UI (U2, U3) consignée au § 7 de la spécification M6,
 * à confirmer par la revue de la PR 1024.
 */
export function RappelsInterrupteur({ tripId, active: initial, modifier = setTripReminders }: { tripId: string; active: boolean; modifier?: ModifierRappels }) {
  const online = useOnline();
  const base = useId();
  const aideId = `${base}-rappels-aide`;
  const offlineId = `${base}-rappels-hors-ligne`;
  const [active, setActive] = useState(initial);
  const [annonce, setAnnonce] = useState("");
  const [echec, setEchec] = useState<boolean | null>(null);
  const enCours = useRef(false);
  const [pending, setPending] = useState(false);

  async function enregistrer(enabled: boolean) {
    if (!online || enCours.current) return;
    enCours.current = true;
    setPending(true);
    setAnnonce("");
    // Revue de la PR 1024 (UX/UI, mineur 13) : le bandeau d'erreur d'un essai précédent est effacé dès le nouvel essai.
    setEchec(null);
    try {
      const resultat = await modifier({ tripId, enabled });
      if (resultat.ok) {
        setActive(resultat.value.active);
        setEchec(null);
        setAnnonce(resultat.value.active ? t.actives : t.arretes);
      } else {
        setEchec(enabled);
      }
    } catch {
      setEchec(enabled);
    } finally {
      enCours.current = false;
      setPending(false);
    }
  }

  const indisponible = !online;
  const decrit = [aideId, ...(indisponible ? [offlineId] : [])].join(" ");

  return (
    <div data-part="rappels" className="flex flex-col gap-2">
      {online ? null : (
        <div id={offlineId}>
          <StatusBanner kind="offline" message={t.horsLigne} />
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-describedby={decrit}
        aria-disabled={indisponible ? true : undefined}
        aria-busy={pending || undefined}
        data-part="rappels-interrupteur"
        onClick={() => void enregistrer(!active)}
        className="flex min-h-(--touch-target) w-full cursor-pointer items-center justify-between gap-4 rounded-control text-left text-corps font-bold text-ink aria-busy:cursor-progress aria-busy:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:text-ink-soft"
      >
        <span>{t.interrupteur}</span>
        {/* Piste et curseur : décor seulement, l'état est porté par `aria-checked`. Allumé : aplat `line` (choix de la personne). */}
        <span
          aria-hidden="true"
          data-part="rappels-piste"
          className={cn(
            // Curseur centré dans la piste (revue de la PR 1024, UX/UI, mineur 14) : marge intérieure égale des deux côtés.
            "inline-flex h-7 w-12 shrink-0 items-center rounded-full border-(length:--ligne-trait-controle) bg-clip-padding p-0.5",
            active ? "justify-end border-line bg-line" : "justify-start border-border-control bg-raised",
          )}
        >
          <span className={cn("size-5 rounded-full", active ? "bg-raised" : "bg-ink-soft")} />
        </span>
      </button>
      <p id={aideId} className="text-corps-s text-ink-soft">
        {t.aide}
      </p>
      {/* Région toujours présente (règle des annonces de 0018) ; l'état visible est celui de l'interrupteur. */}
      <p role="status" data-part="rappels-annonce" className="sr-only">
        {annonce}
      </p>
      {echec === null ? null : (
        <StatusBanner
          kind="error"
          message={t.erreur}
          action={
            <Button
              variant="text"
              size="sm"
              data-part="rappels-reessayer"
              aria-disabled={indisponible ? true : undefined}
              aria-describedby={indisponible ? offlineId : undefined}
              onClick={() => void enregistrer(echec)}
            >
              {t.reessayer}
            </Button>
          }
        />
      )}
    </div>
  );
}
