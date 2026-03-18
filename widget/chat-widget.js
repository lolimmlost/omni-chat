(function() {
  // Get config from script tag
  const script = document.currentScript;
  const serverUrl = script.getAttribute('data-server') || window.location.origin;
  const siteId = script.getAttribute('data-site-id') || 'default';
  const position = script.getAttribute('data-position') || 'bottom-right';
  const primaryColor = script.getAttribute('data-color') || '#00d9ff';
  const themeConfig = script.getAttribute('data-theme') || 'dark';
  const prechatEnabled = script.getAttribute('data-prechat') === 'true';

  // Visitor info
  let visitorName = localStorage.getItem('omni-chat-name') || '';
  let visitorEmail = localStorage.getItem('omni-chat-email') || '';

  // Theme management
  let currentTheme = localStorage.getItem('omni-chat-theme') || themeConfig;
  if (currentTheme === 'auto') {
    currentTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  // Load Socket.io client
  const socketScript = document.createElement('script');
  socketScript.src = serverUrl + '/socket.io/socket.io.js';
  socketScript.onload = initWidget;
  document.head.appendChild(socketScript);

  let socket, sessionId;
  let isOpen = false;
  let isConnected = false;
  let messages = [];
  let typingTimeout = null;
  let isAdminTyping = false;
  let soundEnabled = localStorage.getItem('omni-chat-sound') !== 'false';
  let messageQueue = JSON.parse(sessionStorage.getItem('omni-chat-queue') || '[]');
  const MAX_QUEUE_SIZE = 10;
  let adminStatus = 'offline';
  let chatMode = null; // null = undecided, 'ai' = auto-ask AI, 'human' = waiting for human
  const COMMON_EMOJIS = ['😊', '👍', '👋', '🙏', '❤️', '😂', '🎉', '✨', '🔥', '💯', '😢', '😡', '🤔', '👀', '📧', '📞'];

  function initWidget() {
    socket = io(serverUrl);

    socket.on('connect', () => {
      isConnected = true;
      socket.emit('visitor:join', {
        siteId,
        pageUrl: window.location.href,
        pageTitle: document.title,
        referrer: document.referrer,
        userAgent: navigator.userAgent,
        screen: {
          width: window.screen.width,
          height: window.screen.height
        },
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        language: navigator.language || navigator.userLanguage || ''
      });
    });

    socket.on('visitor:joined', (data) => {
      sessionId = data.sessionId;
      // Send queued messages
      flushMessageQueue();
    });

    socket.on('message', (msg) => {
      // Only add non-visitor messages (visitor messages added locally in sendMessage)
      if (msg.role !== 'visitor') {
        // If admin replies, switch to human mode
        if (msg.role === 'admin') chatMode = 'human';
        messages.push(msg);
        renderMessages();
        if (!isOpen) {
          showBubbleNotification();
        } else {
          // Mark as seen since widget is open
          socket.emit('visitor:mark-seen');
        }
        playSound();
      }
    });

    socket.on('ai:chunk', (data) => {
      updateStreamingMessage(data.chunk);
    });

    socket.on('ai:complete', (data) => {
      finalizeStreamingMessage(data.message);
    });

    socket.on('ai:error', (data) => {
      appendSystemMessage('AI is currently unavailable. Please wait for a human response.');
      updateStatus('active'); // Clear "AI is typing..." status
    });

    socket.on('status', (data) => {
      updateStatus(data.status);
    });

    socket.on('session:closed', () => {
      appendSystemMessage('This conversation has been closed.');
      showFeedbackPrompt();
    });

    socket.on('typing', (data) => {
      if (data.role === 'admin') {
        isAdminTyping = data.isTyping;
        updateTypingIndicator();
      }
    });

    socket.on('disconnect', () => {
      isConnected = false;
    });

    socket.on('admin:status', (data) => {
      adminStatus = data.status;
      updateAdminStatusIndicator();
    });

    socket.on('messages:seen', (data) => {
      const { messageIds } = data;
      if (!messageIds || !Array.isArray(messageIds)) return;

      messages.forEach(m => {
        if (messageIds.includes(m.id)) {
          m.seen = true;
        }
      });
      renderMessages();
    });

    // Page journey tracking
    let lastTrackedUrl = window.location.href;

    function trackPageChange() {
      const currentUrl = window.location.href;
      if (currentUrl !== lastTrackedUrl && sessionId) {
        lastTrackedUrl = currentUrl;
        socket.emit('visitor:page-change', {
          url: currentUrl,
          title: document.title
        });
      }
    }

    // Track History API navigation (SPA)
    const originalPushState = history.pushState;
    history.pushState = function() {
      originalPushState.apply(this, arguments);
      setTimeout(trackPageChange, 0);
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = function() {
      originalReplaceState.apply(this, arguments);
      setTimeout(trackPageChange, 0);
    };

    // Track back/forward navigation
    window.addEventListener('popstate', trackPageChange);

    // Fallback: periodic check for URL changes
    setInterval(trackPageChange, 2000);

    createUI();
  }

  function updateAdminStatusIndicator() {
    const indicator = document.getElementById('omni-admin-status');
    if (indicator) {
      const statusText = {
        'online': 'Support online',
        'away': 'Support away',
        'offline': 'Leave a message'
      };
      const statusColor = {
        'online': '#2ed573',
        'away': '#ffa502',
        'offline': '#666'
      };
      indicator.textContent = statusText[adminStatus] || statusText.offline;
      indicator.style.color = statusColor[adminStatus] || statusColor.offline;
    }
  }

  function emitTyping() {
    if (typingTimeout) clearTimeout(typingTimeout);
    socket.emit('visitor:typing');
    typingTimeout = setTimeout(() => {
      typingTimeout = null;
    }, 2000);
  }

  function updateTypingIndicator() {
    const indicator = document.getElementById('omni-typing-indicator');
    if (indicator) {
      indicator.style.display = isAdminTyping ? 'block' : 'none';
    }
  }

  function playSound() {
    if (!soundEnabled) return;
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

  function toggleSound() {
    soundEnabled = !soundEnabled;
    localStorage.setItem('omni-chat-sound', soundEnabled);
    updateSoundIcon();
  }

  function updateSoundIcon() {
    const btn = document.getElementById('omni-sound-toggle');
    if (btn) {
      btn.innerHTML = soundEnabled
        ? '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>'
        : '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>';
    }
  }

  function downloadTranscript() {
    if (messages.length === 0) return;
    let text = 'Chat Transcript\\n';
    text += '='.repeat(40) + '\\n\\n';
    messages.forEach(m => {
      const time = new Date(m.timestamp).toLocaleString();
      const role = m.role === 'visitor' ? 'You' : m.role === 'admin' ? 'Support' : 'AI';
      text += `[${time}] ${role}:\\n${m.content}\\n\\n`;
    });
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chat-transcript.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('omni-chat-theme', currentTheme);
    applyTheme();
    updateThemeIcon();
  }

  function applyTheme() {
    const window_ = document.getElementById('omni-chat-window');
    if (window_) {
      window_.setAttribute('data-theme', currentTheme);
    }
  }

  function updateThemeIcon() {
    const btn = document.getElementById('omni-theme-toggle');
    if (btn) {
      btn.innerHTML = currentTheme === 'dark'
        ? '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>'
        : '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M9 2c-1.05 0-2.05.16-3 .46 4.06 1.27 7 5.06 7 9.54 0 4.48-2.94 8.27-7 9.54.95.3 1.95.46 3 .46 5.52 0 10-4.48 10-10S14.52 2 9 2z"/></svg>';
    }
  }

  function createUI() {
    // Inject styles
    const styles = document.createElement('style');
    styles.textContent = `
      #omni-chat-widget * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      .omni-hidden { display: none !important; }
      #omni-chat-bubble {
        position: fixed;
        ${position.includes('right') ? 'right: 20px;' : 'left: 20px;'}
        ${position.includes('bottom') ? 'bottom: 20px;' : 'top: 20px;'}
        width: 52px;
        height: 52px;
        border-radius: 50%;
        background: #18181b;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 12px rgba(0,0,0,0.25);
        transition: transform 0.2s, box-shadow 0.2s;
        z-index: 99999;
        border: 1px solid #2a2a2e;
      }
      #omni-chat-bubble:hover {
        transform: scale(1.05);
        box-shadow: 0 4px 16px rgba(0,0,0,0.35);
      }
      #omni-chat-bubble svg { width: 22px; height: 22px; fill: #a1a1aa; }
      #omni-chat-bubble .notification {
        position: absolute;
        top: -2px;
        right: -2px;
        width: 12px;
        height: 12px;
        background: #ef4444;
        border-radius: 50%;
        border: 2px solid #18181b;
        display: none;
      }
      #omni-chat-window {
        position: fixed;
        ${position.includes('right') ? 'right: 20px;' : 'left: 20px;'}
        ${position.includes('bottom') ? 'bottom: 82px;' : 'top: 82px;'}
        width: 370px;
        max-width: calc(100vw - 40px);
        height: 500px;
        max-height: calc(100vh - 110px);
        background: #18181b;
        border-radius: 12px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.4);
        display: none;
        flex-direction: column;
        overflow: hidden;
        z-index: 99998;
        border: 1px solid #27272a;
      }
      #omni-chat-window.open { display: flex; }
      #omni-chat-header {
        background: #18181b;
        color: #e4e4e7;
        padding: 0.875rem 1rem;
        font-weight: 500;
        font-size: 14px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-shrink: 0;
        border-bottom: 1px solid #27272a;
      }
      #omni-chat-header .close-btn {
        background: none;
        border: none;
        width: 28px;
        height: 28px;
        border-radius: 6px;
        font-size: 16px;
        cursor: pointer;
        color: #71717a;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s, color 0.15s;
      }
      #omni-chat-header .close-btn:hover {
        background: #27272a;
        color: #e4e4e7;
      }
      .omni-header-btns {
        display: flex;
        gap: 2px;
        align-items: center;
      }
      .omni-header-btn {
        background: none;
        border: none;
        width: 28px;
        height: 28px;
        border-radius: 6px;
        cursor: pointer;
        color: #71717a;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s, color 0.15s;
      }
      .omni-header-btn:hover {
        background: #27272a;
        color: #e4e4e7;
      }
      #omni-chat-messages {
        flex: 1;
        padding: 1.25rem 1rem;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 0.625rem;
        background: #0f0f12;
      }
      #omni-chat-messages::-webkit-scrollbar { width: 4px; }
      #omni-chat-messages::-webkit-scrollbar-track { background: transparent; }
      #omni-chat-messages::-webkit-scrollbar-thumb { background: #27272a; border-radius: 2px; }
      .omni-msg {
        max-width: 82%;
        padding: 0.75rem 1rem;
        border-radius: 12px;
        font-size: 13.5px;
        line-height: 1.5;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
      .omni-msg.visitor {
        background: #27272a;
        color: #e4e4e7;
        align-self: flex-end;
        border-bottom-right-radius: 4px;
        position: relative;
      }
      .read-status {
        display: inline-block;
        font-size: 10px;
        color: #52525b;
        margin-left: 4px;
        vertical-align: middle;
      }
      .omni-msg.visitor .read-status {
        color: #71717a;
      }
      .omni-msg.admin {
        background: #1e3a5f;
        color: #e4e4e7;
        align-self: flex-start;
        border-bottom-left-radius: 4px;
      }
      .omni-msg.ai {
        background: #1c1c24;
        color: #d4d4d8;
        align-self: flex-start;
        border-bottom-left-radius: 4px;
        border: 1px solid #27272a;
      }
      .omni-msg.system {
        background: transparent;
        color: #52525b;
        font-size: 12px;
        text-align: center;
        align-self: center;
        padding: 0.375rem;
      }
      .omni-msg.streaming::after {
        content: '\\25CB';
        animation: blink 0.8s infinite;
        margin-left: 3px;
        color: #52525b;
      }
      @keyframes blink { 50% { opacity: 0; } }
      #omni-chat-status {
        text-align: center;
        font-size: 12px;
        color: #71717a;
        padding: 0.375rem 1rem;
        background: #18181b;
        display: none;
        flex-shrink: 0;
        border-top: 1px solid #27272a;
      }
      #omni-chat-status.show { display: block; }
      #omni-typing-indicator {
        display: none;
        padding: 0.375rem 1rem;
        font-size: 12px;
        color: #71717a;
      }
      #omni-typing-indicator .dots {
        display: inline-block;
      }
      #omni-typing-indicator .dots span {
        animation: typingDot 1.4s infinite;
        display: inline-block;
      }
      #omni-typing-indicator .dots span:nth-child(2) { animation-delay: 0.2s; }
      #omni-typing-indicator .dots span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes typingDot {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-3px); }
      }
      /* Light theme */
      #omni-chat-window[data-theme="light"] {
        background: #fff;
        border-color: #e4e4e7;
      }
      #omni-chat-window[data-theme="light"] #omni-chat-header {
        background: #fff;
        color: #18181b;
        border-color: #e4e4e7;
      }
      #omni-chat-window[data-theme="light"] #omni-chat-header .close-btn { color: #a1a1aa; }
      #omni-chat-window[data-theme="light"] #omni-chat-header .close-btn:hover { background: #f4f4f5; color: #18181b; }
      #omni-chat-window[data-theme="light"] .omni-header-btn { color: #a1a1aa; }
      #omni-chat-window[data-theme="light"] .omni-header-btn:hover { background: #f4f4f5; color: #18181b; }
      #omni-chat-window[data-theme="light"] #omni-chat-messages {
        background: #fafafa;
      }
      #omni-chat-window[data-theme="light"] .omni-msg.visitor {
        background: #e4e4e7;
        color: #18181b;
      }
      #omni-chat-window[data-theme="light"] .omni-msg.ai {
        background: #fff;
        color: #18181b;
        border-color: #e4e4e7;
      }
      #omni-chat-window[data-theme="light"] .omni-msg.admin {
        background: #dbeafe;
        color: #18181b;
      }
      #omni-chat-window[data-theme="light"] #omni-chat-input {
        background: #fff;
        border-color: #e4e4e7;
        color: #18181b;
      }
      #omni-chat-window[data-theme="light"] #omni-chat-input::placeholder {
        color: #a1a1aa;
      }
      #omni-chat-window[data-theme="light"] #omni-chat-input-area {
        background: #fff;
        border-color: #e4e4e7;
      }
      #omni-chat-window[data-theme="light"] #omni-chat-status {
        background: #fafafa;
        color: #71717a;
        border-color: #e4e4e7;
      }
      #omni-chat-window[data-theme="light"] #omni-typing-indicator {
        color: #71717a;
      }
      #omni-chat-window[data-theme="light"] #omni-emoji-picker {
        background: #fff;
        border-color: #e4e4e7;
      }
      #omni-chat-window[data-theme="light"] .omni-emoji-btn:hover { background: #f4f4f5; }
      /* Pre-chat form */
      #omni-prechat-form {
        padding: 1.5rem;
        background: #0f0f12;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      #omni-prechat-form h3 {
        color: #e4e4e7;
        font-size: 0.95rem;
        font-weight: 500;
        margin-bottom: 0.25rem;
      }
      #omni-prechat-form p {
        color: #71717a;
        font-size: 0.8rem;
      }
      .omni-form-input {
        width: 100%;
        padding: 0.625rem 0.875rem;
        border: 1px solid #27272a;
        border-radius: 8px;
        background: #18181b;
        color: #e4e4e7;
        font-size: 13.5px;
      }
      .omni-form-input:focus {
        outline: none;
        border-color: #3f3f46;
      }
      .omni-form-btn {
        padding: 0.625rem 1rem;
        border: none;
        border-radius: 8px;
        background: #27272a;
        color: #e4e4e7;
        font-weight: 500;
        font-size: 13.5px;
        cursor: pointer;
        transition: background 0.15s;
      }
      .omni-form-btn:hover { background: #3f3f46; }
      /* Admin status */
      #omni-admin-status {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 10px;
        color: #71717a;
        font-weight: 400;
      }
      /* Emoji picker */
      #omni-emoji-picker {
        display: none;
        position: absolute;
        bottom: 100%;
        left: 0;
        background: #18181b;
        border: 1px solid #27272a;
        border-radius: 8px;
        padding: 8px;
        margin-bottom: 4px;
        width: 200px;
        flex-wrap: wrap;
        gap: 2px;
        z-index: 10;
      }
      #omni-emoji-picker.show { display: flex; }
      .omni-emoji-btn {
        width: 32px;
        height: 32px;
        border: none;
        background: transparent;
        font-size: 18px;
        cursor: pointer;
        border-radius: 4px;
        transition: background 0.15s;
      }
      .omni-emoji-btn:hover { background: #27272a; }
      #omni-emoji-toggle {
        background: transparent;
        border: none;
        font-size: 18px;
        cursor: pointer;
        padding: 4px;
        opacity: 0.6;
        transition: opacity 0.15s;
      }
      #omni-emoji-toggle:hover { opacity: 1; }
      /* Feedback prompt */
      .omni-feedback-prompt {
        background: #18181b;
        border: 1px solid #27272a;
        border-radius: 10px;
        padding: 1rem;
        margin: 0.75rem 0;
        text-align: center;
      }
      .omni-feedback-title {
        font-weight: 500;
        margin-bottom: 0.75rem;
        color: #e4e4e7;
        font-size: 13.5px;
      }
      .omni-feedback-stars {
        display: flex;
        justify-content: center;
        gap: 6px;
        margin-bottom: 0.75rem;
      }
      .omni-star {
        background: none;
        border: none;
        font-size: 24px;
        color: #3f3f46;
        cursor: pointer;
        transition: color 0.15s, transform 0.15s;
        padding: 0;
      }
      .omni-star:hover, .omni-star.hover { color: #fbbf24; }
      .omni-star.selected { color: #fbbf24; }
      .omni-star:hover { transform: scale(1.15); }
      .omni-feedback-comment {
        width: 100%;
        padding: 0.625rem;
        border: 1px solid #27272a;
        border-radius: 8px;
        background: #0f0f12;
        color: #e4e4e7;
        font-size: 13px;
        resize: none;
        margin-bottom: 0.625rem;
        min-height: 50px;
      }
      .omni-feedback-comment:focus {
        outline: none;
        border-color: #3f3f46;
      }
      .omni-feedback-submit {
        padding: 0.5rem 1.25rem;
        border: none;
        border-radius: 8px;
        background: #27272a;
        color: #e4e4e7;
        font-weight: 500;
        font-size: 13px;
        cursor: pointer;
        transition: background 0.15s;
      }
      .omni-feedback-submit:hover { background: #3f3f46; }
      .omni-feedback-thanks {
        color: #4ade80;
        font-weight: 500;
        padding: 0.75rem;
        font-size: 13.5px;
      }
      #omni-chat-input-area {
        padding: 0.75rem;
        background: #18181b;
        border-top: 1px solid #27272a;
        flex-shrink: 0;
      }
      #omni-chat-input {
        width: 100%;
        padding: 0.625rem 0.875rem;
        border: 1px solid #27272a;
        border-radius: 10px;
        background: #0f0f12;
        color: #e4e4e7;
        font-size: 13.5px;
        resize: none;
        line-height: 1.4;
      }
      #omni-chat-input::placeholder { color: #52525b; }
      #omni-chat-input:focus {
        outline: none;
        border-color: #3f3f46;
      }
      #omni-chat-actions {
        display: none;
        gap: 0.375rem;
        margin-top: 0.5rem;
      }
      #omni-chat-actions.show { display: flex; }
      .omni-action-btn {
        flex: 1;
        padding: 0.5rem 0.75rem;
        border: 1px solid #27272a;
        border-radius: 8px;
        font-size: 12.5px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s;
        background: #18181b;
        color: #a1a1aa;
      }
      .omni-action-btn:hover {
        background: #27272a;
        color: #e4e4e7;
      }
      .omni-action-btn:active { transform: translateY(0); }
      .omni-action-btn.human {
        background: #18181b;
        color: #4ade80;
        border-color: #27272a;
      }
      .omni-action-btn.human:hover { background: #27272a; }
      .omni-action-btn.ai {
        background: #18181b;
        color: #a1a1aa;
        border-color: #27272a;
      }
      .omni-action-btn.ai:hover { background: #27272a; color: #e4e4e7; }
    `;
    document.head.appendChild(styles);

    // Create widget container
    const container = document.createElement('div');
    container.id = 'omni-chat-widget';
    container.innerHTML = `
      <div id="omni-chat-bubble">
        <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
        <span class="notification"></span>
      </div>
      <div id="omni-chat-window">
        <div id="omni-chat-header">
          <span>Chat with us</span>
          <span id="omni-admin-status">Leave a message</span>
          <div class="omni-header-btns">
            <button id="omni-download-btn" class="omni-header-btn" title="Download transcript">
              <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            </button>
            <button id="omni-theme-toggle" class="omni-header-btn" title="Toggle theme"></button>
            <button id="omni-sound-toggle" class="omni-header-btn" title="Toggle sound"></button>
            <button class="close-btn">&times;</button>
          </div>
        </div>
        <div id="omni-prechat-form" class="${prechatEnabled && !visitorName ? '' : 'omni-hidden'}">
          <h3>Before we start</h3>
          <p>Please introduce yourself so we can help you better.</p>
          <input type="text" id="omni-name-input" class="omni-form-input" placeholder="Your name *" value="${visitorName}">
          <input type="email" id="omni-email-input" class="omni-form-input" placeholder="Email (optional)" value="${visitorEmail}">
          <button id="omni-prechat-submit" class="omni-form-btn">Start Chat</button>
        </div>
        <div id="omni-chat-messages" class="${prechatEnabled && !visitorName ? 'omni-hidden' : ''}"></div>
        <div id="omni-chat-status"></div>
        <div id="omni-typing-indicator">Support is typing<span class="dots"><span>.</span><span>.</span><span>.</span></span></div>
        <div id="omni-chat-input-area" class="${prechatEnabled && !visitorName ? 'omni-hidden' : ''}" style="position:relative;">
          <div style="display:flex;gap:8px;align-items:flex-end;">
            <button id="omni-emoji-toggle">😊</button>
            <textarea id="omni-chat-input" rows="2" placeholder="Type your message..." style="flex:1;"></textarea>
          </div>
          <div id="omni-emoji-picker">${COMMON_EMOJIS.map(e => `<button class="omni-emoji-btn">${e}</button>`).join('')}</div>
          <div id="omni-chat-actions">
            <button class="omni-action-btn human">Wait for Human</button>
            <button class="omni-action-btn ai">Ask AI</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    // Event listeners
    const bubble = document.getElementById('omni-chat-bubble');
    const window_ = document.getElementById('omni-chat-window');
    const closeBtn = window_.querySelector('.close-btn');
    const input = document.getElementById('omni-chat-input');
    const actions = document.getElementById('omni-chat-actions');
    const humanBtn = actions.querySelector('.human');
    const aiBtn = actions.querySelector('.ai');

    bubble.addEventListener('click', () => {
      isOpen = true;
      window_.classList.add('open');
      bubble.querySelector('.notification').style.display = 'none';
      input.focus();
      // Mark messages as seen when opening widget
      if (socket && sessionId) {
        socket.emit('visitor:mark-seen');
      }
    });

    closeBtn.addEventListener('click', () => {
      isOpen = false;
      window_.classList.remove('open');
    });

    // Sound toggle
    const soundToggle = document.getElementById('omni-sound-toggle');
    updateSoundIcon();
    soundToggle.addEventListener('click', toggleSound);

    // Download transcript
    const downloadBtn = document.getElementById('omni-download-btn');
    downloadBtn.addEventListener('click', downloadTranscript);

    // Theme toggle
    const themeToggle = document.getElementById('omni-theme-toggle');
    applyTheme();
    updateThemeIcon();
    themeToggle.addEventListener('click', toggleTheme);

    // Pre-chat form
    const prechatForm = document.getElementById('omni-prechat-form');
    const prechatSubmit = document.getElementById('omni-prechat-submit');
    if (prechatSubmit) {
      prechatSubmit.addEventListener('click', () => {
        const nameInput = document.getElementById('omni-name-input');
        const emailInput = document.getElementById('omni-email-input');
        const name = nameInput.value.trim();
        const email = emailInput.value.trim();

        if (!name) {
          nameInput.style.borderColor = '#ff4757';
          return;
        }

        visitorName = name;
        visitorEmail = email;
        localStorage.setItem('omni-chat-name', name);
        localStorage.setItem('omni-chat-email', email);

        prechatForm.classList.add('omni-hidden');
        document.getElementById('omni-chat-messages').classList.remove('omni-hidden');
        document.getElementById('omni-chat-input-area').classList.remove('omni-hidden');
        input.focus();
      });
    }

    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = input.value.trim();
        if (text) {
          sendMessage(text);
          input.value = '';
          if (chatMode === 'ai') {
            // Auto-request AI response
            socket.emit('visitor:request-ai');
          } else if (chatMode === null) {
            // First message — show mode buttons
            actions.classList.add('show');
          }
          // If chatMode === 'human', just send and wait
        }
      }
    });

    input.addEventListener('input', () => {
      if (input.value.trim()) {
        emitTyping();
      }
    });

    humanBtn.addEventListener('click', () => {
      chatMode = 'human';
      socket.emit('visitor:request-human');
      actions.classList.remove('show');
    });

    aiBtn.addEventListener('click', () => {
      chatMode = 'ai';
      socket.emit('visitor:request-ai');
      actions.classList.remove('show');
    });

    // Emoji picker
    const emojiToggle = document.getElementById('omni-emoji-toggle');
    const emojiPicker = document.getElementById('omni-emoji-picker');

    emojiToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      emojiPicker.classList.toggle('show');
    });

    emojiPicker.querySelectorAll('.omni-emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        input.value += btn.textContent;
        input.focus();
        emojiPicker.classList.remove('show');
      });
    });

    document.addEventListener('click', (e) => {
      if (!emojiPicker.contains(e.target) && e.target !== emojiToggle) {
        emojiPicker.classList.remove('show');
      }
    });
  }

  function sendMessage(content) {
    const msg = { role: 'visitor', content, timestamp: Date.now() };
    messages.push(msg);
    renderMessages();

    if (isConnected && sessionId) {
      socket.emit('visitor:message', { content });
    } else {
      // Queue message for later
      queueMessage(content);
    }
  }

  function queueMessage(content) {
    if (messageQueue.length >= MAX_QUEUE_SIZE) {
      messageQueue.shift(); // Remove oldest
    }
    messageQueue.push({ content, timestamp: Date.now() });
    sessionStorage.setItem('omni-chat-queue', JSON.stringify(messageQueue));
    appendSystemMessage('Message queued - will send when reconnected');
  }

  function flushMessageQueue() {
    if (messageQueue.length === 0) return;

    messageQueue.forEach(msg => {
      socket.emit('visitor:message', { content: msg.content });
    });

    messageQueue = [];
    sessionStorage.removeItem('omni-chat-queue');
  }

  function renderMessages() {
    const container = document.getElementById('omni-chat-messages');
    container.innerHTML = messages.map(m => {
      const readStatus = m.role === 'visitor'
        ? `<span class="read-status">${m.seen ? '✓✓' : '✓'}</span>`
        : '';
      return `<div class="omni-msg ${m.role}">${escapeHtml(m.content)}${readStatus}</div>`;
    }).join('');
    container.scrollTop = container.scrollHeight;
  }

  let streamingContent = '';
  function updateStreamingMessage(chunk) {
    const container = document.getElementById('omni-chat-messages');
    let streamingEl = container.querySelector('.streaming');

    if (!streamingEl) {
      streamingEl = document.createElement('div');
      streamingEl.className = 'omni-msg ai streaming';
      container.appendChild(streamingEl);
    }

    streamingContent += chunk;
    streamingEl.textContent = streamingContent;
    container.scrollTop = container.scrollHeight;
  }

  function finalizeStreamingMessage(message) {
    const container = document.getElementById('omni-chat-messages');
    const streamingEl = container.querySelector('.streaming');
    if (streamingEl) {
      streamingEl.classList.remove('streaming');
    }
    messages.push(message);
    streamingContent = '';
  }

  function appendSystemMessage(text) {
    const container = document.getElementById('omni-chat-messages');
    const el = document.createElement('div');
    el.className = 'omni-msg system';
    el.textContent = text;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  function updateStatus(status) {
    const statusEl = document.getElementById('omni-chat-status');
    const statusTexts = {
      'waiting_human': 'Waiting for a human to respond...',
      'waiting_ai': 'AI is typing...',
      'active': ''
    };
    const text = statusTexts[status] || '';
    statusEl.textContent = text;
    statusEl.classList.toggle('show', !!text);
  }

  function showBubbleNotification() {
    const notification = document.querySelector('#omni-chat-bubble .notification');
    if (notification) {
      notification.style.display = 'block';
    }
  }

  function showFeedbackPrompt() {
    const container = document.getElementById('omni-chat-messages');
    if (!container) return;

    // Create feedback UI
    const feedbackEl = document.createElement('div');
    feedbackEl.className = 'omni-feedback-prompt';
    feedbackEl.innerHTML = `
      <div class="omni-feedback-title">How was your experience?</div>
      <div class="omni-feedback-stars">
        ${[1, 2, 3, 4, 5].map(n => `<button class="omni-star" data-rating="${n}">★</button>`).join('')}
      </div>
      <textarea class="omni-feedback-comment" placeholder="Additional comments (optional)"></textarea>
      <button class="omni-feedback-submit">Submit Feedback</button>
    `;
    container.appendChild(feedbackEl);
    container.scrollTop = container.scrollHeight;

    let selectedRating = 0;

    // Star click handlers
    feedbackEl.querySelectorAll('.omni-star').forEach(star => {
      star.addEventListener('click', () => {
        selectedRating = parseInt(star.dataset.rating);
        feedbackEl.querySelectorAll('.omni-star').forEach((s, i) => {
          s.classList.toggle('selected', i < selectedRating);
        });
      });

      star.addEventListener('mouseenter', () => {
        const rating = parseInt(star.dataset.rating);
        feedbackEl.querySelectorAll('.omni-star').forEach((s, i) => {
          s.classList.toggle('hover', i < rating);
        });
      });

      star.addEventListener('mouseleave', () => {
        feedbackEl.querySelectorAll('.omni-star').forEach(s => s.classList.remove('hover'));
      });
    });

    // Submit handler
    feedbackEl.querySelector('.omni-feedback-submit').addEventListener('click', () => {
      if (selectedRating === 0) return;

      const comment = feedbackEl.querySelector('.omni-feedback-comment').value.trim();
      socket.emit('visitor:feedback', {
        rating: selectedRating,
        comment: comment
      });

      // Replace with thank you message
      feedbackEl.innerHTML = '<div class="omni-feedback-thanks">Thank you for your feedback!</div>';
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
