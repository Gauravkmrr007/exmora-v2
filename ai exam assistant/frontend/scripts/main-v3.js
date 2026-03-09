/**
 * Exmora - Google Antigravity Edition
 * main.js - Core Logic
 */

// --- DOM Elements ---
const fileInput = document.getElementById("file-input");
const uploadTrigger = document.getElementById("upload-trigger");
const queryInput = document.getElementById("query-input");
const askBtn = document.getElementById("ask-btn");
const stopBtn = document.getElementById("stop-btn");
const newChatBtn = document.getElementById("new-chat-btn");
const chatHistory = document.getElementById("chat-history");
const chatHistoryContainer = document.getElementById("chat-history-container");
const welcomeScreen = document.querySelector(".welcome-screen");
const dropUploadArea = document.getElementById("drop-upload-area");

// Toolbar items
const quizBtn = document.getElementById("quiz-btn");
const summarizeBtn = document.getElementById("summarize-btn");
const docInfoBadge = document.getElementById("doc-info");
const docNameEl = document.getElementById("doc-name");
const removeDocBtn = document.getElementById("remove-doc-btn");
const exportBtn = document.getElementById("export-btn");
const voiceTrigger = document.getElementById("voice-trigger");
const extractInsightsBtn = document.getElementById("extract-insights-btn");
const explainConceptsBtn = document.getElementById("explain-concepts-btn");

// Sidebar
const sidebar = document.getElementById("sidebar");
const menuToggle = document.getElementById("menu-toggle");
const responseBox = document.getElementById("response-box");
const userEmailEl = document.getElementById("user-email");
const logoutBtn = document.getElementById("logout-btn");

// --- State ---
let currentSessionId = null;
const API_BASE = "https://exmora-ai.onrender.com"; 
let currentController = null;
let typingTimeout = null;
let recognition = null;
let isRecording = false;
let silenceTimer = null;

// Bookmarks stored in localStorage
const BOOKMARK_KEY = "exmora_bookmarks";
function getBookmarks() {
  try { return JSON.parse(localStorage.getItem(BOOKMARK_KEY) || "[]"); }
  catch { return []; }
}
function saveBookmarks(arr) {
  localStorage.setItem(BOOKMARK_KEY, JSON.stringify(arr));
}
function addBookmark(text) {
  const bm = getBookmarks();
  // Store full text for the modal, but the sidebar will still show a snippet
  bm.unshift({ id: Date.now(), text: text.trim(), ts: Date.now() });
  saveBookmarks(bm.slice(0, 50)); // cap at 50 most recent
  renderBookmarks();
}
function renderBookmarks() {
  const list = document.getElementById("bookmarks-list");
  const empty = document.getElementById("bookmarks-empty");
  if (!list) return;
  const bm = getBookmarks();
  // Remove existing cards
  list.querySelectorAll(".bookmark-card").forEach(el => el.remove());
  if (bm.length === 0) {
    if (empty) empty.style.display = "";
    return;
  }
  if (empty) empty.style.display = "none";
  bm.forEach(b => {
    const card = document.createElement("div");
    card.className = "bookmark-card";
    card.style.cursor = "pointer";
    card.dataset.id = b.id;
    const snippet = b.text.length > 120 ? b.text.slice(0, 120) + "…" : b.text;
    const timeStr = new Date(b.ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
    card.innerHTML = `
      <div class="bookmark-text" style="pointer-events:none;">${snippet}</div>
      <div class="bookmark-meta" style="pointer-events:none;">
        <span class="bookmark-timestamp">${timeStr}</span>
        <button class="bookmark-remove" title="Remove bookmark" data-id="${b.id}" style="pointer-events:auto;">×</button>
      </div>`;
    
    // Open modal on card click
    card.onclick = (e) => {
      if (e.target.classList.contains("bookmark-remove")) return;
      openBookmarkModal(b.id);
    };

    card.querySelector(".bookmark-remove").onclick = (e) => {
      e.stopPropagation();
      const updated = getBookmarks().filter(x => x.id !== b.id);
      saveBookmarks(updated);
      renderBookmarks();
    };
    list.appendChild(card); // Order: newest on top
  });
}

function openBookmarkModal(id) {
  const b = getBookmarks().find(x => x.id === id);
  if (!b) return;

  const modal = document.getElementById("bookmark-view-modal");
  const content = document.getElementById("bm-full-content");
  const date = document.getElementById("bm-view-date");
  const copyBtn = document.getElementById("bm-view-copy");
  const delBtn = document.getElementById("bm-view-delete");

  if (!modal || !content) return;

  // Render full markdown
  content.innerHTML = marked.parse(b.text);
  renderMath(content);
  enhanceCodeBlocks(content);
  if(window.lucide) lucide.createIcons();

  date.textContent = `Saved on ${new Date(b.ts).toLocaleString()}`;
  
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(b.text);
    const original = copyBtn.innerHTML;
    copyBtn.innerHTML = '<i data-lucide="check" size="16"></i> <span>Copied!</span>';
    lucide.createIcons();
    setTimeout(() => { copyBtn.innerHTML = original; lucide.createIcons(); }, 2000);
  };

  delBtn.onclick = () => {
    const updated = getBookmarks().filter(x => x.id !== b.id);
    saveBookmarks(updated);
    renderBookmarks();
    modal.style.display = "none";
  };

  modal.style.display = "flex";

  // Close on outside click
  modal.onclick = (e) => {
    if (e.target === modal) modal.style.display = "none";
  };
}


// --- Time Utilities ---
function getRelativeTime(timestamp) {
  const now = Date.now();
  const diffInSeconds = Math.floor((now - timestamp) / 1000);
  
  if (diffInSeconds < 60) return "Just now";
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes} min ago`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
}

function updateTimestamps() {
  document.querySelectorAll('.live-timestamp').forEach(el => {
    const ts = parseInt(el.getAttribute('data-timestamp'), 10);
    if (!isNaN(ts)) {
      el.textContent = getRelativeTime(ts);
    }
  });
}

// Start global timestamp updater (runs every 60s)
setInterval(updateTimestamps, 60000);

// --- Initialization ---
async function init() {
  // Auth Check
  const token = getToken();
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  // User Profile
  const email = getUserEmail();
  if (email && userEmailEl) {
    userEmailEl.textContent = email;
  }

  // Load session history into sidebar — but do NOT auto-load any session.
  // User always starts on a fresh new session (like ChatGPT / Perplexity).
  // They can click any previous session in the sidebar to restore it.
  await loadSessions();

  // Ensure the welcome screen is visible and input is ready for new chat
  if (welcomeScreen) {
    welcomeScreen.style.display = "flex";
  }
  // Enable input so user can type immediately (without uploading a PDF)
  queryInput.disabled = false;
  askBtn.disabled = false;

// Render any saved bookmarks into the right panel
  renderBookmarks();
  // Initial suggestions state
  toggleSuggestions(false);
}

function toggleSuggestions(enabled) {
  if (extractInsightsBtn) extractInsightsBtn.disabled = !enabled;
  if (explainConceptsBtn) explainConceptsBtn.disabled = !enabled;
}

// --- Event Listeners ---

// 0. Drag & Drop on the welcome zone
if (dropUploadArea) {
  // Clicking the zone triggers file browser
  dropUploadArea.addEventListener("click", () => {
    if (!getToken()) return (window.location.href = "login.html");
    fileInput.click();
  });
  // Prevent the browse button from double-firing
  dropUploadArea.addEventListener("click", (e) => {
    if (e.target.classList.contains("drop-browse-btn")) e.stopPropagation();
  });

  ["dragenter", "dragover"].forEach(evt =>
    dropUploadArea.addEventListener(evt, (e) => {
      e.preventDefault(); e.stopPropagation();
      dropUploadArea.classList.add("drag-over");
    })
  );
  ["dragleave", "drop"].forEach(evt =>
    dropUploadArea.addEventListener(evt, (e) => {
      e.preventDefault(); e.stopPropagation();
      dropUploadArea.classList.remove("drag-over");
    })
  );
  dropUploadArea.addEventListener("drop", (e) => {
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    // Inject into the real file input and fire change
    const dt = new DataTransfer();
    for (let i = 0; i < Math.min(files.length, 3); i++) dt.items.add(files[i]);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event("change"));
  });
}

// Also allow drop anywhere on the chat feed when welcome screen is shown
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  if (!welcomeScreen || welcomeScreen.style.display === "none") return;
  e.preventDefault();
  const files = e.dataTransfer.files;
  if (!files || files.length === 0) return;
  const dt = new DataTransfer();
  for (let i = 0; i < Math.min(files.length, 3); i++) dt.items.add(files[i]);
  fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event("change"));
});

// 1. Text Input Auto-Resize
queryInput.addEventListener("input", () => {
  queryInput.style.height = "24px";
  queryInput.style.height = queryInput.scrollHeight + "px";
});

// 2. Submit Query
askBtn.addEventListener("click", handleAsk);
queryInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleAsk();
  }
});

// 3. Stop Generation
if (stopBtn) {
  stopBtn.addEventListener("click", () => {
    if (currentController) currentController.abort();
    if (typingTimeout) clearTimeout(typingTimeout);
    currentController = null;
    typingTimeout = null;
    removeLoader();
    toggleInputLock(false);
    addMessage("system", "Generation stopped.");
  });
}

// 4. File Upload
uploadTrigger.addEventListener("click", () => {
  if (!getToken()) return (window.location.href = "login.html");
  fileInput.click();
});

fileInput.addEventListener("change", async () => {
  const files = fileInput.files;
  if (files.length === 0) return;
  if (files.length > 3) return alert("Maximum 3 files allowed.");

  const loaderId = addLoader("Uploading to Cloud Storage...");
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append("files", files[i]);
  }

  try {
    const res = await fetch(`${API_BASE}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    });
    const data = await res.json();
    removeMessage(loaderId);
 
    if (!res.ok || data.error) {
      addMessage("system", `Upload Error (${res.status}): ${data.error || data.detail || "Unauthorized or Server Error"}`);
      if (res.status === 401) {
          addMessage("system", "⚠️ **Session expired on AI server**. Please log out and log back in to refresh your credentials.");
      }
    } else {
      currentSessionId = data.session_id;

      // UI Reset for new session
      chatHistory.innerHTML = "";
      chatHistory.appendChild(welcomeScreen);
      if (welcomeScreen) welcomeScreen.style.display = "flex";

      const docNames = Array.from(files)
        .map((f) => f.name)
        .join(", ");
      docNameEl.textContent = docNames;
      docInfoBadge.classList.remove("hidden");
      voiceTrigger.classList.remove("hidden");
      quizBtn.classList.remove("hidden");
      summarizeBtn.classList.remove("hidden");
      toggleSuggestions(true);

      addMessage("system", `PDF context active: **${docNames}**.`);
      toggleInputLock(false);

      // Refresh Sidebar
      loadSessions();
      // Load Quiz History for the new document
      loadQuizHistory(files[0].name);

      // Update Context Suggestions dynamically
      const suggestionsBox = document.querySelector('#context-suggestions .quick-tools');
      if (suggestionsBox) {
        suggestionsBox.innerHTML = `
          <button class="q-tool-btn" onclick="document.getElementById('quiz-btn').click()"><i data-lucide="brain" size="16"></i> <span>Gen Active Recall Quiz</span></button>
          <button class="q-tool-btn" onclick="document.getElementById('summarize-btn').click()"><i data-lucide="align-left" size="16"></i> <span>Summarize Attached PDF</span></button>
        `;
        if (window.lucide) lucide.createIcons();
      }
    }
  } catch (err) {
    removeMessage(loaderId);
    addMessage("system", "Upload failed. Check console.");
  }
});

// 5. Remove Document (Delete Session)
removeDocBtn.addEventListener("click", async () => {
  if (!currentSessionId) return;

  showCustomConfirm(
    "Delete Source?",
    "Are you sure you want to remove this document and its associated session history?",
    async () => {
      try {
        await fetch(`${API_BASE}/sessions/${currentSessionId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${getToken()}` },
        });

        currentSessionId = null;
        chatHistory.innerHTML = "";
        chatHistory.appendChild(welcomeScreen);
        welcomeScreen.style.display = "flex";
        docInfoBadge.classList.add("hidden");
        toggleSuggestions(false);

        loadSessions();
      } catch (e) {
        alert("Failed to delete session");
      }
    },
  );
});

// 6. Tools (Quiz/Summary)
quizBtn.addEventListener("click", () => {
  const countMatch = queryInput.value.match(/(\d+)\s*(?:question|test|quiz)/i);
  let count = 5;
  if (countMatch) {
    count = Math.min(Math.max(parseInt(countMatch[1]), 1), 25);
  }
  queryInput.value = `Generate a ${count}-question interactive quiz based on the key concepts of this document.`;
  handleAsk();
});

summarizeBtn.addEventListener("click", () => {
  queryInput.value =
    "Provide a comprehensive technical summary of this document.";
  handleAsk();
});

// 7. New Chat
newChatBtn.addEventListener("click", () => {
  currentSessionId = null;
  chatHistory.innerHTML = "";
  chatHistory.appendChild(welcomeScreen);
  welcomeScreen.style.display = "flex";
  docInfoBadge.classList.add("hidden");
  quizBtn.classList.add("hidden");
  summarizeBtn.classList.add("hidden");
  toggleSuggestions(false);
  queryInput.disabled = false;
  askBtn.disabled = false;
});

// 8. Logout
logoutBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  showCustomConfirm(
    "Logout",
    "Are you sure you want to end your research session?",
    () => logout(),
  );
});

// Mobile Sidebar Toggle
if (menuToggle) {
  menuToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    sidebar.classList.toggle("open");
  });
}
document.addEventListener("click", (e) => {
  if (
    sidebar.classList.contains("open") &&
    !sidebar.contains(e.target) &&
    !menuToggle.contains(e.target)
  ) {
    sidebar.classList.remove("open");
  }
});

// 9. Voice Input (Speech-to-Text)
if (voiceTrigger) {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      isRecording = true;
      voiceTrigger.classList.add("recording");
      voiceTrigger.title = "Stop Recording";
      queryInput.placeholder = "Listening...";
      resetSilenceTimer();
    };

    function resetSilenceTimer() {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        if (isRecording) {
          recognition.stop();
        }
      }, 3000);
    }

    recognition.onresult = (event) => {
      resetSilenceTimer();
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        queryInput.value += (queryInput.value ? " " : "") + finalTranscript;
        queryInput.dispatchEvent(new Event("input")); // Trigger auto-resize
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech Recognition Error:", event.error);
      stopRecordingUI();
    };

    recognition.onend = () => {
      stopRecordingUI();
    };

    voiceTrigger.addEventListener("click", () => {
      if (!isRecording) {
        try {
          recognition.start();
        } catch (e) {
          console.error(e);
        }
      } else {
        recognition.stop();
      }
    });

    function stopRecordingUI() {
      if (silenceTimer) clearTimeout(silenceTimer);
      isRecording = false;
      voiceTrigger.classList.remove("recording");
      voiceTrigger.title = "Voice Input";
      queryInput.placeholder = "Enter instructions or query...";
    }
  } else {
    voiceTrigger.style.display = "none"; // Hide if not supported
  }
}

// --- Core Logic ---

async function handleAsk() {
  if (!getToken()) return (window.location.href = "login.html");

  const text = queryInput.value.trim();
  if (!text) return;

  // Detect and append instructions for interactive quiz requests
  let processedText = text;
  const quizTriggerKeywords = ["quiz", "test", "questions", "knowledge check"];
  const isQuizRequest = quizTriggerKeywords.some(k => text.toLowerCase().includes(k)) && !text.includes("[QUIZ_JSON]");

  if (isQuizRequest) {
    const countMatch = text.match(/(\d+)/);
    let count = 5;
    if (countMatch) {
      count = Math.min(Math.max(parseInt(countMatch[1]), 1), 25);
    }
    processedText += ` \n\nIMPORTANT: Return exactly ${count} quiz questions as a valid JSON object wrapped in [QUIZ_JSON] (at start) and [/QUIZ_JSON] (at end) tags.
Return STRICTLY VALID JSON.
Format:
{
  "quiz": [
    {
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correct_answer": 0,
      "explanation": "..."
    }
  ]
}`;
  }

  if (welcomeScreen) welcomeScreen.style.display = "none";
  addMessage("user", text);
  queryInput.value = "";
  queryInput.style.height = "24px";

  toggleInputLock(true);
  const loaderId = addLoader("Consulting Knowledge Base...");

  currentController = new AbortController();

  const formData = new FormData();
  formData.append("question", processedText);
  if (currentSessionId) formData.append("session_id", currentSessionId);

  try {
    // 1. Enforce backend rate limit by checking with Node API
    const authServerBase = "https://exmora-auth.onrender.com"; // Connect to express backend
    const quotaRes = await fetch(`${authServerBase}/api/prompt/ask`, {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${getToken()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ check: true }) 
    });

    const quotaData = await quotaRes.json();
    
    // If rate limit hit (429) or other errors, block prompt
    if (!quotaRes.ok) {
        removeMessage(loaderId);
        addMessage("system", `⚠️ **${quotaData.error || quotaData.message || "Request blocked"}**`);
        toggleInputLock(false);
        return; // Prevent passing request to AI
    }

    // 2. If quota is OK, proceed with querying the AI Python backend
    const res = await fetch(`${API_BASE}/ask`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
      signal: currentController.signal,
    });

    let data;
    try {
        data = await res.json();
    } catch (jsonErr) {
        console.error("Failed to parse JSON response:", jsonErr);
        removeMessage(loaderId);
        addMessage("system", `⚠️ **Server error (${res.status})**: The server returned an invalid response. Please try again or check the server status.`);
        toggleInputLock(false);
        return;
    }

    removeMessage(loaderId);

    if (!res.ok) {
      const errorText = data.error || data.detail || JSON.stringify(data) || "Server error";
      addMessage("system", `Error (${res.status}): ${errorText}`);
      toggleInputLock(false);
    } else if (!data.answer) {
      console.warn("Server returned success but no answer:", data);
      addMessage("system", "⚠️ **Technical Error**: The AI server didn't provide an answer. Please try slightly rephrasing your question.");
      toggleInputLock(false);
    } else {
      currentSessionId = data.session_id; 
      const msgDiv = createMessageDiv("ai");
      typeWriter(msgDiv, data.answer, () => {
        toggleInputLock(false);
        loadSessions();
      });
    }
  } catch (err) {
    removeMessage(loaderId);
    if (err.name !== "AbortError") {
      const msg = err.message || "Unknown error";
      console.error("Critical handleAsk error:", err);
      addMessage("system", `⚠️ **Network error**: ${msg}. This usually happens if the AI server is sleeping or under heavy load. Please refresh and try one more time.`);
    }
    toggleInputLock(false);
  }
}

// --- Components & Helpers ---

async function loadSessions() {
  try {
    const res = await fetch(`${API_BASE}/sessions`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    
    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("Sessions fetch failed:", res.status, errorData);
        if (res.status === 401) {
            addMessage("system", "⚠️ **Authentication Error**: Your session is invalid on the AI server. Please try logging out and back in.");
        }
        return;
    }
    
    const sessions = await res.json();
    if (!Array.isArray(sessions)) {
        console.error("Sessions response is not an array:", sessions);
        return;
    }

    responseBox.innerHTML = "";
    sessions.forEach((s) => {
      const item = document.createElement("div");
      item.className = "history-item";
      if (s._id === currentSessionId) {
        item.classList.add("active");
        item.style.background = "var(--tech-bg-hover)";
        item.style.borderLeft = "2px solid var(--google-blue)";
      }

      item.title = s.title || "Untitled Session";
      item.innerHTML = `
                <div class="history-icon-only" style="display:none; align-items:center; justify-content:center; color:#94a3b8;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                </div>
                <div class="history-content" style="display:flex; justify-content:space-between; align-items:center; width:100%; pointer-events:none;">
                    <span class="history-title" style="flex:1; overflow:hidden; text-overflow:ellipsis;">${s.title || "Untitled Session"}</span>
                    <button class="delete-session-btn" data-id="${s._id}" style="background:none; color:var(--tech-text-secondary); opacity:0.5; font-size:1.2rem; pointer-events:auto;">×</button>
                </div>
            `;

      item.onclick = (e) => {
        if (e.target.classList.contains("delete-session-btn")) return;
        switchSession(s._id);
        if (window.innerWidth <= 768) sidebar.classList.remove("open");
      };

      // Delete button
      const delBtn = item.querySelector(".delete-session-btn");
      delBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            `;
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        showCustomConfirm(
          "Delete Session",
          "This action cannot be undone. Delete this session?",
          async () => {
            // ✅ Remove from DOM INSTANTLY — don't wait for the API
            item.style.transition = "opacity 0.2s, transform 0.2s";
            item.style.opacity = "0";
            item.style.transform = "translateX(-8px)";
            setTimeout(() => item.remove(), 200);

            // If deleting active session → reset to new chat immediately
            if (currentSessionId === s._id) {
              currentSessionId = null;
              chatHistory.innerHTML = "";
              chatHistory.appendChild(welcomeScreen);
              welcomeScreen.style.display = "flex";
              docInfoBadge.classList.add("hidden");
              quizBtn.classList.add("hidden");
              summarizeBtn.classList.add("hidden");
              queryInput.disabled = false;
              askBtn.disabled = false;
            }

            // Fire API delete in background — no reload needed
            try {
              await fetch(`${API_BASE}/sessions/${s._id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${getToken()}` },
              });
            } catch (err) {
              console.error("Session delete API error", err);
            }
          },
        );
      };

      responseBox.appendChild(item);
    });
  } catch (e) {
    console.error("Failed to load sessions", e);
  }
}

async function switchSession(id) {
  if (id === currentSessionId && chatHistory.children.length > 1) return;

  currentSessionId = id;
  const loaderId = addLoader("Restoring session context...");

  try {
    const res = await fetch(`${API_BASE}/sessions/${id}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const data = await res.json();
    removeMessage(loaderId);

    chatHistory.innerHTML = "";
    // Hide by default, we will decide to show it if no messages exist
    if (welcomeScreen) welcomeScreen.style.display = "none";

    // Restore Doc context UI
    if (data.title && (data.documents || data.text)) {
      // If documents list exists, show filenames, else show title
      if (data.documents && data.documents.length > 0) {
        docNameEl.textContent = data.documents
          .map((d) => d.filename)
          .join(", ");
      } else {
        docNameEl.textContent = data.title;
      }
      docInfoBadge.classList.remove("hidden");
      voiceTrigger.classList.remove("hidden");
      quizBtn.classList.remove("hidden");
      summarizeBtn.classList.remove("hidden");
      toggleSuggestions(true);
    } else {
      docInfoBadge.classList.add("hidden");
      voiceTrigger.classList.add("hidden");
      quizBtn.classList.add("hidden");
      summarizeBtn.classList.add("hidden");
      toggleSuggestions(false);
    }

    // Restore messages
    if (data.messages && data.messages.length > 0) {
      if (welcomeScreen) welcomeScreen.style.display = "none";
      data.messages.forEach((m) => {
        addMessage("user", m.q);
        addMessage("ai", m.a);
      });
    } else {
      // No messages, show welcome screen (which will have suggestions enabled/disabled via toggleSuggestions below)
      chatHistory.appendChild(welcomeScreen);
      if (welcomeScreen) welcomeScreen.style.display = "flex";
    }

    // CRITICAL FIX: Unlock input after switching
    toggleInputLock(false);
    loadSessions(); // Highlight active
    
    // Load Quiz History for the switched document
    if (docNameEl.textContent && docNameEl.textContent !== "Document Context") {
        loadQuizHistory(docNameEl.textContent);
    }
  } catch (e) {
    removeMessage(loaderId);
    addMessage("system", "Error loading session.");
    toggleInputLock(false);
  }
}

function updateSidebarActive() {
  const items = responseBox.querySelectorAll(".history-item");
  // Simple refresh is easier
  loadSessions();
}

function createMessageDiv(role) {
  const threadDiv = document.createElement("div");
  const roleClass = role === "ai" || role === "system" ? "bot" : "user";
  threadDiv.className = `message ${roleClass}`;
  const timestamp = Date.now();

  if (role === "ai" || role === "system") {
    threadDiv.innerHTML = `
            <div class="agent-header">
                <div class="agent-avatar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"></path></svg>
                </div>
                <div class="agent-name">
                    <span>Exmora</span>
                    <div class="ai-status-indicator ready">
                        <div class="status-dot"></div> 
                        <span class="status-text">Ready</span>
                    </div>
                </div>
                <span class="live-timestamp" data-timestamp="${timestamp}">Just now</span>
            </div>
            <div class="msg-content"></div>
            <div class="msg-actions">
                <button class="msg-action-btn" title="Copy text" onclick="const text = this.closest('.message').querySelector('.msg-content').innerText; navigator.clipboard.writeText(text); const o=this.innerHTML; this.innerHTML='<svg viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'2\\'><polyline points=\\'20 6 9 17 4 12\\'></polyline></svg> Copied'; setTimeout(()=>this.innerHTML=o,2000);">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    Copy
                </button>
                <button class="msg-action-btn" title="Regenerate answer">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg>
                    Regen
                </button>
                <button class="msg-action-btn" title="Generate quiz" onclick="document.getElementById('quiz-btn').click()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    Quiz
                </button>
                <button class="msg-action-btn" title="Save to bookmarks" onclick="const txt=this.closest('.message').querySelector('.msg-content').innerText; addBookmark(txt); const o=this.innerHTML; this.innerHTML='✓ Saved'; setTimeout(()=>this.innerHTML=o,2000);">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>
                    Save
                </button>
            </div>
        `;
  } else {
    threadDiv.innerHTML = `
      <div class="user-header">
          <span class="user-name">You</span>
          <span class="live-timestamp" data-timestamp="${timestamp}">Just now</span>
      </div>
      <div class="msg-content"></div>
    `;
  }

  chatHistory.appendChild(threadDiv);
  setTimeout(() => {
    chatHistoryContainer.scrollTop = chatHistoryContainer.scrollHeight;
  }, 50);
  return threadDiv; 
}

// --- Pre-Process Format Hook for Educational Calling ---
function formatEducationalContent(text) {
    let formattedText = text;
    // Look for patterns like **Key Concept:** or similar, replace with structured HTML divs
    formattedText = formattedText.replace(/\*\*(?:Key Concept|Concept)\s*:\*\*([\s\S]*?)(?=\n\n|\*$|$)/gi, '<div class="key-concept"><strong><i data-lucide="key" size="14"></i> Key Concept:</strong>$1</div>');
    formattedText = formattedText.replace(/\*\*(?:Exam Tip|Tip)\s*:\*\*([\s\S]*?)(?=\n\n|\*$|$)/gi, '<div class="exam-tip"><strong><i data-lucide="award" size="14"></i> Exam Tip:</strong>$1</div>');
    formattedText = formattedText.replace(/\*\*(?:Common Mistake|Mistake|Warning)\s*:\*\*([\s\S]*?)(?=\n\n|\*$|$)/gi, '<div class="common-mistake"><strong><i data-lucide="alert-triangle" size="14"></i> Common Mistake:</strong>$1</div>');
    return formattedText;
}

function addMessage(role, text) {
  const containerDiv = createMessageDiv(role);
  const contentDiv = containerDiv.querySelector(".msg-content");
  
  if (role === "ai" || role === "system") {
    let processedText = formatEducationalContent(text);
    contentDiv.innerHTML = marked.parse(processedText);
    renderMath(contentDiv);
    enhanceCodeBlocks(contentDiv);
    if(window.lucide) lucide.createIcons();
  } else {
    contentDiv.textContent = text;
  }
}

function addLoader(text = "Exmora Agent is thinking...") {
  const id = "loader-" + Date.now();
  const div = document.createElement("div");
  div.id = id;
  const timestamp = Date.now();
  div.className = "message bot";
  div.innerHTML = `
        <div class="agent-header">
            <div class="agent-avatar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"></path></svg>
            </div>
            <div class="agent-name">
                <span>Exmora</span>
                <div class="ai-status-indicator thinking">
                    <div class="status-dot pulsing"></div> 
                    <span class="status-text">Thinking...</span>
                </div>
            </div>
            <span class="live-timestamp" data-timestamp="${timestamp}">Just now</span>
        </div>
        <div class="msg-content">
            <div style="display:flex; align-items:center; gap:16px; padding: 4px 0;">
                <div class="typing-dots">
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                </div>
                <span style="font-size:0.95rem; color:#64748b; font-weight: 500;">${text}</span>
            </div>
        </div>
    `;
  chatHistory.appendChild(div);
  chatHistoryContainer.scrollTop = chatHistoryContainer.scrollHeight;
  return id;
}

function removeMessage(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function removeLoader() {
  const loaders = document.querySelectorAll('[id^="loader-"]');
  loaders.forEach((el) => el.remove());
}

function toggleInputLock(locked) {
  queryInput.disabled = locked;
  askBtn.disabled = locked;
  askBtn.classList.toggle("hidden", locked);
  stopBtn.classList.toggle("hidden", !locked);
  if (!locked) queryInput.focus();
}

function typeWriter(containerElement, text, callback) {
  const contentElement = containerElement.querySelector(".msg-content") || containerElement;
  const statusElement = containerElement.querySelector('.ai-status-indicator');
  const statusText = containerElement.querySelector('.status-text');
  
  if (statusElement) {
      statusElement.className = 'ai-status-indicator generating';
      if(statusText) statusText.innerText = 'Generating...';
      statusElement.style.borderColor = 'rgba(37,99,235,0.4)';
  }

  let i = 0;
  const speed = 5;
  let buffer = "";
  function step() {
    if (!text) {
        if (onComplete) onComplete();
        return;
    }
    if (i < text.length) {
      buffer += text.charAt(i);
      const cleanText = buffer.replace(/\[QUIZ_JSON\][\s\S]*$/, "").trim();
      const processedText = formatEducationalContent(cleanText);
      
      if (processedText === "" && text.includes("[QUIZ_JSON]")) {
          contentElement.innerHTML = '<div style="display:flex; align-items:center; gap:10px; color:var(--text-dim); font-size:0.9rem; margin-bottom:10px;"><div class="status-dot pulsing"></div> Building interactive quiz...</div>';
      } else {
          contentElement.innerHTML = marked.parse(processedText) + '<span class="streaming-cursor"></span>';
      }
      
      i++;
      chatHistoryContainer.scrollTop = chatHistoryContainer.scrollHeight;
      typingTimeout = setTimeout(step, speed);
    } else {
      const finalCleanText = text.replace(/\[QUIZ_JSON\][\s\S]*$/, "").trim();
      contentElement.innerHTML = marked.parse(formatEducationalContent(finalCleanText));
      renderMath(contentElement);
      enhanceCodeBlocks(contentElement);
      if(window.lucide) lucide.createIcons();
      
      if (statusElement) {
          statusElement.className = 'ai-status-indicator ready';
          if(statusText) statusText.innerText = 'Ready';
          statusElement.style.borderColor = 'rgba(37,99,235,0.2)';
      }

      if (text.includes("[QUIZ_JSON]")) renderQuizArtifact(text, contentElement);
      if (callback) callback();
    }
  }
  step();
}

function enhanceCodeBlocks(container) {
  const preBlocks = container.querySelectorAll("pre");
  preBlocks.forEach((pre) => {
    if (pre.querySelector(".code-header")) return;
    const code = pre.querySelector("code");
    const langMatch = (code.className || "").match(/language-(\w+)/);
    const lang = langMatch ? langMatch[1] : "code";
    const header = document.createElement("div");
    header.className = "code-header";
    header.innerHTML = `<span>${lang}</span><button class="copy-btn">Copy</button>`;
    const copyBtn = header.querySelector(".copy-btn");
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(code.innerText);
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy"), 2000);
    };
    pre.prepend(header);
  });
}

// --- Math & Quiz Renderers (Same as before but styled) ---
function renderMath(el) {
  if (window.renderMathInElement) {
    window.renderMathInElement(el, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
      ],
      throwOnError: false,
    });
  }
}

function renderQuizArtifact(fullText, container) {
  // More robust split to extract JSON content
  let rawData = fullText.split('[QUIZ_JSON]')[1]?.split('[/QUIZ_JSON]')[0];
  if (!rawData) return;
  
  // Clean up potential markdown code blocks returned by LLM
  rawData = rawData.replace(/```json/g, "").replace(/```/g, "").trim();
  
  try {
    const data = JSON.parse(rawData);
    const questions = data.quiz || data.questions;
    if (!questions || !questions.length) return;

    let currentIdx = 0;
    let score = 0;
    let userAnswers = [];

    const quizRoot = document.createElement("div");
    quizRoot.className = "quiz-container";
    container.appendChild(quizRoot);

    function renderQuestion(idx) {
      const q = questions[idx];
      const isLast = idx === questions.length - 1;
      
      quizRoot.innerHTML = `
        <div class="quiz-header">
           <span class="quiz-progress">Question ${idx + 1} of ${questions.length}</span>
           <span class="quiz-score-live">Score: ${score}</span>
        </div>
        <div class="quiz-question-text">${q.question}</div>
        <div class="quiz-options"></div>
        <div class="quiz-feedback hidden"></div>
        <div class="quiz-nav hidden">
           <button class="quiz-next-btn">
             ${isLast ? 'See Results' : 'Next Question'} 
             <i data-lucide="${isLast ? 'check-circle' : 'arrow-right'}" size="18"></i>
           </button>
        </div>
      `;

      const optionsBox = quizRoot.querySelector(".quiz-options");
      const feedbackBox = quizRoot.querySelector(".quiz-feedback");
      const navBox = quizRoot.querySelector(".quiz-nav");
      const nextBtn = quizRoot.querySelector(".quiz-next-btn");

      q.options.forEach((opt, oIdx) => {
        const btn = document.createElement("button");
        btn.className = "quiz-option";
        btn.innerHTML = `<span class="opt-label">${String.fromCharCode(65 + oIdx)}</span> ${opt}`;
        btn.onclick = () => {
          if (btn.classList.contains("disabled")) return;
          
          const isCorrect = oIdx === q.correct_answer;
          userAnswers[idx] = oIdx;
          
          if (isCorrect) {
            score++;
            btn.classList.add("correct");
          } else {
            btn.classList.add("incorrect");
            optionsBox.children[q.correct_answer].classList.add("correct");
          }

          // Disable all
          Array.from(optionsBox.children).forEach(b => b.classList.add("disabled"));
          
          // Show feedback
          feedbackBox.innerHTML = `<strong>${isCorrect ? 'Correct!' : 'Incorrect'}</strong><br>${q.explanation || ''}`;
          feedbackBox.className = `quiz-feedback ${isCorrect ? 'key-concept' : 'common-mistake'}`;
          feedbackBox.classList.remove("hidden");
          
          // Show nav
          navBox.classList.remove("hidden");
          quizRoot.querySelector(".quiz-score-live").textContent = `Score: ${score}`;
        };
        optionsBox.appendChild(btn);
      });

      nextBtn.onclick = () => {
        if (isLast) showResults();
        else renderQuestion(idx + 1);
      };

      if (window.lucide) lucide.createIcons();
    }

    function showResults() {
      const percent = Math.round((score / questions.length) * 100);
      let message = "Excellent work! You have a strong grasp of these concepts.";
      if (percent < 50) message = "Review the document again to strengthen your understanding.";
      else if (percent < 80) message = "Good job! A little more review will make you an expert.";

      const docName = document.getElementById("doc-name")?.textContent || "Unknown Document";

      quizRoot.innerHTML = `
        <div class="quiz-results-card">
          <div class="results-score-circle">
            <span class="results-score-num">${score}/${questions.length}</span>
            <span class="results-score-label">${percent}%</span>
          </div>
          <h2 class="results-title">Quiz Completed 🎉</h2>
          <p class="results-msg">${message}</p>
          <div class="results-actions" style="margin-bottom: 12px;">
            <button class="quiz-save-btn" style="background: var(--primary); padding: 12px 20px; border-radius: 12px; color: #fff; font-weight: 600; cursor: pointer; border: none; flex: 1; max-width: 160px; display: flex; align-items: center; justify-content: center; gap: 8px;">
               <i data-lucide="save" size="18"></i> Save Result
            </button>
          </div>
          <div class="results-actions">
            <button class="quiz-retry-btn">Retry Quiz</button>
            <button class="quiz-new-btn">New Quiz</button>
          </div>
        </div>
      `;

      if (window.lucide) lucide.createIcons();

      quizRoot.querySelector(".quiz-save-btn").onclick = async (e) => {
          const btn = e.currentTarget;
          const original = btn.innerHTML;
          btn.innerHTML = '<i data-lucide="loader-2" class="spin" size="18"></i> Saving...';
          lucide.createIcons();
          
          const resultData = {
              document_name: docName,
              session_id: currentSessionId,
              total_questions: questions.length,
              correct_answers: score,
              accuracy_percentage: percent,
              quiz_data: {
                  questions: questions.map((q, idx) => ({
                      ...q,
                      user_answer: userAnswers[idx]
                  }))
              }
          };

          try {
              const res = await fetch(`${API_BASE}/quiz/save`, {
                  method: "POST",
                  headers: { 
                      "Authorization": `Bearer ${getToken()}`,
                      "Content-Type": "application/json"
                  },
                  body: JSON.stringify(resultData)
              });
              if (res.ok) {
                  btn.innerHTML = '<i data-lucide="check" size="18"></i> Saved!';
                  btn.style.background = "var(--google-green)";
                  btn.disabled = true;
                  loadQuizHistory(docName);
              } else {
                  btn.innerHTML = 'Error Saving';
              }
          } catch (err) {
              btn.innerHTML = 'Failed';
          }
          lucide.createIcons();
      };

      quizRoot.querySelector(".quiz-retry-btn").onclick = () => {
        score = 0;
        currentIdx = 0;
        userAnswers = [];
        renderQuestion(0);
      };

      quizRoot.querySelector(".quiz-new-btn").onclick = () => {
        quizBtn.click();
      };
    }

    renderQuestion(0);

  } catch (e) {
    console.error("Quiz render failed", e);
    container.innerHTML += '<div class="common-mistake">Failed to parse interactive quiz data.</div>';
  }
}

// --- Quiz History & Learning Insights ---
async function loadQuizHistory(filename) {
    const listContainer = document.getElementById('quiz-history-list');
    const insightsContainer = document.getElementById('quiz-insights-container');
    if (!listContainer || !filename) return;

    try {
        const res = await fetch(`${API_BASE}/quiz/history/${encodeURIComponent(filename)}`, {
            headers: { "Authorization": `Bearer ${getToken()}` }
        });
        const history = await res.json();
        
        if (!history || history.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align:center; padding:24px 0; color:#475569; font-size:0.85rem;">
                    <i data-lucide="bar-chart-2" size="28" style="color:#334155; display:block; margin:0 auto 10px;"></i>
                    No quiz history for this document yet.
                </div>
            `;
            insightsContainer.innerHTML = "";
            if (window.lucide) lucide.createIcons();
            return;
        }

        renderQuizHistory(history, listContainer);
        analyzeLearningProgress(history, insightsContainer);
        if (window.lucide) lucide.createIcons();
    } catch (e) {
        console.error("Failed to load quiz history", e);
    }
}

function renderQuizHistory(history, container) {
    let html = '';
    
    // Progress Trend Micro-Chart
    const recentScores = history.slice(0, 5).reverse().map(h => h.accuracy_percentage);
    if (recentScores.length > 1) {
        html += `
            <div class="progress-trend-container">
                <div class="trend-title"><i data-lucide="trending-up" size="14"></i> Progress Trend</div>
                <div class="trend-bar-group">
                    ${recentScores.map(s => `<div class="trend-bar" style="height: ${Math.max(s, 10)}%;" title="${s}%"></div>`).join('')}
                </div>
            </div>
        `;
    }

    // Attempt Cards
    history.forEach((attempt, idx) => {
        const scoreClass = attempt.accuracy_percentage >= 80 ? 'score-high' : (attempt.accuracy_percentage >= 50 ? 'score-mid' : 'score-low');
        const dateStr = new Date(attempt.timestamp).toLocaleDateString();
        
        html += `
            <div class="quiz-history-item" onclick="viewQuizAttempt('${attempt._id}')">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:0.85rem; font-weight:600; color:#fff;">Attempt #${history.length - idx}</span>
                    <span class="history-score-tag ${scoreClass}">${attempt.correct_answers} / ${attempt.total_questions}</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
                     <span style="font-size:0.75rem; color:var(--text-dim);">${dateStr}</span>
                     <span style="font-size:0.75rem; color:var(--primary); font-weight:500;">${attempt.accuracy_percentage}% Accurate</span>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function analyzeLearningProgress(history, container) {
    if (!history || history.length === 0) return;
    
    // Simple logic to find topics from failed questions if available
    // In a real app, you'd parse keywords from the question text
    let weakInsights = "";
    const lastAttempt = history[0];
    
    if (lastAttempt.accuracy_percentage < 100) {
        weakInsights = `
            <div class="insight-card">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                    <i data-lucide="info" size="14" style="color:var(--primary);"></i>
                    <h5>Smart Insights</h5>
                </div>
                <p>Based on your last attempt, focus on reviewing the sections regarding <strong>concepts from incorrect answers</strong>.</p>
                <div style="margin-top:8px;">
                    <span class="weak-topic-pill">Key Concepts</span>
                    <span class="weak-topic-pill">Critical Details</span>
                </div>
                <button onclick="quizBtn.click()" style="margin-top:12px; width:100%; padding:8px; border-radius:8px; background:rgba(37,99,235,0.1); border:1px solid var(--primary); color:var(--primary); font-size:0.75rem; font-weight:600; cursor:pointer;">
                    Generate Targeted Quiz
                </button>
            </div>
        `;
    }

    container.innerHTML = weakInsights;
}

// Global function to view a previous attempt details in a modal
async function viewQuizAttempt(id) {
    const modal = document.getElementById('quiz-attempt-modal');
    if (!modal) return;
    
    // In a real app, you'd fetch the full attempt data by ID
    // For this context, we can search the already loaded history or fetch again
    try {
        const res = await fetch(`${API_BASE}/sessions/${currentSessionId}`, { // This is a bit of a hack, better dedicated endpoint
             headers: { "Authorization": `Bearer ${getToken()}` }
        });
        // Since we don't have a GET /quiz/result/{id} yet, we'll try to find it in the current history list 
        // Or if we want to be perfect, we add the endpoint. Let's assume we can fetch it.
        // For now, let's find it in the current list if it was already loaded.
        
        // Let's assume the user just wants to see the summary we already have or we fetch it.
        // Actually, let's just implement the UI for the modal populating from a fetched object.
        
        // I will use a placeholder fetch or use the data passed if possible.
        // To keep it clean, I'll fetch the history again and find the match.
        const docName = document.getElementById("doc-name")?.textContent;
        const hRes = await fetch(`${API_BASE}/quiz/history/${encodeURIComponent(docName)}`, {
            headers: { "Authorization": `Bearer ${getToken()}` }
        });
        const history = await hRes.json();
        const attempt = history.find(a => a._id === id);
        
        if (!attempt) return;

        document.getElementById('qa-modal-date').textContent = `Date: ${new Date(attempt.timestamp).toLocaleString()}`;
        document.getElementById('qa-modal-score').textContent = `${attempt.correct_answers} / ${attempt.total_questions}`;
        document.getElementById('qa-modal-accuracy').textContent = `${attempt.accuracy_percentage}%`;
        
        const qContainer = document.getElementById('qa-modal-questions');
        qContainer.innerHTML = "";
        
        if (attempt.quiz_data && attempt.quiz_data.questions) {
            attempt.quiz_data.questions.forEach((q, idx) => {
                const isCorrect = q.user_answer === q.correct_answer;
                const qDiv = document.createElement('div');
                qDiv.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
                qDiv.style.paddingBottom = "16px";
                qDiv.innerHTML = `
                    <div style="font-size:0.95rem; font-weight:600; color:#fff; margin-bottom:12px;">${idx+1}. ${q.question}</div>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        ${q.options.map((opt, oIdx) => {
                            let style = "background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); color:#94a3b8;";
                            let icon = "";
                            if (oIdx === q.correct_answer) {
                                style = "background:rgba(34, 197, 94, 0.1); border:1px solid #22c55e; color:#fff;";
                                icon = '<i data-lucide="check" size="14" style="margin-left:auto; color:#22c55e;"></i>';
                            } else if (oIdx === q.user_answer && !isCorrect) {
                                style = "background:rgba(239, 68, 68, 0.1); border:1px solid #ef4444; color:#fff;";
                                icon = '<i data-lucide="x" size="14" style="margin-left:auto; color:#ef4444;"></i>';
                            }
                            return `<div style="padding:10px 14px; border-radius:10px; font-size:0.85rem; display:flex; align-items:center; ${style}">${opt}${icon}</div>`;
                        }).join('')}
                    </div>
                    ${q.explanation ? `<div style="margin-top:12px; font-size:0.8rem; color:var(--text-dim); background:rgba(255,255,255,0.02); padding:10px; border-radius:8px;"><strong>Exmoor Insight:</strong> ${q.explanation}</div>` : ''}
                `;
                qContainer.appendChild(qDiv);
            });
        }
        
        modal.style.display = 'flex';
        if (window.lucide) lucide.createIcons();
    } catch (e) {
        console.error("Failed to view attempt", e);
    }
}

// --- Custom Modal System ---
function showCustomConfirm(title, message, onConfirm) {
  const modal = document.getElementById("custom-modal");
  const titleEl = document.getElementById("modal-title");
  const messageEl = document.getElementById("modal-message");
  const confirmBtn = document.getElementById("modal-confirm");
  const cancelBtn = document.getElementById("modal-cancel");

  titleEl.textContent = title;
  messageEl.textContent = message;

  modal.classList.remove("hidden");

  const handleConfirm = () => {
    close();
    if (onConfirm) onConfirm();
  };

  const close = () => {
    modal.classList.add("hidden");
    confirmBtn.removeEventListener("click", handleConfirm);
    cancelBtn.removeEventListener("click", close);
    modal.removeEventListener("click", handleOutsideClick);
  };

  const handleOutsideClick = (e) => {
    if (e.target === modal) close();
  };

  confirmBtn.addEventListener("click", handleConfirm);
  cancelBtn.addEventListener("click", close);
  modal.addEventListener("click", handleOutsideClick);
}

// --- Productivity Features ---

// 1. Hover Text Selection Toolbar
document.addEventListener('selectionchange', () => {
    const selToolbar = document.getElementById('selection-toolbar');
    if (!selToolbar) return;
    
    const selection = window.getSelection();
    const activeText = selection.toString().trim();
    
    // Ensure we are selecting within a chat message and not in inputs or modals
    if (activeText && selection.anchorNode && 
        document.querySelector('.chat-feed').contains(selection.anchorNode) &&
        !document.getElementById('cmd-palette').contains(document.activeElement)) {
        
        try {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            
            selToolbar.style.left = `${rect.left + (rect.width / 2)}px`;
            selToolbar.style.top = `${rect.top - 10}px`;
            selToolbar.style.display = 'flex';
        } catch (e) {}
    } else {
        selToolbar.style.display = 'none';
    }
});

document.querySelectorAll('.sel-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const action = e.currentTarget.dataset.action;
        const text = window.getSelection().toString();
        const selToolbar = document.getElementById('selection-toolbar');
        
        if (selToolbar) selToolbar.style.display = 'none';
        window.getSelection().removeAllRanges();
        
        if (action === 'copy') {
            navigator.clipboard.writeText(text);
        } else if (action === 'explain') {
            queryInput.value = `Explain this deeper: "${text}"`;
            handleAsk();
        } else if (action === 'simplify') {
            queryInput.value = `Simplify this for a beginner: "${text}"`;
            handleAsk();
        }
    });
});

// 2. Command Palette & Shortcuts
const cmdPalette = document.getElementById('cmd-palette');
const cmdInput = document.getElementById('cmd-input');

if (cmdPalette && cmdInput) {
    // Hide on outside click
    cmdPalette.addEventListener('click', (e) => {
        if(e.target === cmdPalette) cmdPalette.style.display = 'none';
    });
    
    // Command filtering
    cmdInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        document.querySelectorAll('.cmd-item').forEach(item => {
            if (item.innerText.toLowerCase().includes(term)) item.style.display = 'flex';
            else item.style.display = 'none';
        });
    });
    
    // Command selection
    document.querySelectorAll('.cmd-item').forEach(item => {
        item.addEventListener('click', () => {
            cmdPalette.style.display = 'none';
            const action = item.dataset.action;
            if (action === 'new-session') newChatBtn.click();
            else if (action === 'upload-doc') uploadTrigger.click();
            else if (action === 'generate-quiz') quizBtn.click();
            else if (action === 'toggle-focus') document.body.classList.toggle('focus-mode');
        });
    });
}

window.addEventListener('keydown', (e) => {
    // Command Palette (⌘K)
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (cmdPalette) {
            if (cmdPalette.style.display === 'none') {
                cmdPalette.style.display = 'flex';
                cmdInput.value = '';
                cmdInput.dispatchEvent(new Event('input')); // trigger reset
                setTimeout(() => cmdInput.focus(), 50);
            } else {
                cmdPalette.style.display = 'none';
            }
        }
    }
    
    // Escape standard binds
    if (e.key === 'Escape') {
        if (cmdPalette && cmdPalette.style.display !== 'none') cmdPalette.style.display = 'none';
        const selToolbar = document.getElementById('selection-toolbar');
        if (selToolbar) selToolbar.style.display = 'none';
    }
    
    // Toggle Left Sidebar (⌘B)
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        const sidebarToggleBtn = document.getElementById('sidebar-collapse-btn');
        if(sidebarToggleBtn) sidebarToggleBtn.click();
    }
    
    // Toggle Right Insight Panel (⌘⇧R)
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        const insightToggleBtn = document.getElementById('insight-collapse-btn');
        if(insightToggleBtn) insightToggleBtn.click();
    }
    
    // Toggle Focus Mode (⌘\)
    if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        document.body.classList.toggle('focus-mode');
    }
    
    // Run Query (⌘↵)
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if(!askBtn.disabled) handleAsk();
    }
});

// --- Responsive Layout Enforcement ---
function handleResponsiveLayout() {
    const insightPanel = document.getElementById('insight-panel');
    const insightToggle = document.getElementById('insight-collapse-btn');
    
    if (window.innerWidth < 1024) {
        if (insightPanel && insightPanel.parentNode) {
            window._cachedInsightPanel = insightPanel;
            insightPanel.parentNode.removeChild(insightPanel);
        }
        if (insightToggle && insightToggle.parentNode) {
            window._cachedInsightToggle = insightToggle;
            insightToggle.parentNode.removeChild(insightToggle);
        }
    } else {
        const container = document.querySelector('.app-container');
        if (!document.getElementById('insight-panel') && window._cachedInsightPanel && container) {
            container.appendChild(window._cachedInsightToggle);
            container.appendChild(window._cachedInsightPanel);
        }
    }
}
window.addEventListener('resize', handleResponsiveLayout);
handleResponsiveLayout();

// Start
init();
