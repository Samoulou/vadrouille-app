export declare const APPROVED: "techlead-approved";
export declare const CHANGES: "changes-requested";
export declare const OWNER: "owner-approved";
export declare const BOT: "github-actions[bot]";
export declare const WORKFLOWS: ".github/workflows";
export declare const OWNER_MISSING: string;
export declare const OWNER_NO_RECORD: string;
export declare const OWNER_REMOVED: string;
export declare const FILES_UNREADABLE: string;

export interface GateReview {
  body: string;
  createdAt: string;
}

export interface OwnerRecord {
  tree: string;
  sha: string;
}

export type OwnerApprovalReason = "approved" | "absent" | "no-record" | "changed";

export interface OwnerApproval {
  approved: boolean;
  stale: boolean;
  record: OwnerRecord | null;
  reason: OwnerApprovalReason;
}

export declare const NO_OWNER_APPROVAL: Readonly<OwnerApproval>;

export interface GateEvent {
  event: string;
  label?: { name: string } | null;
  created_at: string;
}

export interface GateComment {
  user: { login: string } | null;
  body: string;
  created_at: string;
}

export interface OwnerApprovalInput {
  labels: string[];
  action: string;
  labelName?: string;
  headSha: string;
  headTree: string;
  events?: GateEvent[];
  comments?: GateComment[];
}

export interface GateInput {
  action: string;
  labels: string[];
  code: boolean;
  headSha: string;
  reviews?: GateReview[];
  workflows?: boolean;
  ownerApproval?: OwnerApproval;
  filesUnreadable?: boolean;
}

export interface GateDecision {
  pass: boolean;
  removeApproval: boolean;
  messages: string[];
  warnings: string[];
  removeOwnerApproval: boolean;
  recordOwnerApproval: OwnerRecord | null;
}

export interface FileClassification {
  code: boolean;
  workflows: boolean;
  unreadable: string[];
}

export declare function touchesWorkflows(files: string[]): boolean;
export declare function classifyFiles(files: string[]): FileClassification;
export declare function readFileList(bytes: Uint8Array): string[];
export declare function evaluateOwnerApproval(input: OwnerApprovalInput): OwnerApproval;
export declare function workflowsTreeId(input: { sha: string; cwd: string }): string;
export declare function consolidatedHead(body: string | null | undefined): string | null;
export declare function latestConsolidatedHead(entries: GateReview[] | null | undefined): string | null;
export declare function decideGate(input: GateInput): GateDecision;
