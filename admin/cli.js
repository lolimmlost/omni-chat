#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { io } = require('socket.io-client');
const readline = require('readline');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3100';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

if (!ADMIN_TOKEN) {
  console.error('Error: ADMIN_TOKEN not set in environment');
  process.exit(1);
}

const socket = io(SERVER_URL);
let currentSessionId = null;
let sessions = {};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Colors
const c = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m',
  bold: '\x1b[1m'
};

function log(msg) {
  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
  console.log(msg);
  prompt();
}

function prompt() {
  const prefix = currentSessionId
    ? `${c.cyan}[${currentSessionId.slice(0, 8)}]${c.reset} `
    : '';
  rl.setPrompt(`${prefix}${c.green}>${c.reset} `);
  rl.prompt();
}

// Connect and authenticate
socket.on('connect', () => {
  console.log(`${c.cyan}Connecting to ${SERVER_URL}...${c.reset}`);

  socket.emit('admin:auth', { token: ADMIN_TOKEN }, (response) => {
    if (response.success) {
      console.log(`${c.green}Authenticated successfully${c.reset}`);
      console.log(`\nCommands: ${c.dim}list, join <id>, reply <msg>, close, quit${c.reset}\n`);
      loadSessions();
    } else {
      console.error(`${c.red}Authentication failed: ${response.error}${c.reset}`);
      process.exit(1);
    }
  });
});

socket.on('disconnect', () => {
  console.log(`${c.red}Disconnected from server${c.reset}`);
});

// Load sessions
function loadSessions() {
  socket.emit('admin:list-sessions', (response) => {
    if (response.sessions) {
      response.sessions.forEach(s => {
        sessions[s.id] = s;
      });
      listSessions();
    }
  });
}

function listSessions() {
  const list = Object.values(sessions).filter(s => s.status !== 'closed');

  if (list.length === 0) {
    log(`${c.dim}No active sessions${c.reset}`);
    return;
  }

  console.log(`\n${c.bold}Active Sessions:${c.reset}`);
  list.forEach(s => {
    const statusColor = s.status === 'waiting_human' ? c.yellow : c.green;
    const preview = s.lastMessage ? s.lastMessage.content.slice(0, 40) : 'No messages';
    console.log(`  ${c.cyan}${s.id.slice(0, 8)}${c.reset} [${s.siteId}] ${statusColor}${s.status}${c.reset}`);
    console.log(`    ${c.dim}${preview}${c.reset}`);
  });
  console.log('');
  prompt();
}

// Socket events
socket.on('admin:session-created', (data) => {
  sessions[data.id] = data;
  log(`${c.yellow}New session:${c.reset} ${data.id.slice(0, 8)} from ${c.cyan}${data.siteId}${c.reset}`);
});

socket.on('admin:session-activity', (data) => {
  const { sessionId, message } = data;
  if (!sessions[sessionId]) {
    sessions[sessionId] = { id: sessionId };
  }
  sessions[sessionId].lastMessage = message;

  if (sessionId === currentSessionId && message.role === 'visitor') {
    log(`${c.magenta}Visitor:${c.reset} ${message.content}`);
  } else if (message.role === 'visitor') {
    log(`${c.yellow}[${sessionId.slice(0, 8)}]${c.reset} ${message.content.slice(0, 50)}`);
  }
});

socket.on('admin:session-status', (data) => {
  if (sessions[data.sessionId]) {
    sessions[data.sessionId].status = data.status;
  }
});

socket.on('message', (message) => {
  if (message.role === 'visitor') {
    log(`${c.magenta}Visitor:${c.reset} ${message.content}`);
  } else if (message.role === 'ai') {
    log(`${c.cyan}AI:${c.reset} ${message.content}`);
  }
});

let aiBuffer = '';
socket.on('ai:chunk', (data) => {
  aiBuffer += data.chunk;
  process.stdout.write(data.chunk);
});

socket.on('ai:complete', () => {
  if (aiBuffer) {
    console.log('');
    aiBuffer = '';
    prompt();
  }
});

// Command handling
rl.on('line', (line) => {
  const input = line.trim();
  if (!input) {
    prompt();
    return;
  }

  const [cmd, ...args] = input.split(' ');

  switch (cmd.toLowerCase()) {
    case 'list':
    case 'ls':
      listSessions();
      break;

    case 'join':
    case 'j':
      if (!args[0]) {
        log(`${c.red}Usage: join <session-id>${c.reset}`);
        break;
      }
      joinSession(args[0]);
      break;

    case 'reply':
    case 'r':
      if (!args.length) {
        log(`${c.red}Usage: reply <message>${c.reset}`);
        break;
      }
      sendMessage(args.join(' '));
      break;

    case 'close':
      closeSession();
      break;

    case 'leave':
      leaveSession();
      break;

    case 'quit':
    case 'exit':
    case 'q':
      console.log(`${c.dim}Goodbye${c.reset}`);
      process.exit(0);
      break;

    case 'help':
    case 'h':
      showHelp();
      break;

    default:
      // If in a session, treat as a message
      if (currentSessionId) {
        sendMessage(input);
      } else {
        log(`${c.red}Unknown command. Type 'help' for available commands.${c.reset}`);
      }
  }
});

function joinSession(partialId) {
  const match = Object.keys(sessions).find(id => id.startsWith(partialId));
  if (!match) {
    log(`${c.red}Session not found${c.reset}`);
    return;
  }

  currentSessionId = match;
  socket.emit('admin:join-session', { sessionId: match });

  socket.once('admin:session-joined', (data) => {
    const session = data.session;
    console.log(`\n${c.green}Joined session${c.reset} ${c.cyan}${session.id.slice(0, 8)}${c.reset} [${session.siteId}]`);
    console.log(`${c.dim}--- Message History ---${c.reset}`);

    session.messages.forEach(m => {
      const role = m.role === 'visitor' ? c.magenta + 'Visitor' :
                   m.role === 'ai' ? c.cyan + 'AI' : c.green + 'You';
      console.log(`${role}:${c.reset} ${m.content}`);
    });

    console.log(`${c.dim}--- End History ---${c.reset}\n`);
    console.log(`${c.dim}Type your message or 'leave' to exit session${c.reset}\n`);
    prompt();
  });
}

function sendMessage(content) {
  if (!currentSessionId) {
    log(`${c.red}Not in a session. Use 'join <id>' first.${c.reset}`);
    return;
  }

  socket.emit('admin:message', { sessionId: currentSessionId, content });
  log(`${c.green}You:${c.reset} ${content}`);
}

function closeSession() {
  if (!currentSessionId) {
    log(`${c.red}Not in a session${c.reset}`);
    return;
  }

  socket.emit('admin:close-session', { sessionId: currentSessionId });
  log(`${c.yellow}Session closed${c.reset}`);
  currentSessionId = null;
}

function leaveSession() {
  if (!currentSessionId) {
    log(`${c.red}Not in a session${c.reset}`);
    return;
  }

  socket.emit('admin:leave-session', { sessionId: currentSessionId });
  log(`${c.dim}Left session${c.reset}`);
  currentSessionId = null;
}

function showHelp() {
  console.log(`
${c.bold}Commands:${c.reset}
  ${c.cyan}list${c.reset} (ls)           List active sessions
  ${c.cyan}join${c.reset} (j) <id>       Join a session by ID (partial match)
  ${c.cyan}reply${c.reset} (r) <msg>     Send message to current session
  ${c.cyan}close${c.reset}              Close current session
  ${c.cyan}leave${c.reset}              Leave session without closing
  ${c.cyan}help${c.reset} (h)           Show this help
  ${c.cyan}quit${c.reset} (q)           Exit CLI

${c.dim}When in a session, you can type directly to send messages.${c.reset}
`);
  prompt();
}

// Handle exit
rl.on('close', () => {
  console.log(`\n${c.dim}Goodbye${c.reset}`);
  process.exit(0);
});
