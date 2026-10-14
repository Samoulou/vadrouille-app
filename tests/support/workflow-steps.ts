/**
 * Lecteur des étapes d'un workflow GitHub Actions, sans dépendance, partagé par `tests/unit/dev-pages-env.test.ts`
 * (drapeaux d'ouverture) et `tests/unit/server-env-config.test.ts` (variables d'environnement). Déplacé tel quel de
 * `tests/unit/dev-pages-env.test.ts` (décision 0050, P2 point 5 : aucune duplication du lecteur).
 */

export const indentOf = (line: string) => line.length - line.trimStart().length;

export interface Step {
  job: string;
  name: string | null;
  start: number;
  lines: string[];
}

/** Étapes d'un workflow : chaque élément `- ` de la liste `steps:` d'un job, jusqu'au suivant de même retrait. */
export function workflowSteps(content: string): Step[] {
  const lines = content.split("\n");
  const steps: Step[] = [];
  let inJobs = false;
  let job = "";
  let jobIndent = -1;
  let stepIndent = -1;
  let current: Step | null = null;
  lines.forEach((line, index) => {
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
      return;
    }
    if (!inJobs || line.trim() === "" || line.trimStart().startsWith("#")) {
      current?.lines.push(line);
      return;
    }
    const indent = indentOf(line);
    const jobMatch = /^(\s+)([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (jobMatch && (jobIndent === -1 || indent === jobIndent)) {
      jobIndent = indent;
      job = jobMatch[2] ?? "";
      stepIndent = -1;
      current = null;
      return;
    }
    if (indent <= jobIndent) {
      current = null;
      return;
    }
    if (/^\s+steps:\s*$/.test(line)) {
      current = null;
      return;
    }
    if (/^\s+- /.test(line) && (stepIndent === -1 || indent === stepIndent)) {
      stepIndent = indent;
      current = { job, name: null, start: index + 1, lines: [line] };
      steps.push(current);
    } else if (current && indent > stepIndent) {
      current.lines.push(line);
    } else {
      current = null;
    }
    if (current && current.name === null) {
      const name = /^\s+(?:- )?name:\s*(.+?)\s*$/.exec(line);
      if (name && indentOf(line.replace("- ", "  ")) === stepIndent + 2) current.name = name[1] ?? null;
    }
  });
  return steps;
}
