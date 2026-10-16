/**
 * CPPR Equity Budgeting Workshop - Interactive Worksheets Application
 */

let appData = null;
let currentSector = null;
let currentParticipant = null;
let currentResponses = {
  participant_name: "",
  table_number: "",
  answers: {}
};
let saveTimeout = null;
let adminPollInterval = null;
let participantLockPollInterval = null;
let isFacilitatorInspectMode = false;
let currentInspectorTarget = null;
let customDriveFolder = localStorage.getItem("cppr_drive_folder") || "";

// Department Lock State (Default: completely open for individual participants)
let sectorLocks = {
  health: false,
  local: false,
  education: false,
  finance: false
};
let latestLockTimestamp = parseInt(localStorage.getItem("cppr_lock_timestamp") || "0", 10);

function initSectorLocks() {
  sectorLocks = { health: false, local: false, education: false, finance: false };
  try {
    // Purge legacy lock keys
    localStorage.removeItem("cppr_sector_locks");
    const saved = localStorage.getItem("cppr_sector_locks_v2");
    if (saved) {
      sectorLocks = { ...sectorLocks, ...JSON.parse(saved) };
    }
    const savedTs = localStorage.getItem("cppr_lock_timestamp");
    if (savedTs) {
      latestLockTimestamp = parseInt(savedTs, 10);
    }
  } catch(e) {}
  updateLoginPillsLockState();
}

function isSectorLocked(secKey) {
  if (isFacilitatorInspectMode) return false; // Facilitator is never locked out
  if (!secKey) return false;
  return Boolean(sectorLocks[secKey]);
}

function toggleSectorLock(secKey) {
  if (!sectorLocks.hasOwnProperty(secKey)) return;
  const newStatus = !sectorLocks[secKey];
  sectorLocks[secKey] = newStatus;
  latestLockTimestamp = Date.now();
  localStorage.setItem("cppr_lock_timestamp", latestLockTimestamp.toString());
  saveAndBroadcastLocks();
  renderAdminTeams(adminSubmissionsCache);
  const secName = (appData && appData.sectors[secKey] && appData.sectors[secKey].short_name) || secKey.toUpperCase();
  showToast(`${secName} is now ${newStatus ? '🔒 LOCKED' : '🔓 UNLOCKED'}!`, false);
}

function setAllDepartmentLocks(lockState) {
  sectorLocks = {
    health: lockState,
    local: lockState,
    education: lockState,
    finance: lockState
  };
  latestLockTimestamp = Date.now();
  localStorage.setItem("cppr_lock_timestamp", latestLockTimestamp.toString());
  saveAndBroadcastLocks();
  renderAdminTeams(adminSubmissionsCache);
  showToast(`All 4 departments are now ${lockState ? '🔒 LOCKED' : '🔓 UNLOCKED'}!`, false);
}

function saveAndBroadcastLocks() {
  localStorage.setItem("cppr_sector_locks_v2", JSON.stringify(sectorLocks));
  updateAdminLockSummaryText();
  updateLoginPillsLockState();

  // 1. Broadcast to cloud sync (ntfy.sh) so all devices receive lock updates immediately
  try {
    fetch("https://ntfy.sh/cppr_workshop_affan_submissions", {
      method: "POST",
      headers: {
        "Title": "LOCK_UPDATE",
        "Priority": "urgent",
        "Tags": "lock",
        "X-Action": "LOCK_STATE"
      },
      body: JSON.stringify({
        action: "LOCK_STATE",
        locks: sectorLocks,
        time: latestLockTimestamp || Date.now()
      })
    }).catch(e => {});
  } catch(e) {}

  // 2. Broadcast to local server if running
  try {
    fetch("api/locks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sectorLocks)
    }).catch(e => {});
  } catch(e) {}
}

function updateAdminLockSummaryText() {
  const summaryEl = document.getElementById("admin-lock-summary-text");
  if (!summaryEl) return;
  const lockedCount = Object.values(sectorLocks).filter(Boolean).length;
  if (lockedCount === 4) {
    summaryEl.innerHTML = `<span style="color:#991b1b; font-weight:700;">🔒 All 4 departments are currently LOCKED</span> (Participants cannot enter or submit).`;
  } else if (lockedCount === 0) {
    summaryEl.innerHTML = `<span style="color:#166534; font-weight:700;">🔓 All 4 departments are UNLOCKED for Individual Evaluations</span>.`;
  } else {
    summaryEl.innerHTML = `<span style="color:#92400e; font-weight:700;">⚠️ ${lockedCount} of 4 departments LOCKED</span>, ${4 - lockedCount} open for individuals.`;
  }
}

function updateLoginPillsLockState() {
  const secMeta = [
    { key: "health", icon: "🏥", name: "Health" },
    { key: "local", icon: "🏛️", name: "Local Gov" },
    { key: "education", icon: "🎓", name: "Education" },
    { key: "finance", icon: "💼", name: "Finance & Planning" }
  ];

  secMeta.forEach(item => {
    const btn = document.getElementById(`pill-${item.key}`);
    if (btn) {
      const locked = isSectorLocked(item.key);
      if (locked) {
        btn.innerHTML = `🔒 ${item.icon} ${item.name}`;
        btn.style.borderColor = "#fca5a5";
        btn.style.background = "#fee2e2";
        btn.style.color = "#991b1b";
        btn.title = `${item.name} is LOCKED by the Facilitator`;
      } else {
        btn.innerHTML = `${item.icon} ${item.name}`;
        btn.style.borderColor = "";
        btn.style.background = "";
        btn.style.color = "";
        btn.title = `Select ${item.name}`;
      }
    }
  });
}

function applyWorksheetLockState(secKey) {
  const banner = document.getElementById("worksheet-locked-banner");
  const bannerText = document.getElementById("worksheet-locked-banner-text");

  if (isFacilitatorInspectMode) {
    if (banner) banner.style.display = "none";
    const inputs = document.querySelectorAll("#cards-container input, #cards-container select, #cards-container textarea, #table-num");
    inputs.forEach(el => {
      el.disabled = false;
      el.style.opacity = "";
      el.style.cursor = "";
    });
    return;
  }

  const isLocked = isSectorLocked(secKey);
  if (banner) {
    banner.style.display = isLocked ? "flex" : "none";
    if (bannerText) {
      const secTitle = (appData && appData.sectors[secKey]) ? appData.sectors[secKey].display_title : secKey.toUpperCase();
      bannerText.innerHTML = `<span>🔒 <strong>${escapeHtml(secTitle)}</strong> is currently LOCKED by the Facilitator. Submissions and editing are paused.</span>`;
    }
  }

  const inputs = document.querySelectorAll("#cards-container input, #cards-container select, #cards-container textarea, #table-num");
  inputs.forEach(el => {
    el.disabled = isLocked;
    if (isLocked) {
      el.style.opacity = "0.7";
      el.style.cursor = "not-allowed";
    } else {
      el.style.opacity = "";
      el.style.cursor = "";
    }
  });

  const submitBtn = document.querySelector("#worksheet-view .btn-success");
  if (submitBtn) {
    submitBtn.disabled = isLocked;
    submitBtn.style.opacity = isLocked ? "0.5" : "1";
    submitBtn.style.cursor = isLocked ? "not-allowed" : "pointer";
    submitBtn.title = isLocked ? "Submissions paused by facilitator" : "Submit complete worksheet to facilitator";
  }
}

// Real-time synchronization across browser tabs
window.addEventListener("storage", (e) => {
  if (e.key === "cppr_sector_locks_v2" && e.newValue) {
    try {
      sectorLocks = { ...sectorLocks, ...JSON.parse(e.newValue) };
      updateLoginPillsLockState();
      updateAdminLockSummaryText();
      const partCard = document.getElementById("participant-card");
      if (partCard && partCard.style.display !== "none") {
        renderParticipantDepartmentCards();
      }
      if (currentSector && document.getElementById("worksheet-view").style.display !== "none") {
        applyWorksheetLockState(currentSector);
      }
    } catch(err) {}
  }
});

function startParticipantLockPoller() {
  if (participantLockPollInterval) clearInterval(participantLockPollInterval);

  const checkLocks = async () => {
    // 1. Check local server if running
    try {
      const sRes = await fetch("api/locks");
      if (sRes.ok) {
        const sLocks = await sRes.json();
        const prev = JSON.stringify(sectorLocks);
        const next = JSON.stringify(sLocks);
        if (prev !== next) {
          sectorLocks = { ...sectorLocks, ...sLocks };
          localStorage.setItem("cppr_sector_locks_v2", JSON.stringify(sectorLocks));
          updateLoginPillsLockState();
          updateAdminLockSummaryText();
          const partCard = document.getElementById("participant-card");
          if (partCard && partCard.style.display !== "none") {
            renderParticipantDepartmentCards();
          }
          if (currentSector && document.getElementById("worksheet-view").style.display !== "none") {
            applyWorksheetLockState(currentSector);
          }
        }
      }
    } catch(e) {}

    // 2. Poll ntfy.sh for cloud updates
    try {
      const res = await fetch("https://ntfy.sh/cppr_workshop_affan_submissions/json?poll=1&since=10m");
      if (res.ok) {
        const text = await res.text();
        const lines = text.trim().split("\n");
        let latestMsg = null;
        lines.forEach(line => {
          if (!line) return;
          try {
            const item = JSON.parse(line);
            if (item.event === "message" && item.message) {
              let parsed;
              try {
                parsed = JSON.parse(item.message);
              } catch(jsonErr) {
                return;
              }
              if (parsed && parsed.action === "LOCK_STATE" && parsed.locks) {
                const msgTime = parsed.time || ((item.time || 0) * 1000);
                if (!latestMsg || msgTime > latestMsg.time) {
                  latestMsg = { time: msgTime, locks: parsed.locks };
                }
              }
            }
          } catch(e) {}
        });

        if (latestMsg && latestMsg.time >= latestLockTimestamp) {
          latestLockTimestamp = latestMsg.time;
          localStorage.setItem("cppr_lock_timestamp", latestLockTimestamp.toString());
          const prev = JSON.stringify(sectorLocks);
          const next = JSON.stringify(latestMsg.locks);
          if (prev !== next) {
            sectorLocks = { ...sectorLocks, ...latestMsg.locks };
            localStorage.setItem("cppr_sector_locks_v2", JSON.stringify(sectorLocks));
            updateLoginPillsLockState();
            updateAdminLockSummaryText();
            const partCard = document.getElementById("participant-card");
            if (partCard && partCard.style.display !== "none") {
              renderParticipantDepartmentCards();
            }
            if (currentSector && document.getElementById("worksheet-view").style.display !== "none") {
              applyWorksheetLockState(currentSector);
            }
          }
        }
      }
    } catch(e) {}
  };

  // Run immediately on call
  checkLocks();
  participantLockPollInterval = setInterval(checkLocks, 4000);
}

// Initialize App
document.addEventListener("DOMContentLoaded", async () => {
  try {
    initSectorLocks();
    startParticipantLockPoller();
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

function sanitizeParticipantKey(name) {
  if (!name) return "";
  return name.toLowerCase().trim().replace(/[^a-z0-9_-]/g, "_");
}

function getStorageKey(secKey, participant) {
  if (participant && participant.trim()) {
    return `cppr_user_responses_${sanitizeParticipantKey(participant)}_${secKey}`;
  }
  return `cppr_responses_${secKey}`;
}

function getParticipantProgress(participantName, secKey) {
  const key = getStorageKey(secKey, participantName);
  const str = localStorage.getItem(key);
  let data = { table_number: "", answers: {} };
  if (str) {
    try { data = JSON.parse(str); } catch (e) {}
  }
  let completedCount = 0;
  const totalCount = 14;
  const answers = data.answers || {};
  for (const cid in answers) {
    const a = answers[cid];
    if (a && a.status && a.evidence && a.evidence.trim().length > 0) {
      completedCount++;
    }
  }
  const pct = Math.round((completedCount / totalCount) * 100);
  return {
    completedCount,
    totalCount,
    pct,
    table_number: data.table_number || "",
    answers,
    hasData: completedCount > 0 || Boolean(data.table_number) || Object.keys(answers).length > 0
  };
}

function recordParticipant(participantName, secKey) {
  if (!participantName || !participantName.trim()) return;
  const trimmed = participantName.trim();
  const key = sanitizeParticipantKey(trimmed);
  let reg = {};
  try {
    reg = JSON.parse(localStorage.getItem("cppr_participants_registry") || "{}");
  } catch (e) {}
  if (!reg[key]) {
    reg[key] = { name: trimmed, sectors: {}, lastActive: new Date().toISOString() };
  }
  reg[key].name = trimmed;
  reg[key].lastActive = new Date().toISOString();
  if (secKey) {
    reg[key].lastSector = secKey;
    reg[key].sectors[secKey] = true;
  }
  localStorage.setItem("cppr_participants_registry", JSON.stringify(reg));
}

function getSavedParticipants() {
  let reg = {};
  try {
    reg = JSON.parse(localStorage.getItem("cppr_participants_registry") || "{}");
  } catch (e) {}
  return Object.values(reg);
}

function checkUrlOrStorageLogin() {
  const urlParams = new URLSearchParams(window.location.search);
  const paramParticipant = urlParams.get("participant");
  const paramSector = urlParams.get("sector") || window.location.hash.replace("#", "");

  if (paramParticipant && paramParticipant.trim()) {
    currentParticipant = paramParticipant.trim();
    sessionStorage.setItem("cppr_participant_name", currentParticipant);
    recordParticipant(currentParticipant);
  } else {
    const savedPart = sessionStorage.getItem("cppr_participant_name");
    if (savedPart && savedPart.trim()) {
      currentParticipant = savedPart.trim();
    }
  }

  if (paramSector) {
    const norm = normalizeSectorCode(paramSector);
    if (norm === "admin") {
      openAdmin();
      return;
    } else if (norm && appData.sectors[norm]) {
      if (!isSectorLocked(norm)) {
        openSector(norm);
        return;
      } else {
        showLoginView();
        return;
      }
    }
  }

  // Check saved session
  const savedSector = sessionStorage.getItem("cppr_active_sector");
  if (savedSector && appData.sectors[savedSector] && !isSectorLocked(savedSector)) {
    openSector(savedSector);
  } else if (currentParticipant) {
    showParticipantPicker(currentParticipant);
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
  if (s === "admin" || s === "facilitator" || s === "monitor" || s === "affan") return "admin";
  return null;
}

// Login Handler
function handleLoginSubmit(e) {
  if (e) e.preventDefault();
  const inputEl = document.getElementById("sector-input");
  const val = (inputEl.value || "").trim();

  if (!val) {
    showToast("Please enter your name in the input bar above.", true);
    inputEl.style.borderColor = "#ef4444";
    inputEl.focus();
    setTimeout(() => { inputEl.style.borderColor = ""; }, 1500);
    return;
  }

  const norm = normalizeSectorCode(val);

  if (norm === "admin") {
    currentParticipant = null;
    sessionStorage.removeItem("cppr_participant_name");
    openAdmin();
    return;
  }

  if (norm && appData.sectors[norm]) {
    // Participant entered department code
    if (isSectorLocked(norm)) {
      showToast(`🔒 ${appData.sectors[norm].display_title} is currently LOCKED by the Facilitator. Submissions and access are paused.`, true);
      inputEl.style.borderColor = "#ef4444";
      inputEl.focus();
      setTimeout(() => { inputEl.style.borderColor = ""; }, 1500);
      return;
    }
    // Department is UNLOCKED: open departmental master view in read-only mode
    currentParticipant = null;
    sessionStorage.removeItem("cppr_participant_name");
    openSector(norm);
    return;
  }

  if (val.length >= 2) {
    // Individual participant name typed into the existing bar!
    showParticipantPicker(val);
  } else {
    showToast("Please enter a valid name (at least 2 characters).", true);
    inputEl.style.borderColor = "#ef4444";
    inputEl.focus();
    setTimeout(() => {
      inputEl.style.borderColor = "";
    }, 1500);
  }
}

function quickSelectSector(secCode) {
  if (secCode === "admin") {
    openAdmin();
    return;
  }

  const secName = (appData && appData.sectors[secCode]) ? appData.sectors[secCode].display_title : secCode.toUpperCase();

  // 1. If department is LOCKED by Facilitator in Admin
  if (isSectorLocked(secCode)) {
    showToast(`🔒 ${secName} is currently LOCKED by the Facilitator. Submissions and access are paused.`, true);
    const inputEl = document.getElementById("sector-input");
    if (inputEl) {
      inputEl.style.borderColor = "#ef4444";
      inputEl.style.boxShadow = "0 0 0 3px rgba(239, 68, 68, 0.25)";
      inputEl.focus();
      setTimeout(() => {
        inputEl.style.borderColor = "";
        inputEl.style.boxShadow = "";
      }, 1500);
    }
    return;
  }

  // 2. Department is UNLOCKED!
  // If participant is already logged in
  if (currentParticipant) {
    selectParticipantSector(secCode);
    return;
  }

  // Check if participant has typed their name in the input bar
  const inputEl = document.getElementById("sector-input");
  const inputVal = (inputEl?.value || "").trim();
  const norm = normalizeSectorCode(inputVal);

  if (inputVal.length >= 2 && !norm) {
    // User typed their name in the bar and clicked a quick department pill
    showParticipantPicker(inputVal);
    selectParticipantSector(secCode);
    return;
  }

  // If no name was entered, open the Departmental Master View (Read-Only)
  currentParticipant = null;
  sessionStorage.removeItem("cppr_participant_name");
  openSector(secCode);
}

function showParticipantPicker(participantName) {
  if (!participantName || !participantName.trim()) return;
  currentParticipant = participantName.trim();
  sessionStorage.setItem("cppr_participant_name", currentParticipant);
  recordParticipant(currentParticipant);

  document.getElementById("login-view").style.display = "flex";
  const mainCard = document.getElementById("login-card-main");
  if (mainCard) mainCard.style.display = "none";
  const partCard = document.getElementById("participant-card");
  if (partCard) partCard.style.display = "block";
  document.getElementById("worksheet-view").style.display = "none";
  document.getElementById("admin-view").style.display = "none";

  const titleEl = document.getElementById("participant-welcome-title");
  const subEl = document.getElementById("participant-welcome-subtitle");

  // Check progress across sectors
  const sectors = ["health", "local", "education", "finance"];
  let hasAnyProgress = false;
  let totalDone = 0;
  sectors.forEach(s => {
    const prog = getParticipantProgress(currentParticipant, s);
    if (prog.hasData) hasAnyProgress = true;
    totalDone += prog.completedCount;
  });

  if (hasAnyProgress) {
    titleEl.innerHTML = `Welcome back, <span style="color:var(--accent-blue);">${escapeHtml(currentParticipant)}</span>!`;
    subEl.textContent = `Your saved departmental evaluation progress is loaded below. Choose a department to resume or begin:`;
  } else {
    titleEl.innerHTML = `Welcome, <span style="color:var(--accent-blue);">${escapeHtml(currentParticipant)}</span>!`;
    subEl.textContent = `Select which department you would like to evaluate on your own:`;
  }

  renderParticipantDepartmentCards();
}

function renderParticipantDepartmentCards() {
  const container = document.getElementById("participant-sectors-container");
  if (!container || !appData) return;
  container.innerHTML = "";

  const secMeta = [
    { key: "health", icon: "🏥" },
    { key: "local", icon: "🏛️" },
    { key: "education", icon: "🎓" },
    { key: "finance", icon: "💼" }
  ];

  secMeta.forEach(item => {
    const secInfo = appData.sectors[item.key];
    const prog = getParticipantProgress(currentParticipant, item.key);
    const locked = isSectorLocked(item.key);

    let statusBadgeHtml = `<span class="dept-card-status-badge not-started">Not Started</span>`;
    let actionBtnText = `Start Worksheet ➔`;
    let cardClass = "participant-dept-card";

    if (locked) {
      statusBadgeHtml = `<span class="dept-card-status-badge locked">🔒 Locked by Facilitator</span>`;
      actionBtnText = `Locked 🔒`;
      cardClass += " is-locked";
    } else if (prog.completedCount === 14) {
      statusBadgeHtml = `<span class="dept-card-status-badge completed">✓ Complete (100%)</span>`;
      actionBtnText = `Review Worksheet ➔`;
      cardClass += " complete-progress";
    } else if (prog.completedCount > 0 || prog.hasData) {
      statusBadgeHtml = `<span class="dept-card-status-badge in-progress">In Progress: ${prog.completedCount} / 14 (${prog.pct}%)</span>`;
      actionBtnText = `Resume Progress ➔`;
      cardClass += " active-progress";
    }

    const card = document.createElement("div");
    card.className = cardClass;
    card.onclick = () => {
      if (isSectorLocked(item.key)) {
        showToast(`🔒 ${secInfo.display_title} is currently locked by the Facilitator.`, true);
        return;
      }
      selectParticipantSector(item.key);
    };

    card.innerHTML = `
      <div>
        <div class="dept-card-top">
          <div class="dept-card-icon">${item.icon}</div>
          <div class="dept-card-info">
            <div class="dept-card-title">${escapeHtml(secInfo.display_title)}</div>
            <div class="dept-card-scope">${escapeHtml(secInfo.scope)}</div>
          </div>
        </div>
        <div class="progress-track" style="height: 6px; margin: 0.5rem 0;">
          <div class="progress-fill" style="width: ${prog.pct}%;"></div>
        </div>
      </div>
      <div class="dept-card-meta">
        ${statusBadgeHtml}
        <span class="dept-card-action-btn">${actionBtnText}</span>
      </div>
    `;
    container.appendChild(card);
  });
}

function selectParticipantSector(secKey) {
  if (!appData || !appData.sectors[secKey]) return;
  if (isSectorLocked(secKey)) {
    showToast(`🔒 ${appData.sectors[secKey].display_title} is currently locked by the Facilitator.`, true);
    return;
  }
  currentSector = secKey;
  sessionStorage.setItem("cppr_active_sector", secKey);
  recordParticipant(currentParticipant, secKey);

  // Update URL state
  const newUrl = `${window.location.pathname}?participant=${encodeURIComponent(currentParticipant)}&sector=${encodeURIComponent(secKey)}`;
  window.history.pushState({}, "", newUrl);

  openSector(secKey);
}

function backToMainLogin() {
  currentParticipant = null;
  sessionStorage.removeItem("cppr_participant_name");
  sessionStorage.removeItem("cppr_active_sector");
  window.history.pushState({}, "", window.location.pathname);
  showLoginView();
}

function renderRecentParticipantsList() {
  const box = document.getElementById("recent-participants-box");
  const list = document.getElementById("recent-participants-list");
  if (!box || !list) return;

  const saved = getSavedParticipants();
  if (!saved || saved.length === 0) {
    box.style.display = "none";
    return;
  }

  list.innerHTML = "";
  saved.slice(-6).reverse().forEach(p => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "recent-participant-chip";
    chip.innerHTML = `<span>👤</span><span>${escapeHtml(p.name)}</span>`;
    chip.onclick = () => showParticipantPicker(p.name);
    list.appendChild(chip);
  });
  box.style.display = "block";
}

function showLoginView() {
  document.getElementById("login-view").style.display = "flex";
  const mainCard = document.getElementById("login-card-main");
  if (mainCard) mainCard.style.display = "block";
  const partCard = document.getElementById("participant-card");
  if (partCard) partCard.style.display = "none";
  document.getElementById("worksheet-view").style.display = "none";
  document.getElementById("admin-view").style.display = "none";
  const inputEl = document.getElementById("sector-input");
  inputEl.value = "";
  renderRecentParticipantsList();
  updateLoginPillsLockState();
  setTimeout(() => inputEl.focus(), 100);
}

function logoutSector() {
  if (adminPollInterval) {
    clearInterval(adminPollInterval);
    adminPollInterval = null;
  }
  if (isFacilitatorInspectMode) {
    returnToAdminDesk();
    return;
  }
  sessionStorage.removeItem("cppr_active_sector");

  if (currentParticipant) {
    const newUrl = `${window.location.pathname}?participant=${encodeURIComponent(currentParticipant)}`;
    window.history.pushState({}, "", newUrl);
    showParticipantPicker(currentParticipant);
  } else {
    window.history.pushState({}, "", window.location.pathname);
    showLoginView();
  }
}

// Open Specific Sector Worksheet
async function openSector(secKey) {
  if (isSectorLocked(secKey) && !isFacilitatorInspectMode) {
    const secName = (appData && appData.sectors[secKey]) ? appData.sectors[secKey].display_title : secKey.toUpperCase();
    showToast(`🔒 ${secName} is currently LOCKED by the Facilitator. Submissions and access are paused.`, true);
    showLoginView();
    return;
  }

  currentSector = secKey;
  sessionStorage.setItem("cppr_active_sector", secKey);

  const secInfo = appData.sectors[secKey];
  if (currentParticipant) {
    document.title = `${secInfo.display_title} (${currentParticipant}) — CPPR Equity Budgeting Workshop`;
  } else {
    document.title = `${secInfo.display_title} — CPPR Equity Budgeting Workshop`;
  }

  document.getElementById("login-view").style.display = "none";
  document.getElementById("admin-view").style.display = "none";
  document.getElementById("worksheet-view").style.display = "flex";

  // Check Inspector Banner
  const inspBanner = document.getElementById("inspector-top-banner");
  if (inspBanner) {
    if (isFacilitatorInspectMode) {
      inspBanner.style.display = "flex";
      const targetLabel = currentParticipant ? `Participant: ${currentParticipant}` : `Team Focus: ${secInfo.display_title}`;
      const bannerText = document.getElementById("inspector-banner-text");
      if (bannerText) bannerText.textContent = `FACILITATOR INSPECTOR: Viewing ${targetLabel} — Live Preview`;
    } else {
      inspBanner.style.display = "none";
    }
  }

  // Update Header Banner
  const topNameEl = document.getElementById("top-sector-name");
  const bannerTeamEl = document.getElementById("banner-team-name");
  const partTagEl = document.getElementById("header-participant-tag");
  const switchBtn = document.getElementById("btn-switch-sector");

  if (isFacilitatorInspectMode) {
    topNameEl.textContent = `${secInfo.display_title} (Inspecting: ${currentParticipant || 'Team'})`;
    bannerTeamEl.textContent = `${currentParticipant || 'Team'} — ${secInfo.display_title}`;
    if (partTagEl) {
      partTagEl.textContent = currentParticipant ? `🔍 Inspecting: ${currentParticipant}` : `🔍 Inspecting: Team`;
      partTagEl.style.display = "inline-flex";
    }
    if (switchBtn) {
      switchBtn.textContent = `← Exit to Facilitator Desk`;
      switchBtn.style.background = "#eff6ff";
      switchBtn.style.color = "#1d4ed8";
    }
  } else if (currentParticipant) {
    topNameEl.textContent = `${secInfo.display_title} — ${currentParticipant}`;
    bannerTeamEl.textContent = `${currentParticipant} — ${secInfo.display_title}`;
    if (partTagEl) {
      partTagEl.textContent = `👤 ${currentParticipant}`;
      partTagEl.style.display = "inline-flex";
    }
    if (switchBtn) {
      switchBtn.textContent = `🚪 Switch Dept`;
      switchBtn.style.background = "";
      switchBtn.style.color = "";
    }
  } else {
    topNameEl.textContent = secInfo.display_title;
    bannerTeamEl.textContent = secInfo.display_title;
    if (partTagEl) {
      partTagEl.style.display = "none";
    }
    if (switchBtn) {
      switchBtn.textContent = `🚪 Switch Sector`;
      switchBtn.style.background = "";
      switchBtn.style.color = "";
    }
  }

  document.getElementById("banner-scope").textContent = secInfo.scope;

  // Load responses from LocalStorage, then server, with admin cache fallback
  loadLocalResponses(secKey);
  await fetchServerResponses(secKey);

  if (currentParticipant && !currentResponses.table_number) {
    currentResponses.table_number = currentParticipant;
  }

  document.getElementById("table-num").value = currentResponses.table_number || "";

  // Render sub-components
  renderQuickJumpBar(secInfo.cards);
  renderCards(secInfo);
  renderCatalog(secInfo.catalog);
  renderWorkflow(secInfo.workflow);
  renderRubric(secInfo.rubric);

  applyWorksheetLockState(secKey);
  updateProgress();
  switchTab("cards");
}

function loadLocalResponses(secKey) {
  const storageKey = getStorageKey(secKey, currentParticipant);
  const localStr = localStorage.getItem(storageKey);
  if (localStr) {
    try {
      currentResponses = JSON.parse(localStr);
      if (currentParticipant && !currentResponses.participant_name) {
        currentResponses.participant_name = currentParticipant;
      }
    } catch (e) {
      currentResponses = { 
        participant_name: currentParticipant || "",
        table_number: currentParticipant || "", 
        answers: {} 
      };
    }
  } else {
    currentResponses = { 
      participant_name: currentParticipant || "",
      table_number: currentParticipant || "", 
      answers: {} 
    };
  }

  // CRITICAL INSPECTION / CLOUD SYNC:
  // Merge missing indicators from adminSubmissionsCache (or baseline) so incomplete drafts get the full answers
  if (adminSubmissionsCache && adminSubmissionsCache[secKey]) {
    const subData = adminSubmissionsCache[secKey];
    if (currentParticipant) {
      const partsMap = subData.participants || {};
      let match = partsMap[currentParticipant];
      if (!match) {
        const sTarget = sanitizeParticipantKey(currentParticipant);
        for (const p in partsMap) {
          if (sanitizeParticipantKey(p) === sTarget) {
            match = partsMap[p];
            break;
          }
        }
      }
      if (match && match.answers) {
        currentResponses.answers = currentResponses.answers || {};
        for (const cid in match.answers) {
          if (!currentResponses.answers[cid] || !currentResponses.answers[cid].evidence) {
            currentResponses.answers[cid] = { ...match.answers[cid] };
          }
        }
        currentResponses.table_number = match.table_number || currentResponses.table_number || currentParticipant;
        currentResponses.last_saved = match.last_saved || currentResponses.last_saved;
      }
    }
    
    // Also merge from departmental baseline
    if (subData.answers) {
      currentResponses.answers = currentResponses.answers || {};
      for (const cid in subData.answers) {
        if (!currentResponses.answers[cid] || !currentResponses.answers[cid].evidence) {
          currentResponses.answers[cid] = { ...subData.answers[cid] };
        }
      }
      if (!currentResponses.table_number) {
        currentResponses.table_number = subData.table_number || `Table - ${secKey}`;
      }
      if (!currentResponses.last_saved) {
        currentResponses.last_saved = subData.last_saved || "";
      }
    }
  }
}

async function fetchServerResponses(secKey) {
  let loadedData = null;

  // 1. Try local or server API
  try {
    let url = `/api/submissions/${secKey}`;
    if (currentParticipant) {
      url += `?participant=${encodeURIComponent(currentParticipant)}`;
    }
    const res = await fetch(url);
    if (res.ok) {
      loadedData = await res.json();
    }
  } catch (err) {}

  // 2. Fallback to baseline_submissions.json (essential for GitHub Pages static hosting!)
  if (!loadedData || !loadedData.answers || Object.keys(loadedData.answers).length === 0) {
    try {
      const bRes = await fetch(`baseline_submissions.json?v=20261016-${Date.now()}`);
      if (bRes.ok) {
        const allBaseline = await bRes.json();
        if (allBaseline && allBaseline[secKey]) {
          loadedData = allBaseline[secKey];
        }
      }
    } catch (err) {}
  }

  // 3. Deep-merge baseline/server data into currentResponses
  if (loadedData && loadedData.answers && Object.keys(loadedData.answers).length > 0) {
    if (!currentResponses.table_number) {
      currentResponses.table_number = loadedData.table_number || `Table - ${secKey}`;
    }
    if (!currentResponses.last_saved) {
      currentResponses.last_saved = loadedData.last_saved || "";
    }

    currentResponses.answers = currentResponses.answers || {};
    for (const cid in loadedData.answers) {
      const bAns = loadedData.answers[cid];
      if (!currentResponses.answers[cid]) {
        currentResponses.answers[cid] = bAns;
      } else {
        const curAns = currentResponses.answers[cid];
        if (!curAns.evidence || !curAns.evidence.trim()) {
          currentResponses.answers[cid] = { ...bAns, ...curAns };
          if (bAns.evidence) currentResponses.answers[cid].evidence = bAns.evidence;
          if (bAns.rationale && !curAns.rationale) currentResponses.answers[cid].rationale = bAns.rationale;
          if (bAns.status && !curAns.status) currentResponses.answers[cid].status = bAns.status;
          if (bAns.page_ref && !curAns.page_ref) currentResponses.answers[cid].page_ref = bAns.page_ref;
          if (bAns.pdf_searched && !curAns.pdf_searched) currentResponses.answers[cid].pdf_searched = bAns.pdf_searched;
          if (bAns.dimensions && (!curAns.dimensions || curAns.dimensions.length === 0)) currentResponses.answers[cid].dimensions = bAns.dimensions;
        }
      }
    }

    const storageKey = getStorageKey(secKey, currentParticipant);
    localStorage.setItem(storageKey, JSON.stringify(currentResponses));
    const secInfo = appData && appData.sectors[secKey];
    if (secInfo) {
      renderCards(secInfo);
      updateProgress();
    }
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
  if (isFacilitatorInspectMode) {
    // Read-only inspection mode: do not save or overwrite participant submissions
    setSyncStatus("Inspection Mode (Read-Only)", "#0284c7");
    return;
  }
  setSyncStatus("Saving...", "#f59e0b");
  if (currentParticipant) {
    currentResponses.participant_name = currentParticipant;
  }
  const storageKey = getStorageKey(currentSector, currentParticipant);
  localStorage.setItem(storageKey, JSON.stringify(currentResponses));
  recordParticipant(currentParticipant, currentSector);

  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    await submitResponses(false);
  }, 1500);
}

async function submitResponses(isExplicitSubmit) {
  if (!currentSector) return;

  if (isSectorLocked(currentSector)) {
    if (isExplicitSubmit) {
      showToast(`🔒 Submissions are paused. This department is currently locked by the Facilitator.`, true);
    }
    return;
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const tableInput = document.getElementById("table-num");
  const tableVal = (tableInput?.value || "").trim();
  if (currentParticipant) {
    currentResponses.participant_name = currentParticipant;
  } else if (tableVal) {
    currentResponses.participant_name = tableVal;
  }
  if (tableVal) {
    currentResponses.table_number = tableVal;
  }
  currentResponses.last_saved = timeStr;

  // 1. Always save locally under proper storage key
  const storageKey = getStorageKey(currentSector, currentParticipant);
  localStorage.setItem(storageKey, JSON.stringify(currentResponses));
  recordParticipant(currentParticipant, currentSector);

  const answeredCount = Object.keys(currentResponses.answers || {}).length;

  // 2. Real-time Cloud Push to ntfy.sh so facilitator receives instant alerts anywhere
  try {
    const ntfyTitle = currentParticipant 
      ? `CPPR: ${currentSector.toUpperCase()} (${currentParticipant})`
      : `CPPR Workshop Submission: ${currentSector.toUpperCase()}`;
    
    const ntfyHeaders = {
      "Title": ntfyTitle,
      "Priority": isExplicitSubmit ? "high" : "default",
      "Tags": isExplicitSubmit ? "white_check_mark,clipboard" : "pencil2",
      "X-Sector": currentSector
    };
    if (currentParticipant) {
      ntfyHeaders["X-Participant"] = currentParticipant;
    }

    const payload = {
      sector: currentSector,
      participant_name: currentResponses.participant_name || currentParticipant || "",
      table_number: currentResponses.table_number || (currentParticipant ? `Table - ${currentParticipant}` : `Table - ${currentSector}`),
      completed_count: answeredCount,
      last_saved: timeStr,
      answers: currentResponses.answers
    };

    fetch("https://ntfy.sh/cppr_workshop_affan_submissions", {
      method: "POST",
      headers: ntfyHeaders,
      body: JSON.stringify(payload)
    }).catch(e => console.log("Cloud sync note:", e));
  } catch (e) {}

  // 3. Post to server endpoint if running
  try {
    const payload = {
      sector: currentSector,
      participant_name: currentResponses.participant_name || currentParticipant || "",
      table_number: currentResponses.table_number || (currentParticipant ? `Table - ${currentParticipant}` : `Table - ${currentSector}`),
      completed_count: answeredCount,
      last_saved: timeStr,
      answers: currentResponses.answers
    };

    const res = await fetch(`api/submissions/${currentSector}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
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

function resetCurrentWorksheet() {
  if (!currentSector) return;

  if (isSectorLocked(currentSector)) {
    showToast("🔒 Cannot reset worksheet while department is locked by Facilitator.", true);
    return;
  }

  const secName = (appData.sectors[currentSector] && appData.sectors[currentSector].short_name) || currentSector.toUpperCase();

  currentResponses = {
    participant_name: currentParticipant || "",
    table_number: currentParticipant || "",
    answers: {}
  };
  const storageKey = getStorageKey(currentSector, currentParticipant);
  localStorage.removeItem(storageKey);
  const tableInput = document.getElementById("table-num");
  if (tableInput) tableInput.value = currentResponses.table_number || "";

  renderCards(appData.sectors[currentSector]);
  updateProgress();
  submitResponses(false);

  const displayName = currentParticipant ? `${currentParticipant} (${secName})` : secName;
  showToast(`Worksheet for ${displayName} cleared to blank!`, false);
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
    ["Department / Sector:", secData.display_title]
  ];

  if (currentParticipant) {
    rows.push(["Participant Name:", currentParticipant]);
  }

  rows.push(["Table / Team Identifier:", currentResponses.table_number || "Unassigned"]);
  rows.push(["Timestamp:", new Date().toLocaleString()]);
  rows.push([]);
  rows.push([
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
  ]);

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
  const filename = currentParticipant 
    ? `${sector}_${sanitizeParticipantKey(currentParticipant)}_Completed_Workbook.xlsx`
    : `${sector}_Completed_Workbook.xlsx`;
  XLSX.writeFile(wb, filename);
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
  if (currentParticipant) {
    html += `<strong>Participant Name:</strong> ${escapeHtml(currentParticipant)}<br>`;
  }
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
  const filename = currentParticipant
    ? `${sector}_${sanitizeParticipantKey(currentParticipant)}_Completed_Worksheet.doc`
    : `${sector}_Completed_Worksheet.doc`;
  a.download = filename;
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
  updateAdminLockSummaryText();
  renderAdminTeams(adminSubmissionsCache);
  if (!adminPollInterval) {
    adminPollInterval = setInterval(refreshAdminData, 6000);
  }
  await refreshAdminData();
}

let adminSubmissionsCache = {
  health: { sector: "health", completed_count: 0, answers: {} },
  local: { sector: "local", completed_count: 0, answers: {} },
  education: { sector: "education", completed_count: 0, answers: {} },
  finance: { sector: "finance", completed_count: 0, answers: {} }
};

async function refreshAdminData() {
  let latestGlobalReset = parseInt(localStorage.getItem("cppr_admin_reset_time") || "0", 10);
  let sectorResets = JSON.parse(localStorage.getItem("cppr_sector_resets") || "{}");

  const newCache = {
    health: { sector: "health", completed_count: 0, answers: {}, participants: {} },
    local: { sector: "local", completed_count: 0, answers: {}, participants: {} },
    education: { sector: "education", completed_count: 0, answers: {}, participants: {} },
    finance: { sector: "finance", completed_count: 0, answers: {}, participants: {} }
  };

  // 1. Try local or serverless API
  try {
    const res = await fetch("api/submissions");
    if (res.ok) {
      const submissions = await res.json();
      Object.keys(submissions).forEach(k => {
        if (newCache[k]) {
          newCache[k] = { ...newCache[k], ...submissions[k] };
          if (submissions[k].participants) {
            newCache[k].participants = { ...submissions[k].participants };
          }
        }
      });
    } else {
      // Static hosting fallback (GitHub Pages)
      const bRes = await fetch(`baseline_submissions.json?v=20261016-${Date.now()}`);
      if (bRes.ok) {
        const baseSubmissions = await bRes.json();
        Object.keys(baseSubmissions).forEach(k => {
          if (newCache[k]) {
            newCache[k] = { ...newCache[k], ...baseSubmissions[k] };
          }
        });
      }
    }
  } catch (err) {
    try {
      const bRes = await fetch(`baseline_submissions.json?v=20261016-${Date.now()}`);
      if (bRes.ok) {
        const baseSubmissions = await bRes.json();
        Object.keys(baseSubmissions).forEach(k => {
          if (newCache[k]) {
            newCache[k] = { ...newCache[k], ...baseSubmissions[k] };
          }
        });
      }
    } catch(bErr) {}
  }

  // 2. Poll cloud sync topic for live submissions
  try {
    const cloudRes = await fetch("https://ntfy.sh/cppr_workshop_affan_submissions/json?poll=1&since=all");
    if (cloudRes.ok) {
      const text = await cloudRes.text();
      const lines = text.trim().split("\n");

      // Pass 1: Discover any RESET or LOCK events in the stream
      lines.forEach(line => {
        try {
          if (!line) return;
          const item = JSON.parse(line);
          if (item.event === "message" && item.message) {
            const parsed = JSON.parse(item.message);
            if (parsed.action === "LOCK_STATE" && parsed.locks) {
              const msgTime = parsed.time || ((item.time || 0) * 1000);
              if (msgTime >= latestLockTimestamp) {
                latestLockTimestamp = msgTime;
                localStorage.setItem("cppr_lock_timestamp", latestLockTimestamp.toString());
                sectorLocks = { ...sectorLocks, ...parsed.locks };
                localStorage.setItem("cppr_sector_locks_v2", JSON.stringify(sectorLocks));
              }
            } else if (parsed.action === "RESET_ALL" && parsed.reset_time) {
              if (parsed.reset_time > latestGlobalReset) {
                latestGlobalReset = parsed.reset_time;
                localStorage.setItem("cppr_admin_reset_time", latestGlobalReset.toString());
              }
            } else if (parsed.action === "RESET_SECTOR" && parsed.sector && parsed.reset_time) {
              const prev = sectorResets[parsed.sector] || 0;
              if (parsed.reset_time > prev) {
                sectorResets[parsed.sector] = parsed.reset_time;
                localStorage.setItem("cppr_sector_resets", JSON.stringify(sectorResets));
              }
            }
          }
        } catch(e) {}
      });

      // Pass 2: Merge submissions created AFTER the latest reset
      lines.forEach(line => {
        try {
          if (!line) return;
          const item = JSON.parse(line);
          if (item.event === "message" && item.message) {
            const parsed = JSON.parse(item.message);
            if (parsed.action === "LOCK_STATE") return;
            const msgTimeMs = (item.time || 0) * 1000;

            if (latestGlobalReset && msgTimeMs <= latestGlobalReset) return;
            if (parsed.sector && sectorResets[parsed.sector] && msgTimeMs <= sectorResets[parsed.sector]) return;

            if (parsed.sector && parsed.answers !== undefined) {
              const sec = parsed.sector;
              if (!newCache[sec]) {
                newCache[sec] = { sector: sec, completed_count: 0, answers: {}, participants: {} };
              }
              if (!newCache[sec].participants) {
                newCache[sec].participants = {};
              }

              if (parsed.participant_name && parsed.participant_name.trim()) {
                const pName = parsed.participant_name.trim();
                newCache[sec].participants[pName] = {
                  participant_name: pName,
                  table_number: parsed.table_number || "",
                  completed_count: parsed.completed_count || 0,
                  total_count: 14,
                  completion_pct: Math.round(((parsed.completed_count || 0) / 14) * 100),
                  last_saved: parsed.last_saved || "",
                  answers: parsed.answers || {}
                };
              } else {
                newCache[sec].table_number = parsed.table_number;
                newCache[sec].completed_count = parsed.completed_count || 0;
                newCache[sec].total_count = 14;
                newCache[sec].completion_pct = Math.round(((parsed.completed_count || 0) / 14) * 100);
                newCache[sec].last_saved = parsed.last_saved;
                newCache[sec].answers = parsed.answers || {};
              }
            }
          }
        } catch(e) {}
      });
    }
  } catch (err) {}

  // Pass 3: Check localStorage for any participant progress on this machine
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("cppr_user_responses_")) {
      try {
        const parts = k.replace("cppr_user_responses_", "").split("_");
        const sec = parts[parts.length - 1];
        if (newCache[sec]) {
          const val = JSON.parse(localStorage.getItem(k));
          const pName = val.participant_name || (parts.slice(0, parts.length - 1).join(" "));
          if (pName) {
            newCache[sec].participants = newCache[sec].participants || {};
            if (!newCache[sec].participants[pName]) {
              let count = 0;
              for (const cid in (val.answers || {})) {
                const a = val.answers[cid];
                if (a && a.status && a.evidence && a.evidence.trim().length > 0) count++;
              }
              newCache[sec].participants[pName] = {
                participant_name: pName,
                table_number: val.table_number || "",
                completed_count: count,
                total_count: 14,
                completion_pct: Math.round((count / 14) * 100),
                last_saved: val.last_saved || "Saved on Device",
                answers: val.answers || {}
              };
            }
          }
        }
      } catch(e) {}
    }
  }

  adminSubmissionsCache = newCache;
  renderAdminTeams(adminSubmissionsCache);
  populateAdminIndicatorSelect();
  renderAdminComparison();
}

function resetAllSubmissions() {
  const nowMs = Date.now();
  localStorage.setItem("cppr_admin_reset_time", nowMs.toString());
  localStorage.removeItem("cppr_responses_health");
  localStorage.removeItem("cppr_responses_local");
  localStorage.removeItem("cppr_responses_education");
  localStorage.removeItem("cppr_responses_finance");

  // Clean local user responses
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("cppr_user_responses_")) {
      keysToRemove.push(k);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
  localStorage.removeItem("cppr_participants_registry");

  adminSubmissionsCache = {
    health: { sector: "health", completed_count: 0, answers: {}, participants: {} },
    local: { sector: "local", completed_count: 0, answers: {}, participants: {} },
    education: { sector: "education", completed_count: 0, answers: {}, participants: {} },
    finance: { sector: "finance", completed_count: 0, answers: {}, participants: {} }
  };

  renderAdminTeams(adminSubmissionsCache);
  renderAdminComparison();

  // Direct DOM zeroing as safety guarantee
  document.querySelectorAll(".progress-fill").forEach(el => el.style.width = "0%");
  document.querySelectorAll(".admin-status-badge").forEach(el => {
    el.textContent = "Not Started";
    el.style.background = "#f1f5f9";
    el.style.color = "#64748b";
  });

  showToast("All dashboard submissions reset to 0%!", false);

  try {
    fetch("https://ntfy.sh/cppr_workshop_affan_submissions", {
      method: "POST",
      headers: {
        "Title": "RESET: ALL TEAMS",
        "Priority": "urgent",
        "Tags": "wastebasket,warning",
        "X-Action": "RESET_ALL"
      },
      body: JSON.stringify({
        action: "RESET_ALL",
        reset_time: nowMs,
        time_str: new Date().toLocaleTimeString()
      })
    }).catch(e => {});
  } catch(e) {}

  try {
    fetch("api/reset", { method: "POST" }).catch(e => {});
  } catch(e) {}
}

function resetSingleSector(sector) {
  const secName = (appData.sectors[sector] && appData.sectors[sector].short_name) || sector.toUpperCase();
  const nowMs = Date.now();

  let sectorResets = JSON.parse(localStorage.getItem("cppr_sector_resets") || "{}");
  sectorResets[sector] = nowMs;
  localStorage.setItem("cppr_sector_resets", JSON.stringify(sectorResets));
  localStorage.removeItem(`cppr_responses_${sector}`);

  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("cppr_user_responses_") && k.endsWith(`_${sector}`)) {
      keysToRemove.push(k);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));

  adminSubmissionsCache[sector] = { sector: sector, completed_count: 0, answers: {}, participants: {} };
  renderAdminTeams(adminSubmissionsCache);
  renderAdminComparison();

  showToast(`${secName} submissions reset to 0%!`, false);

  try {
    fetch("https://ntfy.sh/cppr_workshop_affan_submissions", {
      method: "POST",
      headers: {
        "Title": `RESET: ${sector.toUpperCase()}`,
        "Priority": "urgent",
        "Tags": "wastebasket",
        "X-Action": "RESET_SECTOR"
      },
      body: JSON.stringify({
        action: "RESET_SECTOR",
        sector: sector,
        reset_time: nowMs
      })
    }).catch(e => {});
  } catch(e) {}

  try {
    fetch(`api/reset/${sector}`, { method: "POST" }).catch(e => {});
  } catch(e) {}
}

function renderAdminTeams(submissions) {
  const grid = document.getElementById("admin-teams-grid");
  grid.innerHTML = "";

  const secKeys = ["health", "local", "education", "finance"];
  secKeys.forEach(key => {
    const secInfo = appData.sectors[key];
    const sub = submissions[key] || {};
    let count = sub.completed_count || 0;
    const total = 14;
    const lastSaved = sub.last_saved || "Not started";

    const participantsMap = sub.participants || {};
    const participantsList = Object.values(participantsMap);

    // If team count is 0, check if any individual participant in this sector has progress!
    if (count === 0 && participantsList.length > 0) {
      let maxPartCount = 0;
      participantsList.forEach(p => {
        const c = p.completed_count || 0;
        if (c > maxPartCount) maxPartCount = c;
      });
      if (maxPartCount > 0) count = maxPartCount;
    }
    const pct = sub.completion_pct || Math.round((count / total) * 100);

    let statusBadge = `<span class="admin-status-badge" style="background:#f1f5f9; color:#64748b;">Not Started</span>`;
    if (count > 0 && count < total) {
      statusBadge = `<span class="admin-status-badge" style="background:#fef3c7; color:#92400e;">In Progress (${pct}%)</span>`;
    } else if (count >= total) {
      statusBadge = `<span class="admin-status-badge" style="background:#ecfdf5; color:#065f46;">✓ Complete (100%)</span>`;
    }

    let participantsListHtml = "";
    if (participantsList.length === 0) {
      participantsListHtml = `<div class="admin-participant-empty">No individual participants recorded yet</div>`;
    } else {
      participantsListHtml = participantsList.map(p => {
        const pCount = p.completed_count || 0;
        const pPct = p.completion_pct || Math.round((pCount / 14) * 100);
        let badgeStyle = "background:#f1f5f9; color:#64748b;";
        if (pPct === 100) badgeStyle = "background:#dcfce7; color:#166534;";
        else if (pCount > 0) badgeStyle = "background:#fef3c7; color:#92400e;";

        const encPart = encodeURIComponent(p.participant_name);

        return `
          <div class="admin-participant-row">
            <div>
              <span class="admin-participant-name">👤 ${escapeHtml(p.participant_name)}</span>
              <span style="color: var(--text-muted); font-size: 0.72rem; margin-left: 0.35rem;">(${escapeHtml(p.table_number || 'No table')})</span>
            </div>
            <div class="admin-participant-meta">
              <span class="admin-participant-prog" style="${badgeStyle}">
                ${pCount}/14 (${pPct}%)
              </span>
              <button type="button" class="btn-sm" style="padding: 0.2rem 0.55rem; font-size: 0.72rem; font-weight:700; background:#e0f2fe; color:#0369a1;" onclick="openInspectorModal('${key}', '${encPart}')" title="Inspect ${escapeHtml(p.participant_name)}'s completed answers">👁️ Inspect</button>
              <button type="button" class="btn-sm" style="padding: 0.2rem 0.45rem; font-size: 0.72rem;" onclick="openParticipantWorksheetDirect('${key}', '${encPart}')" title="Open full worksheet">Worksheet ➔</button>
            </div>
          </div>
        `;
      }).join("");
    }

    const isLocked = isSectorLocked(key);
    const lockPillHtml = `<span class="sector-lock-pill ${isLocked ? 'locked' : 'unlocked'}">${isLocked ? '🔒 Locked' : '🔓 Active'}</span>`;

    const card = document.createElement("div");
    card.className = "admin-card";
    card.innerHTML = `
      <div class="admin-card-header">
        <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
          <div class="admin-card-title">${escapeHtml(secInfo.display_title)}</div>
          ${lockPillHtml}
        </div>
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
      <div class="admin-participants-box">
        <div class="admin-participants-heading">
          <span>👥 Submitting Participants (${participantsList.length})</span>
        </div>
        <div class="admin-participants-list">
          ${participantsListHtml}
        </div>
      </div>
      <div class="admin-card-actions">
        <button type="button" class="btn-sm" style="${isLocked ? 'background:#fee2e2; color:#991b1b; font-weight:800; border:1.5px solid #fca5a5;' : 'background:#dcfce7; color:#166534; font-weight:800; border:1.5px solid #86efac;'}" onclick="toggleSectorLock('${key}')" title="${isLocked ? 'Click to Unlock this department' : 'Click to Lock this department'}">${isLocked ? '🔓 Unlock' : '🔒 Lock'}</button>
        <button type="button" class="btn-sm" style="flex:1.2; font-weight:700; background:#e0f2fe; color:#0369a1;" onclick="inspectGroup('${key}')" title="Inspect team evaluation">👁️ Inspect Team</button>
        <button type="button" class="btn-sm" style="flex:0.8;" onclick="viewTeamWorksheet('${key}')" title="Open full team worksheet">Worksheet</button>
        <button type="button" class="btn-sm" style="flex:1;" onclick="exportResponsesForSector('${key}', 'xlsx')">📥 Excel</button>
        <button type="button" class="btn-sm" style="flex:1;" onclick="exportResponsesForSector('${key}', 'docx')">📄 Word</button>
        <button type="button" class="btn-sm" style="background:#fee2e2; color:#991b1b;" onclick="resetSingleSector('${key}')" title="Reset this team to 0%">🔄 Reset</button>
      </div>
    `;
    grid.appendChild(card);
  });
  updateAdminLockSummaryText();
}

// INSPECTOR MODAL & VIEWS
function openInspectorModal(secKey, encodedPartName) {
  const participantName = encodedPartName ? decodeURIComponent(encodedPartName) : null;
  const secInfo = (appData && appData.sectors[secKey]) || { display_title: secKey.toUpperCase(), short_name: secKey.toUpperCase(), cards: [] };
  const subData = (adminSubmissionsCache && adminSubmissionsCache[secKey]) || {};

  let targetAnswers = {};
  let tableNumber = "";
  let lastSaved = "";
  let title = "";
  let subtitle = "";

  if (participantName) {
    title = `Participant: ${participantName}`;
    const pData = (subData.participants && (subData.participants[participantName] || subData.participants[participantName.trim()])) || {};
    targetAnswers = pData.answers || {};
    tableNumber = pData.table_number || `Table - ${participantName}`;
    lastSaved = pData.last_saved || "Saved on Device";

    // Fallback: search localStorage
    if (Object.keys(targetAnswers).length === 0) {
      const prog = getParticipantProgress(participantName, secKey);
      if (prog && prog.answers && Object.keys(prog.answers).length > 0) {
        targetAnswers = prog.answers;
        tableNumber = prog.table_number || tableNumber;
      }
    }
    subtitle = `Department: ${secInfo.display_title} | Table: ${tableNumber} | Last active: ${lastSaved}`;
  } else {
    // Group / Team inspection
    title = `Team Focus: ${secInfo.display_title}`;
    targetAnswers = subData.answers || {};
    tableNumber = subData.table_number || `Team - ${secInfo.short_name}`;
    lastSaved = subData.last_saved || "Not started";

    // Fallback: search localStorage
    if (Object.keys(targetAnswers).length === 0) {
      try {
        const localTeam = JSON.parse(localStorage.getItem(`cppr_responses_${secKey}`) || "{}");
        if (localTeam.answers && Object.keys(localTeam.answers).length > 0) {
          targetAnswers = localTeam.answers;
          tableNumber = localTeam.table_number || tableNumber;
          lastSaved = localTeam.last_saved || lastSaved;
        }
      } catch(e) {}
    }

    const pList = Object.values(subData.participants || {});
    if (Object.keys(targetAnswers).length === 0 && pList.length > 0) {
      subtitle = `Department: ${secInfo.display_title} | Individual Submissions: ${pList.map(p => p.participant_name).join(", ")}`;
    } else {
      subtitle = `Department: ${secInfo.display_title} | Table: ${tableNumber} | Last active: ${lastSaved}`;
    }
  }

  // Calculate completion count
  let completedCount = 0;
  for (const cid in targetAnswers) {
    const a = targetAnswers[cid];
    if (a && a.status && a.evidence && a.evidence.trim().length > 0) {
      completedCount++;
    }
  }
  const pct = Math.round((completedCount / 14) * 100);

  currentInspectorTarget = {
    sector: secKey,
    participant: participantName,
    answers: targetAnswers,
    table_number: tableNumber,
    last_saved: lastSaved,
    completed_count: completedCount,
    pct: pct
  };

  // Populate Header
  const deptBadge = document.getElementById("insp-dept-badge");
  if (deptBadge) deptBadge.textContent = `${secInfo.short_name.toUpperCase()} FOCUS`;

  const progBadge = document.getElementById("insp-prog-badge");
  if (progBadge) {
    progBadge.textContent = `${completedCount} / 14 Completed (${pct}%)`;
    if (pct === 100) {
      progBadge.style.background = "#dcfce7";
      progBadge.style.color = "#166534";
    } else if (completedCount > 0) {
      progBadge.style.background = "#fef3c7";
      progBadge.style.color = "#92400e";
    } else {
      progBadge.style.background = "#f1f5f9";
      progBadge.style.color = "#64748b";
    }
  }

  const titleEl = document.getElementById("insp-title");
  if (titleEl) titleEl.textContent = title;

  const subEl = document.getElementById("insp-subtitle");
  if (subEl) subEl.textContent = subtitle;

  const footerSummary = document.getElementById("insp-footer-summary");
  if (footerSummary) footerSummary.textContent = `${completedCount} of 14 Completed (${pct}%) — ${secInfo.display_title}`;

  // Reset filter buttons
  document.querySelectorAll(".insp-filter-btn").forEach(b => b.classList.remove("active"));
  const allBtn = document.getElementById("insp-flt-all");
  if (allBtn) allBtn.classList.add("active");

  renderInspectorCards("all");

  const modal = document.getElementById("inspector-modal");
  if (modal) modal.style.display = "flex";
}

function inspectGroup(secKey) {
  openInspectorModal(secKey, null);
}

function renderInspectorCards(filterMode) {
  if (!currentInspectorTarget || !appData) return;
  const container = document.getElementById("inspector-cards-list");
  if (!container) return;
  container.innerHTML = "";

  const secInfo = appData.sectors[currentInspectorTarget.sector];
  if (!secInfo) return;

  const cards = secInfo.cards || [];
  const answers = currentInspectorTarget.answers || {};

  let doneTotal = 0;
  let todoTotal = 0;

  cards.forEach(card => {
    const a = answers[card.id];
    const isDone = Boolean(a && a.status && a.evidence && a.evidence.trim().length > 0);
    if (isDone) doneTotal++;
    else todoTotal++;
  });

  const cntDoneEl = document.getElementById("insp-cnt-done");
  if (cntDoneEl) cntDoneEl.textContent = doneTotal.toString();
  const cntTodoEl = document.getElementById("insp-cnt-todo");
  if (cntTodoEl) cntTodoEl.textContent = todoTotal.toString();

  cards.forEach(card => {
    const a = answers[card.id];
    const isDone = Boolean(a && a.status && a.evidence && a.evidence.trim().length > 0);

    if (filterMode === "done" && !isDone) return;
    if (filterMode === "todo" && isDone) return;

    const cardEl = document.createElement("div");
    cardEl.className = `insp-card ${isDone ? 'is-done' : 'is-empty'}`;

    let statusBadgeHtml = `<span class="insp-status-badge empty">⚪ Not Assessed</span>`;
    if (a && a.status === "YES") {
      statusBadgeHtml = `<span class="insp-status-badge yes">✓ YES — Institutionalized</span>`;
    } else if (a && a.status === "NO") {
      statusBadgeHtml = `<span class="insp-status-badge no">✕ NO — No Evidence Found</span>`;
    } else if (a && a.status === "PARTIAL") {
      statusBadgeHtml = `<span class="insp-status-badge partial">⚠ PARTIAL — Ad-hoc / Marginal</span>`;
    }

    const pageCitation = (a && a.page_ref) || (a && a.book_page ? `Doc p. ${a.book_page} / PDF p. ${a.pdf_page || ''}` : "None recorded");
    const searchedPdf = (a && a.pdf_searched) || "Not selected";
    const evidenceText = (a && a.evidence && a.evidence.trim()) || "No transcribed evidence entered.";
    const dimensionsList = (a && a.dimensions && a.dimensions.length > 0) ? a.dimensions : [];
    const rationaleText = (a && a.rationale && a.rationale.trim()) || "No analytical rationale provided.";

    const dimsHtml = dimensionsList.length > 0
      ? dimensionsList.map(d => `<span class="insp-dim-pill">🏷️ ${escapeHtml(d)}</span>`).join("")
      : `<span style="font-size:0.75rem; color:var(--text-muted); font-style:italic;">None marked</span>`;

    cardEl.innerHTML = `
      <div class="insp-card-header">
        <div class="insp-card-title">INDICATOR ${card.id}: ${escapeHtml(card.stage.toUpperCase())}</div>
        ${statusBadgeHtml}
      </div>
      <div class="insp-card-question">${escapeHtml(card.question)}</div>

      <div class="insp-detail-grid">
        <div class="insp-meta-item">
          <strong>Assigned PDF:</strong> ${escapeHtml(searchedPdf)}
        </div>
        <div class="insp-meta-item">
          <strong>Page Citation:</strong> ${escapeHtml(pageCitation)}
        </div>
      </div>

      <div class="insp-evidence-box">
        <strong>Transcribed Verbatim Evidence & Monetary Amounts:</strong>
        ${escapeHtml(evidenceText)}
      </div>

      <div style="margin-bottom: 0.6rem;">
        <span style="font-size:0.75rem; font-weight:700; color:var(--primary-steel); text-transform:uppercase; display:block; margin-bottom:0.25rem;">Equity Dimensions:</span>
        <div class="insp-dimensions-box">
          ${dimsHtml}
        </div>
      </div>

      <div class="insp-rationale-box">
        <strong>Analytical Rationale & Findings:</strong>
        ${escapeHtml(rationaleText)}
      </div>
    `;

    container.appendChild(cardEl);
  });

  if (container.children.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--text-muted); font-style: italic;">
        No indicators match the selected filter.
      </div>
    `;
  }
}

function filterInspectorCards(mode) {
  document.querySelectorAll(".insp-filter-btn").forEach(b => b.classList.remove("active"));
  const btn = document.getElementById(`insp-flt-${mode}`);
  if (btn) btn.classList.add("active");
  renderInspectorCards(mode);
}

function closeInspectorModal() {
  const modal = document.getElementById("inspector-modal");
  if (modal) modal.style.display = "none";
}

function handleModalBackdropClick(e) {
  if (e.target && e.target.id === "inspector-modal") {
    closeInspectorModal();
  }
}

function exportCurrentInspector(fmt) {
  if (!currentInspectorTarget) return;
  const origSector = currentSector;
  const origResponses = currentResponses;
  const origParticipant = currentParticipant;

  currentSector = currentInspectorTarget.sector;
  currentParticipant = currentInspectorTarget.participant;
  currentResponses = {
    participant_name: currentInspectorTarget.participant || "",
    table_number: currentInspectorTarget.table_number || "",
    answers: currentInspectorTarget.answers || {}
  };

  exportResponses(fmt);

  currentSector = origSector;
  currentResponses = origResponses;
  currentParticipant = origParticipant;
}

function openInspectorInWorksheet() {
  if (!currentInspectorTarget) return;
  closeInspectorModal();

  isFacilitatorInspectMode = true;
  currentParticipant = currentInspectorTarget.participant;
  if (currentParticipant) {
    sessionStorage.setItem("cppr_participant_name", currentParticipant);
  } else {
    sessionStorage.removeItem("cppr_participant_name");
  }

  openSector(currentInspectorTarget.sector);
}

function viewParticipantWorksheet(secKey, encodedPartName) {
  openInspectorModal(secKey, encodedPartName);
}

function openParticipantWorksheetDirect(secKey, encodedPartName) {
  const pName = decodeURIComponent(encodedPartName);
  isFacilitatorInspectMode = true;
  currentParticipant = pName;
  sessionStorage.setItem("cppr_participant_name", pName);
  openSector(secKey);
}

function viewTeamWorksheet(secKey) {
  isFacilitatorInspectMode = true;
  currentParticipant = null;
  sessionStorage.removeItem("cppr_participant_name");
  openSector(secKey);
}

function returnToAdminDesk() {
  isFacilitatorInspectMode = false;
  currentParticipant = null;
  sessionStorage.removeItem("cppr_participant_name");
  sessionStorage.removeItem("cppr_active_sector");
  openAdmin();
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
    let ans = (sub.answers || {})[selectedCid];
    let sourceLabel = secInfo.short_name;

    // If team has no answer for this card, check if any participant in this sector answered it!
    if (!ans || (!ans.status && (!ans.evidence || !ans.evidence.trim()))) {
      const parts = Object.values(sub.participants || {});
      for (const p of parts) {
        if (p.answers && p.answers[selectedCid] && (p.answers[selectedCid].status || (p.answers[selectedCid].evidence && p.answers[selectedCid].evidence.trim()))) {
          ans = p.answers[selectedCid];
          sourceLabel = `${secInfo.short_name} (${p.participant_name})`;
          break;
        }
      }
    }
    ans = ans || {};

    let statusColor = "#64748b";
    let statusBg = "#f1f5f9";
    if (ans.status === "YES") { statusColor = "#065f46"; statusBg = "#ecfdf5"; }
    else if (ans.status === "NO") { statusColor = "#991b1b"; statusBg = "#fef2f2"; }
    else if (ans.status === "PARTIAL") { statusColor = "#92400e"; statusBg = "#fffbeb"; }

    const col = document.createElement("div");
    col.style = "background: #f8fafc; border: 1px solid var(--border-light); border-radius: 0.75rem; padding: 1rem;";
    col.innerHTML = `
      <div style="font-weight: 800; font-size: 0.95rem; color: var(--primary-navy); margin-bottom: 0.4rem;">
        ${escapeHtml(sourceLabel)}
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
