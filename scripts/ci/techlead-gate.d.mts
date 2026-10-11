export declare const APPROVED: "techlead-approved";
export declare const CHANGES: "changes-requested";

export interface GateReview {
  body: string;
  createdAt: string;
}

export interface GateInput {
  action: string;
  labels: string[];
  code: boolean;
  headSha: string;
  reviews?: GateReview[];
}

export interface GateDecision {
  pass: boolean;
  removeApproval: boolean;
  messages: string[];
  warnings: string[];
}

export declare function consolidatedHead(body: string | null | undefined): string | null;
export declare function latestConsolidatedHead(entries: GateReview[] | null | undefined): string | null;
export declare function decideGate(input: GateInput): GateDecision;
