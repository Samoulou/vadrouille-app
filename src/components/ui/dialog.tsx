"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ComponentPropsWithRef } from "react";

import { cn } from "@/lib/utils";

/**
 * Dialog de shadcn/ui sur `@radix-ui/react-dialog` 1.2.0 (décision 0013, § 3.5), présenté en feuille
 * ancrée en bas de l'écran, à une seule hauteur. Radix fournit le piège de focus, Échap
 * et le titre lié ; `aria-modal` est posé ici (Radix masque seulement le reste de la page). Surfaces provisoires en attendant Q10 : fond `raised`, voile `ink` à 40 % et hauteur maximale
 * (`provisoire.css`),
 * coins `radius-sheet` (F6-Q1). Le `Sheet` à 3 hauteurs de F5 pourra la remplacer.
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
export const DialogClose = DialogPrimitive.Close;

export function DialogSheet({ className, children, ...props }: ComponentPropsWithRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay data-part="voile" className="fixed inset-0 z-40 bg-(--ligne-voile)" />
      <DialogPrimitive.Content
        aria-modal="true"
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-(--ligne-feuille-hauteur-max) w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-sheet bg-raised px-5 pt-6 pb-8 text-ink",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
