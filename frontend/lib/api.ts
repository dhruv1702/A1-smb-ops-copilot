export type BriefSectionKey = "ops" | "finance" | "comms" | "risks";

export interface ReceiptItem {
  id: string;
  title: string;
  kind: string;
  sourceName: string;
  reference: string;
  summary: string;
  excerpt: string;
}

export interface SelectableInsight {
  id: string;
  title: string;
  rationale: string;
  whyItMatters: string[];
  receiptIds: string[];
}

export interface RecommendedAction extends SelectableInsight {
  priority: "high" | "medium" | "low";
  status: string;
  owner: string;
  requiresReview: boolean;
}

export interface BriefSectionItem extends SelectableInsight {
  status: string;
  copy: string;
  tags: string[];
}

export interface BriefSectionCard {
  label: string;
  title: string;
  subtitle: string;
  items: BriefSectionItem[];
}

export interface DraftItem {
  id: string;
  title: string;
  channel: string;
  reviewStatus: string;
  summary: string;
  body: string;
  sourceLabels: string[];
}

export interface ProposedUpdate {
  id: string;
  field: string;
  currentValue: string;
  proposedValue: string;
  reason: string;
  requiresHumanReview: boolean;
}

export interface AgentRunStatus {
  id: string;
  label: string;
  status: "complete" | "pending";
}

export interface DailyBrief {
  briefDate: string;
  reportTitle: string;
  executiveSummary: {
    headline: string;
    body: string;
    keyPoints: Array<{
      label: string;
      value: string;
      detail: string;
    }>;
  };
  cards: Record<BriefSectionKey, BriefSectionCard>;
  recommendedActions: RecommendedAction[];
  drafts: DraftItem[];
  receipts: ReceiptItem[];
  proposedUpdates: ProposedUpdate[];
  agentRuns: AgentRunStatus[];
}

interface BackendBriefItem {
  id: string;
  title: string;
  summary: string;
  priority: number;
  receipt_ids?: string[];
  owner?: string;
  due?: string | null;
  status?: string;
}

interface BackendDraftItem {
  id: string;
  channel: string;
  subject: string;
  body: string;
  tone?: string;
  receipt_ids?: string[];
}

interface BackendReceiptItem {
  id: string;
  title: string;
  source_id: string;
  source_name: string;
  source_type: string;
  excerpt: string;
}

interface BackendDailyBrief {
  executive_summary: string[];
  ops: BackendBriefItem[];
  finance: BackendBriefItem[];
  customer_comms: BackendBriefItem[];
  risks: BackendBriefItem[];
  recommended_actions: BackendBriefItem[];
  drafts: BackendDraftItem[];
  receipts: BackendReceiptItem[];
}

const mockDailyBrief: DailyBrief = {
  briefDate: "April 7, 2026",
  reportTitle: "Daily operating brief",
  executiveSummary: {
    headline: "Two time-sensitive issues need review today: a delayed customer shipment and an overdue invoice follow-up.",
    body:
      "This brief combines the uploaded business inputs into a reviewable operating snapshot. Recommendations below are suggested next steps based on the available evidence and should be confirmed by the business owner before anything is sent or updated.",
    keyPoints: [
      {
        label: "Top customer issue",
        value: "ACME Retail shipment update",
        detail: "The customer asked for a realistic ETA today ahead of a Friday launch.",
      },
      {
        label: "Cash exposure",
        value: "$4,860 overdue",
        detail: "Invoice #1042 is past due and appears to be missing its first reminder.",
      },
      {
        label: "Prepared drafts",
        value: "2 drafts ready",
        detail: "Both remain in review status and have not been sent.",
      },
    ],
  },
  cards: {
    ops: {
      label: "Ops",
      title: "Operational follow-up",
      subtitle: "Time-bound work that should be reviewed and handled today.",
      items: [
        {
          id: "ops-acme-update",
          title: "Prepare a realistic shipment update for ACME Retail",
          status: "Suggested today",
          copy: "The current inputs point to a missed shipment commitment and a launch-related deadline.",
          tags: ["Customer", "Today", "Launch impact"],
          rationale: "The customer requested a clear ETA today and the founder note calls for a direct update when delays exceed 48 hours.",
          whyItMatters: [
            "ACME Retail linked the shipment to a Friday store launch.",
            "The internal playbook calls for a same-day update and a partial ship option on delays.",
          ],
          receiptIds: ["receipt-acme-email", "receipt-delay-playbook"],
        },
        {
          id: "ops-supplier-call",
          title: "Review whether Northline supplier escalation is needed before 11:00",
          status: "Suggested review",
          copy: "The playbook points to a time-sensitive escalation path when truck inventory is missing.",
          tags: ["Supplier", "Ops rule"],
          rationale: "The operating note contains a specific supplier escalation instruction tied to the Tuesday truck.",
          whyItMatters: [
            "A supplier call may clarify whether stock is available for a partial fulfillment plan.",
          ],
          receiptIds: ["receipt-delay-playbook"],
        },
      ],
    },
    finance: {
      label: "Finance",
      title: "Cash and collections",
      subtitle: "Items that affect receivables and short-term cash timing.",
      items: [
        {
          id: "finance-overdue-invoice",
          title: "Review first reminder for invoice #1042",
          status: "Suggested today",
          copy: "The invoice appears overdue and the note says a reminder has not yet been sent.",
          tags: ["$4,860", "Overdue", "Collections"],
          rationale: "The invoice due date has passed and the collections playbook calls for a reminder once the invoice is seven days overdue.",
          whyItMatters: [
            "Unreviewed collection slippage turns a routine follow-up into a cash timing issue.",
          ],
          receiptIds: ["receipt-invoice-1042", "receipt-reminder-rule"],
        },
      ],
    },
    comms: {
      label: "Customer Comms",
      title: "Prepared communications",
      subtitle: "Drafted messages grounded in the uploaded context.",
      items: [
        {
          id: "comms-acme-draft",
          title: "Review shipment reply draft for ACME Retail",
          status: "Prepared draft",
          copy: "The draft reflects the request for a realistic ETA and includes a partial ship option.",
          tags: ["Email", "Review before sending"],
          rationale: "The recommended reply is tied to the complaint email and the sensitive-account playbook note.",
          whyItMatters: [
            "The account is flagged as sensitive and should receive direct language rather than vague status copy.",
          ],
          receiptIds: ["receipt-acme-email", "receipt-sensitive-account"],
        },
        {
          id: "comms-payment-draft",
          title: "Review payment reminder draft for Bluebird Home",
          status: "Prepared draft",
          copy: "The reminder references the invoice amount, due date, and current overdue status.",
          tags: ["Finance comms", "Review before sending"],
          rationale: "The recommendation is supported by the invoice details and the founder collections cadence.",
          whyItMatters: [
            "A clean reminder can recover cash without escalating the tone unnecessarily.",
          ],
          receiptIds: ["receipt-invoice-1042", "receipt-reminder-rule"],
        },
      ],
    },
    risks: {
      label: "Risks",
      title: "Risks to monitor",
      subtitle: "Exposure surfaced by the current inputs and suggested work.",
      items: [
        {
          id: "risk-launch",
          title: "Friday launch timing may slip",
          status: "Monitor closely",
          copy: "The customer tied the missing shipment update directly to a store launch window.",
          tags: ["Customer trust", "Launch risk"],
          rationale: "The complaint email makes the launch timing explicit and shows reduced tolerance for uncertainty.",
          whyItMatters: [
            "Missing the communication window may widen the issue from delivery timing to relationship damage.",
          ],
          receiptIds: ["receipt-acme-email"],
        },
        {
          id: "risk-cash",
          title: "Aging receivable is beginning to affect cash confidence",
          status: "Monitor closely",
          copy: "Invoice #1042 is overdue and still awaiting a first reminder.",
          tags: ["Cash risk", "Receivables"],
          rationale: "The gap between due date and reminder timing creates avoidable cash exposure.",
          whyItMatters: [
            "The business owner should be able to see why collections follow-up is being recommended.",
          ],
          receiptIds: ["receipt-invoice-1042", "receipt-reminder-rule"],
        },
      ],
    },
  },
  recommendedActions: [
    {
      id: "action-acme-update",
      title: "Review and send the ACME Retail update today",
      priority: "high",
      status: "Suggested next action",
      owner: "Owner or operations lead",
      requiresReview: true,
      rationale: "This is the clearest customer-facing pressure point in the uploaded inputs.",
      whyItMatters: [
        "A realistic ETA and partial ship option directly address the customer request.",
        "The account history suggests clarity matters more than polished wording.",
      ],
      receiptIds: ["receipt-acme-email", "receipt-delay-playbook", "receipt-sensitive-account"],
    },
    {
      id: "action-invoice-reminder",
      title: "Review the first reminder for invoice #1042",
      priority: "medium",
      status: "Suggested next action",
      owner: "Owner or finance lead",
      requiresReview: true,
      rationale: "The invoice is already overdue and appears to have missed the expected reminder cadence.",
      whyItMatters: [
        "This recommendation is based on the invoice due date and the note about reminder timing.",
      ],
      receiptIds: ["receipt-invoice-1042", "receipt-reminder-rule"],
    },
    {
      id: "action-crm-update",
      title: "Confirm the ACME account note should be refreshed in the company record",
      priority: "low",
      status: "Suggested follow-up",
      owner: "Owner",
      requiresReview: true,
      rationale: "The sensitive-account note is operationally important and should remain visible in future follow-up work.",
      whyItMatters: [
        "This is presented as a proposed record update, not an automatic system change.",
      ],
      receiptIds: ["receipt-sensitive-account"],
    },
  ],
  drafts: [
    {
      id: "draft-acme",
      title: "Shipment reply draft for ACME Retail",
      channel: "Email",
      reviewStatus: "Prepared draft",
      summary: "Direct status note with revised ETA language and a partial ship offer.",
      body: "Hi Maya, we are reviewing the shipment delay now. Based on the latest note, we should come back to you today with a realistic ETA and confirm whether a partial shipment is possible.",
      sourceLabels: ["Customer email", "Delay playbook", "Sensitive account note"],
    },
    {
      id: "draft-reminder",
      title: "Payment reminder draft for Bluebird Home",
      channel: "Email",
      reviewStatus: "Prepared draft",
      summary: "Reminder anchored to invoice #1042, exact amount, and original due date.",
      body: "Hi Bluebird Home team, this is a friendly follow-up on invoice #1042 for $4,860, originally due on March 26. Please let us know if there is any issue on your side.",
      sourceLabels: ["Invoice #1042", "Collections rule"],
    },
  ],
  receipts: [
    {
      id: "receipt-acme-email",
      title: "Customer requested a realistic ETA today",
      kind: "Customer email",
      sourceName: "acme-shipment-delay-email.txt",
      reference: "Email excerpt",
      summary: "The message states there is no delivery update and asks for a realistic ETA today.",
      excerpt:
        "We still do not have a delivery update... our store launch is on Friday and we need a realistic ETA today.",
    },
    {
      id: "receipt-delay-playbook",
      title: "Delay playbook says to communicate the same day",
      kind: "Founder note",
      sourceName: "founder-fulfillment-note.md",
      reference: "Ops rule",
      summary: "Delayed outbound shipments should trigger a same-day customer update and a partial ship option.",
      excerpt:
        "If any outbound shipment slips by more than 48 hours, email the customer the same day with a revised ETA and offer a partial ship if stock is split.",
    },
    {
      id: "receipt-sensitive-account",
      title: "ACME account is marked as sensitive",
      kind: "Founder note",
      sourceName: "founder-fulfillment-note.md",
      reference: "Account context",
      summary: "The note recommends direct and specific language for this customer relationship.",
      excerpt:
        "ACME account is sensitive after the February packaging mistake; be direct and give a date, not 'soon'.",
    },
    {
      id: "receipt-invoice-1042",
      title: "Invoice #1042 is overdue and unpaid",
      kind: "Invoice",
      sourceName: "invoice-1042.txt",
      reference: "Finance record",
      summary: "The invoice was due March 26 for $4,860 and the notes say no reminder has been sent.",
      excerpt:
        "Invoice #1042... Due Date: 2026-03-26... Amount Due: $4,860... Notes: Net 14. Reminder not yet sent.",
    },
    {
      id: "receipt-reminder-rule",
      title: "Collections rule defines reminder cadence",
      kind: "Founder note",
      sourceName: "founder-fulfillment-note.md",
      reference: "Collections rule",
      summary: "The playbook recommends the first reminder at 7 overdue days and the second at 14 overdue days.",
      excerpt:
        "Payment reminder cadence: first reminder at 7 overdue days, second reminder at 14 overdue days.",
    },
  ],
  proposedUpdates: [
    {
      id: "update-acme-crm",
      field: "Customer relationship note",
      currentValue: "Sensitive account flagged after February packaging issue.",
      proposedValue: "Sensitive account: request same-day updates with concrete dates when shipments slip.",
      reason: "This keeps the relationship context visible for the next follow-up.",
      requiresHumanReview: true,
    },
    {
      id: "update-collections-playbook",
      field: "Collections workflow status",
      currentValue: "First reminder not logged for invoice #1042.",
      proposedValue: "Mark reminder as pending owner review before follow-up is sent.",
      reason: "This preserves operator clarity without implying any reminder was automatically sent.",
      requiresHumanReview: true,
    },
  ],
  agentRuns: [
    { id: "agent-inbox", label: "Inbox Agent complete", status: "complete" },
    { id: "agent-finance", label: "Finance Agent complete", status: "complete" },
    { id: "agent-crm", label: "Customer Relations Agent complete", status: "complete" },
  ],
};

interface FetchDailyBriefOptions {
  endpoint?: string;
  useMock?: boolean;
}

function isFrontendDailyBrief(payload: unknown): payload is DailyBrief {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  return (
    "cards" in payload &&
    "recommendedActions" in payload &&
    "executiveSummary" in payload
  );
}

function isBackendDailyBrief(payload: unknown): payload is BackendDailyBrief {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  return (
    "executive_summary" in payload &&
    "recommended_actions" in payload &&
    "receipts" in payload
  );
}

function mapPriority(priority: number): "high" | "medium" | "low" {
  if (priority <= 1) {
    return "high";
  }
  if (priority === 2) {
    return "medium";
  }
  return "low";
}

function toTitleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function mapSectionItem(item: BackendBriefItem): BriefSectionItem {
  const tags = [item.owner, item.due ?? undefined, `Priority ${item.priority}`]
    .filter(Boolean)
    .map((tag) => String(tag));
  return {
    id: item.id,
    title: item.title,
    status: item.status ?? "Open",
    copy: item.summary,
    tags,
    rationale: item.summary,
    whyItMatters: tags.length ? tags : ["Evidence-backed recommendation"],
    receiptIds: item.receipt_ids ?? [],
  };
}

function mapBackendToFrontend(backendBrief: BackendDailyBrief): DailyBrief {
  const topAction = backendBrief.recommended_actions[0];
  const topRisk = backendBrief.risks[0];
  const topCash = backendBrief.finance[0];

  const keyPoints = [
    {
      label: "Top customer issue",
      value: topRisk?.title ?? "No critical customer issue",
      detail: topRisk?.summary ?? "No escalation-level customer risk found.",
    },
    {
      label: "Cash exposure",
      value: topCash?.title ?? "No overdue invoices surfaced",
      detail: topCash?.summary ?? "No active collections follow-up detected.",
    },
    {
      label: "Prepared drafts",
      value: `${backendBrief.drafts.length} drafts ready`,
      detail:
        backendBrief.drafts.length > 0
          ? "Drafts are generated for human review before sending."
          : "No communication drafts generated from current state.",
    },
  ];

  return {
    briefDate: new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    reportTitle: "Daily operating brief",
    executiveSummary: {
      headline:
        backendBrief.executive_summary[0] ??
        topAction?.title ??
        "No high-priority recommendations from current inputs.",
      body:
        backendBrief.executive_summary.join(" ") ||
        "Recommendations are generated from ingestion and specialist-agent analysis.",
      keyPoints,
    },
    cards: {
      ops: {
        label: "Ops",
        title: "Operational follow-up",
        subtitle: "Time-bound work that should be reviewed and handled today.",
        items: backendBrief.ops.map(mapSectionItem),
      },
      finance: {
        label: "Finance",
        title: "Cash and collections",
        subtitle: "Items that affect receivables and short-term cash timing.",
        items: backendBrief.finance.map(mapSectionItem),
      },
      comms: {
        label: "Customer Comms",
        title: "Prepared communications",
        subtitle: "Drafted messages grounded in the compiled business state.",
        items: backendBrief.customer_comms.map(mapSectionItem),
      },
      risks: {
        label: "Risks",
        title: "Risks to monitor",
        subtitle: "Exposure surfaced by the current inputs and suggested work.",
        items: backendBrief.risks.map(mapSectionItem),
      },
    },
    recommendedActions: backendBrief.recommended_actions.map((action) => ({
      id: action.id,
      title: action.title,
      priority: mapPriority(action.priority),
      status: action.status ?? "Suggested next action",
      owner: action.owner ?? "Owner",
      requiresReview: true,
      rationale: action.summary,
      whyItMatters: [
        action.due ? `Due: ${action.due}` : "No hard deadline specified",
        `Priority score: ${action.priority}`,
      ],
      receiptIds: action.receipt_ids ?? [],
    })),
    drafts: backendBrief.drafts.map((draft) => ({
      id: draft.id,
      title: draft.subject,
      channel: toTitleCase(draft.channel),
      reviewStatus: "Prepared draft",
      summary: draft.tone
        ? `Tone: ${draft.tone}`
        : "Generated from linked action and evidence receipts.",
      body: draft.body,
      sourceLabels: (draft.receipt_ids ?? []).slice(0, 3),
    })),
    receipts: backendBrief.receipts.map((receipt) => ({
      id: receipt.id,
      title: receipt.title,
      kind: toTitleCase(receipt.source_type),
      sourceName: receipt.source_name,
      reference: receipt.source_id,
      summary: receipt.excerpt,
      excerpt: receipt.excerpt,
    })),
    proposedUpdates: [],
    agentRuns: [
      { id: "agent-inbox", label: "Inbox Agent complete", status: "complete" },
      { id: "agent-finance", label: "Finance Agent complete", status: "complete" },
      {
        id: "agent-crm",
        label: "Customer Relations Agent complete",
        status: "complete",
      },
    ],
  };
}

export async function fetchDailyBrief(
  options: FetchDailyBriefOptions = {},
): Promise<DailyBrief> {
  const endpoint = options.endpoint ?? process.env.NEXT_PUBLIC_DAILY_BRIEF_URL ?? "/api/daily-brief";
  const useMock = options.useMock ?? !endpoint;

  if (useMock) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return mockDailyBrief;
  }

  const resolvedEndpoint = endpoint;
  if (!resolvedEndpoint) {
    throw new Error("Daily brief endpoint is not configured.");
  }

  const response = await fetch(resolvedEndpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Daily brief request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  if (isFrontendDailyBrief(payload)) {
    return payload;
  }
  if (isBackendDailyBrief(payload)) {
    return mapBackendToFrontend(payload);
  }
  throw new Error("Daily brief response did not match frontend or backend contract.");
}
