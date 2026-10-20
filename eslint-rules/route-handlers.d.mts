import type { Rule } from "eslint";

export declare const IDENTIFIANTS_REFUSES_ACTIONS: ReadonlySet<string>;
export declare const CONTRAT_INTERNE: ReadonlySet<string>;
export declare const estRouteApi: (fichier: string) => boolean;
export declare function refusImport(source: string, importateur: string): string | null;
export declare const routeHandlers: Rule.RuleModule;
