import type { ReactNode } from "react";

export interface EtatPageProps {
  /** Titre de niveau 1, seul de la page. */
  title: string;
  /** Ce qui s'est passé et ce qu'on peut faire (redaction.md). */
  text: string;
  /** Actions de fin d'écran (décision 0018) : `primary` puis `text`, en pleine largeur. */
  children: ReactNode;
}

/**
 * Mise en page commune de la page introuvable et des pages d'erreur (écran 18, rendu provisoire UX/UI, Q154) :
 * titre, texte, puis les actions dans le flux. Aucune donnée, aucun paramètre : le contenu ne dépend ni de
 * l'adresse ni de la raison (F11-PO-17).
 */
export function EtatPage({ title, text, children }: EtatPageProps) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-5 py-10">
      <div className="flex flex-col gap-3">
        <h1 className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">{title}</h1>
        <p className="text-corps text-ink-2">{text}</p>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </main>
  );
}
