/**
 * Mailpit des tests de base (spécification B3b-envoi, critères E5, E6 et E8 ; décision 0098 § 5). Service du job `db` de
 * la CI (`.github/workflows/ci.yml`) ou service `mailpit` de `docker-compose.yml`, joint **sur la boucle locale
 * seulement** : SMTP `127.0.0.1:1025` (cible du transport, passée directement à `createSmtpCodeMailer` : aucune
 * variable d'environnement, aucun repli du code de l'application), API `127.0.0.1:8025`. Adresses des essais en
 * `exemple.test`, uniques à chaque appel : aucun test ne vide la boîte (les tests s'exécutent en parallèle).
 */

export const MAILPIT_SMTP = { host: "127.0.0.1", port: 1025 } as const;
const API = "http://127.0.0.1:8025/api/v1";

const attendre = (ms: number) => new Promise<void>((fin) => setTimeout(fin, ms));

type AdresseMailpit = { Name: string; Address: string };
type Resume = { ID: string };
export type MessageMailpit = {
  readonly id: string;
  readonly from: string;
  readonly to: readonly string[];
  readonly cc: readonly string[];
  readonly bcc: readonly string[];
  readonly subject: string;
  readonly text: string;
  readonly html: string;
};

const adresses = (liste: readonly AdresseMailpit[] | null | undefined): string[] => (liste ?? []).map((a) => a.Address);

async function lireJson(chemin: string): Promise<unknown> {
  let reponse: Response;
  try {
    reponse = await fetch(`${API}${chemin}`);
  } catch {
    throw new Error("Mailpit injoignable sur 127.0.0.1:8025 (service du job `db` de la CI, ou `docker compose up -d mailpit`).");
  }
  if (!reponse.ok) throw new Error(`Mailpit a répondu ${reponse.status} à ${chemin.split("?")[0]}.`);
  return reponse.json();
}

/** Messages reçus par `adresse` (destinataire, copie ou copie cachée), du plus récent au plus ancien, après `delaiMs`. */
export async function messagesPour(adresse: string, delaiMs = 0): Promise<MessageMailpit[]> {
  if (delaiMs > 0) await attendre(delaiMs);
  const recherche = (await lireJson(`/search?query=${encodeURIComponent(`to:${adresse}`)}&limit=50`)) as { messages?: Resume[] };
  const resultat: MessageMailpit[] = [];
  for (const { ID } of recherche.messages ?? []) {
    const m = (await lireJson(`/message/${encodeURIComponent(ID)}`)) as {
      ID: string;
      From?: AdresseMailpit | null;
      To?: AdresseMailpit[] | null;
      Cc?: AdresseMailpit[] | null;
      Bcc?: AdresseMailpit[] | null;
      Subject?: string;
      Text?: string;
      HTML?: string;
    };
    resultat.push({
      id: m.ID,
      from: m.From?.Address ?? "",
      to: adresses(m.To),
      cc: adresses(m.Cc),
      bcc: adresses(m.Bcc),
      subject: m.Subject ?? "",
      text: m.Text ?? "",
      html: m.HTML ?? "",
    });
  }
  return resultat;
}

/** Attend (3 secondes au plus) au moins `n` messages pour `adresse` et les rend ; échoue sinon. */
export async function attendreMessages(adresse: string, n = 1): Promise<MessageMailpit[]> {
  for (let essai = 0; essai < 30; essai += 1) {
    const messages = await messagesPour(adresse);
    if (messages.length >= n) return messages;
    await attendre(100);
  }
  throw new Error(`Mailpit n'a pas reçu ${n} message(s) pour l'adresse de l'essai.`);
}

/** Dernier code (6 chiffres) reçu par `adresse`, ou `undefined` sans message. */
export async function dernierCodeMailpit(adresse: string): Promise<string | undefined> {
  const [dernier] = await messagesPour(adresse);
  return dernier === undefined ? undefined : /[0-9]{6}/.exec(dernier.text)?.[0];
}
