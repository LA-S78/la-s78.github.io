/**
 * js/auth-modal.js
 * Unified Proposal & Deferred Authentication Engine for Last Asylum Tools
 */

const STASH_KEY = "la_pending_proposal_stash";

// ============================================================================
// 1. DYNAMIC MODAL INJECTION & STYLING
// ============================================================================

function ensureModalDOM() {
  if (document.getElementById("proposal-dialog")) return;

  const modalHtml = `
    <dialog id="proposal-dialog" class="auth-modal">
      <div class="auth-modal-frame">
        <div class="auth-modal-header">
          <div class="auth-modal-title-wrap">
            <span class="auth-modal-icon">👑</span>
            <h3 id="auth-modal-title" class="auth-modal-title">Submit War Room Proposal</h3>
          </div>
          <button type="button" class="auth-modal-close" id="auth-modal-close-btn" aria-label="Close">&times;</button>
        </div>

        <div class="auth-modal-body">
          <div id="auth-modal-user-strip" class="auth-user-strip">
            <!-- Injected dynamically based on auth status -->
          </div>

          <div class="auth-modal-section">
            <label class="auth-modal-label">Proposal Summary</label>
            <div id="auth-modal-diff-summary" class="auth-diff-box">
              <!-- Diff list injected here -->
            </div>
          </div>

          <div class="auth-modal-section">
            <label for="auth-modal-notes" class="auth-modal-label">Leadership Notes (Optional)</label>
            <textarea 
              id="auth-modal-notes" 
              class="auth-modal-textarea" 
              placeholder="Explain the context or strategic reason for this proposal..."
              rows="3"
              maxlength="500"
            ></textarea>
          </div>

          <div id="auth-modal-error" class="auth-modal-error hidden"></div>
        </div>

        <div class="auth-modal-footer">
          <button type="button" class="btn-modal-cancel" id="auth-modal-cancel-btn">Cancel</button>
          <button type="button" class="btn-modal-action" id="auth-modal-action-btn">
            <span id="auth-btn-spinner" class="spinner hidden"></span>
            <span id="auth-btn-text">Transmit Proposal</span>
          </button>
        </div>
      </div>
    </dialog>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);

  // Bind close buttons
  const dialog = document.getElementById("proposal-dialog");
  document.getElementById("auth-modal-close-btn")?.addEventListener("click", () => closeModal());
  document.getElementById("auth-modal-cancel-btn")?.addEventListener("click", () => closeModal());
  
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) closeModal();
  });
}

function closeModal() {
  const dialog = document.getElementById("proposal-dialog");
  if (dialog && typeof dialog.close === "function") {
    if (window.closeDialogGracefully) {
      window.closeDialogGracefully(dialog);
    } else {
      dialog.close();
    }
  }
}

// ============================================================================
// 2. STASH & RETRIEVE (LOCALSTORAGE PERSISTENCE)
// ============================================================================

export function stashProposalDraft(type, payload, diffSummaryHtml = "") {
  try {
    const data = {
      type,
      payload,
      diffSummaryHtml,
      timestamp: Date.now(),
      path: window.location.pathname + window.location.search + window.location.hash
    };
    localStorage.setItem(STASH_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn("Failed to stash proposal in localStorage:", err);
  }
}

export function getStashedProposal() {
  try {
    const raw = localStorage.getItem(STASH_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Discard drafts older than 24 hours
    if (Date.now() - data.timestamp > 24 * 60 * 60 * 1000) {
      clearStashedProposal();
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
}

export function clearStashedProposal() {
  localStorage.removeItem(STASH_KEY);
}

// ============================================================================
// 3. CORE SUBMISSION ENGINE
// ============================================================================

/**
 * Triggers the unified submission flow.
 * Handles auth gating, deferred OAuth login, and direct API transmission.
 */
export async function submitProposalWithAuth({
  type, // 'map' | 'rewards' | 'alliance'
  title = "Submit War Room Proposal",
  payload, // Object matching proposal schema
  diffSummaryHtml = "<p>Pending shifts</p>",
  onSuccess = () => {},
  onError = () => {}
}) {
  ensureModalDOM();

  const dialog = document.getElementById("proposal-dialog");
  const modalTitle = document.getElementById("auth-modal-title");
  const userStrip = document.getElementById("auth-modal-user-strip");
  const diffBox = document.getElementById("auth-modal-diff-summary");
  const notesInput = document.getElementById("auth-modal-notes");
  const errorBox = document.getElementById("auth-modal-error");
  const actionBtn = document.getElementById("auth-modal-action-btn");
  const btnText = document.getElementById("auth-btn-text");
  const btnSpinner = document.getElementById("auth-btn-spinner");

  // Populate static fields
  modalTitle.textContent = title;
  diffBox.innerHTML = diffSummaryHtml;
  notesInput.value = payload.notes || "";
  errorBox.classList.add("hidden");
  errorBox.textContent = "";

  const currentUser = localStorage.getItem("auth-username");
  const currentAvatar = localStorage.getItem("auth-avatar");
  const currentRole = localStorage.getItem("auth-role") || "public";
  const currentAlliance = localStorage.getItem("auth-alliance");

  const isAuthenticated = Boolean(currentUser && currentRole !== "public");

  // Render User Auth Identity Card
  if (isAuthenticated) {
    userStrip.innerHTML = `
      <div class="auth-logged-in">
        <img src="${currentAvatar || '/images/default-avatar.png'}" class="auth-avatar-mini" alt="User Avatar" />
        <div class="auth-user-meta">
          <span class="auth-username-label">Submitting as <strong>${currentUser}</strong></span>
          <span class="auth-badge-role ${currentRole.toLowerCase()}">${currentRole.toUpperCase()}${currentAlliance ? ` • [${currentAlliance}]` : ''}</span>
        </div>
      </div>
    `;
    btnText.textContent = "Transmit to War Room";
    actionBtn.onclick = async () => {
      await performTransmission();
    };
  } else {
    userStrip.innerHTML = `
      <div class="auth-guest-notice">
        <span class="auth-guest-icon">⚠️</span>
        <div>
          <strong>Leadership Authentication Required</strong>
          <p>War Room proposals require verified Discord leadership or officer status to dispatch.</p>
        </div>
      </div>
    `;
    btnText.textContent = "Log In via Discord to Submit";
    actionBtn.onclick = () => {
      // Stash draft and payload first
      payload.notes = notesInput.value.trim();
      stashProposalDraft(type, payload, diffSummaryHtml);

      // Trigger OAuth redirect
      if (typeof window.triggerDiscordLogin === "function") {
        window.triggerDiscordLogin();
      } else {
        alert("Discord OAuth service is unreachable. Please refresh and try again.");
      }
    };
  }

  dialog.showModal();

  async function performTransmission() {
    setLoading(true);
    errorBox.classList.add("hidden");

    try {
      payload.notes = notesInput.value.trim();
      payload.submittedBy = currentUser || "Anonymous";
      payload.type = type;

      const res = await fetch("/api/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const resData = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(resData.error || `Server responded with HTTP ${res.status}`);
      }

      clearStashedProposal();
      closeModal();
      alert("✅ Proposal successfully transmitted to the War Room on Discord!");
      onSuccess(resData);
    } catch (err) {
      console.error("Proposal dispatch error:", err);
      errorBox.textContent = `❌ ${err.message}`;
      errorBox.classList.remove("hidden");
      onError(err);
    } finally {
      setLoading(false);
    }
  }

  function setLoading(isLoading) {
    actionBtn.disabled = isLoading;
    btnSpinner.classList.toggle("hidden", !isLoading);
    if (isLoading) {
      btnText.textContent = "Transmitting...";
    } else {
      btnText.textContent = isAuthenticated ? "Transmit to War Room" : "Log In via Discord to Submit";
    }
  }
}

// ============================================================================
// 4. AUTO-RESUME LISTENER (TURBO / PAGE-LOAD)
// ============================================================================

/**
 * Checks if a pending proposal was stashed before an OAuth redirect and prompts to resume.
 */
export function checkAndResumePendingProposal(handlers = {}) {
  const stashed = getStashedProposal();
  if (!stashed) return;

  const currentUser = localStorage.getItem("auth-username");
  const currentRole = localStorage.getItem("auth-role") || "public";

  // If user has returned and is authenticated
  if (currentUser && currentRole !== "public") {
    const handler = handlers[stashed.type];
    
    // Allow tool-specific reconciliation if registered
    if (handler && typeof handler.onResumed === "function") {
      handler.onResumed(stashed);
    } else {
      // Default: Pop modal immediately for final confirmation
      setTimeout(() => {
        submitProposalWithAuth({
          type: stashed.type,
          title: `Resume ${stashed.type.toUpperCase()} Proposal`,
          payload: stashed.payload,
          diffSummaryHtml: stashed.diffSummaryHtml || "<p>Draft restored from previous session.</p>",
          onSuccess: () => clearStashedProposal()
        });
      }, 350);
    }
  }
}

// Automatic check on Turbo load
if (typeof document !== "undefined") {
  document.addEventListener("turbo:load", () => checkAndResumePendingProposal());
  document.addEventListener("DOMContentLoaded", () => checkAndResumePendingProposal());
}