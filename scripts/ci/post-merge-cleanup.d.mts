export declare const QUERY: string;
export declare const MAX_AGE_DAYS: number;
export declare const MERGED_LIMIT: number;
export interface CleanupPlan {
  warnings?: string[];
  closeIssues: { issue: number; pr: number }[];
  deleteBranches: { branch: string; pr: number; oid: string }[];
}
export declare function planCleanup(data: unknown, now?: Date): CleanupPlan;
export declare function planLines(plan: CleanupPlan): string[];
