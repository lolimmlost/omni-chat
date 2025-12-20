const socket = io();

let currentSessionId = null;
let sessions = {};
let timerInterval = null;
let adminTypingTimeout = null;
let visitorTypingMap = {}; // sessionId -> isTyping
let soundEnabled = localStorage.getItem('admin-sound') !== 'false';
let notificationsEnabled = false;

// Config
const INACTIVE_WARNING_MS = 3 * 60 * 1000; // 3 min - yellow warning
const INACTIVE_EXPIRED_MS = 5 * 60 * 1000; // 5 min - red expired
const CONTACT_MESSAGE = "Thanks for chatting! For detailed inquiries, please use the contact form on the website or email me directly. Have a great day!";

// DOM Elements
const authScreen = document.getElementById('auth-screen');
const tokenInput = document.getElementById('token-input');
const authBtn = document.getElementById('auth-btn');
const authError = document.getElementById('auth-error');
const app = document.getElementById('app');
const sessionList = document.getElementById('session-list');
const sessionCount = document.getElementById('session-count');
const noSession = document.getElementById('no-session');
const chatView = document.getElementById('chat-view');
const chatSite = document.getElementById('chat-site');
const chatStatus = document.getElementById('chat-status');
const chatTimer = document.getElementById('chat-timer');
const messages = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const closeSessionBtn = document.getElementById('close-session-btn');
const closeContactBtn = document.getElementById('close-contact-btn');
const clearInactiveBtn = document.getElementById('clear-inactive-btn');
const clearAllBtn = document.getElementById('clear-all-btn');
const typingIndicator = document.getElementById('typing-indicator');
const visitorInfoBtn = document.getElementById('visitor-info-btn');
const visitorInfoPanel = document.getElementById('visitor-info-panel');
const infoDevice = document.getElementById('info-device');
const infoBrowser = document.getElementById('info-browser');
const infoOs = document.getElementById('info-os');
const infoScreen = document.getElementById('info-screen');
const infoLanguage = document.getElementById('info-language');
const infoIp = document.getElementById('info-ip');
const infoReferrer = document.getElementById('info-referrer');
const infoPageCount = document.getElementById('info-page-count');
const infoPageJourney = document.getElementById('info-page-journey');
const sessionSearch = document.getElementById('session-search');
const sessionFilter = document.getElementById('session-filter');
const sessionMetaBtn = document.getElementById('session-meta-btn');
const sessionMetaPanel = document.getElementById('session-meta-panel');
const sessionNotes = document.getElementById('session-notes');
const sessionTagsEl = document.getElementById('session-tags');
const tagInput = document.getElementById('tag-input');
const addTagBtn = document.getElementById('add-tag-btn');

let searchQuery = '';
let filterStatus = 'all';
let currentSessionTags = [];
let notesDebounce = null;
let suggestionsLoading = false;

// Suggested replies elements
const suggestedReplies = document.getElementById('suggested-replies');
const suggestedList = document.getElementById('suggested-list');
const refreshSuggestionsBtn = document.getElementById('refresh-suggestions-btn');

// Auth
authBtn.addEventListener('click', authenticate);
tokenInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') authenticate();
});

function authenticate() {
  const token = tokenInput.value.trim();
  if (!token) return;

  socket.emit('admin:auth', { token }, (response) => {
    if (response.success) {
      authScreen.classList.add('hidden');
      app.classList.remove('hidden');
      loadSessions();
      startTimerUpdates();
      requestNotificationPermission();
    } else {
      authError.textContent = response.error || 'Authentication failed';
    }
  });
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(permission => {
      notificationsEnabled = permission === 'granted';
    });
  } else if (Notification.permission === 'granted') {
    notificationsEnabled = true;
  }
}

function showDesktopNotification(title, body, sessionId) {
  if (!notificationsEnabled || document.hasFocus()) return;
  const notification = new Notification(title, {
    body,
    icon: '/admin/favicon.ico',
    tag: sessionId
  });
  notification.onclick = () => {
    window.focus();
    if (sessionId) joinSession(sessionId);
    notification.close();
  };
  setTimeout(() => notification.close(), 5000);
}

// Timer updates
function startTimerUpdates() {
  timerInterval = setInterval(() => {
    renderSessionList();
    updateCurrentSessionTimer();
  }, 1000);
}

function updateCurrentSessionTimer() {
  if (!currentSessionId || !sessions[currentSessionId]) return;
  const session = sessions[currentSessionId];
  const lastActivity = session.lastActivity || session.createdAt;
  chatTimer.textContent = formatTimeSince(lastActivity);
  chatTimer.className = 'timer ' + getTimerClass(lastActivity);
}

function formatTimeSince(timestamp) {
  const elapsed = Date.now() - timestamp;
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function getTimerClass(timestamp) {
  const elapsed = Date.now() - timestamp;
  if (elapsed >= INACTIVE_EXPIRED_MS) return 'expired';
  if (elapsed >= INACTIVE_WARNING_MS) return 'warning';
  return '';
}

// Load sessions
function loadSessions() {
  socket.emit('admin:list-sessions', (response) => {
    if (response.sessions) {
      response.sessions.forEach(s => {
        sessions[s.id] = {
          ...s,
          lastActivity: s.lastMessage?.timestamp || s.createdAt,
          needsResponse: s.lastMessage?.role === 'visitor'
        };
      });
      renderSessionList();
    }
  });
}

// Render session list
function renderSessionList() {
  let list = Object.values(sessions)
    .filter(s => s.status !== 'closed')
    .filter(s => {
      // Filter by status
      if (filterStatus !== 'all' && s.status !== filterStatus) return false;
      // Filter by search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (s.siteId || '').toLowerCase().includes(q) ||
               (s.id || '').toLowerCase().includes(q) ||
               (s.lastMessage?.content || '').toLowerCase().includes(q) ||
               (s.visitorInfo?.pageUrl || '').toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      // Sort by needs response first, then by last activity
      if (a.needsResponse && !b.needsResponse) return -1;
      if (!a.needsResponse && b.needsResponse) return 1;
      return (b.lastActivity || b.createdAt) - (a.lastActivity || a.createdAt);
    });

  sessionCount.textContent = list.length;

  sessionList.innerHTML = list.map(s => {
    const lastActivity = s.lastActivity || s.createdAt;
    const timerClass = getTimerClass(lastActivity);
    const needsResponseClass = s.needsResponse ? 'needs-response' : '';
    const activeClass = s.id === currentSessionId ? 'active' : '';

    return `
      <li class="session-item ${activeClass} ${needsResponseClass}" data-id="${s.id}">
        <div class="meta">
          <span class="site-badge">${s.siteId}</span>
          <span class="status ${s.status}">${formatStatus(s.status)}</span>
          <span class="session-timer ${timerClass}">${formatTimeSince(lastActivity)}</span>
        </div>
        <div class="preview">${s.lastMessage ? escapeHtml(s.lastMessage.content) : 'No messages yet'}</div>
      </li>
    `;
  }).join('');

  // Attach click handlers
  sessionList.querySelectorAll('.session-item').forEach(item => {
    item.addEventListener('click', () => {
      joinSession(item.dataset.id);
    });
  });
}

function formatStatus(status) {
  const map = {
    'active': 'Active',
    'waiting_human': 'Waiting',
    'waiting_ai': 'AI',
    'closed': 'Closed'
  };
  return map[status] || status;
}

// Join session
function joinSession(sessionId) {
  if (currentSessionId) {
    socket.emit('admin:leave-session', { sessionId: currentSessionId });
  }

  currentSessionId = sessionId;
  socket.emit('admin:join-session', { sessionId });
}

// Socket events
socket.on('admin:session-joined', (data) => {
  const session = data.session;
  const lastMsg = session.messages[session.messages.length - 1];
  sessions[session.id] = {
    ...session,
    lastActivity: lastMsg?.timestamp || session.createdAt,
    needsResponse: lastMsg?.role === 'visitor',
    visitorInfo: session.visitorInfo || {}
  };

  noSession.classList.add('hidden');
  chatView.classList.remove('hidden');
  visitorInfoPanel.classList.add('hidden');
  sessionMetaPanel.classList.add('hidden');
  hideSuggestions();

  chatSite.textContent = session.siteId;
  updateStatusBadge(session.status);
  updateCurrentSessionTimer();
  updateVisitorInfo();
  loadSessionMeta(session);
  renderMessages(session.messages);
  renderSessionList();

  // Display feedback if present
  const feedbackEl = document.getElementById('session-feedback');
  if (session.feedback) {
    displayFeedback(session.feedback.rating, session.feedback.comment);
  } else {
    feedbackEl.classList.add('hidden');
  }

  // Mark visitor messages as seen
  socket.emit('admin:mark-seen', { sessionId: session.id });

  messageInput.focus();
});

socket.on('admin:session-created', (data) => {
  sessions[data.id] = {
    ...data,
    lastActivity: data.createdAt,
    needsResponse: false,
    visitorInfo: data.visitorInfo || {}
  };
  renderSessionList();
});

socket.on('admin:session-activity', (data) => {
  const { sessionId, message } = data;
  if (!sessions[sessionId]) {
    sessions[sessionId] = { id: sessionId, messages: [] };
  }
  sessions[sessionId].lastMessage = message;
  sessions[sessionId].lastActivity = message.timestamp;
  sessions[sessionId].needsResponse = message.role === 'visitor';

  if (sessionId === currentSessionId) {
    appendMessage(message);
    // Mark as seen if viewing this session
    if (message.role === 'visitor') {
      socket.emit('admin:mark-seen', { sessionId });
      // Auto-fetch suggestions for visitor messages
      fetchSuggestions();
    }
  }

  renderSessionList();

  // Only ping if visitor message AND session is waiting for human
  if (message.role === 'visitor' && sessions[sessionId]?.status === 'waiting_human') {
    playNotification(sessionId, message.content);
  }
});

socket.on('admin:session-status', (data) => {
  const { sessionId, status } = data;
  if (sessions[sessionId]) {
    sessions[sessionId].status = status;
  }
  if (sessionId === currentSessionId) {
    updateStatusBadge(status);
  }
  renderSessionList();

  // Ping when visitor requests human help
  if (status === 'waiting_human') {
    playNotification(sessionId, 'Visitor is waiting for help');
  }
});

socket.on('admin:visitor-disconnected', (data) => {
  if (sessions[data.sessionId]) {
    sessions[data.sessionId].visitorDisconnected = true;
  }
});

socket.on('admin:visitor-page-change', (data) => {
  const { sessionId, page } = data;
  if (!sessions[sessionId]) return;

  // Initialize visitorInfo if needed
  if (!sessions[sessionId].visitorInfo) {
    sessions[sessionId].visitorInfo = {};
  }
  if (!sessions[sessionId].visitorInfo.pageJourney) {
    sessions[sessionId].visitorInfo.pageJourney = [];
  }

  // Add the new page visit
  sessions[sessionId].visitorInfo.pageJourney.push(page);
  sessions[sessionId].visitorInfo.pageUrl = page.url;
  sessions[sessionId].visitorInfo.pageTitle = page.title;

  // Update UI if viewing this session
  if (sessionId === currentSessionId) {
    renderPageJourney(sessions[sessionId].visitorInfo.pageJourney);
  }
});

socket.on('admin:typing', (data) => {
  const { sessionId, role, isTyping } = data;
  if (role === 'visitor') {
    visitorTypingMap[sessionId] = isTyping;
    if (sessionId === currentSessionId) {
      updateTypingIndicator();
    }
  }
});

socket.on('typing', (data) => {
  if (data.role === 'visitor' && currentSessionId) {
    visitorTypingMap[currentSessionId] = data.isTyping;
    updateTypingIndicator();
  }
});

socket.on('message', (message) => {
  if (currentSessionId) {
    appendMessage(message);
  }
});

socket.on('admin:session-feedback', (data) => {
  const { sessionId, rating, comment } = data;
  if (sessions[sessionId]) {
    sessions[sessionId].feedback = { rating, comment };
  }
  if (sessionId === currentSessionId) {
    displayFeedback(rating, comment);
  }
  renderSessionList();
});

socket.on('admin:messages-seen', (data) => {
  const { sessionId, messageIds } = data;
  if (!messageIds || !Array.isArray(messageIds)) return;

  // Update local session data
  if (sessions[sessionId]) {
    const sessionMessages = sessions[sessionId].messages || [];
    sessionMessages.forEach(m => {
      if (messageIds.includes(m.id)) {
        m.seen = true;
      }
    });
  }

  // Update visible messages if viewing this session
  if (sessionId === currentSessionId) {
    messageIds.forEach(id => {
      const el = messages.querySelector(`[data-id="${id}"] .read-status`);
      if (el) {
        el.textContent = '✓✓';
        el.title = 'Seen';
      }
    });
  }
});

socket.on('ai:chunk', (data) => {
  let aiMsg = messages.querySelector('.ai-streaming');
  if (!aiMsg) {
    aiMsg = document.createElement('div');
    aiMsg.className = 'message ai ai-streaming';
    aiMsg.innerHTML = '<div class="role">AI</div><div class="content"></div>';
    messages.appendChild(aiMsg);
  }
  aiMsg.querySelector('.content').textContent += data.chunk;
  messages.scrollTop = messages.scrollHeight;
});

socket.on('ai:complete', (data) => {
  const aiMsg = messages.querySelector('.ai-streaming');
  if (aiMsg) {
    aiMsg.classList.remove('ai-streaming');
  }
});

// Render messages
function renderMessages(msgList) {
  messages.innerHTML = msgList.map(m => createMessageHTML(m)).join('');
  messages.scrollTop = messages.scrollHeight;
}

function appendMessage(msg) {
  messages.insertAdjacentHTML('beforeend', createMessageHTML(msg));
  messages.scrollTop = messages.scrollHeight;
}

function createMessageHTML(msg) {
  const time = new Date(msg.timestamp).toLocaleTimeString();
  const roleLabel = msg.role === 'visitor' ? 'Visitor' : msg.role === 'ai' ? 'AI' : 'You';
  const readStatus = (msg.role === 'admin' || msg.role === 'ai')
    ? `<span class="read-status" title="${msg.seen ? 'Seen' : 'Delivered'}">${msg.seen ? '✓✓' : '✓'}</span>`
    : '';
  return `
    <div class="message ${msg.role}" data-id="${msg.id}">
      <div class="role">${roleLabel}</div>
      <div class="content">${escapeHtml(msg.content)}</div>
      <div class="time">${time}${readStatus}</div>
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function updateStatusBadge(status) {
  chatStatus.textContent = formatStatus(status);
  chatStatus.className = `status ${status}`;
}

function updateTypingIndicator() {
  const isTyping = visitorTypingMap[currentSessionId];
  typingIndicator.classList.toggle('hidden', !isTyping);
}

function displayFeedback(rating, comment) {
  const feedbackEl = document.getElementById('session-feedback');
  if (feedbackEl) {
    const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
    feedbackEl.innerHTML = `
      <div class="feedback-rating">${stars} <span class="rating-number">(${rating}/5)</span></div>
      ${comment ? `<div class="feedback-comment">"${escapeHTML(comment)}"</div>` : ''}
    `;
    feedbackEl.classList.remove('hidden');
  }
}

function emitAdminTyping() {
  if (!currentSessionId) return;
  if (adminTypingTimeout) clearTimeout(adminTypingTimeout);
  socket.emit('admin:typing', { sessionId: currentSessionId });
  adminTypingTimeout = setTimeout(() => {
    adminTypingTimeout = null;
  }, 2000);
}

// Send message
sendBtn.addEventListener('click', () => sendMessage());
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});
messageInput.addEventListener('input', () => {
  if (messageInput.value.trim()) {
    emitAdminTyping();
  }
});

function sendMessage(content) {
  const msg = content || messageInput.value.trim();
  if (!msg || !currentSessionId) return;

  socket.emit('admin:message', { sessionId: currentSessionId, content: msg });
  messageInput.value = '';

  // Update local state
  if (sessions[currentSessionId]) {
    sessions[currentSessionId].needsResponse = false;
    sessions[currentSessionId].lastActivity = Date.now();
  }
  renderSessionList();
}

// Quick responses
document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const msg = btn.dataset.msg;
    if (msg) sendMessage(msg);
  });
});

// Visitor info toggle
visitorInfoBtn.addEventListener('click', () => {
  visitorInfoPanel.classList.toggle('hidden');
});

// Session meta (notes/tags) panel
sessionMetaBtn.addEventListener('click', () => {
  sessionMetaPanel.classList.toggle('hidden');
});

sessionNotes.addEventListener('input', () => {
  if (notesDebounce) clearTimeout(notesDebounce);
  notesDebounce = setTimeout(() => {
    saveSessionMeta();
  }, 500);
});

addTagBtn.addEventListener('click', addTag);
tagInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') addTag();
});

function addTag() {
  const tag = tagInput.value.trim().toLowerCase();
  if (!tag || currentSessionTags.includes(tag) || currentSessionTags.length >= 10) return;

  currentSessionTags.push(tag);
  tagInput.value = '';
  renderTags();
  saveSessionMeta();
}

function removeTag(tag) {
  currentSessionTags = currentSessionTags.filter(t => t !== tag);
  renderTags();
  saveSessionMeta();
}

function renderTags() {
  sessionTagsEl.innerHTML = currentSessionTags.map(tag => {
    const tagClass = ['vip', 'bug', 'sales', 'support'].includes(tag) ? tag : '';
    return `<span class="tag ${tagClass}">${escapeHTML(tag)}<button class="tag-remove" data-tag="${escapeHTML(tag)}">&times;</button></span>`;
  }).join('');

  sessionTagsEl.querySelectorAll('.tag-remove').forEach(btn => {
    btn.addEventListener('click', () => removeTag(btn.dataset.tag));
  });
}

function saveSessionMeta() {
  if (!currentSessionId) return;
  socket.emit('admin:update-session-meta', {
    sessionId: currentSessionId,
    notes: sessionNotes.value,
    tags: currentSessionTags
  });
}

function loadSessionMeta(session) {
  sessionNotes.value = session.notes || '';
  currentSessionTags = session.tags || [];
  renderTags();
}

socket.on('admin:session-meta-updated', (data) => {
  const { sessionId, notes, tags } = data;
  if (sessions[sessionId]) {
    sessions[sessionId].notes = notes;
    sessions[sessionId].tags = tags;
  }
  if (sessionId === currentSessionId) {
    sessionNotes.value = notes;
    currentSessionTags = tags;
    renderTags();
  }
});

// Suggested replies
refreshSuggestionsBtn.addEventListener('click', fetchSuggestions);

function fetchSuggestions() {
  if (!currentSessionId || suggestionsLoading) return;

  suggestionsLoading = true;
  suggestedList.innerHTML = '<span class="suggested-loading">Generating suggestions...</span>';
  suggestedReplies.classList.remove('hidden');

  socket.emit('admin:get-quick-replies', { sessionId: currentSessionId }, (response) => {
    suggestionsLoading = false;
    if (response.replies && response.replies.length > 0) {
      renderSuggestions(response.replies);
    } else {
      suggestedList.innerHTML = '<span class="suggested-loading">No suggestions available</span>';
    }
  });
}

function renderSuggestions(replies) {
  suggestedList.innerHTML = replies.map(reply =>
    `<button class="suggested-btn" title="${escapeHtml(reply)}">${escapeHtml(reply)}</button>`
  ).join('');

  suggestedList.querySelectorAll('.suggested-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sendMessage(btn.title);
      suggestedReplies.classList.add('hidden');
    });
  });
}

function hideSuggestions() {
  suggestedReplies.classList.add('hidden');
  suggestedList.innerHTML = '';
}

// Canned Responses
const cannedModal = document.getElementById('canned-modal');
const cannedBtn = document.getElementById('canned-responses-btn');
const cannedModalClose = cannedModal.querySelector('.modal-close');
const cannedTextInput = document.getElementById('canned-text');
const cannedCategory = document.getElementById('canned-category');
const addCannedBtn = document.getElementById('add-canned-btn');
const cannedListEl = document.getElementById('canned-list');

let cannedResponses = [];

cannedBtn.addEventListener('click', () => {
  cannedModal.classList.remove('hidden');
  loadCannedResponses();
});

cannedModalClose.addEventListener('click', () => {
  cannedModal.classList.add('hidden');
});

cannedModal.addEventListener('click', (e) => {
  if (e.target === cannedModal) {
    cannedModal.classList.add('hidden');
  }
});

addCannedBtn.addEventListener('click', addCannedResponse);
cannedTextInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') addCannedResponse();
});

function loadCannedResponses() {
  socket.emit('admin:get-canned-responses', (response) => {
    cannedResponses = response.responses || [];
    renderCannedResponses();
  });
}

function addCannedResponse() {
  const text = cannedTextInput.value.trim();
  if (!text) return;

  socket.emit('admin:add-canned-response', {
    text,
    category: cannedCategory.value
  }, (response) => {
    if (response.response) {
      cannedTextInput.value = '';
    }
  });
}

function deleteCannedResponse(id) {
  socket.emit('admin:delete-canned-response', { id });
}

function useCannedResponse(text) {
  if (currentSessionId) {
    sendMessage(text);
    cannedModal.classList.add('hidden');
  }
}

function renderCannedResponses() {
  if (cannedResponses.length === 0) {
    cannedListEl.innerHTML = '<p style="color:#888;text-align:center;">No saved responses yet</p>';
    return;
  }

  cannedListEl.innerHTML = cannedResponses.map(r => `
    <div class="canned-item" data-id="${r.id}">
      <span class="canned-item-text" title="Click to use">${escapeHtml(r.text)}</span>
      <span class="canned-item-category">${escapeHtml(r.category)}</span>
      <button class="canned-item-delete" title="Delete">&times;</button>
    </div>
  `).join('');

  cannedListEl.querySelectorAll('.canned-item-text').forEach(el => {
    el.addEventListener('click', () => useCannedResponse(el.textContent));
  });

  cannedListEl.querySelectorAll('.canned-item-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.closest('.canned-item').dataset.id;
      deleteCannedResponse(id);
    });
  });
}

socket.on('admin:canned-response-added', (response) => {
  cannedResponses.push(response);
  renderCannedResponses();
});

socket.on('admin:canned-response-deleted', (data) => {
  cannedResponses = cannedResponses.filter(r => r.id !== data.id);
  renderCannedResponses();
});

function updateVisitorInfo() {
  const session = sessions[currentSessionId];
  if (!session || !session.visitorInfo) {
    visitorInfoPanel.classList.add('hidden');
    return;
  }
  const info = session.visitorInfo;

  // Device info
  const device = info.device || {};
  const deviceIcons = { desktop: '🖥️', mobile: '📱', tablet: '📱', unknown: '❓' };
  infoDevice.innerHTML = `<span class="device-icon">${deviceIcons[device.type] || deviceIcons.unknown}</span>${device.type || 'Unknown'}`;

  // Browser
  const browserVersion = device.browserVersion ? ` ${device.browserVersion}` : '';
  infoBrowser.textContent = (device.browser || 'Unknown') + browserVersion;

  // OS
  infoOs.textContent = device.os || 'Unknown';

  // Screen
  if (info.screen && info.viewport) {
    infoScreen.textContent = `${info.screen.width}×${info.screen.height} (viewport: ${info.viewport.width}×${info.viewport.height})`;
  } else if (info.screen) {
    infoScreen.textContent = `${info.screen.width}×${info.screen.height}`;
  } else {
    infoScreen.textContent = 'Unknown';
  }

  // Language
  infoLanguage.textContent = info.language || 'Unknown';

  // IP
  infoIp.textContent = info.ip || 'Unknown';

  // Referrer
  infoReferrer.textContent = info.referrer || 'Direct';

  // Page Journey
  renderPageJourney(info.pageJourney || []);
}

function renderPageJourney(journey) {
  infoPageCount.textContent = journey.length;

  if (journey.length === 0) {
    infoPageJourney.innerHTML = '<div style="color:#666;font-size:0.75rem;">No pages visited yet</div>';
    return;
  }

  // Show in reverse order (most recent first)
  infoPageJourney.innerHTML = journey.slice().reverse().map(page => {
    const time = new Date(page.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const urlPath = page.url.replace(/^https?:\/\/[^\/]+/, '') || '/';
    return `
      <div class="page-visit">
        <span class="page-visit-time">${time}</span>
        <span class="page-visit-url" title="${escapeHtml(page.url)}">${escapeHtml(urlPath)}</span>
      </div>
    `;
  }).join('');
}

// Close session
closeSessionBtn.addEventListener('click', () => {
  if (!currentSessionId) return;
  if (confirm('Close this session?')) {
    closeSession(currentSessionId);
  }
});

// Close with contact info
closeContactBtn.addEventListener('click', () => {
  if (!currentSessionId) return;
  sendMessage(CONTACT_MESSAGE);
  setTimeout(() => {
    closeSession(currentSessionId);
  }, 500);
});

function closeSession(sessionId) {
  socket.emit('admin:close-session', { sessionId });
  if (sessionId === currentSessionId) {
    currentSessionId = null;
    chatView.classList.add('hidden');
    noSession.classList.remove('hidden');
  }
  if (sessions[sessionId]) {
    sessions[sessionId].status = 'closed';
  }
  renderSessionList();
}

// Batch actions
clearInactiveBtn.addEventListener('click', () => {
  const inactiveSessions = Object.values(sessions).filter(s => {
    if (s.status === 'closed') return false;
    const elapsed = Date.now() - (s.lastActivity || s.createdAt);
    return elapsed >= INACTIVE_EXPIRED_MS;
  });

  if (inactiveSessions.length === 0) {
    alert('No inactive sessions to clear');
    return;
  }

  if (confirm(`Close ${inactiveSessions.length} inactive session(s)?`)) {
    inactiveSessions.forEach(s => closeSession(s.id));
  }
});

clearAllBtn.addEventListener('click', () => {
  const activeSessions = Object.values(sessions).filter(s => s.status !== 'closed');

  if (activeSessions.length === 0) {
    alert('No sessions to clear');
    return;
  }

  if (confirm(`Close ALL ${activeSessions.length} session(s)?`)) {
    activeSessions.forEach(s => closeSession(s.id));
  }
});

// Export buttons
document.getElementById('export-json-btn').addEventListener('click', () => exportSessions('json'));
document.getElementById('export-csv-btn').addEventListener('click', () => exportSessions('csv'));

// Sound toggle
const soundToggleBtn = document.getElementById('sound-toggle-btn');
updateSoundButton();
soundToggleBtn.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem('admin-sound', soundEnabled);
  updateSoundButton();
});

function updateSoundButton() {
  soundToggleBtn.textContent = soundEnabled ? 'Sound ON' : 'Sound OFF';
  soundToggleBtn.style.opacity = soundEnabled ? '1' : '0.5';
}

// Search and filter
sessionSearch.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  renderSessionList();
});

sessionFilter.addEventListener('change', (e) => {
  filterStatus = e.target.value;
  renderSessionList();
});

// Keyboard shortcut for search
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    sessionSearch.focus();
  }
});

// Notification sound
function playNotification(sessionId, message) {
  // Play sound
  if (soundEnabled) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.frequency.value = 800;
      gain.gain.value = 0.1;
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  }

  // Desktop notification
  const session = sessions[sessionId];
  const siteId = session?.siteId || 'Unknown';
  showDesktopNotification(
    `New message from ${siteId}`,
    message || 'Visitor needs assistance',
    sessionId
  );
}

// Export sessions
function exportSessions(format) {
  const sessionList = Object.values(sessions).filter(s => s.status !== 'closed');

  if (format === 'json') {
    const data = JSON.stringify(sessionList, null, 2);
    downloadFile(data, 'sessions.json', 'application/json');
  } else if (format === 'csv') {
    let csv = 'Session ID,Site ID,Status,Messages,Created At,Last Activity\\n';
    sessionList.forEach(s => {
      csv += `${s.id},${s.siteId},${s.status},${s.messageCount || 0},${new Date(s.createdAt).toISOString()},${new Date(s.lastActivity || s.createdAt).toISOString()}\\n`;
    });
    downloadFile(csv, 'sessions.csv', 'text/csv');
  }
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
