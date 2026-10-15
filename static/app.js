/**
 * CPPR Equity Budgeting Workshop - Interactive Worksheets Application
 */

let appData = null;
let currentSector = null;
let currentResponses = {
  table_number: "",
  answers: {}
};
let saveTimeout = null;
let customDriveFolder = localStorage.getItem("cppr_drive_folder") || "";

// Initialize App
document.addEventListener("DOMContentLoaded", async () => {
  try {
    let res;
    try {
      res = await fetch("api/data");
      if (!res.ok) throw new Error("API not ok");
    } catch (e) {
      res = await fetch("data.json");
    }
    appData = await res.json();
    checkUrlOrStorageLogin();
  } catch (err) {
    console.error("Failed to load workshop data:", err);
    showToast("Error loading workshop data. Retrying...", true);
  }
});

function checkUrlOrStorageLogin() {
  const urlParams = new URLSearchParams(window.location.search);
  const paramSector = urlParams.get("sector") || window.location.hash.replace("#", "");

  if (paramSector) {
    const norm = normalizeSectorCode(paramSector);
    if (norm === "admin") {
      openAdmin();
      return;
    } else if (norm && appData.sectors[norm]) {
      openSector(norm);
      return;
    }
  }

  // Check saved session
  const savedSector = sessionStorage.getItem("cppr_active_sector");
  if (savedSector && appData.sectors[savedSector]) {
    openSector(savedSector);
  } else {
    showLoginView();
  }
}

function normalizeSectorCode(raw) {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  if (s === "health" || s === "1" || s === "team 1" || s === "h") return "health";
  if (s === "local" || s === "local government" || s === "lg" || s === "2" || s === "team 2" || s === "l") return "local";
  if (s === "education" || s === "edu" || s === "3" || s === "team 3" || s === "e") return "education";
  if (s === "finance" || s === "planning" || s === "pfm" || s === "4" || s === "team 4" || s === "f") return "finance";
  if (s === "admin" || s === "facilitator" || s === "monitor") return "admin";
  return null;
}

// Login Handler
function handleLoginSubmit(e) {
  if (e) e.preventDefault();
  const inputEl = document.getElementById("sector-input");
  const norm = normalizeSectorCode(inputEl.value);

  if (norm === "admin") {
    openAdmin();
  } else if (norm && appData.sectors[norm]) {
    openSector(norm);
  } else {
    showToast("Invalid code. Please enter 'health', 'finance', 'education', or 'local'.", true);
    inputEl.style.borderColor = "#ef4444";
    setTimeout(() => {
      inputEl.style.borderColor = "";
    }, 1500);
  }
}

function quickSelectSector(secCode) {
  if (secCode === "admin") {
    openAdmin();
  } else {
    openSector(secCode);
  }
}

function showLoginView() {
  document.getElementById("login-view").style.display = "flex";
  document.getElementById("worksheet-view").style.display = "none";
  document.getElementById("admin-view").style.display = "none";
  const inputEl = document.getElementById("sector-input");
  inputEl.value = "";
  setTimeout(() => inputEl.focus(), 100);
}

function logoutSector() {
  sessionStorage.removeItem("cppr_active_sector");
  window.history.pushState({}, "", window.location.pathname);
  showLoginView();
}

// Open Specific Sector Worksheet
async function openSector(secKey) {
  currentSector = secKey;
  sessionStorage.setItem("cppr_active_sector", secKey);
  window.location.hash = secKey;

  const secInfo = appData.sectors[secKey];
  document.title = `${secInfo.display_title} — CPPR Equity Budgeting Workshop`;

  document.getElementById("login-view").style.display = "none";
  document.getElementById("admin-view").style.display = "none";
  document.getElementById("worksheet-view").style.display = "flex";

  // Update Header Banner
  document.getElementById("top-sector-name").textContent = secInfo.display_title;
  document.getElementById("banner-team-name").textContent = secInfo.display_title;
  document.getElementById("banner-scope").textContent = secInfo.scope;

  // Load responses from LocalStorage first, then server
  loadLocalResponses(secKey);
  await fetchServerResponses(secKey);

  document.getElementById("table-num").value = currentResponses.table_number || "";

  // Render sub-components
  renderQuickJumpBar(secInfo.cards);
  renderCards(secInfo);
  renderCatalog(secInfo.catalog);
  renderWorkflow(secInfo.workflow);
  renderRubric(secInfo.rubric);

  updateProgress();
  switchTab("cards");
}

function loadLocalResponses(secKey) {
  const localStr = localStorage.getItem(`cppr_responses_${secKey}`);
  if (localStr) {
    try {
      currentResponses = JSON.parse(localStr);
    } catch (e) {
      currentResponses = { table_number: "", answers: {} };
    }
  } else {
    currentResponses = { table_number: "", answers: {} };
  }
}

async function fetchServerResponses(secKey) {
  try {
    const res = await fetch(`/api/submissions/${secKey}`);
    if (res.ok) {
      const serverData = await res.json();
      if (serverData && serverData.answers && Object.keys(serverData.answers).length > 0) {
        // Merge server responses with local responses
        currentResponses.table_number = serverData.table_number || currentResponses.table_number || "";
        currentResponses.answers = { ...serverData.answers, ...currentResponses.answers };
      }
    }
  } catch (err) {
    console.warn("Could not sync with server, using local data:", err);
  }
}

// Render Indicator Quick Jump Bar
function renderQuickJumpBar(cards) {
  const container = document.getElementById("quick-jump-container");
  container.innerHTML = "";

  cards.forEach((card, idx) => {
    const btn = document.createElement("button");
    btn.className = "jump-pill";
    btn.id = `jump-pill-${card.id}`;
    btn.innerHTML = `<span>${card.id}</span>`;
    btn.onclick = () => {
      document.querySelectorAll(".jump-pill").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      const targetCard = document.getElementById(`card-${card.id}`);
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    container.appendChild(btn);
  });
}

// Render 14 Indicator Cards
function renderCards(secInfo) {
  const container = document.getElementById("cards-container");
  container.innerHTML = "";

  const assignedPdfOptions = secInfo.catalog.map(f => `<option value="${escapeHtml(f.filename)}">${escapeHtml(f.filename)}</option>`).join("");

  secInfo.cards.forEach((card, idx) => {
    const cid = card.id;
    const ans = currentResponses.answers[cid] || {
      pdf_searched: "",
      book_page: "",
      pdf_page: "",
      page_ref: "",
      evidence: "",
      dimensions: [],
      status: "",
      rationale: ""
    };

    const isComplete = Boolean(ans.status && ans.evidence.trim());

    const cardDiv = document.createElement("div");
    cardDiv.className = "indicator-card";
    cardDiv.id = `card-${cid}`;

    cardDiv.innerHTML = `
      <div class="card-header">
        <div class="card-header-title">INDICATOR ${cid}: ${escapeHtml(card.stage.toUpperCase())}</div>
        <span class="card-header-badge ${isComplete ? 'done' : ''}" id="badge-${cid}">${isComplete ? '✓ Completed' : 'Incomplete'}</span>
      </div>

      <div class="card-question-box">
        <div class="question-label">Framework Indicator Question</div>
        <div class="question-text">${escapeHtml(card.question)}</div>
        <div class="sources-box">
          <span class="sources-label">Prescribed Source Documents:</span>
          <span>${escapeHtml(card.prescribed_sources)}</span>
        </div>
      </div>

      <div class="card-body">
        <!-- Row 1: PDF Searched & Page References -->
        <div class="grid-2col">
          <div class="form-group">
            <label class="form-label" for="pdf-${cid}">Assigned PDF Searched</label>
            <select class="form-select" id="pdf-${cid}" onchange="handleInputChange('${cid}', 'pdf_searched', this.value)">
              <option value="">-- Select assigned PDF file --</option>
              ${assignedPdfOptions}
              <option value="Other / External PDF">Other / External PDF</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Page Reference (Dual Citation)</label>
            <div class="dual-page-group">
              <input 
                type="text" 
                class="form-input" 
                id="bpage-${cid}" 
                placeholder="Printed Page (e.g. 27)" 
                value="${escapeHtml(ans.book_page || '')}" 
                oninput="handlePageChange('${cid}')"
              >
              <input 
                type="text" 
                class="form-input" 
                id="ppage-${cid}" 
                placeholder="PDF Index Page (e.g. 31)" 
                value="${escapeHtml(ans.pdf_page || '')}" 
                oninput="handlePageChange('${cid}')"
              >
            </div>
            <span style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;" id="preview-page-${cid}">
              ${ans.page_ref ? `Citation: <strong>${escapeHtml(ans.page_ref)}</strong>` : ''}
            </span>
          </div>
        </div>

        <!-- Row 2: Exact Textual Evidence -->
        <div class="form-group">
          <label class="form-label" for="ev-${cid}">Exact Textual Evidence & Monetary Figures (Verbatim quote from PDF)</label>
          <textarea 
            class="form-textarea" 
            id="ev-${cid}" 
            placeholder="Transcribe verbatim sentence or budget table row, including PKR figures in Millions/Billions..." 
            oninput="handleInputChange('${cid}', 'evidence', this.value)"
          >${escapeHtml(ans.evidence || '')}</textarea>
        </div>

        <!-- Row 3: Disaggregated Dimensions -->
        <div class="form-group">
          <label class="form-label">Disaggregated Dimensions (Tick all that apply)</label>
          <div class="dimensions-grid">
            ${card.dimensions_available.map(dim => {
              const isChecked = (ans.dimensions || []).includes(dim);
              return `
                <label class="dim-chip ${isChecked ? 'checked' : ''}" id="chip-${cid}-${sanitizeId(dim)}">
                  <input 
                    type="checkbox" 
                    value="${escapeHtml(dim)}" 
                    ${isChecked ? 'checked' : ''} 
                    onchange="handleDimensionChange('${cid}', '${escapeHtml(dim)}', this.checked)"
                  >
                  <span>${escapeHtml(dim)}</span>
                </label>
              `;
            }).join("")}
          </div>
        </div>

        <!-- Row 4: Overall Status Assessment -->
        <div class="form-group">
          <label class="form-label">Overall Status Assessment</label>
          <div class="status-radios">
            <label class="status-option yes ${ans.status === 'YES' ? 'selected' : ''}" id="st-opt-${cid}-YES">
              <input type="radio" name="status-${cid}" value="YES" ${ans.status === 'YES' ? 'checked' : ''} onchange="handleStatusChange('${cid}', 'YES')">
              <span>✓ YES — Explicitly institutionalized</span>
            </label>
            <label class="status-option no ${ans.status === 'NO' ? 'selected' : ''}" id="st-opt-${cid}-NO">
              <input type="radio" name="status-${cid}" value="NO" ${ans.status === 'NO' ? 'checked' : ''} onchange="handleStatusChange('${cid}', 'NO')">
              <span>✕ NO — No empirical evidence found</span>
            </label>
            <label class="status-option partial ${ans.status === 'PARTIAL' ? 'selected' : ''}" id="st-opt-${cid}-PARTIAL">
              <input type="radio" name="status-${cid}" value="PARTIAL" ${ans.status === 'PARTIAL' ? 'checked' : ''} onchange="handleStatusChange('${cid}', 'PARTIAL')">
              <span>⚠ PARTIAL — Ad-hoc / marginal mention</span>
            </label>
          </div>
        </div>

        <!-- Row 5: Team Analytical Rationale -->
        <div class="form-group">
          <label class="form-label" for="rat-${cid}">Team Findings & Analytical Rationale</label>
          <textarea 
            class="form-textarea" 
            id="rat-${cid}" 
            placeholder="Write your team's analytical synthesis and justification for the assigned status..." 
            oninput="handleInputChange('${cid}', 'rationale', this.value)"
          >${escapeHtml(ans.rationale || '')}</textarea>
        </div>
      </div>
    `;

    container.appendChild(cardDiv);

    // Set selected value in dropdown
    if (ans.pdf_searched) {
      const selectEl = cardDiv.querySelector(`#pdf-${cid}`);
      if (selectEl) selectEl.value = ans.pdf_searched;
    }
  });
}

// Input Change Handlers
function handleTableNumChange() {
  const val = document.getElementById("table-num").value;
  currentResponses.table_number = val;
  triggerAutoSave();
}

function handleInputChange(cid, field, value) {
  if (!currentResponses.answers[cid]) {
    currentResponses.answers[cid] = {
      pdf_searched: "",
      book_page: "",
      pdf_page: "",
      page_ref: "",
      evidence: "",
      dimensions: [],
      status: "",
      rationale: ""
    };
  }
  currentResponses.answers[cid][field] = value;
  checkCardCompletion(cid);
  triggerAutoSave();
}

function handlePageChange(cid) {
  const bpage = document.getElementById(`bpage-${cid}`).value.trim();
  const ppage = document.getElementById(`ppage-${cid}`).value.trim();

  let formatted = "";
  if (bpage && ppage) {
    formatted = `Doc p. ${bpage} / PDF p. ${ppage}`;
  } else if (bpage) {
    formatted = `Doc p. ${bpage}`;
  } else if (ppage) {
    formatted = `PDF p. ${ppage}`;
  }

  if (!currentResponses.answers[cid]) currentResponses.answers[cid] = {};
  currentResponses.answers[cid].book_page = bpage;
  currentResponses.answers[cid].pdf_page = ppage;
  currentResponses.answers[cid].page_ref = formatted;

  const prevEl = document.getElementById(`preview-page-${cid}`);
  if (prevEl) {
    prevEl.innerHTML = formatted ? `Citation: <strong>${escapeHtml(formatted)}</strong>` : "";
  }

  checkCardCompletion(cid);
  triggerAutoSave();
}

function handleDimensionChange(cid, dim, isChecked) {
  if (!currentResponses.answers[cid]) currentResponses.answers[cid] = {};
  if (!Array.isArray(currentResponses.answers[cid].dimensions)) {
    currentResponses.answers[cid].dimensions = [];
  }

  if (isChecked) {
    if (!currentResponses.answers[cid].dimensions.includes(dim)) {
      currentResponses.answers[cid].dimensions.push(dim);
    }
  } else {
    currentResponses.answers[cid].dimensions = currentResponses.answers[cid].dimensions.filter(d => d !== dim);
  }

  const chipEl = document.getElementById(`chip-${cid}-${sanitizeId(dim)}`);
  if (chipEl) {
    if (isChecked) chipEl.classList.add("checked");
    else chipEl.classList.remove("checked");
  }

  checkCardCompletion(cid);
  triggerAutoSave();
}

function handleStatusChange(cid, status) {
  if (!currentResponses.answers[cid]) currentResponses.answers[cid] = {};
  currentResponses.answers[cid].status = status;

  ["YES", "NO", "PARTIAL"].forEach(st => {
    const optEl = document.getElementById(`st-opt-${cid}-${st}`);
    if (optEl) {
      if (st === status) optEl.classList.add("selected");
      else optEl.classList.remove("selected");
    }
  });

  checkCardCompletion(cid);
  triggerAutoSave();
}

function checkCardCompletion(cid) {
  const ans = currentResponses.answers[cid];
  if (!ans) return;

  const isDone = Boolean(ans.status && ans.evidence && ans.evidence.trim().length > 0);
  const badgeEl = document.getElementById(`badge-${cid}`);
  const pillEl = document.getElementById(`jump-pill-${cid}`);

  if (badgeEl) {
    badgeEl.textContent = isDone ? "✓ Completed" : "Incomplete";
    if (isDone) badgeEl.classList.add("done");
    else badgeEl.classList.remove("done");
  }

  if (pillEl) {
    if (isDone) pillEl.classList.add("completed");
    else pillEl.classList.remove("completed");
  }

  updateProgress();
}

function updateProgress() {
  if (!appData || !currentSector) return;
  const cards = appData.sectors[currentSector].cards;
  let doneCount = 0;

  cards.forEach(c => {
    const a = currentResponses.answers[c.id];
    if (a && a.status && a.evidence && a.evidence.trim().length > 0) {
      doneCount++;
    }
  });

  const pct = Math.round((doneCount / cards.length) * 100);
  document.getElementById("progress-bar").style.width = `${pct}%`;
  document.getElementById("progress-text").textContent = `${doneCount} / ${cards.length} Completed (${pct}%)`;
  document.getElementById("footer-summary-text").textContent = `${doneCount} / ${cards.length} Completed`;
}

// AutoSave Mechanism
function triggerAutoSave() {
  setSyncStatus("Saving...", "#f59e0b");
  localStorage.setItem(`cppr_responses_${currentSector}`, JSON.stringify(currentResponses));

  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    await submitResponses(false);
  }, 1500);
}

async function submitResponses(isExplicitSubmit) {
  if (!currentSector) return;

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // 1. Always save locally
  localStorage.setItem(`cppr_responses_${currentSector}`, JSON.stringify(currentResponses));

  // 2. Real-time Cloud Push to ntfy.sh so facilitator receives instant alerts anywhere
  try {
    const answeredCount = Object.keys(currentResponses.answers || {}).length;
    fetch("https://ntfy.sh/cppr_workshop_affan_submissions", {
      method: "POST",
      headers: {
        "Title": `CPPR Workshop Submission: ${currentSector.toUpperCase()}`,
        "Priority": isExplicitSubmit ? "high" : "default",
        "Tags": isExplicitSubmit ? "white_check_mark,clipboard" : "pencil2",
        "X-Sector": currentSector
      },
      body: JSON.stringify({
        sector: currentSector,
        table_number: currentResponses.table_number || `Table - ${currentSector}`,
        completed_count: answeredCount,
        last_saved: timeStr,
        answers: currentResponses.answers
      })
    }).catch(e => console.log("Cloud sync note:", e));
  } catch (e) {}

  // 3. Post to server endpoint if running
  try {
    const res = await fetch(`api/submissions/${currentSector}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentResponses)
    });

    if (res.ok) {
      setSyncStatus("All Changes Saved & Synced", "#10b981");
      document.getElementById("footer-save-time").textContent = `Last saved: ${timeStr}`;
      if (isExplicitSubmit) {
        showToast("🎉 Worksheet successfully submitted to facilitator!", false);
      }
      return;
    }
  } catch (err) {
    // Backend offline / static mode
  }

  setSyncStatus("Saved & Cloud Synced", "#10b981");
  document.getElementById("footer-save-time").textContent = `Cloud saved: ${timeStr}`;
  if (isExplicitSubmit) {
    showToast("🎉 Worksheet saved & submitted to facilitator!", false);
  }
}

function setSyncStatus(text, color) {
  const syncBadge = document.getElementById("sync-status");
  const syncText = document.getElementById("sync-text");
  if (syncBadge && syncText) {
    syncText.textContent = text;
    syncBadge.style.color = color;
  }
}

// Export Download Handler (Dual Mode: Server API or Client-Side)
async function exportResponses(fmt) {
  if (!currentSector) return;
  await submitResponses(false);

  if (fmt === "xlsx") {
    try {
      const res = await fetch(`api/export/${currentSector}/xlsx`, { method: "HEAD" });
      if (res.ok) {
        window.location.href = `api/export/${currentSector}/xlsx`;
        return;
      }
    } catch(e) {}
    generateClientExcel(currentSector);
  } else if (fmt === "docx" || fmt === "doc") {
    try {
      const res = await fetch(`api/export/${currentSector}/docx`, { method: "HEAD" });
      if (res.ok) {
        window.location.href = `api/export/${currentSector}/docx`;
        return;
      }
    } catch(e) {}
    generateClientWord(currentSector);
  }
}

function generateClientExcel(sector) {
  if (typeof XLSX === "undefined") {
    showToast("Excel generator loading, please wait 2 seconds...", true);
    return;
  }
  const secData = appData.sectors[sector];
  const rows = [
    ["CPPR EQUITY BUDGETING WORKSHOP - COMPLETED PARTICIPANT WORKSHEET"],
    ["Department / Sector:", secData.display_title],
    ["Table / Team Identifier:", currentResponses.table_number || "Unassigned"],
    ["Timestamp:", new Date().toLocaleString()],
    [],
    [
      "Card #",
      "Indicator ID",
      "Budget Stage",
      "Framework Indicator Question",
      "Assigned PDF Searched",
      "Dual Page Reference",
      "Transcribed Verbatim Evidence & Amounts",
      "Gender",
      "Age",
      "Ethnicity/Merged",
      "Religion",
      "Disability",
      "Culture",
      "Status Assessment",
      "Analytical Rationale / Policy Implication"
    ]
  ];

  secData.cards.forEach((card, idx) => {
    const ans = currentResponses.answers[card.id] || {};
    const dims = ans.dimensions || [];
    rows.push([
      idx + 1,
      card.id,
      card.stage,
      card.question,
      ans.pdf_searched || "",
      ans.page_ref || (ans.book_page ? `Doc p. ${ans.book_page} / PDF p. ${ans.pdf_page || ''}` : ""),
      ans.evidence || "",
      dims.some(d => d.includes("Gender")) ? "YES" : "NO",
      dims.some(d => d.includes("Age")) ? "YES" : "NO",
      dims.some(d => d.includes("Ethnicity")) ? "YES" : "NO",
      dims.some(d => d.includes("Religion")) ? "YES" : "NO",
      dims.some(d => d.includes("Disability")) ? "YES" : "NO",
      dims.some(d => d.includes("Culture")) ? "YES" : "NO",
      ans.status || "",
      ans.rationale || ""
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Completed Worksheet");
  XLSX.writeFile(wb, `${sector}_Completed_Workbook.xlsx`);
  showToast("📥 Excel Workbook downloaded successfully!", false);
}

function generateClientWord(sector) {
  const secData = appData.sectors[sector];
  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="utf-8"><title>${secData.display_title}</title>
  <style>
    body { font-family: Calibri, sans-serif; font-size: 11pt; line-height: 1.4; }
    h1 { color: #0f172a; font-size: 18pt; margin-bottom: 4pt; }
    h2 { color: #1e3a8a; font-size: 13pt; margin-top: 14pt; margin-bottom: 4pt; }
    table { width: 100%; border-collapse: collapse; margin-top: 8pt; margin-bottom: 12pt; }
    th, td { border: 1px solid #cbd5e1; padding: 6pt; font-size: 10pt; vertical-align: top; }
    th { background: #0f172a; color: #ffffff; }
    .status-yes { color: #065f46; font-weight: bold; }
    .status-no { color: #991b1b; font-weight: bold; }
    .status-partial { color: #92400e; font-weight: bold; }
  </style></head><body>`;

  html += `<h1>CPPR EQUITY BUDGETING WORKSHOP</h1>`;
  html += `<p><strong>Department:</strong> ${secData.display_title}<br>`;
  html += `<strong>Table Identifier:</strong> ${escapeHtml(currentResponses.table_number || "Unassigned")}<br>`;
  html += `<strong>Submission Date:</strong> ${new Date().toLocaleString()}</p><hr>`;

  secData.cards.forEach((card, idx) => {
    const ans = currentResponses.answers[card.id] || {};
    const dims = (ans.dimensions || []).join(", ") || "None marked";
    html += `<h2>Indicator ${card.id}: ${escapeHtml(card.stage)}</h2>`;
    html += `<p><strong>Question:</strong> ${escapeHtml(card.question)}</p>`;
    html += `<table>
      <tr><th style="width:25%;">Field</th><th>Participant Entry</th></tr>
      <tr><td><strong>Assigned PDF Searched</strong></td><td>${escapeHtml(ans.pdf_searched || "N/A")}</td></tr>
      <tr><td><strong>Page Reference</strong></td><td>${escapeHtml(ans.page_ref || (ans.book_page ? `Doc p. ${ans.book_page} / PDF p. ${ans.pdf_page || ''}` : 'N/A'))}</td></tr>
      <tr><td><strong>Transcribed Evidence</strong></td><td>${escapeHtml(ans.evidence || "No evidence recorded.")}</td></tr>
      <tr><td><strong>Equity Dimensions</strong></td><td>${escapeHtml(dims)}</td></tr>
      <tr><td><strong>Overall Status Assessment</strong></td><td class="status-${(ans.status || '').toLowerCase()}">${escapeHtml(ans.status || "Not Assessed")}</td></tr>
      <tr><td><strong>Analytical Rationale</strong></td><td>${escapeHtml(ans.rationale || "No rationale provided.")}</td></tr>
    </table>`;
  });

  html += `</body></html>`;

  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sector}_Completed_Worksheet.doc`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("📄 Word Document downloaded successfully!", false);
}

function emailResponses() {
  const email = "affanaminbat@gmail.com";
  const secName = currentSector ? currentSector.toUpperCase() : "WORKSHOP";
  const subject = encodeURIComponent(`CPPR Equity Budgeting Workshop - ${currentResponses.table_number || secName} Submission`);
  let body = `CPPR EQUITY BUDGETING WORKSHOP - PARTICIPANT WORKSHEET SUBMISSION\n`;
  body += `=================================================================\n`;
  body += `Sector: ${secName}\n`;
  body += `Table: ${currentResponses.table_number || "Unassigned"}\n`;
  body += `Timestamp: ${new Date().toLocaleString()}\n\n`;

  const secData = appData.sectors[currentSector];
  if (secData) {
    secData.cards.forEach((card, idx) => {
      const ans = currentResponses.answers[card.id] || {};
      body += `--------------------------------------------------\n`;
      body += `[#${idx+1}] INDICATOR ${card.id}: ${card.stage}\n`;
      body += `Question: ${card.question}\n`;
      body += `PDF File: ${ans.pdf_searched || 'N/A'}\n`;
      body += `Page Ref: ${ans.page_ref || (ans.book_page ? `Doc p. ${ans.book_page} / PDF p. ${ans.pdf_page || ''}` : 'N/A')}\n`;
      body += `Evidence: ${ans.evidence || 'N/A'}\n`;
      body += `Dimensions: ${(ans.dimensions || []).join(', ') || 'None'}\n`;
      body += `Status: ${ans.status || 'N/A'}\n`;
      body += `Rationale: ${ans.rationale || 'N/A'}\n\n`;
    });
  }

  body += `=================================================================\n`;
  body += `Submitted via CPPR Workshop Online Participant Portal\n`;

  window.open(`mailto:${email}?subject=${subject}&body=${encodeURIComponent(body)}`);
  showToast("📧 Opening email client to send to Facilitator...", false);
}

// Tab Switcher
function switchTab(tabId) {
  const tabs = ["cards", "pdfs", "workflow", "rubric"];
  tabs.forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) el.style.display = (t === tabId) ? "block" : "none";
  });

  document.querySelectorAll(".tab-btn").forEach((btn, idx) => {
    btn.classList.toggle("active", tabs[idx] === tabId);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Render Catalog
function renderCatalog(catalog) {
  const container = document.getElementById("catalog-container");
  container.innerHTML = "";

  catalog.forEach(f => {
    const driveLink = getDriveLinkForFile(f.filename);

    const card = document.createElement("div");
    card.className = "file-card";
    card.innerHTML = `
      <div>
        <div class="file-card-title">${escapeHtml(f.filename)}</div>
        <div class="file-card-meta">
          <span>📅 ${escapeHtml(f.fy)}</span>
          <span>💾 ${escapeHtml(f.filesize)}</span>
          <span>🏛️ ${escapeHtml(f.authority)}</span>
        </div>
        <div class="file-card-desc">
          <strong>Key Content & Hints:</strong> ${escapeHtml(f.content)}
        </div>
      </div>
      <div class="file-card-actions">
        <a href="${escapeHtml(f.download_url)}" download class="btn-download" title="Download direct from workshop server">
          📥 Download PDF
        </a>
        <a href="${escapeHtml(driveLink)}" target="_blank" rel="noopener noreferrer" class="btn-drive" title="Open in Google Drive">
          📁 Open in Drive
        </a>
      </div>
    `;
    container.appendChild(card);
  });
}

function getDriveLinkForFile(filename) {
  if (customDriveFolder) {
    return customDriveFolder;
  }
  // Default search query on Google Drive
  return `https://drive.google.com/drive/search?q=${encodeURIComponent(filename)}`;
}

function setCustomDriveFolder() {
  const promptVal = prompt(
    "Enter your shared Google Drive folder URL for the workshop budget files:\n(e.g., https://drive.google.com/drive/folders/1ABC...)",
    customDriveFolder
  );
  if (promptVal !== null) {
    customDriveFolder = promptVal.trim();
    localStorage.setItem("cppr_drive_folder", customDriveFolder);
    showToast("Google Drive link updated successfully!");
    if (currentSector) {
      renderCatalog(appData.sectors[currentSector].catalog);
    }
  }
}

// Render Workflow
function renderWorkflow(workflow) {
  const tbody = document.getElementById("workflow-tbody");
  tbody.innerHTML = "";
  workflow.forEach(w => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight: 700; color: var(--primary-steel);">${escapeHtml(w.stage)}</td>
      <td>${escapeHtml(w.action)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Render Rubric
function renderRubric(rubric) {
  const tbody = document.getElementById("rubric-tbody");
  tbody.innerHTML = "";
  rubric.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight: 700; color: var(--primary-steel);">${escapeHtml(r.dimension)}</td>
      <td>${escapeHtml(r.definition)}</td>
      <td style="text-align: center; font-style: italic; color: var(--text-muted);">${escapeHtml(r.allowed)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Facilitator Admin Dashboard Logic
async function openAdmin() {
  document.getElementById("login-view").style.display = "none";
  document.getElementById("worksheet-view").style.display = "none";
  document.getElementById("admin-view").style.display = "flex";
  document.title = "Facilitator Dashboard — CPPR Equity Budgeting Workshop";
  await refreshAdminData();
}

let adminSubmissionsCache = {
  health: { sector: "health", completed_count: 0, answers: {} },
  local: { sector: "local", completed_count: 0, answers: {} },
  education: { sector: "education", completed_count: 0, answers: {} },
  finance: { sector: "finance", completed_count: 0, answers: {} }
};

async function refreshAdminData() {
  // 1. Try local or serverless API
  try {
    const res = await fetch("api/submissions");
    if (res.ok) {
      const submissions = await res.json();
      Object.assign(adminSubmissionsCache, submissions);
    }
  } catch (err) {}

  // 2. Poll cloud sync topic for live submissions
  try {
    const cloudRes = await fetch("https://ntfy.sh/cppr_workshop_affan_submissions/json?poll=1&since=all");
    if (cloudRes.ok) {
      const text = await cloudRes.text();
      const lines = text.trim().split("\n");
      lines.forEach(line => {
        try {
          if (!line) return;
          const item = JSON.parse(line);
          if (item.event === "message" && item.message) {
            const parsed = JSON.parse(item.message);
            if (parsed.sector) {
              adminSubmissionsCache[parsed.sector] = {
                sector: parsed.sector,
                table_number: parsed.table_number,
                completed_count: parsed.completed_count,
                total_count: 14,
                completion_pct: Math.round((parsed.completed_count / 14) * 100),
                last_saved: parsed.last_saved,
                answers: parsed.answers || {}
              };
            }
          }
        } catch(e) {}
      });
    }
  } catch (err) {}

  renderAdminTeams(adminSubmissionsCache);
  populateAdminIndicatorSelect();
  renderAdminComparison();
}

function renderAdminTeams(submissions) {
  const grid = document.getElementById("admin-teams-grid");
  grid.innerHTML = "";

  const secKeys = ["health", "local", "education", "finance"];
  secKeys.forEach(key => {
    const secInfo = appData.sectors[key];
    const sub = submissions[key] || {};
    const count = sub.completed_count || 0;
    const total = 14;
    const pct = sub.completion_pct || Math.round((count / total) * 100);
    const lastSaved = sub.last_saved || "Not started";

    let statusBadge = `<span class="admin-status-badge" style="background:#f1f5f9; color:#64748b;">Not Started</span>`;
    if (count > 0 && count < total) {
      statusBadge = `<span class="admin-status-badge" style="background:#fef3c7; color:#92400e;">In Progress (${pct}%)</span>`;
    } else if (count >= total) {
      statusBadge = `<span class="admin-status-badge" style="background:#ecfdf5; color:#065f46;">✓ Complete (100%)</span>`;
    }

    const card = document.createElement("div");
    card.className = "admin-card";
    card.innerHTML = `
      <div class="admin-card-header">
        <div class="admin-card-title">${escapeHtml(secInfo.display_title)}</div>
        ${statusBadge}
      </div>
      <div class="admin-meta-row">
        <span>Table #: <strong>${escapeHtml(sub.table_number || "Unassigned")}</strong></span>
        <span>Scope: <strong>${escapeHtml(secInfo.short_name)}</strong></span>
      </div>
      <div class="admin-meta-row">
        <span>Completed: <strong>${count} of ${total}</strong></span>
        <span>Last Active: <strong>${escapeHtml(lastSaved)}</strong></span>
      </div>
      <div class="progress-track" style="margin: 0.75rem 0;">
        <div class="progress-fill" style="width: ${pct}%;"></div>
      </div>
      <div class="admin-card-actions">
        <button class="btn-sm" style="flex:1;" onclick="openSector('${key}')">👁️ View Team</button>
        <button class="btn-sm" style="flex:1;" onclick="exportResponsesForSector('${key}', 'xlsx')">📥 Excel</button>
        <button class="btn-sm" style="flex:1;" onclick="exportResponsesForSector('${key}', 'docx')">📄 Word</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

function exportResponsesForSector(key, fmt) {
  const origSector = currentSector;
  const origResponses = currentResponses;
  currentSector = key;
  currentResponses = adminSubmissionsCache[key] || { table_number: "", answers: {} };
  exportResponses(fmt);
  currentSector = origSector;
  currentResponses = origResponses;
}

function populateAdminIndicatorSelect() {
  const select = document.getElementById("admin-indicator-select");
  if (select.children.length > 0) return;

  const sampleCards = appData.sectors.health.cards;
  select.innerHTML = sampleCards.map(c => `<option value="${c.id}">${c.id}: ${c.stage} — ${c.question.substring(0, 45)}...</option>`).join("");
}

function renderAdminComparison() {
  const select = document.getElementById("admin-indicator-select");
  const selectedCid = select.value || "A5";
  const grid = document.getElementById("admin-comparison-grid");
  grid.innerHTML = "";

  const subs = adminSubmissionsCache;

  ["health", "local", "education", "finance"].forEach(key => {
    const secInfo = appData.sectors[key];
    const sub = subs[key] || {};
    const ans = (sub.answers || {})[selectedCid] || {};

    let statusColor = "#64748b";
    let statusBg = "#f1f5f9";
    if (ans.status === "YES") { statusColor = "#065f46"; statusBg = "#ecfdf5"; }
    else if (ans.status === "NO") { statusColor = "#991b1b"; statusBg = "#fef2f2"; }
    else if (ans.status === "PARTIAL") { statusColor = "#92400e"; statusBg = "#fffbeb"; }

    const col = document.createElement("div");
    col.style = "background: #f8fafc; border: 1px solid var(--border-light); border-radius: 0.75rem; padding: 1rem;";
    col.innerHTML = `
      <div style="font-weight: 800; font-size: 0.95rem; color: var(--primary-navy); margin-bottom: 0.4rem;">
        ${escapeHtml(secInfo.short_name)}
      </div>
      <div style="display:inline-block; font-size:0.75rem; font-weight:700; padding:0.2rem 0.5rem; border-radius:0.4rem; background:${statusBg}; color:${statusColor}; margin-bottom:0.5rem;">
        ${escapeHtml(ans.status || "Not Assessed")}
      </div>
      <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.4rem;">
        <strong>Doc/Page:</strong> ${escapeHtml(ans.page_ref || "None")}
      </div>
      <div style="font-size: 0.825rem; margin-bottom: 0.5rem; max-height: 90px; overflow-y: auto; background:#ffffff; padding:0.4rem; border-radius:0.35rem; border:1px solid #e2e8f0;">
        <strong>Evidence:</strong> ${escapeHtml(ans.evidence || "No evidence recorded yet.")}
      </div>
      <div style="font-size: 0.8rem; color: var(--primary-steel);">
        <strong>Dimensions:</strong> ${(ans.dimensions && ans.dimensions.length) ? escapeHtml(ans.dimensions.join(", ")) : "None"}
      </div>
    `;
    grid.appendChild(col);
  });
}

// Helpers
function showToast(msg, isError = false) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.style.background = isError ? "#dc2626" : "#1e293b";
  toast.style.display = "block";
  setTimeout(() => {
    toast.style.display = "none";
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeId(str) {
  return String(str).replace(/[^a-zA-Z0-9]/g, "-");
}
