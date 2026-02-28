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
const welcomeScreen = document.querySelector(".welcome-screen");

// Toolbar items
const quizBtn = document.getElementById("quiz-btn");
const summarizeBtn = document.getElementById("summarize-btn");
const docInfoBadge = document.getElementById("doc-info");
const docNameEl = document.getElementById("doc-name");
const removeDocBtn = document.getElementById("remove-doc-btn");
const exportBtn = document.getElementById("export-btn");
const voiceTrigger = document.getElementById("voice-trigger");

// Sidebar
const sidebar = document.getElementById("sidebar");
const menuToggle = document.getElementById("menu-toggle");
const responseBox = document.getElementById("response-box");
const userEmailEl = document.getElementById("user-email");
const logoutBtn = document.getElementById("logout-btn");

// --- State ---
let currentSessionId = null;
const API_BASE = "http://127.0.0.1:8000";
let currentController = null;
let typingTimeout = null;
let recognition = null;
let isRecording = false;
let silenceTimer = null;

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

  // Load Sessions Sidebar
  await loadSessions();

  // Auto-load most recent session if none active
  if (!currentSessionId) {
    const history = await fetch(`${API_BASE}/sessions`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }).then((r) => r.json());

    if (history && history.length > 0) {
      switchSession(history[0]._id);
    }
  }
}

// --- Event Listeners ---

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

    if (data.error) {
      addMessage("system", `Upload Error: ${data.error}`);
    } else {
      currentSessionId = data.session_id;

      // UI Reset for new session
      chatHistory.innerHTML = "";
      if (welcomeScreen) welcomeScreen.style.display = "none";

      const docNames = Array.from(files)
        .map((f) => f.name)
        .join(", ");
      docNameEl.textContent = docNames;
      docInfoBadge.classList.remove("hidden");
      voiceTrigger.classList.remove("hidden");
      quizBtn.classList.remove("hidden");
      summarizeBtn.classList.remove("hidden");

      addMessage("system", `PDF context active: **${docNames}**.`);
      toggleInputLock(false);

      // Refresh Sidebar
      loadSessions();

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

        loadSessions();
      } catch (e) {
        alert("Failed to delete session");
      }
    },
  );
});

// 6. Tools (Quiz/Summary)
quizBtn.addEventListener("click", () => {
  queryInput.value =
    "Generate a 5-question interactive quiz based on the key concepts.";
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

  if (welcomeScreen) welcomeScreen.style.display = "none";
  addMessage("user", text);
  queryInput.value = "";
  queryInput.style.height = "24px";

  toggleInputLock(true);
  const loaderId = addLoader("Consulting Knowledge Base...");

  currentController = new AbortController();

  const formData = new FormData();
  formData.append("question", text);
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

    const data = await res.json();
    removeMessage(loaderId);

    if (data.error) {
      addMessage("system", `Error: ${data.error}`);
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
    if (err.name !== "AbortError") addMessage("system", "Network error.");
    toggleInputLock(false);
  }
}

// --- Components & Helpers ---

async function loadSessions() {
  try {
    const res = await fetch(`${API_BASE}/sessions`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const sessions = await res.json();

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
            await fetch(`${API_BASE}/sessions/${s._id}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${getToken()}` },
            });
            if (currentSessionId === s._id) {
              currentSessionId = null;
              newChatBtn.click();
            } else {
              loadSessions();
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
    } else {
      docInfoBadge.classList.add("hidden");
      voiceTrigger.classList.add("hidden");
      quizBtn.classList.add("hidden");
      summarizeBtn.classList.add("hidden");
    }

    // Restore messages
    if (data.messages && data.messages.length > 0) {
      data.messages.forEach((m) => {
        addMessage("user", m.q);
        addMessage("ai", m.a);
      });
    } else {
      addMessage("system", "Session restored. How can I help you today?");
    }

    // CRITICAL FIX: Unlock input after switching
    toggleInputLock(false);
    loadSessions(); // Highlight active
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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"></path></svg>
                </div>
                <span class="agent-name">Exmora Agent 
                    <div class="ai-status-indicator ready"><div class="status-dot"></div> Ready</div>
                </span>
                <span class="live-timestamp" data-timestamp="${timestamp}">Just now</span>
            </div>
            <div class="msg-content"></div>
            <div class="msg-actions">
                <button class="msg-action-btn" onclick="const text = this.closest('.message').querySelector('.msg-content').innerText; navigator.clipboard.writeText(text); const o=this.innerHTML; this.innerHTML='<svg width=\\'14\\' height=\\'14\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'2\\'><polyline points=\\'20 6 9 17 4 12\\'></polyline></svg> Copied'; setTimeout(()=>this.innerHTML=o,2000);"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy summary</button>
                <button class="msg-action-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg> Regenerate</button>
                <button class="msg-action-btn" onclick="document.getElementById('quiz-btn').click()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> Generate Quiz</button>
                <button class="msg-action-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg> Bookmark</button>
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
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }, 50);
  return threadDiv; // Returning entire thread to access status element easily
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

function addLoader(text = "Initializing cognitive search...") {
  const id = "loader-" + Date.now();
  const div = document.createElement("div");
  div.id = id;
  const timestamp = Date.now();
  div.className = "message bot";
  div.innerHTML = `
        <div class="agent-header">
            <div class="agent-avatar">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"></path></svg>
            </div>
            <span class="agent-name">Exmora Agent
                <div class="ai-status-indicator thinking" style="border-color: rgba(168,85,247,0.4);"><div class="status-dot pulsing"></div> Thinking...</div>
            </span>
            <span class="live-timestamp" data-timestamp="${timestamp}">Just now</span>
        </div>
        <div class="msg-content"><div style="display:flex; align-items:center; gap:12px;">
            <div class="typing-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
            <span style="font-size:0.95rem; color:var(--text-muted);">${text}</span>
        </div></div>
    `;
  chatHistory.appendChild(div);
  chatHistory.scrollTop = chatHistory.scrollHeight;
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
  
  if (statusElement) {
      statusElement.innerHTML = '<div class="status-dot pulsing"></div> Generating...';
      statusElement.style.borderColor = 'rgba(168,85,247,0.4)';
  }

  let i = 0;
  const speed = 5;
  let buffer = "";
  function step() {
    if (i < text.length) {
      buffer += text.charAt(i);
      const cleanText = buffer.replace(/\[QUIZ_JSON\][\s\S]*$/, "");
      const processedText = formatEducationalContent(cleanText);
      contentElement.innerHTML = marked.parse(processedText) + '<span class="streaming-cursor"></span>';
      i++;
      chatHistory.scrollTop = chatHistory.scrollHeight;
      typingTimeout = setTimeout(step, speed);
    } else {
      const finalCleanText = text.replace(/\[QUIZ_JSON\][\s\S]*$/, "");
      contentElement.innerHTML = marked.parse(formatEducationalContent(finalCleanText));
      renderMath(contentElement);
      enhanceCodeBlocks(contentElement);
      if(window.lucide) lucide.createIcons();
      
      if (statusElement) {
          statusElement.innerHTML = '<div class="status-dot"></div> Ready';
          statusElement.style.borderColor = 'rgba(168,85,247,0.2)';
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
  const match = fullText.match(/\[QUIZ_JSON\]([\s\S]*?)\[\/QUIZ_JSON\]/);
  if (!match) return;
  try {
    const quizData = JSON.parse(match[1]);
    const quizCard = document.createElement("div");
    quizCard.className = "glass-panel";
    quizCard.style.padding = "1.5rem";
    quizCard.style.marginTop = "1rem";
    quizCard.style.borderLeft = "4px solid var(--google-yellow)";
    quizCard.innerHTML = `<h3 style="margin-bottom:1rem;">Interactive Knowledge Check</h3>`;
    quizData.questions.forEach((q, idx) => {
      const qDiv = document.createElement("div");
      qDiv.style.marginBottom = "1.5rem";
      qDiv.innerHTML = `<div style="font-weight:500; margin-bottom:0.5rem;">${idx + 1}. ${q.q}</div>`;
      const optsDiv = document.createElement("div");
      optsDiv.style.display = "grid";
      optsDiv.style.gap = "8px";
      q.o.forEach((opt, oIdx) => {
        const btn = document.createElement("button");
        btn.textContent = opt;
        btn.className = "btn-landing-secondary";
        btn.style.textAlign = "left";
        btn.style.fontSize = "0.9rem";
        btn.onclick = () => {
          const isCorrect = oIdx === q.a;
          btn.style.borderColor = isCorrect
            ? "var(--google-green)"
            : "var(--google-red)";
          btn.style.background = isCorrect
            ? "rgba(52, 168, 83, 0.1)"
            : "rgba(234, 67, 53, 0.1)";

          const feedback = document.createElement("div");
          feedback.style.fontSize = "0.85rem";
          feedback.style.marginTop = "4px";
          feedback.style.color = isCorrect
            ? "var(--google-green)"
            : "var(--google-red)";
          feedback.textContent = isCorrect ? "Correct" : "Incorrect";

          if (!qDiv.querySelector(".feedback")) {
            toggleInputLock(false); // ensuring ease
            feedback.className = "feedback";
            qDiv.appendChild(feedback);
          }
        };
        optsDiv.appendChild(btn);
      });
      qDiv.appendChild(optsDiv);
      quizCard.appendChild(qDiv);
    });
    container.appendChild(quizCard);
  } catch (e) {
    console.error("Quiz render failed", e);
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
