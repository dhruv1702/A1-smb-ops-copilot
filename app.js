(function () {
  const referenceDate = new Date("2026-04-07T09:00:00+08:00");
  const pipelineStages = [
    {
      id: "ingest",
      label: "Ingest inputs",
      copy: "Queue uploaded files and normalize the raw text.",
    },
    {
      id: "extract",
      label: "Extract facts",
      copy: "Pull out customers, money, due dates, and obligations.",
    },
    {
      id: "compile",
      label: "Compile memory",
      copy: "Build a compact operating state from the extracted evidence.",
    },
    {
      id: "brief",
      label: "Write brief",
      copy: "Turn the compiled state into next actions and draft responses.",
    },
  ];

  const demoDocuments = [
    {
      id: "doc-email-acme",
      name: "acme-shipment-delay-email.txt",
      text: [
        "Subject: Re: ACME spring launch order - shipment update?",
        "From: Maya Patel <maya@acme-retail.com>",
        "Received: 2026-04-07 08:14 SGT",
        "",
        "Hi team,",
        "We still do not have a delivery update for PO-7781. Your team said the shipment would leave last Thursday, but our store launch is on Friday and we need a realistic ETA today.",
        "If the shipment slipped, please tell us plainly and let us know whether a partial delivery is possible.",
        "",
        "Thanks,",
        "Maya Patel",
        "Operations Manager, ACME Retail",
      ].join("\n"),
      origin: "Demo file",
    },
    {
      id: "doc-invoice-1042",
      name: "invoice-1042.txt",
      text: [
        "Invoice #1042",
        "Customer: Bluebird Home",
        "Issue Date: 2026-03-12",
        "Due Date: 2026-03-26",
        "Amount Due: $4,860",
        "Status: Unpaid",
        "Notes: Net 14. Reminder not yet sent.",
      ].join("\n"),
      origin: "Demo file",
    },
    {
      id: "doc-founder-note",
      name: "founder-fulfillment-note.md",
      text: [
        "Fulfillment note - founder desk",
        "",
        "- If any outbound shipment slips by more than 48 hours, email the customer the same day with a revised ETA and offer a partial ship if stock is split.",
        "- Call Northline supplier before 11:00 if stock is missing from the Tuesday truck.",
        "- Payment reminder cadence: first reminder at 7 overdue days, second reminder at 14 overdue days.",
        "- ACME account is sensitive after the February packaging mistake; be direct and give a date, not 'soon'.",
      ].join("\n"),
      origin: "Demo file",
    },
  ];

  const state = {
    documents: [],
    compiled: null,
    pipelineIndex: -1,
    pipelineMode: "idle",
    activeFocusId: null,
    isCompiling: false,
  };

  const elements = {
    briefDate: document.getElementById("brief-date"),
    pipelineStatus: document.getElementById("pipeline-status"),
    pipelineStageCopy: document.getElementById("pipeline-stage-copy"),
    pipelineSteps: document.getElementById("pipeline-steps"),
    loadDemoButton: document.getElementById("load-demo-button"),
    compileButton: document.getElementById("compile-button"),
    clearButton: document.getElementById("clear-button"),
    fileInput: document.getElementById("file-input"),
    sourceList: document.getElementById("source-list"),
    documentCount: document.getElementById("document-count"),
    memoryMetrics: document.getElementById("memory-metrics"),
    briefGrid: document.getElementById("brief-grid"),
    briefSummary: document.getElementById("brief-summary"),
    focusPanel: document.getElementById("focus-panel"),
    filesRead: document.getElementById("files-read"),
    filesReadCount: document.getElementById("files-read-count"),
    factsList: document.getElementById("facts-list"),
    factsCount: document.getElementById("facts-count"),
    draftsList: document.getElementById("drafts-list"),
    draftsCount: document.getElementById("drafts-count"),
    dropzone: document.querySelector(".dropzone"),
  };

  function init() {
    elements.briefDate.textContent = formatLongDate(referenceDate);
    renderPipeline();
    renderMemoryMetrics();
    bindEvents();
    renderSourceList();
    bootFromQuery();
  }

  function bindEvents() {
    elements.loadDemoButton.addEventListener("click", () => {
      state.documents = demoDocuments.map((documentItem) => ({
        ...documentItem,
        status: "ready",
      }));
      resetCompilation();
      renderSourceList();
      renderMemoryMetrics();
      updateControls();
    });

    elements.clearButton.addEventListener("click", () => {
      state.documents = [];
      resetCompilation();
      renderSourceList();
      renderMemoryMetrics();
      renderReceipts();
      renderBrief();
      updateControls();
    });

    elements.compileButton.addEventListener("click", compileCurrentState);

    elements.fileInput.addEventListener("change", async (event) => {
      const { files } = event.target;
      if (!files || !files.length) {
        return;
      }

      const loadedFiles = await Promise.all(Array.from(files).map(readFile));
      state.documents = dedupeDocuments([...state.documents, ...loadedFiles]);
      resetCompilation();
      renderSourceList();
      renderMemoryMetrics();
      updateControls();
      event.target.value = "";
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      elements.dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        elements.dropzone.classList.add("drag-active");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      elements.dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        if (eventName === "drop" && event.dataTransfer && event.dataTransfer.files.length) {
          handleDroppedFiles(event.dataTransfer.files);
        }
        elements.dropzone.classList.remove("drag-active");
      });
    });
  }

  async function bootFromQuery() {
    const query = new URLSearchParams(window.location.search);
    if (!query.has("demo")) {
      return;
    }

    state.documents = demoDocuments.map((documentItem) => ({
      ...documentItem,
      status: "ready",
    }));
    resetCompilation();
    renderSourceList();
    renderMemoryMetrics();
    updateControls();

    if (query.has("compiled")) {
      state.compiled = compileBusinessState(state.documents);
      state.activeFocusId = state.compiled.defaultFocusId;
      state.pipelineMode = "ready";
      state.pipelineIndex = pipelineStages.length - 1;
      renderPipeline();
      renderMemoryMetrics();
      renderBrief();
      renderReceipts();
      updateControls();
      return;
    }

    if (query.has("compile")) {
      await wait(100);
      await compileCurrentState();
    }
  }

  async function handleDroppedFiles(files) {
    const loadedFiles = await Promise.all(Array.from(files).map(readFile));
    state.documents = dedupeDocuments([...state.documents, ...loadedFiles]);
    resetCompilation();
    renderSourceList();
    renderMemoryMetrics();
    updateControls();
  }

  async function readFile(file) {
    const isTextFriendly =
      file.type.startsWith("text/") ||
      file.name.endsWith(".md") ||
      file.name.endsWith(".txt") ||
      file.name.endsWith(".eml");
    const text = isTextFriendly
      ? await file.text()
      : [
          "[Binary file queued for reference]",
          `File name: ${file.name}`,
          "Tip: use text exports in the prototype to extract facts and citations.",
        ].join("\n");

    return {
      id: `upload-${slugify(file.name)}-${file.lastModified || Date.now()}`,
      name: file.name,
      text,
      origin: "Uploaded file",
      status: "ready",
    };
  }

  function resetCompilation() {
    state.compiled = null;
    state.activeFocusId = null;
    state.pipelineIndex = -1;
    state.pipelineMode = state.documents.length ? "stale" : "idle";
    state.isCompiling = false;
    renderPipeline();
    renderBrief();
    renderReceipts();
  }

  async function compileCurrentState() {
    if (!state.documents.length || state.isCompiling) {
      return;
    }

    state.isCompiling = true;
    state.pipelineMode = "running";
    updateControls();

    for (let index = 0; index < pipelineStages.length; index += 1) {
      state.pipelineIndex = index;
      renderPipeline();
      await wait(260);
    }

    state.compiled = compileBusinessState(state.documents);
    state.activeFocusId = state.compiled.defaultFocusId;
    state.pipelineMode = "ready";
    state.isCompiling = false;
    renderPipeline();
    renderMemoryMetrics();
    renderBrief();
    renderReceipts();
    updateControls();
  }

  function updateControls() {
    elements.compileButton.disabled = !state.documents.length || state.isCompiling;
    elements.clearButton.disabled = !state.documents.length || state.isCompiling;
  }

  function renderPipeline() {
    const statusMap = {
      idle: "Waiting for inputs",
      stale: "Needs recompilation",
      running: "Compiling now",
      ready: "Brief ready",
    };

    const copyMap = {
      idle: "Ingest raw files into a usable company state.",
      stale: "New inputs changed the state. Recompile to refresh the brief.",
      running: pipelineStages[state.pipelineIndex]?.copy || "Compiling business state.",
      ready: "Recommendations are grounded in the evidence currently queued.",
    };

    elements.pipelineStatus.textContent = statusMap[state.pipelineMode];
    elements.pipelineStageCopy.textContent = copyMap[state.pipelineMode];
    elements.pipelineSteps.innerHTML = pipelineStages
      .map((stage, index) => {
        const statusClass =
          state.pipelineMode === "ready" || index < state.pipelineIndex
            ? "done"
            : index === state.pipelineIndex && state.pipelineMode === "running"
              ? "active"
              : "";

        return [
          `<div class="pipeline-step ${statusClass}">`,
          '<span class="pipeline-step-marker" aria-hidden="true"></span>',
          `<div><strong>${stage.label}</strong><p class="card-note">${stage.copy}</p></div>`,
          "</div>",
        ].join("");
      })
      .join("");
  }

  function renderMemoryMetrics() {
    const metrics = state.compiled
      ? state.compiled.metrics
      : [
          {
            label: "Customers under pressure",
            value: "--",
            copy: "Complaint or escalation signals will show up here.",
          },
          {
            label: "Open money",
            value: "--",
            copy: "Amounts due and overdue invoices become cash reminders.",
          },
          {
            label: "Active playbook rules",
            value: "--",
            copy: "Foundational SOPs and founder notes are compiled into operating rules.",
          },
          {
            label: "Drafts ready",
            value: "--",
            copy: "Reply drafts appear after the brief is compiled.",
          },
        ];

    elements.memoryMetrics.innerHTML = metrics
      .map(
        (metric) => `
          <div class="metric">
            <p class="metric-label">${metric.label}</p>
            <p class="metric-value">${metric.value}</p>
            <p class="metric-copy">${metric.copy}</p>
          </div>
        `,
      )
      .join("");
  }

  function renderSourceList() {
    elements.documentCount.textContent = `${state.documents.length} ${state.documents.length === 1 ? "source" : "sources"}`;

    if (!state.documents.length) {
      elements.sourceList.className = "source-list empty-state";
      elements.sourceList.textContent = "Add a few inputs to compile the first brief.";
      return;
    }

    elements.sourceList.className = "source-list";
    elements.sourceList.innerHTML = state.documents
      .map((documentItem) => {
        const kind = detectDocumentKind(documentItem);
        return `
          <article class="source-item">
            <div class="source-head">
              <div>
                <span class="file-kind">${kind.label}</span>
                <p class="source-name">${documentItem.name}</p>
              </div>
              <span class="status-chip">${documentItem.origin}</span>
            </div>
            <p class="source-preview">${escapeHtml(previewText(documentItem.text, 170))}</p>
          </article>
        `;
      })
      .join("");
  }

  function renderBrief() {
    if (!state.compiled) {
      elements.briefSummary.textContent = "No brief compiled yet.";
      elements.briefGrid.innerHTML = [
        `<article class="brief-card placeholder-card"><h3>Ops</h3><p class="card-note">Compile a few documents to surface open issues, obligations, and recommended next steps.</p></article>`,
        `<article class="brief-card placeholder-card"><h3>Finance</h3><p class="card-note">Overdue invoices and cash reminders land here with exact due dates and amounts.</p></article>`,
        `<article class="brief-card placeholder-card"><h3>Customer comms</h3><p class="card-note">Reply drafts stay grounded in the underlying evidence instead of generic AI copy.</p></article>`,
        `<article class="brief-card placeholder-card"><h3>Risks</h3><p class="card-note">Trust, launch, and cash exposure stay visible with the source facts attached.</p></article>`,
      ].join("");
      return;
    }

    elements.briefSummary.textContent = state.compiled.summary;
    elements.briefGrid.innerHTML = [
      renderBriefCard("Ops", "Work that needs immediate handling.", "ops", state.compiled.cards.ops),
      renderBriefCard("Finance", "Cash obligations and reminder timing.", "finance", state.compiled.cards.finance),
      renderBriefCard("Customer comms", "Drafts that can be sent after a quick review.", "comms", state.compiled.cards.comms),
      renderBriefCard("Risks", "Exposure created by the current state.", "risks", state.compiled.cards.risks),
    ].join("");

    elements.briefGrid.querySelectorAll("[data-focus-id]").forEach((button) => {
      button.addEventListener("click", () => {
        state.activeFocusId = button.getAttribute("data-focus-id");
        renderBrief();
        renderReceipts();
      });
    });
  }

  function renderBriefCard(title, subtitle, tone, items) {
    const countLabel = `${items.length} ${items.length === 1 ? "item" : "items"}`;

    return `
      <article class="brief-card">
        <div class="brief-card-head">
          <div>
            <h3>${title}</h3>
            <p class="card-note">${subtitle}</p>
          </div>
          <span class="badge">${countLabel}</span>
        </div>
        ${items.map((item) => renderBriefItem(item, tone)).join("")}
      </article>
    `;
  }

  function renderBriefItem(item, tone) {
    const isActive = item.id === state.activeFocusId;
    const body = item.body ? `<p class="brief-item-body">${escapeHtml(item.body)}</p>` : "";

    return `
      <button class="brief-item ${tone}${isActive ? " active" : ""}" type="button" data-focus-id="${item.id}">
        <span class="brief-item-title">${item.title}</span>
        <div class="brief-item-meta">
          ${item.meta.map((tag) => `<span class="badge">${tag}</span>`).join("")}
        </div>
        <p class="brief-item-copy">${item.copy}</p>
        ${body}
      </button>
    `;
  }

  function renderReceipts() {
    if (!state.compiled) {
      elements.focusPanel.className = "focus-panel empty-state";
      elements.focusPanel.textContent = "Select a brief item to inspect the exact evidence behind it.";
      elements.filesRead.innerHTML = "";
      elements.factsList.innerHTML = "";
      elements.draftsList.innerHTML = "";
      elements.filesReadCount.textContent = "0";
      elements.factsCount.textContent = "0";
      elements.draftsCount.textContent = "0";
      return;
    }

    const activeFocus = state.compiled.focusMap[state.activeFocusId] || null;
    renderFocusPanel(activeFocus);

    elements.filesReadCount.textContent = String(state.compiled.receipts.files.length);
    elements.factsCount.textContent = String(state.compiled.receipts.facts.length);
    elements.draftsCount.textContent = String(state.compiled.receipts.drafts.length);

    elements.filesRead.innerHTML = state.compiled.receipts.files
      .map((item) => renderReceiptItem(item, activeFocus?.documentIds.includes(item.id)))
      .join("");
    elements.factsList.innerHTML = state.compiled.receipts.facts
      .map((item) => renderReceiptItem(item, activeFocus?.citationIds.includes(item.id)))
      .join("");
    elements.draftsList.innerHTML = state.compiled.receipts.drafts
      .map((item) => renderReceiptItem(item, activeFocus?.draftIds.includes(item.id)))
      .join("");
  }

  function renderFocusPanel(activeFocus) {
    if (!activeFocus) {
      elements.focusPanel.className = "focus-panel empty-state";
      elements.focusPanel.textContent = "Select a brief item to inspect the exact evidence behind it.";
      return;
    }

    elements.focusPanel.className = "focus-panel";
    elements.focusPanel.innerHTML = `
      <p class="section-kicker">Selected recommendation</p>
      <h3 class="focus-title">${activeFocus.title}</h3>
      <p class="focus-copy">${activeFocus.copy}</p>
      <div class="focus-list">
        ${activeFocus.citations
          .map(
            (citation) => `
              <article class="focus-evidence">
                <h4>${citation.title}</h4>
                <p class="badge">${citation.fileName}</p>
                <p class="focus-quote">${escapeHtml(citation.quote)}</p>
              </article>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function renderReceiptItem(item, highlight) {
    return `
      <article class="receipt-item${highlight ? " highlight" : ""}">
        <div class="receipt-item-head">
          <p class="receipt-item-title">${item.title}</p>
          ${item.badge ? `<span class="badge">${item.badge}</span>` : ""}
        </div>
        <div class="receipt-item-meta">
          ${item.meta.map((metaItem) => `<span class="badge">${metaItem}</span>`).join("")}
        </div>
        <p class="receipt-copy">${item.copy}</p>
      </article>
    `;
  }

  function compileBusinessState(documents) {
    const extractedFacts = [];
    const citations = [];
    const filesRead = [];
    const focusMap = {};
    const registerCitation = (documentItem, title, quote, tone) => {
      const citation = {
        id: `citation-${slugify(documentItem.id)}-${citations.length + 1}`,
        documentId: documentItem.id,
        fileName: documentItem.name,
        title,
        quote,
        tone: tone || "accent",
      };
      citations.push(citation);
      return citation;
    };

    const addFact = (title, copy, badge, meta, citationList) => {
      const fact = {
        id: `fact-${extractedFacts.length + 1}`,
        title,
        copy,
        badge,
        meta,
        citationIds: citationList.map((citation) => citation.id),
      };
      extractedFacts.push(fact);
      return fact;
    };

    const emailCases = [];
    const invoices = [];
    const playbook = {
      sameDayUpdate: null,
      supplierEscalation: null,
      reminderCadence: null,
      sensitiveAccount: null,
    };

    documents.forEach((documentItem) => {
      const kind = detectDocumentKind(documentItem);
      filesRead.push({
        id: documentItem.id,
        title: documentItem.name,
        badge: kind.label,
        meta: [documentItem.origin],
        copy: previewText(documentItem.text, 120),
      });

      if (kind.id === "email") {
        const emailCase = extractEmailCase(documentItem, registerCitation);
        if (emailCase) {
          emailCases.push(emailCase);
          addFact(
            `${emailCase.customer} waiting on shipment update`,
            emailCase.issue,
            "Customer",
            [emailCase.severityLabel, emailCase.deadlineLabel],
            emailCase.citations,
          );
        }
      }

      if (kind.id === "invoice") {
        const invoice = extractInvoice(documentItem, registerCitation);
        if (invoice) {
          invoices.push(invoice);
          addFact(
            `Invoice #${invoice.invoiceNumber} is ${invoice.overdueDays} days overdue`,
            `${invoice.customer} owes ${formatCurrency(invoice.amount)}. Due ${formatShortDate(invoice.dueDate)}.`,
            "Finance",
            [invoice.statusLabel, invoice.reminderLabel],
            invoice.citations,
          );
        }
      }

      if (kind.id === "note") {
        const noteFacts = extractPlaybook(documentItem, registerCitation);
        Object.assign(playbook, noteFacts);

        if (noteFacts.sameDayUpdate) {
          addFact(
            "Delay playbook requires a same-day update",
            "Any slip beyond 48 hours should trigger a revised ETA and partial ship option.",
            "Rule",
            ["Ops rule"],
            [noteFacts.sameDayUpdate, noteFacts.sameDayUpdateEta],
          );
        }

        if (noteFacts.reminderCadence) {
          addFact(
            "Collections playbook defines reminder timing",
            "First reminder at 7 overdue days, second reminder at 14 overdue days.",
            "Rule",
            ["Collections rule"],
            [noteFacts.reminderCadence],
          );
        }
      }
    });

    const primaryCustomerCase = emailCases[0];
    const primaryInvoice = invoices.sort((left, right) => right.overdueDays - left.overdueDays)[0];
    const draftItems = [];
    const cards = {
      ops: [],
      finance: [],
      comms: [],
      risks: [],
    };

    if (primaryCustomerCase) {
      const focusId = `focus-ops-${primaryCustomerCase.customerSlug}`;
      const citationList = [
        ...primaryCustomerCase.citations,
        playbook.sameDayUpdate,
        playbook.sameDayUpdateEta,
        playbook.supplierEscalation,
        playbook.sensitiveAccount,
      ].filter(Boolean);

      cards.ops.push({
        id: focusId,
        title: `${primaryCustomerCase.customer} is waiting on a shipment update`,
        meta: ["Urgent", "Reply today"],
        copy: `${primaryCustomerCase.contactName} needs a realistic ETA before the Friday launch window tightens further.`,
      });

      focusMap[focusId] = buildFocus(
        focusId,
        `${primaryCustomerCase.customer} shipment update`,
        `${primaryCustomerCase.customer} was promised a shipment last Thursday and asked for a realistic ETA today.`,
        citationList,
        [],
        [primaryCustomerCase.documentId],
      );

      if (playbook.supplierEscalation) {
        const supplierFocusId = "focus-ops-supplier";
        cards.ops.push({
          id: supplierFocusId,
          title: "Call Northline supplier before 11:00",
          meta: ["Ops", "Supplier"],
          copy: "The founder note says delays on the Tuesday truck should escalate before 11:00.",
        });

        focusMap[supplierFocusId] = buildFocus(
          supplierFocusId,
          "Supplier escalation",
          "The shipment is already late and the founder note defines a time-sensitive supplier call.",
          [playbook.supplierEscalation, ...primaryCustomerCase.citations].filter(Boolean),
          [],
          [playbook.supplierEscalation.documentId, primaryCustomerCase.documentId],
        );
      }

      const customerDraft = buildCustomerReply(primaryCustomerCase);
      const customerDraftId = "draft-customer-reply";
      draftItems.push({
        id: customerDraftId,
        title: `Reply draft for ${primaryCustomerCase.contactName}`,
        badge: "Reply",
        meta: ["Customer comms"],
        copy: "Grounded in the complaint email and the delay playbook.",
      });

      const customerFocusId = "focus-comms-customer";
      cards.comms.push({
        id: customerFocusId,
        title: `Draft shipment reply to ${primaryCustomerCase.customer}`,
        meta: ["Draft ready", "Review then send"],
        copy: "A direct update with revised timing and a partial-ship option.",
        body: customerDraft,
      });

      focusMap[customerFocusId] = buildFocus(
        customerFocusId,
        `Draft reply to ${primaryCustomerCase.contactName}`,
        "This draft uses the live complaint, the launch date pressure, and the founder note on how to handle sensitive accounts.",
        [
          ...primaryCustomerCase.citations,
          playbook.sameDayUpdate,
          playbook.sameDayUpdateEta,
          playbook.sensitiveAccount,
        ].filter(Boolean),
        [customerDraftId],
        [primaryCustomerCase.documentId, playbook.sameDayUpdate?.documentId].filter(Boolean),
      );
    }

    if (primaryInvoice) {
      const financeFocusId = "focus-finance-overdue";
      cards.finance.push({
        id: financeFocusId,
        title: `Invoice #${primaryInvoice.invoiceNumber} overdue by ${primaryInvoice.overdueDays} days`,
        meta: [formatCurrency(primaryInvoice.amount), primaryInvoice.customer],
        copy: `No reminder has been sent yet, even though the playbook calls for a first reminder after 7 overdue days.`,
      });

      focusMap[financeFocusId] = buildFocus(
        financeFocusId,
        `Overdue invoice #${primaryInvoice.invoiceNumber}`,
        `${primaryInvoice.customer} owes ${formatCurrency(primaryInvoice.amount)} and the invoice is already ${primaryInvoice.overdueDays} days overdue.`,
        [...primaryInvoice.citations, playbook.reminderCadence].filter(Boolean),
        [],
        [primaryInvoice.documentId, playbook.reminderCadence?.documentId].filter(Boolean),
      );

      const reminderDraft = buildPaymentReminder(primaryInvoice);
      const reminderDraftId = "draft-payment-reminder";
      draftItems.push({
        id: reminderDraftId,
        title: `Payment reminder for ${primaryInvoice.customer}`,
        badge: "Reminder",
        meta: ["Finance comms"],
        copy: `References invoice #${primaryInvoice.invoiceNumber} and the original due date.`,
      });

      const reminderFocusId = "focus-comms-reminder";
      cards.comms.push({
        id: reminderFocusId,
        title: `Draft payment reminder for ${primaryInvoice.customer}`,
        meta: ["Cash follow-up", "Review then send"],
        copy: `Prompt on timing, exact amount, and due date without sounding hostile.`,
        body: reminderDraft,
      });

      focusMap[reminderFocusId] = buildFocus(
        reminderFocusId,
        `Draft reminder for ${primaryInvoice.customer}`,
        "The draft uses the unpaid invoice, overdue duration, and reminder cadence from the founder note.",
        [...primaryInvoice.citations, playbook.reminderCadence].filter(Boolean),
        [reminderDraftId],
        [primaryInvoice.documentId, playbook.reminderCadence?.documentId].filter(Boolean),
      );
    }

    if (primaryCustomerCase) {
      const launchRiskId = "focus-risk-launch";
      cards.risks.push({
        id: launchRiskId,
        title: "Friday launch timing is exposed",
        meta: ["Customer trust", "Launch risk"],
        copy: "The store launch is imminent and the customer explicitly asked for a realistic ETA today.",
      });

      focusMap[launchRiskId] = buildFocus(
        launchRiskId,
        "Launch timing risk",
        "The customer is planning around a Friday store launch and the shipment already slipped last Thursday.",
        primaryCustomerCase.citations,
        [],
        [primaryCustomerCase.documentId],
      );

      if (playbook.sensitiveAccount) {
        const trustRiskId = "focus-risk-trust";
        cards.risks.push({
          id: trustRiskId,
          title: `${primaryCustomerCase.customer} account has low trust tolerance`,
          meta: ["Relationship", "Sensitive account"],
          copy: "The founder note says to be direct and specific because the account is still sensitive after a prior mistake.",
        });

        focusMap[trustRiskId] = buildFocus(
          trustRiskId,
          "Customer trust risk",
          `${primaryCustomerCase.customer} is already marked as a sensitive account, so vague language will make the delay worse.`,
          [playbook.sensitiveAccount, ...primaryCustomerCase.citations].filter(Boolean),
          [],
          [playbook.sensitiveAccount.documentId, primaryCustomerCase.documentId],
        );
      }
    }

    if (primaryInvoice) {
      const cashRiskId = "focus-risk-cash";
      cards.risks.push({
        id: cashRiskId,
        title: `${formatCurrency(primaryInvoice.amount)} is aging in receivables`,
        meta: ["Cash risk", `${primaryInvoice.overdueDays} days overdue`],
        copy: "The invoice is outside the 7-day reminder window and is close to the second reminder threshold.",
      });

      focusMap[cashRiskId] = buildFocus(
        cashRiskId,
        "Cash exposure",
        `${primaryInvoice.customer}'s invoice is already ${primaryInvoice.overdueDays} days overdue, so collection delay is turning into cash risk.`,
        [...primaryInvoice.citations, playbook.reminderCadence].filter(Boolean),
        [],
        [primaryInvoice.documentId, playbook.reminderCadence?.documentId].filter(Boolean),
      );
    }

    const metrics = [
      {
        label: "Customers under pressure",
        value: String(emailCases.length),
        copy: emailCases.length
          ? `${emailCases[0].customer} needs a direct update today.`
          : "No complaint signals extracted.",
      },
      {
        label: "Open money",
        value: primaryInvoice ? formatCurrency(primaryInvoice.amount) : "$0",
        copy: primaryInvoice
          ? `Primary overdue item is invoice #${primaryInvoice.invoiceNumber}.`
          : "No overdue invoices extracted.",
      },
      {
        label: "Active playbook rules",
        value: String(Object.values(playbook).filter(Boolean).length),
        copy: "Rules are being used to justify next steps and draft style.",
      },
      {
        label: "Drafts ready",
        value: String(draftItems.length),
        copy: draftItems.length
          ? "Reply drafts are ready for review."
          : "No drafts created from the current evidence.",
      },
    ];

    const defaultFocusId =
      cards.ops[0]?.id || cards.finance[0]?.id || cards.comms[0]?.id || cards.risks[0]?.id || null;

    return {
      summary: buildSummary(emailCases, primaryInvoice, draftItems),
      metrics,
      cards,
      defaultFocusId,
      focusMap,
      receipts: {
        files: filesRead,
        facts: extractedFacts.map((fact) => ({
          id: fact.id,
          title: fact.title,
          badge: fact.badge,
          meta: fact.meta,
          copy: fact.copy,
        })),
        drafts: draftItems,
      },
    };
  }

  function buildFocus(id, title, copy, citations, draftIds, documentIds) {
    return {
      id,
      title,
      copy,
      citations,
      citationIds: citations.map((citation) => citation.id),
      draftIds,
      documentIds: Array.from(new Set(documentIds.filter(Boolean))),
    };
  }

  function extractEmailCase(documentItem, registerCitation) {
    const normalizedText = documentItem.text.toLowerCase();
    if (!normalizedText.includes("shipment") && !normalizedText.includes("delivery")) {
      return null;
    }

    const customer = matchOrFallback(documentItem.text, /ACME Retail/i, "ACME Retail");
    const contactName = matchOrFallback(documentItem.text, /Maya Patel/i, "Customer");
    const issueLine = lineFor(documentItem.text, "delivery update") || lineFor(documentItem.text, "shipment would leave");
    const launchLine = lineFor(documentItem.text, "store launch is on Friday");
    const partialLine = lineFor(documentItem.text, "partial delivery is possible");

    const issueCitation = registerCitation(
      documentItem,
      "Customer is missing a shipment update",
      issueLine || "The customer says they still do not have a delivery update.",
      "risk",
    );
    const launchCitation = registerCitation(
      documentItem,
      "Friday launch date is at risk",
      launchLine || "The customer says their store launch is on Friday.",
      "warning",
    );
    const partialCitation = registerCitation(
      documentItem,
      "Customer asked for a partial delivery option",
      partialLine || "The customer asks whether a partial delivery is possible.",
      "accent",
    );

    return {
      documentId: documentItem.id,
      customer,
      customerSlug: slugify(customer),
      contactName,
      issue: "Shipment was promised last Thursday and the customer needs a realistic ETA today.",
      severityLabel: "High urgency",
      deadlineLabel: "Today",
      citations: [issueCitation, launchCitation, partialCitation],
    };
  }

  function extractInvoice(documentItem, registerCitation) {
    const invoiceNumber = capture(documentItem.text, /Invoice\s*#(\d+)/i);
    const customer = capture(documentItem.text, /Customer:\s*(.+)/i);
    const dueDateText = capture(documentItem.text, /Due Date:\s*(\d{4}-\d{2}-\d{2})/i);
    const amountText = capture(documentItem.text, /Amount Due:\s*\$([\d,]+(?:\.\d{2})?)/i);
    if (!invoiceNumber || !customer || !dueDateText || !amountText) {
      return null;
    }

    const dueDate = new Date(`${dueDateText}T09:00:00+08:00`);
    const overdueDays = Math.max(0, dayDiff(dueDate, referenceDate));
    const amount = Number(amountText.replace(/,/g, ""));
    const dueCitation = registerCitation(
      documentItem,
      `Invoice #${invoiceNumber} due date`,
      lineFor(documentItem.text, "Due Date") || `Due Date: ${dueDateText}`,
      "warning",
    );
    const amountCitation = registerCitation(
      documentItem,
      `Invoice #${invoiceNumber} amount due`,
      lineFor(documentItem.text, "Amount Due") || `Amount Due: $${amountText}`,
      "accent",
    );
    const reminderCitation = registerCitation(
      documentItem,
      `Reminder status for invoice #${invoiceNumber}`,
      lineFor(documentItem.text, "Reminder not yet sent") || "Notes: Reminder not yet sent.",
      "risk",
    );

    return {
      documentId: documentItem.id,
      invoiceNumber,
      customer,
      dueDate,
      overdueDays,
      amount,
      statusLabel: "Unpaid",
      reminderLabel: "Reminder not sent",
      citations: [dueCitation, amountCitation, reminderCitation],
    };
  }

  function extractPlaybook(documentItem, registerCitation) {
    const sameDayLine = lineFor(documentItem.text, "slips by more than 48 hours");
    const etaLine = lineFor(documentItem.text, "revised ETA");
    const supplierLine = lineFor(documentItem.text, "Call Northline supplier");
    const reminderLine = lineFor(documentItem.text, "Payment reminder cadence");
    const sensitiveLine = lineFor(documentItem.text, "ACME account is sensitive");

    return {
      sameDayUpdate: sameDayLine
        ? registerCitation(documentItem, "Delay rule", sameDayLine, "warning")
        : null,
      sameDayUpdateEta: etaLine
        ? registerCitation(documentItem, "ETA rule", etaLine, "accent")
        : null,
      supplierEscalation: supplierLine
        ? registerCitation(documentItem, "Supplier escalation rule", supplierLine, "warning")
        : null,
      reminderCadence: reminderLine
        ? registerCitation(documentItem, "Reminder cadence", reminderLine, "accent")
        : null,
      sensitiveAccount: sensitiveLine
        ? registerCitation(documentItem, "Sensitive account note", sensitiveLine, "risk")
        : null,
    };
  }

  function buildCustomerReply(customerCase) {
    return [
      `Hi ${customerCase.contactName.split(" ")[0]},`,
      "",
      "Thanks for flagging this. You are right to ask for a direct update.",
      "The shipment did not leave on the original Thursday timing, and I am confirming the revised dispatch timing with the supplier this morning.",
      "I will send you a firm ETA today. If the full order cannot move together, I will also confirm whether we can release a partial shipment so your Friday launch is protected.",
      "",
      "Best,",
      "Operations",
    ].join("\n");
  }

  function buildPaymentReminder(invoice) {
    return [
      `Hi ${invoice.customer},`,
      "",
      `A quick reminder that invoice #${invoice.invoiceNumber} for ${formatCurrency(invoice.amount)} was due on ${formatShortDate(invoice.dueDate)} and is now ${invoice.overdueDays} days overdue.`,
      "Please let us know the payment date, or reply if anything is blocking processing on your side.",
      "",
      "Thank you,",
      "Accounts",
    ].join("\n");
  }

  function buildSummary(emailCases, invoice, drafts) {
    const parts = [];
    if (emailCases.length) {
      parts.push(`${emailCases[0].customer} needs a shipment update today`);
    }
    if (invoice) {
      parts.push(`invoice #${invoice.invoiceNumber} is ${invoice.overdueDays} days overdue`);
    }
    if (drafts.length) {
      parts.push(`${drafts.length} draft${drafts.length === 1 ? "" : "s"} ready for review`);
    }
    return parts.join(" | ");
  }

  function detectDocumentKind(documentItem) {
    const normalized = `${documentItem.name}\n${documentItem.text}`.toLowerCase();
    if (normalized.includes("invoice")) {
      return { id: "invoice", label: "Invoice" };
    }
    if (normalized.includes("subject:") || normalized.includes("from:") || normalized.includes("re:")) {
      return { id: "email", label: "Email" };
    }
    if (normalized.includes("note") || normalized.includes("sop") || normalized.includes("playbook")) {
      return { id: "note", label: "Note" };
    }
    return { id: "doc", label: "Doc" };
  }

  function dedupeDocuments(documents) {
    const seen = new Set();
    return documents.filter((documentItem) => {
      const key = `${documentItem.name}::${documentItem.text}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function previewText(text, length) {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized.length <= length) {
      return normalized;
    }
    return `${normalized.slice(0, length).trim()}...`;
  }

  function capture(text, expression) {
    const match = text.match(expression);
    return match ? match[1].trim() : "";
  }

  function lineFor(text, phrase) {
    return text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.toLowerCase().includes(phrase.toLowerCase()));
  }

  function matchOrFallback(text, expression, fallback) {
    const match = text.match(expression);
    return match ? match[0].trim() : fallback;
  }

  function formatLongDate(date) {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date);
  }

  function formatShortDate(date) {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }

  function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function slugify(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function dayDiff(start, end) {
    const startTime = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    const endTime = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
    return Math.round((endTime - startTime) / 86400000);
  }

  function escapeHtml(value) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  init();
})();
