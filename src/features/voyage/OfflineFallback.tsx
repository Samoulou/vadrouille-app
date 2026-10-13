"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ligne/Button";
import { EtatPage } from "@/features/etats/EtatPage";
import { messages } from "@/i18n";
import { useOnline } from "@/lib/online";

const t = messages.voyage.horsLigne;

export interface OfflineFallbackProps {
  /** Historique de l'onglet (tests) ; celui du navigateur par défaut. */
  history?: Pick<History, "length" | "back">;
  /** Ouverture d'une adresse (tests) ; `location.assign` par défaut. */
  assign?: (url: string) => void;
}

/**
 * Page de repli hors ligne (`R-repli`, spécification F10, F10b ; F10-PO-9 ; rendu provisoire UX/UI, F10-Q5). Servie
 * par le service worker quand une navigation échoue faute de réseau. Elle ne contient et ne lit aucune donnée : ni
 * voyage, ni jeton, ni adresse demandée, ni stockage.
 *
 * « Réessayer » sert surtout l'application installée, sans bouton du navigateur : retour à la page d'où la personne
 * est partie, ou l'accueil dans un onglet sans page précédente. Au retour du réseau, « Connexion rétablie. » est
 * annoncé poliment.
 */
export function OfflineFallback({ history, assign }: OfflineFallbackProps) {
  const online = useOnline();
  const [state, setState] = useState({ online, announce: "" });
  if (online !== state.online) {
    // Ajustement pendant le rendu : l'annonce ne suit qu'un passage de « hors ligne » à « en ligne ».
    setState({ online, announce: online ? t.retabli : "" });
  }

  const retry = () => {
    const tabHistory = history ?? window.history;
    if (tabHistory.length > 1) tabHistory.back();
    else (assign ?? ((url: string) => window.location.assign(url)))("/");
  };

  return (
    <EtatPage title={t.titre} text={t.texte}>
      <Button onClick={retry}>{t.reessayer}</Button>
      <Button asChild variant="text">
        <Link href="/" prefetch={false}>
          {t.accueil}
        </Link>
      </Button>
      <p role="status" data-part="annonce" className="sr-only">
        {state.announce}
      </p>
    </EtatPage>
  );
}
