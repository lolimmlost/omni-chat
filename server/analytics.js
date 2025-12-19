// Analytics tracking and metrics calculation
const store = require('./store');
const fs = require('fs');
const path = require('path');

const ANALYTICS_FILE = path.join(__dirname, '..', 'data', 'analytics.json');

let analyticsData = {
  sessionsPerDay: {},
  totalMessages: 0,
  totalSessions: 0,
  avgResponseTime: 0,
  responseTimeSum: 0,
  responseTimeCount: 0,
  feedbackSum: 0,
  feedbackCount: 0
};

// Load from file on startup
function loadAnalytics() {
  try {
    const dir = path.dirname(ANALYTICS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(ANALYTICS_FILE)) {
      const data = fs.readFileSync(ANALYTICS_FILE, 'utf-8');
      analyticsData = { ...analyticsData, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error('Failed to load analytics:', err.message);
  }
}

function saveAnalytics() {
  try {
    const dir = path.dirname(ANALYTICS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(analyticsData, null, 2));
  } catch (err) {
    console.error('Failed to save analytics:', err.message);
  }
}

function getDateKey(timestamp) {
  return new Date(timestamp).toISOString().split('T')[0];
}

function trackSession() {
  const today = getDateKey(Date.now());
  analyticsData.sessionsPerDay[today] = (analyticsData.sessionsPerDay[today] || 0) + 1;
  analyticsData.totalSessions++;
  saveAnalytics();
}

function trackMessage() {
  analyticsData.totalMessages++;
  // Save periodically (every 10 messages)
  if (analyticsData.totalMessages % 10 === 0) {
    saveAnalytics();
  }
}

function trackResponseTime(visitorMsgTime, adminMsgTime) {
  const diff = adminMsgTime - visitorMsgTime;
  if (diff > 0 && diff < 3600000) { // Under 1 hour
    analyticsData.responseTimeSum += diff;
    analyticsData.responseTimeCount++;
    analyticsData.avgResponseTime = analyticsData.responseTimeSum / analyticsData.responseTimeCount;
  }
}

function trackFeedback(rating) {
  analyticsData.feedbackSum += rating;
  analyticsData.feedbackCount++;
  saveAnalytics();
}

function getAnalyticsSummary() {
  const today = getDateKey(Date.now());
  const sessions = store.listSessions(true);

  // Calculate real-time stats from sessions
  let waitingCount = 0;
  let activeCount = 0;
  let closedCount = 0;
  let feedbackTotal = 0;
  let feedbackCount = 0;

  sessions.forEach(s => {
    if (s.status === 'waiting_human') waitingCount++;
    else if (s.status === 'active' || s.status === 'waiting_ai') activeCount++;
    else if (s.status === 'closed') closedCount++;

    if (s.feedback?.rating) {
      feedbackTotal += s.feedback.rating;
      feedbackCount++;
    }
  });

  // Get last 7 days of session data
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = getDateKey(date.getTime());
    last7Days.push({
      date: key,
      sessions: analyticsData.sessionsPerDay[key] || 0
    });
  }

  return {
    todaySessions: analyticsData.sessionsPerDay[today] || 0,
    totalSessions: analyticsData.totalSessions,
    totalMessages: analyticsData.totalMessages,
    avgResponseTimeMs: Math.round(analyticsData.avgResponseTime),
    avgRating: feedbackCount > 0 ? (feedbackTotal / feedbackCount).toFixed(1) : 'N/A',
    feedbackCount,
    currentWaiting: waitingCount,
    currentActive: activeCount,
    recentlyClosed: closedCount,
    sessionsPerDay: last7Days,
    storedFeedbackAvg: analyticsData.feedbackCount > 0
      ? (analyticsData.feedbackSum / analyticsData.feedbackCount).toFixed(1)
      : 'N/A'
  };
}

// Load on init
loadAnalytics();

// Save every 5 minutes
setInterval(saveAnalytics, 5 * 60 * 1000);

module.exports = {
  trackSession,
  trackMessage,
  trackResponseTime,
  trackFeedback,
  getAnalyticsSummary
};
