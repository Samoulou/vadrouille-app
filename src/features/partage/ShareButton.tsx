"use client";

import { lazy, Suspense, useRef, useState } from "react";

import { IconButton } from "@/components/ligne/IconButton";
import { IconPartager } from "@/components/ligne/icons";
import { messages } from "@/i18n";
import { cn } from "@/lib/utils";

/** Feuille chargée à la demande : hors du JavaScript initial du Séjour et de la Journée (décision 0039, F10-TL-10). */
const loadSheet = () => import("./ShareSheet");
const ShareSheet = lazy(() => loadSheet().then((loaded) => ({ default: loaded.ShareSheet })));

/** Préchargement au survol ou au focus ; un échec (réseau) est retenté par l'ouverture elle-même. */
function preload() {
  loadSheet().catch(() => {});
}

export interface ShareButtonProps {
  tripId: string;
  /** Fuseau de la destination, pour la date de création du lien. */
  timeZone: string;
  className?: string;
}

/**
 * `IconButton` « Partager » posé en haut à droite de la carte du Séjour et de la Journée (spécification F10,
 * F10c). Rendu seulement si la mise en page du voyage l'a permis côté serveur (voyage débloqué, partage
 * disponible et pas terminé). Ouvre la feuille « Partager ton voyage » sans changer d'adresse ; à la
 * fermeture, le focus revient ici.
 */
export function ShareButton({ tripId, timeZone, className }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  return (
    <>
      <IconButton
        ref={button}
        icon={<IconPartager />}
        label={messages.partage.bouton}
        aria-haspopup="dialog"
        data-part="partager"
        className={cn("absolute right-3 top-3 z-10", className)}
        onPointerEnter={preload}
        onFocus={preload}
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
      />
      {mounted ? (
        <Suspense fallback={null}>
          <ShareSheet
            open={open}
            onOpenChange={setOpen}
            tripId={tripId}
            timeZone={timeZone}
            onReturnFocus={() => button.current?.focus()}
          />
        </Suspense>
      ) : null}
    </>
  );
}
