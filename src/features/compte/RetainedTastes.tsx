"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { createLazyTrack } from "@/analytics/lazy";
import type { EventRecorder, RecorderKind } from "@/analytics/track";
import { Button } from "@/components/ligne/Button";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import { UndoToast, UndoToastRegion } from "@/components/ligne/UndoToast";
import type { RetainedTaste } from "@/contracts";
import { createMemoryReviewActions, createServerReviewActions, type ReviewActions } from "@/features/voyage/review-actions";
import { tasteEventCategory, tasteLabel } from "@/features/voyage/tastes";
import { useOptionalTripSession } from "@/features/voyage/TripSessionProvider";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { useOnline } from "@/lib/online";

const t = messages.mesVoyages.gouts;

/** Identifiant du bandeau hors ligne : il décrit les boutons désactivés (`aria-describedby`, handover § 13). */
const OFFLINE_ID = "gouts-hors-ligne";

export interface RetainedTastesProps {
  /**
   * Goûts de la personne lus par la page (`api`, dans l'ordre où ils ont été retenus) ; absent : mémoire de l'onglet
   * (`mock`, 0021 § 4), et rien hors du fournisseur de l'onglet.
   */
  tastes?: readonly RetainedTaste[];
  /** Identifiant de voyage → destination, depuis les résumés de « Mes voyages » ; absent : « Retenu après un voyage ». */
  destinations: ReadonlyMap<string, string>;
  /** Actions injectées (tests) ; sinon celles du mode. */
  actions?: Pick<ReviewActions, "removeTaste" | "restoreTaste" | "removeAllTastes">;
  /** Cible du focus quand il ne reste aucun « Retirer » : le titre « Mes voyages ». */
  focusFallbackId: string;
  recorderKind?: RecorderKind;
  recorder?: EventRecorder;
}

type Failure = { readonly kind: "remove"; readonly tasteId: string } | { readonly kind: "restore"; readonly taste: RetainedTaste } | { readonly kind: "removeAll" };

const AUCUNE_ETAPE: ReadonlySet<string> = new Set();

/**
 * « Tes goûts retenus » de « Mes voyages » (M8c-1, ticket 1121 ; spécification M8 § 5.3 et § 7 ; F11-PO-13). Rendue
 * seulement s'il y a au moins un goût (ou un retrait encore annulable). Une ligne par goût, au libellé de l'écran 16, avec
 * « Retenu après {destination} » (« Retenu après un voyage » si le voyage d'origine n'est plus dans la liste), et
 * « Retirer » (nom accessible « Retirer : {libellé} »).
 *
 * - « Retirer » : le goût est **supprimé tout de suite** (retrait d'accord, jamais refusé par le serveur) ; la ligne
 *   disparaît une fois le retrait confirmé, `UndoToast` « Goût retiré. » pendant 5 s. « Annuler » le rétablit (en fin de
 *   liste : nouvel instant d'accord, 0160 § 1.3 point 7) et lui rend le focus. Après « Retirer », focus sur le « Retirer »
 *   suivant, sinon le précédent, sinon le titre « Mes voyages ».
 * - « Retirer tous mes goûts » : confirmation en place (« Tout retirer », « Garder »), puis plus aucune ligne ; « Tous tes
 *   goûts sont retirés. » est annoncé. Pas d'annulation (la confirmation la remplace).
 * - Erreur : la ligne reste, message du § 7 et « Réessayer ». Hors ligne : bandeau, boutons en `aria-disabled="true"`.
 *
 * Mesure : `taste_removed { category, origin }` à l'expiration du délai sans « Annuler », et pour chaque goût retiré par
 * « Retirer tous mes goûts ». Rien n'est gardé dans le navigateur. Rendu provisoire (UX/UI, U3) : composants Ligne existants.
 */
export function RetainedTastes({ tastes, destinations, actions: injected, focusFallbackId, recorderKind = "none", recorder }: RetainedTastesProps) {
  const online = useOnline();
  const memory = useOptionalTripSession();
  const track = useMemo(() => createLazyTrack(recorderKind, recorder), [recorderKind, recorder]);
  const actions = useMemo(() => {
    if (injected) return injected;
    if (tastes !== undefined) return createServerReviewActions();
    return memory ? createMemoryReviewActions({ recordReview: () => undefined }, AUCUNE_ETAPE, { memory, candidates: [] }) : null;
  }, [injected, tastes, memory]);

  const [list, setList] = useState<readonly RetainedTaste[]>(() => tastes ?? memory?.tastes() ?? []);
  // Sans aucun goût à l'affichage, rien n'est rendu (ni section, ni région d'annonce) : « Mes voyages » reste tel quel.
  const [present] = useState(list.length > 0);
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<{ readonly taste: RetainedTaste; readonly key: number } | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  /**
   * Cible du focus après le prochain rendu : le « Retirer » d'un goût, sinon le titre de l'écran (`titre`), « Garder » de
   * la confirmation (`garder`) ou « Retirer tous mes goûts » (`toutRetirer`).
   */
  const focusTarget = useRef<{ readonly tasteId: string } | "titre" | "garder" | "toutRetirer" | null>(null);
  const undoKey = useRef(0);
  const sectionRef = useRef<HTMLElement>(null);

  // Après chaque rendu : la cible n'existe qu'une fois la liste ou la confirmation rendue.
  useEffect(() => {
    const target = focusTarget.current;
    if (target === null) return;
    focusTarget.current = null;
    const section = sectionRef.current;
    const element =
      target === "titre"
        ? null
        : target === "garder"
          ? section?.querySelector<HTMLElement>('[data-part="garder"]')
          : target === "toutRetirer"
            ? section?.querySelector<HTMLElement>('[data-part="tout-retirer"]')
            : section?.querySelector<HTMLElement>(`[data-taste="${target.tasteId}"] button`);
    (element ?? document.getElementById(focusFallbackId))?.focus();
  });

  const disabled = !online;

  const measure = (taste: RetainedTaste) => {
    track({ name: "taste_removed", properties: { category: tasteEventCategory(taste.subject), origin: taste.origin } }).catch(() => {
      // Mesure perdue (chargement impossible) : rien à montrer, elle n'est pas réessayée.
    });
  };

  /** Le retrait en attente d'annulation devient définitif (délai expiré, ou nouveau geste). */
  const settleUndo = () => {
    if (undo === null) return;
    measure(undo.taste);
    setUndo(null);
  };

  const remove = (tasteId: string) => {
    if (disabled || busy || actions === null) return;
    settleUndo();
    setBusy(true);
    setFailure(null);
    setAnnouncement("");
    const index = list.findIndex((taste) => taste.id === tasteId);
    void actions.removeTaste(tasteId).then(
      (result) => {
        setBusy(false);
        // Goût déjà absent (retiré ailleurs) : la ligne n'a plus lieu d'être, sans annulation possible.
        if (!result.ok && result.error.code !== "not_found") {
          setFailure({ kind: "remove", tasteId });
          return;
        }
        const rest = list.filter((taste) => taste.id !== tasteId);
        setList(rest);
        if (result.ok) {
          undoKey.current += 1;
          setUndo({ taste: result.value, key: undoKey.current });
        }
        const next = (rest[index] ?? rest[index - 1])?.id;
        focusTarget.current = next === undefined ? "titre" : { tasteId: next };
      },
      () => {
        setBusy(false);
        setFailure({ kind: "remove", tasteId });
      },
    );
  };

  const restore = (taste: RetainedTaste) => {
    if (disabled || busy || actions === null) return;
    setUndo(null);
    setBusy(true);
    setFailure(null);
    void actions.restoreTaste(taste).then(
      (result) => {
        setBusy(false);
        if (!result.ok) {
          setFailure({ kind: "restore", taste });
          return;
        }
        setList((current) => (current.some((other) => other.id === taste.id) ? current : [...current, taste]));
        focusTarget.current = { tasteId: taste.id };
      },
      () => {
        setBusy(false);
        setFailure({ kind: "restore", taste });
      },
    );
  };

  const removeAll = () => {
    if (disabled || busy || actions === null) return;
    settleUndo();
    setBusy(true);
    setFailure(null);
    setConfirming(false);
    const removed = list;
    void actions.removeAllTastes().then(
      (result) => {
        setBusy(false);
        if (!result.ok) {
          setFailure({ kind: "removeAll" });
          return;
        }
        setList([]);
        removed.forEach(measure);
        setAnnouncement(t.tousRetires);
        focusTarget.current = "titre";
      },
      () => {
        setBusy(false);
        setFailure({ kind: "removeAll" });
      },
    );
  };

  const retry = () => {
    if (failure === null) return;
    if (failure.kind === "remove") remove(failure.tasteId);
    else if (failure.kind === "restore") restore(failure.taste);
    else removeAll();
  };

  const visible = list.length > 0 || undo !== null || failure !== null;
  const failureMessage = failure === null ? null : failure.kind === "remove" ? t.erreurRetrait : failure.kind === "restore" ? t.erreurAnnuler : t.erreurToutRetirer;

  if (!present) return null;
  return (
    <>
      {/* Annonce présente dès l'affichage, aussi quand la section a disparu (« Tous tes goûts sont retirés. »). */}
      <p role="status" data-part="annonce-gouts" className="sr-only">
        {announcement}
      </p>
      {visible ? (
        <section ref={sectionRef} aria-labelledby="mes-voyages-gouts" data-section="gouts" className="flex flex-col gap-2">
          <h2 id="mes-voyages-gouts" className="text-section font-extrabold text-ink">
            {t.titre}
          </h2>
          <div id={OFFLINE_ID} role="status" data-part="hors-ligne">
            {online ? null : <StatusBanner kind="offline" message={t.horsLigne} announce={false} />}
          </div>
          <ul className="flex flex-col">
            {list.map((taste) => {
              const libelle = tasteLabel(taste.subject);
              const destination = taste.fromTripId === null ? undefined : destinations.get(taste.fromTripId);
              return (
                <li key={taste.id} data-taste={taste.id} className="flex flex-col items-start border-b border-hairline py-2 last:border-b-0">
                  <span className="text-corps font-bold text-ink">{libelle}</span>
                  <span className="text-legende text-ink-soft">{destination === undefined ? t.origineInconnue : format(t.origine, { destination })}</span>
                  <Button
                    variant="text"
                    size="sm"
                    className="px-0"
                    aria-label={format(t.retirerNom, { libelle })}
                    aria-disabled={disabled || busy || undefined}
                    aria-describedby={disabled ? OFFLINE_ID : undefined}
                    onClick={() => remove(taste.id)}
                  >
                    {t.retirer}
                  </Button>
                </li>
              );
            })}
          </ul>
          {failureMessage === null ? null : (
            <StatusBanner
              kind="error"
              message={failureMessage}
              action={
                <Button
                  variant="text"
                  size="sm"
                  className="px-0"
                  aria-disabled={disabled || busy || undefined}
                  aria-describedby={disabled ? OFFLINE_ID : undefined}
                  onClick={retry}
                >
                  {t.reessayer}
                </Button>
              }
            />
          )}
          {list.length === 0 ? null : confirming ? (
            <div role="group" aria-labelledby="gouts-confirmation" data-part="confirmation" className="flex flex-col items-start gap-2">
              <p id="gouts-confirmation" className="text-corps text-ink">
                {t.confirmation}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  data-part="tout-retirer-confirmer"
                  aria-disabled={disabled || busy || undefined}
                  aria-describedby={disabled ? OFFLINE_ID : undefined}
                  onClick={removeAll}
                >
                  {t.confirmer}
                </Button>
                <Button
                  variant="text"
                  size="sm"
                  data-part="garder"
                  onClick={() => {
                    focusTarget.current = "toutRetirer";
                    setConfirming(false);
                  }}
                >
                  {t.garder}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="text"
              size="sm"
              className="self-start px-0"
              data-part="tout-retirer"
              aria-disabled={disabled || busy || undefined}
              aria-describedby={disabled ? OFFLINE_ID : undefined}
              onClick={() => {
                if (disabled || busy) return;
                focusTarget.current = "garder";
                setConfirming(true);
              }}
            >
              {t.toutRetirer}
            </Button>
          )}
          <UndoToastRegion>
            {undo ? <UndoToast key={undo.key} message={t.retire} onUndo={() => restore(undo.taste)} onExpire={settleUndo} /> : null}
          </UndoToastRegion>
        </section>
      ) : null}
    </>
  );
}
