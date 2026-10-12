export declare const CI_PORT: 3100;
export declare const LOCAL_PORT_MIN: 3100;
export declare const LOCAL_PORT_MAX: 3899;

export declare function fnv1a(text: string): number;
export declare function worktreePort(repoPath: string): number;
export declare function e2ePort(input: { env: Record<string, string | undefined>; repoPath: string }): number;
