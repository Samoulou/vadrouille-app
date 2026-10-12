// Release automatique (décision 0023 § 5) : nom du tag d'une note de version et
// message Slack. Fonctions pures, testées dans tests/unit/ci/release-note.test.ts ;
// le workflow .github/workflows/release.yml les appelle avec `node`, sans installation.

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Notes de release de R3 : docs/releases/vAAAA.MM.JJ-HH.md. Les revues hebdomadaires
// (docs/releases/hebdo-AAAA-SS.md) ne sont pas des releases et ne créent pas de tag.
const NOTE = /^docs\/releases\/(v\d{4}\.\d{2}\.\d{2}-\d{2})\.md$/;

/** Tag d'une note de version (nom du fichier sans `.md`), ou null si ce n'en est pas une. */
export function tagFromNotePath(path) {
  const match = NOTE.exec(path);
  return match ? match[1] : null;
}

// Limite prudente : Slack tronque un champ `text` au-delà de 40 000 caractères,
// mais un message lisible dans #studio reste court ; la note complète est sur GitHub.
export const SLACK_MAX = 3000;

/** Charge utile du webhook Slack : titre, lien vers la release, note (tronquée), signature. */
export function slackPayload({ tag, url, body }) {
  const note = body.trim();
  const shown =
    note.length > SLACK_MAX
      ? `${note.slice(0, SLACK_MAX)}\n… (note complète sur GitHub)`
      : note;
  return { text: `*Release ${tag}*  ${url}\n\n${shown}\n\n— Studio` };
}

// Interface en ligne de commande pour le workflow :
//   node scripts/ci/release-note.mjs tag <chemin>            → tag, ou rien
//   node scripts/ci/release-note.mjs slack <tag> <url> <note> → JSON du webhook
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "tag") {
    const tag = tagFromNotePath(args[0] ?? "");
    if (tag) process.stdout.write(`${tag}\n`);
    return;
  }
  if (command === "slack") {
    const [tag, url, file] = args;
    const body = await readFile(file, "utf8");
    process.stdout.write(`${JSON.stringify(slackPayload({ tag, url, body }))}\n`);
    return;
  }
  process.stderr.write("Usage : release-note.mjs tag <chemin> | slack <tag> <url> <note>\n");
  process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
