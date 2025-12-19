// Webhook notifications for Slack, Discord, etc.

const WEBHOOK_URL = process.env.WEBHOOK_URL || '';
const WEBHOOK_EVENTS = (process.env.WEBHOOK_EVENTS || 'waiting_human').split(',');
const DASHBOARD_URL = process.env.DASHBOARD_URL || '';

async function sendWebhook(event, data) {
  if (!WEBHOOK_URL || !WEBHOOK_EVENTS.includes(event)) return;

  try {
    const payload = formatPayload(event, data);

    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error('Webhook error:', err.message);
  }
}

function formatPayload(event, data) {
  const sessionLink = DASHBOARD_URL ? `${DASHBOARD_URL}?session=${data.sessionId}` : '';

  // Detect webhook type from URL
  const isSlack = WEBHOOK_URL.includes('slack.com');
  const isDiscord = WEBHOOK_URL.includes('discord.com');

  if (isSlack) {
    return formatSlackPayload(event, data, sessionLink);
  } else if (isDiscord) {
    return formatDiscordPayload(event, data, sessionLink);
  } else {
    return formatGenericPayload(event, data, sessionLink);
  }
}

function formatSlackPayload(event, data, sessionLink) {
  const messages = {
    'new_session': {
      text: `New chat session from *${data.siteId}*`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:speech_balloon: *New chat session*\n*Site:* ${data.siteId}\n*Session:* \`${data.sessionId.slice(0, 8)}\``
          }
        }
      ]
    },
    'waiting_human': {
      text: `Visitor waiting for help on ${data.siteId}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:rotating_light: *Visitor needs assistance*\n*Site:* ${data.siteId}\n*Session:* \`${data.sessionId.slice(0, 8)}\`${sessionLink ? `\n<${sessionLink}|View in dashboard>` : ''}`
          }
        }
      ]
    },
    'message': {
      text: `New message from visitor on ${data.siteId}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:envelope: *New message*\n*Site:* ${data.siteId}\n*Message:* ${(data.content || '').slice(0, 100)}`
          }
        }
      ]
    }
  };

  return messages[event] || { text: `Omni-Chat: ${event}` };
}

function formatDiscordPayload(event, data, sessionLink) {
  const colors = {
    'new_session': 0x00d9ff,
    'waiting_human': 0xffa502,
    'message': 0x2ed573
  };

  const titles = {
    'new_session': 'New Chat Session',
    'waiting_human': 'Visitor Needs Help',
    'message': 'New Message'
  };

  return {
    embeds: [{
      title: titles[event] || event,
      color: colors[event] || 0x888888,
      fields: [
        { name: 'Site', value: data.siteId || 'Unknown', inline: true },
        { name: 'Session', value: data.sessionId?.slice(0, 8) || 'N/A', inline: true },
        ...(data.content ? [{ name: 'Message', value: data.content.slice(0, 200) }] : [])
      ],
      timestamp: new Date().toISOString(),
      footer: sessionLink ? { text: 'Click title to open dashboard' } : undefined,
      url: sessionLink || undefined
    }]
  };
}

function formatGenericPayload(event, data, sessionLink) {
  return {
    event,
    timestamp: new Date().toISOString(),
    ...data,
    dashboardUrl: sessionLink
  };
}

// Event handlers
function notifyNewSession(session) {
  sendWebhook('new_session', {
    sessionId: session.id,
    siteId: session.siteId
  });
}

function notifyWaitingHuman(session) {
  sendWebhook('waiting_human', {
    sessionId: session.id,
    siteId: session.siteId
  });
}

function notifyMessage(session, message) {
  sendWebhook('message', {
    sessionId: session.id,
    siteId: session.siteId,
    content: message.content
  });
}

module.exports = {
  sendWebhook,
  notifyNewSession,
  notifyWaitingHuman,
  notifyMessage
};
