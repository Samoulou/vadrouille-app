"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ligne/Button";
import { IconButton } from "@/components/ligne/IconButton";
import { IconCroix } from "@/components/ligne/icons";
import { SegmentedControl } from "@/components/ligne/SegmentedControl";
import { Dialog, DialogClose, DialogSheet, DialogTitle } from "@/components/ui/dialog";
import type { Result, Stop } from "@/contracts";
import { STOP_REPORT_REASONS, type StopReportReason } from "@/contracts/values";
import { EMPTY_LIVE_REGION_CLASS } from "@/features/creation/fields";
import * as messages from "@/i18n/messages";
import { cn } from "@/lib/utils";
import { reportStop } from "@/server/actions/retouches";

import { ARIA_DISABLED } from "./RevisionPreview";

const t = messages.sejour.signaler;

/** Les cinq motifs fermés, dans l'ordre de `STOP_REPORT_REASONS` (décision 0147 § 1 point 1, M5-PO-8). */
const MOTIFS = STOP_REPORT_REASONS.map((value) => ({ value, label: t.motifs[value] }));

/** Message de la feuille : motif manquant, plafond du jour, ou envoi échoué. */
type Erreur = "sansMotif" | "plafond" | "erreur";

/** Action d'envoi : `reportStop` de `@/server/actions/retouches` par défaut (injectée par les tests). */
export type EnvoiSignalement = (input: unknown) => Promise<Result<null>>;

export interface ReportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tripId: string;
  /** Étape signalée (étape du programme, ni engagement ni lieu à soi). */
  stop: Stop;
  /** Signalement enregistré (ou déjà connu du serveur) : la feuille est fermée, la fiche affiche la confirmation. */
  onReported: (reason: StopReportReason) => void;
  /** Rend le focus à « Signaler une erreur » quand la feuille se ferme. */
  onReturnFocus: () => void;
  report?: EnvoiSignalement;
  /** Identifiant de demande (tests) ; `crypto.randomUUID` par défaut. */
  newRequestId?: () => string;
}

/**
 * Feuille modale « Signaler une erreur » (tâche M5c ; spécification M5 § 5 ; rendu UX/UI sur le modèle de la feuille
 * « Déplacer », décision 0018 § 11) : ouverte depuis la Fiche sans changer d'adresse, titre de niveau 1 avec le focus,
 * choix exclusif obligatoire parmi cinq motifs fermés (`SegmentedControl` vertical, comme les raisons de l'écran 14),
 * **aucun champ de texte** (M5-PO-9), « Envoyer » et « Annuler ». Sans motif : « Choisis ce qui ne va pas. » (`role="alert"`),
 * focus sur le groupe. Rien n'est gardé dans le navigateur ; un `requestId` par motif (un nouvel essai du même motif est
 * idempotent côté serveur). Chargée à la demande, hors du JavaScript initial de la Journée.
 */
export function ReportSheet({ open, onOpenChange, ...props }: ReportSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <ReportContent {...props} close={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function ReportContent({
  tripId,
  stop,
  onReported,
  onReturnFocus,
  report = reportStop,
  newRequestId = () => crypto.randomUUID(),
  close,
}: Omit<ReportSheetProps, "open" | "onOpenChange"> & { close: () => void }) {
  const ids = useId();
  const groupId = `${ids}-motifs`;
  const errorId = `${ids}-erreur`;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const sending = useRef(false);
  const requestIds = useRef(new Map<StopReportReason, string>());
  const mounted = useRef(true);

  const [reason, setReason] = useState<StopReportReason | null>(null);
  const [erreur, setErreur] = useState<Erreur | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const send = async () => {
    if (sending.current) return;
    if (reason === null) {
      setErreur("sansMotif");
      groupRef.current?.querySelector<HTMLElement>("[tabindex='0']")?.focus();
      return;
    }
    let requestId = requestIds.current.get(reason);
    if (requestId === undefined) {
      requestId = newRequestId();
      requestIds.current.set(reason, requestId);
    }
    sending.current = true;
    setBusy(true);
    setErreur(null);
    let result: Result<null>;
    try {
      result = await report({ tripId, stopId: stop.id, reason, requestId });
    } catch {
      result = { ok: false, error: { code: "internal" } };
    }
    sending.current = false;
    if (!mounted.current) return;
    setBusy(false);
    if (result.ok) {
      close();
      onReported(reason);
      return;
    }
    setErreur(result.error.code === "rate_limited" ? "plafond" : "erreur");
  };

  return (
    <DialogSheet
      data-sheet="signaler"
      aria-describedby={undefined}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        titleRef.current?.focus();
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        onReturnFocus();
      }}
    >
      <form
        noValidate
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <header className="flex items-start justify-between gap-3">
          <DialogTitle asChild>
            <h1 ref={titleRef} tabIndex={-1} className="min-w-0 text-section font-extrabold text-ink">
              {t.titre}
            </h1>
          </DialogTitle>
          <DialogClose asChild>
            <IconButton icon={<IconCroix />} label={messages.sejour.fiche.fermer} data-part="fermer" />
          </DialogClose>
        </header>

        <p data-part="etape-signalee" className="text-corps font-bold text-ink-2">
          {stop.name}
        </p>

        <div className="flex flex-col gap-3">
          <SegmentedControl
            id={groupId}
            groupRef={groupRef}
            options={MOTIFS}
            value={reason}
            onChange={(value) => {
              setReason(value);
              setErreur(null);
            }}
            label={t.titre}
            orientation="vertical"
            invalid={erreur === "sansMotif"}
            describedBy={errorId}
          />
          {/* Région présente dès l'ouverture (0018, « Message d'erreur et annonces ») ; liée au groupe. */}
          <p id={errorId} role="alert" data-part="erreur-signalement" className={cn("text-corps-s font-semibold text-ink", erreur ? undefined : EMPTY_LIVE_REGION_CLASS)}>
            {erreur === null ? null : t[erreur]}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button type="submit" className={cn("w-full", ARIA_DISABLED)} aria-disabled={busy ? true : undefined} data-part="envoyer">
            {t.envoyer}
          </Button>
          <Button type="button" variant="secondary" className="w-full" data-part="annuler" onClick={close}>
            {t.annuler}
          </Button>
        </div>
      </form>
    </DialogSheet>
  );
}
