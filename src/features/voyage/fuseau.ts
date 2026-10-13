import { format, messages } from "@/i18n";

const t = messages.voyage.aujourdhui;

/** Noms de lieu à « h » aspiré : pas d'élision (« Heures de Hambourg »). Liste fermée, complétée au besoin. */
const H_ASPIRE = /^(hambourg|hanovre|hollande|hongrie|hong kong|honduras)\b/i;

/**
 * « Heures de Lisbonne », « Heures d'Édimbourg », « Heures d'Hendaye » : élision devant une voyelle ou un « h »
 * muet ; les « h » aspirés connus (`H_ASPIRE`) gardent « de ».
 */
export function timeZoneMention(destination: string): string {
  const elision = /^[aeiouyàâäéèêëîïôöùûüœ]/i.test(destination) || (/^h/i.test(destination) && !H_ASPIRE.test(destination));
  return format(elision ? t.fuseauElision : t.fuseau, { destination });
}
