// Email notifications via Resend — low-frequency, high-signal only
const { Resend } = require('resend');

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Omni-Chat <notifications@appahouse.com>';
const DASHBOARD_URL = process.env.DASHBOARD_URL || '';

let resend = null;

// Cooldown: don't send more than 1 email per 10 minutes
let lastEmailSent = 0;
const COOLDOWN_MS = 10 * 60 * 1000;

function init() {
  if (RESEND_API_KEY && NOTIFY_EMAIL) {
    resend = new Resend(RESEND_API_KEY);
    console.log(`  ✓ Resend email notifications enabled → ${NOTIFY_EMAIL}`);
  } else {
    console.log('  ⚠ Resend not configured (set RESEND_API_KEY and NOTIFY_EMAIL)');
  }
}

async function notifyHumanRequested(session) {
  if (!resend || !NOTIFY_EMAIL) return;

  // Enforce cooldown
  const now = Date.now();
  if (now - lastEmailSent < COOLDOWN_MS) return;
  lastEmailSent = now;

  const sessionLink = DASHBOARD_URL ? `${DASHBOARD_URL}?session=${session.id}` : '';
  const visitorInfo = session.visitorInfo || {};
  const name = visitorInfo.name || 'Anonymous visitor';
  const page = visitorInfo.pageUrl || 'Unknown page';

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: NOTIFY_EMAIL,
      subject: 'Visitor waiting for help on AppaHouse',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="margin: 0 0 16px; font-size: 18px; color: #1a1a1a;">Someone needs your help</h2>
          <p style="color: #555; line-height: 1.5; margin: 0 0 12px;">
            <strong>${name}</strong> is waiting for a human response on your site.
          </p>
          <p style="color: #888; font-size: 13px; margin: 0 0 20px;">
            Page: ${page}<br>
            Site: ${session.siteId || 'default'}
          </p>
          ${sessionLink ? `<a href="${sessionLink}" style="display: inline-block; padding: 10px 20px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px;">Open Dashboard</a>` : ''}
          <p style="color: #aaa; font-size: 11px; margin-top: 24px;">Omni-Chat · You'll receive at most 1 email every 10 minutes.</p>
        </div>
      `
    });
    console.log(`Email sent to ${NOTIFY_EMAIL} (human requested)`);
  } catch (err) {
    console.error('Resend email error:', err.message);
  }
}

module.exports = { init, notifyHumanRequested };
