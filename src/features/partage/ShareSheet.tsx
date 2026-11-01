"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ligne/Button";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import { Dialog, DialogClose, DialogSheet, DialogTitle } from "@/components/ui/dialog";
import type { CreatedShareLink, Result, ShareRequest, ShareStatus } from "@/contracts";
import { SIGNED_SHARE_TOKEN_PATTERN } from "@/contracts/values";
import { localDateAt } from "@/features/voyage/today";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { formatDateLongue } from "@/lib/dates";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";
import {
  createShareLink as createShareLinkAction,
  getShareStatus as getShareStatusAction,
  revokeShareLink as revokeShareLinkAction,
} from "@/server/actions/partage";

import { sharedRoutes } from "./routes";

const t = messages.partage.feuille;

/** Bouton en `aria-disabled` (hors ligne, envoi en cours) : rendu de l'état désactivé, toujours atteignable au clavier. */
const ARIA_DISABLED = "aria-disabled:cursor-not-allowed aria-disabled:border-muted aria-disabled:bg-muted aria-disabled:text-ink-soft";

/** Actions serveur du partage (`src/server/actions/partage.ts`), injectables pour les tests. */
export interface ShareActions {
  getShareStatus: (input: ShareRequest) => Promise<Result<ShareStatus>>;
  createShareLink: (input: ShareRequest) => Promise<Result<CreatedShareLink>>;
  revokeShareLink: (input: ShareRequest) => Promise<Result<ShareStatus>>;
}

const SERVER_ACTIONS: ShareActions = {
  getShareStatus: getShareStatusAction,
  createShareLink: createShareLinkAction,
  revokeShareLink: revokeShareLinkAction,
};

/** État affiché de la feuille (spécification F10, « Partager »). */
type View =
  | { kind: "loading" }
  | { kind: "unread" }
  | { kind: "none" }
  | { kind: "active"; createdAt: string; expiresOn: string }
  | { kind: "created"; url: string; expiresOn: string; stable: boolean };

/** Action envoyée, ou relue par « Réessayer » avec la même entrée. */
type Operation = "read" | "create" | "revoke" | "replace";

/** Confirmation ouverte dans la feuille. */
type Confirm = "revoke" | "replace" | null;

/** Éléments qui reçoivent le focus après un changement d'état (le bouton qui avait le focus a disparu). */
type FocusTarget = "creer" | "nouveau" | "desactiver" | "champ" | "confirmation" | null;

export interface ShareSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  /** Fuseau de la destination : la date de création affichée est celle de la destination. */
  timeZone: string;
  /** Rend le focus à « Partager » à la fermeture. */
  onReturnFocus: () => void;
  /** Actions injectées (tests) ; sinon les actions serveur. */
  actions?: ShareActions;
}

/**
 * Feuille modale « Partager ton voyage » (spécification F10, F10c, F10-PO-13) : lit l'état du lien à
 * l'ouverture, puis crée, remplace ou désactive le lien unique du voyage. Le jeton en clair n'existe que dans
 * la réponse de la création, affiché une fois dans le champ ; il n'est ni gardé après la fermeture, ni
 * journalisé, ni stocké. Chargée à la demande par `ShareButton` (décision 0039, F10-TL-10).
 */
export function ShareSheet({ open, onOpenChange, tripId, timeZone, onReturnFocus, actions = SERVER_ACTIONS }: ShareSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <ShareContent tripId={tripId} timeZone={timeZone} onReturnFocus={onReturnFocus} actions={actions} /> : null}
    </Dialog>
  );
}

function subscribeNothing() {
  return () => {};
}

/** Partage natif proposé par le navigateur (`navigator.share`) ; faux au rendu serveur. */
function useNativeShare(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => typeof navigator.share === "function",
    () => false,
  );
}

function ShareContent({
  tripId,
  timeZone,
  onReturnFocus,
  actions,
}: {
  tripId: string;
  timeZone: string;
  onReturnFocus: () => void;
  actions: ShareActions;
}) {
  const online = useOnline();
  const nativeShare = useNativeShare();
  const offlineId = useId();
  const fieldId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const content = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<View>({ kind: "loading" });
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [pending, setPending] = useState<Operation | null>(null);
  const [failed, setFailed] = useState<Operation | null>(null);
  // Spécification M6 § 7 : création refusée par la limite `partage-lien` (`rate_limited`, adaptateur `api`).
  const [limited, setLimited] = useState(false);
  const [announce, setAnnounce] = useState<string | null>(null);
  // Élément à focaliser après le prochain rendu ; lu et vidé par l'effet ci-dessous.
  const focusTarget = useRef<FocusTarget>(null);
  const setFocusTarget = (target: FocusTarget) => {
    focusTarget.current = target;
  };
  // Garde synchrone contre le second clic : l'état `pending` n'est lu qu'au rendu suivant.
  const busy = useRef(false);

  const input = useCallback((): ShareRequest => ({ tripId }), [tripId]);

  const run = useCallback(
    async (operation: Operation) => {
      if (busy.current) return;
      busy.current = true;
      setPending(operation);
      setAnnounce(null);
      // Après un refus par la limite (bandeau sans « Réessayer », nouvel essai par le bouton de l'action), le bandeau est
      // retiré au début de l'essai : un nouveau refus est ré-annoncé (revue du ticket 1013, UX mineur 7). Après une
      // autre erreur, le bandeau et son « Réessayer », qui a le focus, restent en place pendant l'essai.
      if (limited) setFailed(null);
      let refusParLimite = false;
      try {
        if (operation === "read") {
          setView({ kind: "loading" });
          const result = await actions.getShareStatus(input());
          if (!result.ok) throw new Error("lecture");
          setView(result.value.active ? { kind: "active", createdAt: result.value.createdAt, expiresOn: result.value.expiresOn } : { kind: "none" });
          setFocusTarget(null);
        } else if (operation === "revoke") {
          const result = await actions.revokeShareLink(input());
          if (!result.ok) throw new Error("désactivation");
          setView({ kind: "none" });
          setConfirm(null);
          setAnnounce(t.desactive);
          setFocusTarget("creer");
        } else {
          const result = await actions.createShareLink(input());
          if (!result.ok) {
            refusParLimite = result.error.code === "rate_limited";
            throw new Error("création");
          }
          const url = `${window.location.origin}${sharedRoutes(result.value.token).sejour()}`;
          // Partage réel du site d'essai (décision 0135 § 7) : jeton signé, le même pour ce voyage, que « Créer un lien »
          // redonne ; « il ne pourra plus s'afficher » ne vaut que pour le jeton aléatoire de l'adaptateur simulé.
          const stable = SIGNED_SHARE_TOKEN_PATTERN.test(result.value.token);
          setView({ kind: "created", url, expiresOn: result.value.expiresOn, stable });
          setConfirm(null);
          setFocusTarget("champ");
        }
        setFailed(null);
      } catch {
        // Résultat `{ ok: false }` ou action qui échoue : bandeau d'erreur, état affiché inchangé ; « Réessayer »
        // relance la même action, une tentative par clic, sans relance automatique.
        setFailed(operation);
        setLimited(refusParLimite);
        if (operation === "read") setView({ kind: "unread" });
      } finally {
        busy.current = false;
        setPending(null);
      }
    },
    [actions, input, limited],
  );

  // Lecture de l'état du lien à l'ouverture (une feuille neuve à chaque ouverture : `ShareContent` est remonté).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run("read");
  }, [run]);

  // Focus après un changement d'état : l'élément qui l'avait (bouton d'action, confirmation) n'existe plus.
  useEffect(() => {
    const target = focusTarget.current;
    if (target === null) return;
    focusTarget.current = null;
    content.current?.querySelector<HTMLElement>(`[data-focus='${target}']`)?.focus();
  });

  const disabledOffline = !online;
  const disabledProps = (operation: Operation) => {
    const disabled = disabledOffline || pending !== null;
    return {
      "aria-disabled": disabled ? true : undefined,
      "aria-describedby": disabledOffline ? offlineId : undefined,
      onClick: () => {
        if (!disabled) void run(operation);
      },
      "data-pending": pending === operation ? "" : undefined,
    } as const;
  };

  const openConfirm = (which: "revoke" | "replace") => {
    if (pending !== null) return;
    setConfirm(which);
    setFailed(null);
    setFocusTarget("confirmation");
  };

  const cancelConfirm = () => {
    const back: FocusTarget = confirm === "replace" ? "nouveau" : "desactiver";
    setConfirm(null);
    setFailed(null);
    setFocusTarget(back);
  };

  const copy = async (url: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("presse-papiers");
      await navigator.clipboard.writeText(url);
      setAnnounce(t.copie);
    } catch {
      setAnnounce(t.copieImpossible);
      field.current?.focus();
      field.current?.select();
    }
  };

  const share = async (url: string) => {
    try {
      await navigator.share({ url });
    } catch {
      // Partage annulé par la personne ou refusé par le navigateur : rien à annoncer, le lien reste affiché.
    }
  };

  const expiresOn = view.kind === "active" || view.kind === "created" ? view.expiresOn : null;

  return (
    <DialogSheet
      data-sheet="partager"
      aria-describedby={undefined}
      aria-busy={pending !== null ? true : undefined}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        title.current?.focus();
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        onReturnFocus();
      }}
    >
      <div ref={content} className="flex flex-col gap-4">
        <DialogTitle ref={title} tabIndex={-1} className="text-section font-extrabold text-ink">
          {t.titre}
        </DialogTitle>
        <p className="text-corps text-ink-2">{t.texte}</p>

        {disabledOffline ? (
          <div id={offlineId}>
            <StatusBanner kind="offline" message={t.horsLigne} />
          </div>
        ) : null}

        {failed !== null ? (
          <StatusBanner
            kind="error"
            message={limited ? t.limite : t.erreur}
            action={
              // Limite atteinte : « Réessayer » contredirait « Réessaie plus tard » (revue du ticket 1013, UX mineur 7) ;
              // le bouton de l'action reste disponible pour un nouvel essai.
              limited ? undefined : (
                <Button
                  variant="text"
                  data-part="reessayer"
                  className={ARIA_DISABLED}
                  aria-disabled={pending !== null ? true : undefined}
                  onClick={() => {
                    if (pending === null) void run(failed);
                  }}
                >
                  {t.reessayer}
                </Button>
              )
            }
          />
        ) : null}

        {view.kind === "none" ? (
          <Button variant="primary" data-focus="creer" data-part="creer" className={cn("w-full", ARIA_DISABLED)} {...disabledProps("create")}>
            {t.creer}
          </Button>
        ) : null}

        {view.kind === "created" ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={fieldId} className="text-corps-s font-bold text-ink">
                {t.champ}
              </label>
              <input
                ref={field}
                id={fieldId}
                data-focus="champ"
                data-part="champ-lien"
                type="text"
                readOnly
                value={view.url}
                onFocus={(event) => event.currentTarget.select()}
                className="min-h-(--touch-target) w-full rounded-control border border-border-control bg-raised px-3 text-corps text-ink"
              />
            </div>
            <p className="text-corps-s text-ink-2">{view.stable ? t.lienStable : t.copieMaintenant}</p>
            <Button variant="primary" data-part="copier" className="w-full" onClick={() => void copy(view.url)}>
              {t.copier}
            </Button>
            {nativeShare ? (
              <Button variant="secondary" data-part="envoyer" className="w-full" onClick={() => void share(view.url)}>
                {t.envoyer}
              </Button>
            ) : null}
          </div>
        ) : null}

        {view.kind === "active" ? (
          <p data-part="actif" className="text-corps text-ink">
            {format(t.actif, { date: formatDateLongue(localDateAt(Date.parse(view.createdAt), timeZone)) })}
          </p>
        ) : null}

        {expiresOn !== null ? (
          <p data-part="valable" className="text-corps text-ink">
            {format(t.valable, { date: formatDateLongue(expiresOn) })}
          </p>
        ) : null}

        {view.kind === "active" && confirm === null ? (
          <div className="flex flex-col gap-3">
            <Button
              variant="secondary"
              data-focus="nouveau"
              data-part="nouveau"
              className={cn("w-full", ARIA_DISABLED)}
              aria-disabled={disabledOffline ? true : undefined}
              aria-describedby={disabledOffline ? offlineId : undefined}
              onClick={() => {
                // Rien n'est envoyé avant la confirmation : désactivé hors ligne seulement.
                if (!disabledOffline) openConfirm("replace");
              }}
            >
              {t.nouveau}
            </Button>
            <Button
              variant="secondary"
              data-focus="desactiver"
              data-part="desactiver"
              className={cn("w-full", ARIA_DISABLED)}
              aria-disabled={disabledOffline ? true : undefined}
              aria-describedby={disabledOffline ? offlineId : undefined}
              onClick={() => {
                // Rien n'est envoyé avant la confirmation : désactivé hors ligne seulement.
                if (!disabledOffline) openConfirm("revoke");
              }}
            >
              {t.desactiver}
            </Button>
          </div>
        ) : null}

        {view.kind === "active" && confirm !== null ? (
          <div data-part="confirmation" className="flex flex-col gap-3 rounded-block bg-muted p-4">
            <p data-focus="confirmation" tabIndex={-1} className="text-corps text-ink">
              {confirm === "revoke" ? t.confirmationDesactiver : t.confirmationNouveau}
            </p>
            <Button
              variant="primary"
              data-part={confirm === "revoke" ? "confirmer-desactiver" : "confirmer-nouveau"}
              className={cn("w-full", ARIA_DISABLED)}
              {...disabledProps(confirm === "revoke" ? "revoke" : "replace")}
            >
              {confirm === "revoke" ? t.confirmerDesactiver : t.nouveau}
            </Button>
            <Button
              variant="secondary"
              data-part="annuler-confirmation"
              className={cn("w-full", ARIA_DISABLED)}
              aria-disabled={pending !== null ? true : undefined}
              onClick={() => {
                if (pending === null) cancelConfirm();
              }}
            >
              {t.annuler}
            </Button>
          </div>
        ) : null}

        {/* Sous les actions : son apparition (« Lien copié »…) ne décale ni le champ ni les boutons. */}
        <p role="status" data-part="annonce-partage" className="text-corps-s text-ink-2 empty:hidden">
          {view.kind === "loading" ? t.chargement : announce}
        </p>

        <DialogClose asChild>
          <Button variant="text" data-part="fermer" className="self-start">
            {t.fermer}
          </Button>
        </DialogClose>
      </div>
    </DialogSheet>
  );
}

