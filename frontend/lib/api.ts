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

export interface DailyBriefInput {
  sourceId: string;
  title: string;
  text: string;
  sourceType?: "email" | "invoice" | "note";
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
  source_agents?: string[];
  status?: string;
}

interface BackendDraft {
  id: string;
  channel: string;
  subject: string;
  body: string;
  tone?: string;
  related_action_id?: string;
  receipt_ids?: string[];
}

interface BackendReceipt {
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
  drafts: BackendDraft[];
  receipts: BackendReceipt[];
}

interface FetchDailyBriefOptions {
  endpoint?: string;
  useMock?: boolean;
  inputs?: DailyBriefInput[];
}

const DEFAULT_API_ENDPOINT = "/api/daily-brief";
const DEFAULT_DEMO_ENDPOINT = "/demo/daily_brief.json";
const DEMO_REFERENCE_DATE = "2026-04-07";

const SECTION_CONFIG: Record<
  BriefSectionKey,
  {
    label: string;
    title: string;
    subtitle: string;
  }
> = {
  ops: {
    label: "Ops",
    title: "Operational follow-up",
    subtitle: "Time-bound work that should be reviewed and handled today.",
  },
  finance: {
    label: "Finance",
    title: "Cash and collections",
    subtitle: "Items that affect receivables and short-term cash timing.",
  },
  comms: {
    label: "Customer Comms",
    title: "Prepared communications",
    subtitle: "Drafted messages grounded in the compiled business context.",
  },
  risks: {
    label: "Risks",
    title: "Risks to monitor",
    subtitle: "Exposure surfaced by the current state and suggested actions.",
  },
};

export async function fetchDailyBrief(
  options: FetchDailyBriefOptions = {},
): Promise<DailyBrief> {
  const requestInputs = (options.inputs ?? []).filter((input) => input.text.trim().length > 0);
  const configuredEndpoint = options.endpoint ?? process.env.NEXT_PUBLIC_DAILY_BRIEF_URL;
  const preferredEndpoint = options.useMock ? DEFAULT_DEMO_ENDPOINT : configuredEndpoint ?? DEFAULT_API_ENDPOINT;
  const endpointsToTry =
    requestInputs.length === 0 &&
    !options.useMock &&
    !configuredEndpoint &&
    preferredEndpoint === DEFAULT_API_ENDPOINT
      ? [DEFAULT_API_ENDPOINT, DEFAULT_DEMO_ENDPOINT]
      : [preferredEndpoint];

  let lastError: Error | null = null;

  for (const endpoint of endpointsToTry) {
    try {
      const response = await fetch(
        endpoint,
        requestInputs.length > 0
          ? {
              method: "POST",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                reference_date: DEMO_REFERENCE_DATE,
                inputs: requestInputs.map((input) => ({
                  source_id: input.sourceId,
                  title: input.title,
                  text: input.text,
                  source_type: input.sourceType,
                })),
              }),
              cache: "no-store",
            }
          : {
              method: "GET",
              headers: {
                Accept: "application/json",
              },
              cache: "no-store",
            },
      );

      if (!response.ok) {
        throw new Error(`Daily brief request failed with status ${response.status}`);
      }

      const rawBrief = (await response.json()) as BackendDailyBrief;
      return adaptBackendDailyBrief(rawBrief);
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error("Unable to load the daily brief.");
    }
  }

  throw lastError ?? new Error("Unable to load the daily brief.");
}

function adaptBackendDailyBrief(raw: BackendDailyBrief): DailyBrief {
  const receiptMap = new Map(raw.receipts.map((receipt) => [receipt.id, receipt]));

  return {
    briefDate: formatDisplayDate(DEMO_REFERENCE_DATE),
    reportTitle: "Daily operating brief",
    executiveSummary: buildExecutiveSummary(raw),
    cards: {
      ops: buildSectionCard("ops", raw.ops, receiptMap),
      finance: buildSectionCard("finance", raw.finance, receiptMap),
      comms: buildSectionCard("comms", raw.customer_comms, receiptMap),
      risks: buildSectionCard("risks", raw.risks, receiptMap),
    },
    recommendedActions: raw.recommended_actions.map((item) =>
      adaptRecommendedAction(item, receiptMap),
    ),
    drafts: raw.drafts.map((draft) => adaptDraft(draft, receiptMap)),
    receipts: raw.receipts.map(adaptReceipt),
    proposedUpdates: buildProposedUpdates(raw, receiptMap),
    agentRuns: [
      { id: "agent-inbox", label: "Inbox Agent complete", status: "complete" },
      { id: "agent-finance", label: "Finance Agent complete", status: "complete" },
      {
        id: "agent-customer-relations",
        label: "Customer Relations Agent complete",
        status: "complete",
      },
    ],
  };
}

function buildExecutiveSummary(raw: BackendDailyBrief): DailyBrief["executiveSummary"] {
  const headline = raw.executive_summary[0] ?? "What needs attention today";
  const tail = raw.executive_summary.slice(1).join(" ");
  const body =
    tail ||
    "This brief is compiled from the current business state and should be reviewed by a human before any action is taken.";

  const keyPoints = [
    raw.customer_comms[0]
      ? {
          label: "Top customer issue",
          value: raw.customer_comms[0].title,
          detail: raw.customer_comms[0].summary,
        }
      : null,
    raw.finance[0]
      ? {
          label: "Cash exposure",
          value: raw.finance[0].title,
          detail: raw.finance[0].summary,
        }
      : null,
    {
      label: "Prepared drafts",
      value: `${raw.drafts.length} drafts ready`,
      detail:
        raw.drafts.length > 0
          ? "Drafts remain in review status and have not been sent automatically."
          : "No drafts are currently prepared.",
    },
  ].filter(Boolean) as DailyBrief["executiveSummary"]["keyPoints"];

  return {
    headline,
    body,
    keyPoints,
  };
}

function buildSectionCard(
  sectionKey: BriefSectionKey,
  items: BackendBriefItem[],
  receiptMap: Map<string, BackendReceipt>,
): BriefSectionCard {
  const config = SECTION_CONFIG[sectionKey];
  return {
    ...config,
    items: items.map((item) => adaptBriefSectionItem(item, receiptMap)),
  };
}

function adaptBriefSectionItem(
  item: BackendBriefItem,
  receiptMap: Map<string, BackendReceipt>,
): BriefSectionItem {
  return {
    id: item.id,
    title: item.title,
    status: normalizeStatus(item.status ?? "open"),
    copy: item.summary,
    tags: unique(
      [
        priorityToLabel(item.priority).toUpperCase(),
        item.owner ? titleCase(item.owner.replaceAll("_", " ")) : null,
        item.due ? `Due ${normalizeStatus(item.due)}` : null,
        ...(item.source_agents ?? []).map((agent) => titleCase(agent.replaceAll("_", " "))),
      ].filter(Boolean) as string[],
    ).slice(0, 4),
    rationale: item.summary,
    whyItMatters: buildWhyItMatters(item, receiptMap),
    receiptIds: item.receipt_ids ?? [],
  };
}

function adaptRecommendedAction(
  item: BackendBriefItem,
  receiptMap: Map<string, BackendReceipt>,
): RecommendedAction {
  return {
    id: item.id,
    title: item.title,
    priority: priorityToLabel(item.priority),
    status: normalizeStatus(item.status ?? "pending_review"),
    owner: titleCase((item.owner ?? "ops").replaceAll("_", " ")),
    requiresReview: true,
    rationale: item.summary,
    whyItMatters: buildWhyItMatters(item, receiptMap),
    receiptIds: item.receipt_ids ?? [],
  };
}

function adaptDraft(
  draft: BackendDraft,
  receiptMap: Map<string, BackendReceipt>,
): DraftItem {
  const sourceLabels = unique(
    (draft.receipt_ids ?? [])
      .map((receiptId) => receiptMap.get(receiptId)?.title)
      .filter(Boolean) as string[],
  ).slice(0, 4);

  return {
    id: draft.id,
    title: draft.subject,
    channel: titleCase(draft.channel),
    reviewStatus: "Prepared draft",
    summary: summarizeDraft(draft),
    body: draft.body,
    sourceLabels,
  };
}

function adaptReceipt(receipt: BackendReceipt): ReceiptItem {
  return {
    id: receipt.id,
    title: receipt.title,
    kind: titleCase(receipt.source_type),
    sourceName: receipt.source_name,
    reference: referenceLabel(receipt.source_type),
    summary: receipt.title,
    excerpt: receipt.excerpt,
  };
}

function buildWhyItMatters(
  item: BackendBriefItem,
  receiptMap: Map<string, BackendReceipt>,
): string[] {
  const receiptReasons = (item.receipt_ids ?? [])
    .map((receiptId) => receiptMap.get(receiptId)?.title)
    .filter(Boolean) as string[];

  return unique(
    [
      item.due ? `Suggested timing: ${normalizeStatus(item.due)}` : null,
      item.owner ? `Suggested owner: ${titleCase(item.owner.replaceAll("_", " "))}` : null,
      ...receiptReasons,
    ].filter(Boolean) as string[],
  ).slice(0, 3);
}

function buildProposedUpdates(
  raw: BackendDailyBrief,
  receiptMap: Map<string, BackendReceipt>,
): ProposedUpdate[] {
  const updates: ProposedUpdate[] = [];
  const receiptTitles = new Set(raw.receipts.map((receipt) => receipt.title.toLowerCase()));

  if (receiptTitles.has("sensitive account note")) {
    updates.push({
      id: "update-account-context",
      field: "Customer relationship note",
      currentValue: "Sensitive account flagged after prior packaging issue.",
      proposedValue: "Use direct shipment updates with specific dates when delays occur.",
      reason:
        "The founder note marks this account as sensitive and suggests direct date-specific communication.",
      requiresHumanReview: true,
    });
  }

  if (raw.finance.length > 0) {
    const financeItem = raw.finance[0];
    updates.push({
      id: "update-collections-status",
      field: "Collections workflow status",
      currentValue: "Reminder status unclear in current operating record.",
      proposedValue: `${financeItem.title} should be marked pending owner review.`,
      reason:
        "This keeps collections follow-up visible without implying any reminder was sent automatically.",
      requiresHumanReview: true,
    });
  }

  if (
    raw.ops.length > 0 &&
    Array.from(receiptMap.values()).some((receipt) =>
      receipt.title.toLowerCase().includes("supplier escalation"),
    )
  ) {
    updates.push({
      id: "update-supplier-escalation",
      field: "Fulfillment escalation note",
      currentValue: "Supplier escalation path not confirmed for this shipment issue.",
      proposedValue: "Confirm whether Northline escalation should be tracked as active for this order.",
      reason:
        "The playbook contains a time-sensitive supplier escalation rule tied to missing truck inventory.",
      requiresHumanReview: true,
    });
  }

  return updates;
}

function summarizeDraft(draft: BackendDraft): string {
  const firstSentence = draft.body
    .split("\n")
    .find((line) => line.trim().length > 0 && !line.startsWith("Hi "));
  if (firstSentence) {
    return firstSentence.trim();
  }
  return `${titleCase(draft.tone ?? "prepared")} draft prepared for review.`;
}

function referenceLabel(sourceType: string): string {
  if (sourceType === "email") {
    return "Email excerpt";
  }
  if (sourceType === "invoice") {
    return "Finance record";
  }
  if (sourceType === "note") {
    return "Ops rule";
  }
  return "Source excerpt";
}

function priorityToLabel(priority: number): "high" | "medium" | "low" {
  if (priority <= 1) {
    return "high";
  }
  if (priority === 2) {
    return "medium";
  }
  return "low";
}

function normalizeStatus(value: string): string {
  return titleCase(value.replaceAll("_", " ").replaceAll("-", " "));
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDisplayDate(rawDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${rawDate}T09:00:00Z`));
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}
