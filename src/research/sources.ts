import type { ClasseSource } from "@/prototype/candidat";

/**
 * Politique de sources (cadrage § 6.5) : classement maison des domaines. Privilégier médias et guides locaux,
 * critiques gastronomiques, sites officiels et agendas institutionnels ; pénaliser les listes génériques
 * d'affiliation. La classe pèse dans le classement (`classement.json`), jamais dans un prompt.
 */

const GENERIQUES = /(?:^|[.-])(?:tripadvisor|booking|expedia|viator|getyourguide|klook|hotels|top\d*|best|affiliat\w*)(?:[.-]|$)/;
const OFFICIELLES = /(?:\.gov\.uk|\.gov|\.gouv\.fr|\.admin\.ch|\.ac\.uk|\.edu)$|^(?:www\.)?visit[a-z-]*\./;

export function classerSource(url: string): ClasseSource {
  const hote = new URL(url).hostname;
  if (OFFICIELLES.test(hote)) return "officielle";
  if (GENERIQUES.test(hote)) return "generique";
  return "independante";
}

const MOIS_EN = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/**
 * Vrai si le texte d'une page relue mentionne la date (R2) : forme ISO, « 25 November 2026 » ou « 25 novembre
 * 2026 ». Un événement dont la page ne confirme pas la date porte le badge `unconfirmed`.
 */
export function dateMentionnee(texte: string, date: string): boolean {
  const [annee, mois, jour] = date.split("-");
  if (annee === undefined || mois === undefined || jour === undefined) return false;
  const bas = texte.toLowerCase();
  if (bas.includes(date)) return true;
  const index = Number(mois) - 1;
  const j = String(Number(jour));
  return [MOIS_EN[index], MOIS_FR[index]].some(
    (nom) => nom !== undefined && (bas.includes(`${j} ${nom} ${annee}`) || bas.includes(`${j}${j === "1" ? "er" : ""} ${nom} ${annee}`)),
  );
}
