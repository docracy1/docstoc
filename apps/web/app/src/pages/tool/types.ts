import type {
  ChaseReminder,
  ChaseSequence,
  CloudFileImport,
  CloudProvider,
  RewriteAction,
  SmsWhatsAppDraft,
} from "../../lib/api";

export type PendingCloudImport = CloudFileImport & {
  provider: CloudProvider | "upload";
  providerLabel: string;
  /** Small local-only thumbnail (data URL) of a phone-scanned page — there's no extractable
   *  text to show a preview from otherwise, and without this the import looks like it produced
   *  nothing at all. Never sent to the server; only ever a client-side handoff. */
  previewDataUrl?: string;
};

export type AiBusy =
  | RewriteAction
  | "thankyou"
  | "reply"
  | "replySmart"
  | "sequence"
  | "multi"
  | "sms"
  | "demandLetter"
  | null;

export interface Invoice {
  id: string;
  clientName: string;
  amount: number;
  dueDate: string;
  status?: "open" | "paid";
  paidAt?: string | null;
  draft?: { subject: string; body: string };
  generating: boolean;
  rewriting: AiBusy;
  clientReply?: string;
  replyInsight?: {
    classification: string;
    summary: string;
    suggestedAction: string;
    promisedPayDate?: string | null;
  } | null;
  sequence?: ChaseSequence | null;
  reminders?: ChaseReminder[];
  smsDraft?: SmsWhatsAppDraft | null;
  lastChaseStatus?: string | null;
  lastChaseAt?: string | null;
  trackingNote?: string | null;
  timeline?: import("../../lib/api").ChaseEventRecord[];
  error?: string;
  /** Set once a NOWPayments crypto invoice has been generated for this row. */
  paymentMethod?: "crypto" | null;
  paymentUrl?: string | null;
}

export type StoredInvoice = {
  id: string;
  clientName: string;
  amount: number;
  dueDate: string;
  status?: "open" | "paid";
  paidAt?: string | null;
  draft?: { subject: string; body: string };
  lastChaseStatus?: string | null;
  lastChaseAt?: string | null;
  paymentMethod?: "crypto" | null;
  paymentUrl?: string | null;
};
