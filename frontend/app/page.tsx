"use client";

import { useEffect, useRef, useState } from "react";
import { BriefCard } from "@/components/BriefCard";
import { DraftPanel } from "@/components/DraftPanel";
import { ReceiptPanel } from "@/components/ReceiptPanel";
import { QueuedInputFile, UploadBox } from "@/components/UploadBox";
import {
  DailyBriefInput,
  BriefSectionItem,
  DailyBrief,
  RecommendedAction,
  SelectableInsight,
  fetchDailyBrief,
} from "@/lib/api";

const demoFiles: QueuedInputFile[] = [
  {
    id: "demo-acme-email",
    name: "acme-shipment-delay-email.txt",
    sizeLabel: "2 KB",
  },
  {
    id: "demo-invoice",
    name: "invoice-1042.txt",
    sizeLabel: "1 KB",
  },
  {
    id: "demo-founder-note",
    name: "founder-fulfillment-note.md",
    sizeLabel: "2 KB",
  },
];

const demoPasteText =
  "Founder note: keep customer updates specific, make recommendation reasons easy to inspect, and review any company record updates before applying them.";

export default function Page() {
  const bootedFromQuery = useRef(false);
  const [queuedFiles, setQueuedFiles] = useState<QueuedInputFile[]>([]);
  const [pastedText, setPastedText] = useState("");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [selectedInsight, setSelectedInsight] = useState<SelectableInsight | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askValue, setAskValue] = useState("");

  const buildLiveInputs = (): DailyBriefInput[] => {
    const fileInputs = queuedFiles
      .filter((file) => file.text && file.text.trim().length > 0)
      .map((file) => ({
        sourceId: file.id,
        title: file.name,
        text: file.text ?? "",
      }));

    const textInputs: DailyBriefInput[] = [];

    if (pastedText.trim()) {
      textInputs.push({
        sourceId: "pasted-note",
        title: "Pasted operating note",
        text: pastedText.trim(),
      });
    }

    if (voiceTranscript.trim()) {
      textInputs.push({
        sourceId: "voice-note",
        title: "Voice note transcript",
        text: voiceTranscript.trim(),
      });
    }

    return [...fileInputs, ...textInputs];
  };

  const runBrief = async (options?: { useMock?: boolean }) => {
    setIsRunning(true);
    setError(null);

    try {
      const nextBrief = await fetchDailyBrief(
        options?.useMock || isDemoMode
          ? { useMock: true }
          : { inputs: buildLiveInputs() },
      );
      setBrief(nextBrief);
      setSelectedInsight(nextBrief.recommendedActions[0] ?? nextBrief.cards.ops.items[0] ?? null);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Unable to load the daily brief.");
    } finally {
      setIsRunning(false);
    }
  };

  const handleLoadDemo = () => {
    setQueuedFiles(demoFiles);
    setPastedText(demoPasteText);
    setVoiceTranscript("Please summarize what needs review today and show why each recommendation was made.");
    setIsDemoMode(true);
  };

  const handleFilesChange = (files: QueuedInputFile[]) => {
    setQueuedFiles(files);
    setIsDemoMode(false);
  };

  const handlePastedTextChange = (value: string) => {
    setPastedText(value);
    setIsDemoMode(false);
  };

  const handleVoiceTranscriptChange = (value: string) => {
    setVoiceTranscript(value);
    setIsDemoMode(false);
  };

  useEffect(() => {
    if (bootedFromQuery.current || typeof window === "undefined") {
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    if (!searchParams.has("demo")) {
      return;
    }

    bootedFromQuery.current = true;
    handleLoadDemo();

    if (searchParams.has("run") || searchParams.has("compiled")) {
      void runBrief({ useMock: true });
    }
  }, []);

  const renderActionItem = (action: RecommendedAction) => {
    const isSelected = selectedInsight?.id === action.id;

    return (
      <button
        key={action.id}
        className={`action-item${isSelected ? " is-selected" : ""}`}
        type="button"
        onClick={() => setSelectedInsight(action)}
      >
        <div className="todo-row">
          <span className="todo-marker" aria-hidden="true">
            {action.requiresReview ? "○" : "✓"}
          </span>
          <div className="todo-body">
            <div className="action-head">
              <div>
                <strong className="card-item-title">{action.title}</strong>
                <p className="action-rationale">{action.rationale}</p>
              </div>
              <span className="action-priority" data-priority={action.priority}>
                {action.priority}
              </span>
            </div>
            <div className="tag-row">
              <span className="tag">{action.status}</span>
              <span className="tag">{action.owner}</span>
              <span className="tag">{action.requiresReview ? "Needs review" : "Ready"}</span>
            </div>
          </div>
        </div>
      </button>
    );
  };

  const renderCard = (sectionKey: keyof DailyBrief["cards"]) => {
    if (!brief) {
      return null;
    }

    return (
      <BriefCard
        key={sectionKey}
        sectionKey={sectionKey}
        card={brief.cards[sectionKey]}
        selectedItemId={selectedInsight?.id ?? null}
        onSelect={(item: BriefSectionItem) => setSelectedInsight(item)}
      />
    );
  };

  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SMB ops copilot prototype</p>
          <h1>Daily operating brief</h1>
          <p className="topbar-copy">
            Turn uploaded notes, copied text, and optional voice input into a calm, reviewable
            summary of what needs attention today.
          </p>
        </div>

        <div className="topbar-meta">
          <div className="meta-card">
            <p className="meta-label">Brief date</p>
            <p className="meta-value">{brief?.briefDate ?? "Waiting for input"}</p>
          </div>
          <div className="meta-card">
            <p className="meta-label">Current state</p>
            <p className="meta-value">{brief ? "Brief ready" : "Pre-run"}</p>
          </div>
          <div className="meta-card">
            <p className="meta-label">Review stance</p>
            <p className="meta-value">Suggested, not sent</p>
          </div>
        </div>
      </header>

      <div className="workspace">
        <section>
          <section className="panel summary-panel">
            <div className="summary-head">
              <div>
                <p className="kicker">Executive summary</p>
                <h2>{brief?.reportTitle ?? "What needs attention today"}</h2>
              </div>
              {brief ? <span className="chip">Evidence-backed</span> : null}
            </div>

            {brief ? (
              <>
                <div className="summary-grid">
                  <div>
                    <h3 className="summary-title">{brief.executiveSummary.headline}</h3>
                    <p className="summary-copy">{brief.executiveSummary.body}</p>
                  </div>
                  <div className="summary-points">
                    {brief.executiveSummary.keyPoints.map((point) => (
                      <div className="summary-point" key={point.label}>
                        <strong>{point.label}</strong>
                        <span>{point.value}</span>
                        <span>{point.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="status-line">
                  {brief.agentRuns.map((agent) => (
                    <span className="status-pill" key={agent.id}>
                      <span className="status-dot" aria-hidden="true" />
                      {agent.label}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="summary-copy">
                Run the daily brief after adding a few sample inputs. The resulting view will show
                suggested actions, supporting evidence, prepared drafts, and any record updates
                that should be reviewed by a human.
              </p>
            )}
          </section>

          <section className="panel action-panel">
            <div className="action-head">
              <div>
                <p className="kicker">Recommended actions</p>
                <h2>Today&apos;s to-do list</h2>
              </div>
              <span className="chip">
                {brief ? `${brief.recommendedActions.length} suggestions` : "Waiting"}
              </span>
            </div>

            {error ? <p className="helper-copy">{error}</p> : null}

            {brief ? (
              <div className="action-list">{brief.recommendedActions.map(renderActionItem)}</div>
            ) : (
              <p className="helper-copy">
                Recommendations will appear here after the brief is prepared. Each item will show
                why it is being suggested and what still needs review.
              </p>
            )}
          </section>

          <UploadBox
            queuedFiles={queuedFiles}
            pastedText={pastedText}
            voiceTranscript={voiceTranscript}
            onFilesChange={handleFilesChange}
            onPastedTextChange={handlePastedTextChange}
            onVoiceTranscriptChange={handleVoiceTranscriptChange}
            onRun={runBrief}
            onLoadDemo={handleLoadDemo}
            isRunning={isRunning}
          />

          {brief ? <div className="brief-grid">{(["ops", "finance", "comms", "risks"] as const).map(renderCard)}</div> : null}

          <section className="panel updates-panel">
            <div className="update-head">
              <div>
                <p className="kicker">Proposed updates</p>
                <h2>Needs confirmation</h2>
              </div>
              <span className="chip">
                {brief ? `${brief.proposedUpdates.length} review items` : "Pending"}
              </span>
            </div>

            {brief ? (
              <div className="update-list">
                {brief.proposedUpdates.map((update) => (
                  <article className="update-item" key={update.id}>
                    <strong className="card-item-title">{update.field}</strong>
                    <p className="update-copy">{update.reason}</p>
                    <div className="tag-row">
                      <span className="tag">Current: {update.currentValue}</span>
                      <span className="tag">Proposed: {update.proposedValue}</span>
                      <span className="tag">
                        {update.requiresHumanReview ? "Human review required" : "Ready"}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="helper-copy">
                Proposed company or database updates will be shown as reviewable suggestions only.
              </p>
            )}
          </section>

          <section className="panel ask-panel">
            <div className="panel-head">
              <div>
                <p className="kicker">Ask box</p>
                <h2>Ask your business...</h2>
              </div>
            </div>
            <textarea
              className="ask-input"
              placeholder="Example: What should I review before replying to ACME Retail?"
              value={askValue}
              onChange={(event) => setAskValue(event.target.value)}
            />
            <p className="ask-footnote">
              This demo keeps the ask box lightweight. It is present as a UX surface and does not
              imply a live multi-turn backend yet.
            </p>
          </section>
        </section>

        <div className="right-rail">
          <ReceiptPanel selectedInsight={selectedInsight} receipts={brief?.receipts ?? []} />
          <DraftPanel drafts={brief?.drafts ?? []} />
        </div>
      </div>
    </main>
  );
}
