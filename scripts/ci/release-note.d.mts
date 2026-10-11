export declare const SLACK_MAX: number;
export declare function tagFromNotePath(path: string): string | null;
export declare function slackPayload(input: { tag: string; url: string; body: string }): { text: string };
