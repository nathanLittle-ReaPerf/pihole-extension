const BLOCKED_STATUSES = new Set([1, 4, 5, 6, 7, 8, 9]);
const REFRESH_MS = 5000;

let config = {};
let pausedUntil = null; // null=unknown, 0=indefinite, >0=epoch ms
let isCurrentlyPaused = false;

function formatCountdown(ms) {
  if (ms <= 0) return '0:00';
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function renderPausedStatus() {
  if (!isCurrentlyPaused) return;
  let text;
  if (pausedUntil === null) {
    text = 'Paused';
  } else if (pausedUntil === 0) {
    text = 'Paused ∞';
  } else {
    const remaining = pausedUntil - Date.now();
    text = remaining <= 0 ? 'Resuming…' : `Paused ${formatCountdown(remaining)}`;
  }
  document.getElementById('status-text').textContent = text;
}

function timeAgo(timestamp) {
  const delta = Math.floor(Date.now() / 1000) - parseInt(timestamp);
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  return `${Math.floor(delta / 3600)}h ago`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function fetchSummary() {
  const res = await fetch(
    `http://${config.piholeIp}/admin/api.php?summary&auth=${config.piholeToken}`,
    { signal: AbortSignal.timeout(5000) }
  );
  return res.json();
}

async function fetchRecentBlocked() {
  const res = await fetch(
    `http://${config.piholeIp}/admin/api.php?getAllQueries=200&auth=${config.piholeToken}`,
    { signal: AbortSignal.timeout(5000) }
  );
  const data = await res.json();
  return (data.data || []).filter(q => BLOCKED_STATUSES.has(parseInt(q[4])));
}

function updateStats(summary) {
  const enabled = summary.status === 'enabled';
  isCurrentlyPaused = !enabled;
  document.getElementById('status-dot').className = `dot ${enabled ? 'green' : 'red'}`;
  const suspendBtn = document.getElementById('suspend-btn');
  if (enabled) {
    document.getElementById('status-text').textContent = 'Enabled';
    suspendBtn.textContent = '⏸';
    suspendBtn.title = 'Suspend blocking';
    if (pausedUntil !== null) {
      pausedUntil = null;
      chrome.storage.local.remove('pausedUntil');
    }
  } else {
    renderPausedStatus();
    suspendBtn.textContent = '▶';
    suspendBtn.title = 'Resume blocking';
    document.getElementById('suspend-panel').style.display = 'none';
  }
  document.getElementById('queries-count').textContent =
    parseInt(summary.dns_queries_today || 0).toLocaleString();
  document.getElementById('blocked-count').textContent =
    parseInt(summary.ads_blocked_today || 0).toLocaleString();
  document.getElementById('blocked-pct').textContent =
    `${parseFloat(summary.ads_percentage_today || 0).toFixed(1)}%`;
}

function updateBlockedList(blocked) {
  const list = document.getElementById('blocked-list');
  if (!blocked.length) {
    list.innerHTML = '<div class="empty">No recent blocks</div>';
    return;
  }
  list.innerHTML = blocked.slice(0, 60).map(q => `
    <div class="block-item">
      <span class="domain" title="${escapeHtml(q[2])}">${escapeHtml(q[2])}</span>
      <span class="client">${escapeHtml(q[3])}</span>
      <span class="time">${timeAgo(q[0])}</span>
    </div>
  `).join('');
}

async function suspendPihole(seconds) {
  pausedUntil = seconds > 0 ? Date.now() + seconds * 1000 : 0;
  chrome.storage.local.set({ pausedUntil });
  await fetch(
    `http://${config.piholeIp}/admin/api.php?disable=${seconds}&auth=${config.piholeToken}`,
    { signal: AbortSignal.timeout(5000) }
  );
  document.getElementById('suspend-panel').style.display = 'none';
  await refresh();
}

async function enablePihole() {
  pausedUntil = null;
  chrome.storage.local.remove('pausedUntil');
  await fetch(
    `http://${config.piholeIp}/admin/api.php?enable&auth=${config.piholeToken}`,
    { signal: AbortSignal.timeout(5000) }
  );
  await refresh();
}

async function refresh() {
  try {
    const [summary, blocked] = await Promise.all([fetchSummary(), fetchRecentBlocked()]);
    updateStats(summary);
    updateBlockedList(blocked);
    document.getElementById('error').style.display = 'none';
    document.getElementById('last-updated').textContent =
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch (e) {
    document.getElementById('error').textContent = `Connection error: ${e.message}`;
    document.getElementById('error').style.display = 'block';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get(['piholeIp', 'piholeToken', 'pausedUntil']);
  if (stored.pausedUntil !== undefined) pausedUntil = stored.pausedUntil;
  if (!stored.piholeIp || !stored.piholeToken) {
    document.getElementById('no-config').style.display = 'block';
    document.getElementById('main').style.display = 'none';
    document.getElementById('open-settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
    return;
  }

  config = stored;
  document.getElementById('settings-btn').addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.getElementById('admin-btn').addEventListener('click', () => chrome.tabs.create({ url: `http://${config.piholeIp}/admin/` }));

  document.getElementById('suspend-btn').addEventListener('click', async () => {
    if (isCurrentlyPaused) {
      await enablePihole();
    } else {
      const panel = document.getElementById('suspend-panel');
      panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
    }
  });

  document.querySelectorAll('.dur-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await suspendPihole(parseInt(btn.dataset.seconds));
    });
  });

  await refresh();
  setInterval(refresh, REFRESH_MS);
  setInterval(renderPausedStatus, 1000);
});
