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

async function fetchTopBlocked() {
  const res = await fetch(
    `http://${config.piholeIp}/admin/api.php?topItems&auth=${config.piholeToken}`,
    { signal: AbortSignal.timeout(5000) }
  );
  const data = await res.json();
  return Object.entries(data.top_ads || {});
}

async function fetchRecentQueries() {
  const res = await fetch(
    `http://${config.piholeIp}/admin/api.php?getAllQueries=200&auth=${config.piholeToken}`,
    { signal: AbortSignal.timeout(5000) }
  );
  const data = await res.json();
  const all = data.data || [];
  return {
    blocked: all.filter(q => BLOCKED_STATUSES.has(parseInt(q[4]))),
    allowed: all.filter(q => !BLOCKED_STATUSES.has(parseInt(q[4]))),
  };
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

async function whitelistDomain(domain, row) {
  try {
    await fetch(
      `http://${config.piholeIp}/admin/api.php?list=white&add=${encodeURIComponent(domain)}&auth=${config.piholeToken}`,
      { signal: AbortSignal.timeout(5000) }
    );
    row.innerHTML = `<span class="whitelisted-msg">✓ ${escapeHtml(domain)}</span>`;
    setTimeout(() => row.remove(), 2000);
  } catch (e) {
    const btn = row.querySelector('.allow-btn');
    btn.textContent = '!';
    setTimeout(() => { btn.textContent = '+'; }, 2000);
  }
}

async function blacklistDomain(domain, row) {
  try {
    await fetch(
      `http://${config.piholeIp}/admin/api.php?list=black&add=${encodeURIComponent(domain)}&auth=${config.piholeToken}`,
      { signal: AbortSignal.timeout(5000) }
    );
    row.innerHTML = `<span class="blacklisted-msg">✕ ${escapeHtml(domain)}</span>`;
    setTimeout(() => row.remove(), 2000);
  } catch (e) {
    const btn = row.querySelector('.block-btn');
    btn.textContent = '!';
    setTimeout(() => { btn.textContent = '−'; }, 2000);
  }
}

function deduplicateByDomain(queries) {
  const seen = new Map();
  for (const q of queries) {
    const domain = q[2];
    if (!seen.has(domain)) {
      seen.set(domain, { q, count: 1 });
    } else {
      seen.get(domain).count++;
    }
  }
  return [...seen.values()];
}

function updateBlockedList(blocked) {
  const list = document.getElementById('blocked-list');
  if (!blocked.length) {
    list.innerHTML = '<div class="empty">No recent blocks</div>';
    return;
  }
  const deduped = deduplicateByDomain(blocked).slice(0, 60);
  list.innerHTML = deduped.map(({ q, count }) => `
    <div class="block-item">
      <span class="domain" title="${escapeHtml(q[2])}">${escapeHtml(q[2])}</span>
      ${count > 1 ? `<span class="repeat-count">×${count}</span>` : ''}
      <span class="client">${escapeHtml(q[3])}</span>
      <span class="time">${timeAgo(q[0])}</span>
      <button class="allow-btn" data-domain="${escapeHtml(q[2])}" title="Whitelist domain">+</button>
    </div>
  `).join('');

  list.querySelectorAll('.allow-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      whitelistDomain(btn.dataset.domain, btn.closest('.block-item'));
    });
  });
}

function updateAllowedList(allowed) {
  const list = document.getElementById('allowed-list');
  if (!allowed.length) {
    list.innerHTML = '<div class="empty">No recent allowed queries</div>';
    return;
  }
  list.innerHTML = allowed.slice(0, 60).map(q => `
    <div class="block-item">
      <a class="domain-link" href="http://${escapeHtml(q[2])}" title="Open ${escapeHtml(q[2])}" data-domain="${escapeHtml(q[2])}">${escapeHtml(q[2])}</a>
      <span class="client">${escapeHtml(q[3])}</span>
      <span class="time">${timeAgo(q[0])}</span>
      <button class="block-btn" data-domain="${escapeHtml(q[2])}" title="Blacklist domain">−</button>
    </div>
  `).join('');

  list.querySelectorAll('.domain-link').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: `http://${a.dataset.domain}` });
    });
  });

  list.querySelectorAll('.block-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      blacklistDomain(btn.dataset.domain, btn.closest('.block-item'));
    });
  });
}

function updateTopList(entries) {
  const list = document.getElementById('top-list');
  if (!entries.length) {
    list.innerHTML = '<div class="empty">No data yet</div>';
    return;
  }
  const max = entries[0][1];
  list.innerHTML = entries.map(([domain, count]) => `
    <div class="block-item top-item">
      <div class="top-bar-wrap">
        <div class="top-bar" style="width:${Math.round((count / max) * 100)}%"></div>
        <span class="domain" title="${escapeHtml(domain)}">${escapeHtml(domain)}</span>
      </div>
      <span class="top-count">${count.toLocaleString()}</span>
      <button class="allow-btn" data-domain="${escapeHtml(domain)}" title="Whitelist domain">+</button>
    </div>
  `).join('');

  list.querySelectorAll('.allow-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      whitelistDomain(btn.dataset.domain, btn.closest('.block-item'));
    });
  });
}

function applySearch(term) {
  const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
  const list = document.getElementById(`${activeTab}-list`);
  const lower = term.toLowerCase();
  list.querySelectorAll('.block-item').forEach(row => {
    const domain = (row.querySelector('.domain, .domain-link') || {}).textContent || '';
    row.style.display = domain.toLowerCase().includes(lower) ? '' : 'none';
  });
}

async function suspendPihole(seconds) {
  await fetch(
    `http://${config.piholeIp}/admin/api.php?disable=${seconds}&auth=${config.piholeToken}`,
    { signal: AbortSignal.timeout(5000) }
  );
  pausedUntil = seconds > 0 ? Date.now() + seconds * 1000 : 0;
  chrome.storage.local.set({ pausedUntil });
  document.getElementById('suspend-panel').style.display = 'none';
  await refresh();
}

async function enablePihole() {
  await fetch(
    `http://${config.piholeIp}/admin/api.php?enable&auth=${config.piholeToken}`,
    { signal: AbortSignal.timeout(5000) }
  );
  pausedUntil = null;
  chrome.storage.local.remove('pausedUntil');
  await refresh();
}

async function refresh() {
  try {
    const [summary, queries, topEntries] = await Promise.all([fetchSummary(), fetchRecentQueries(), fetchTopBlocked()]);
    updateStats(summary);
    updateBlockedList(queries.blocked);
    updateAllowedList(queries.allowed);
    updateTopList(topEntries);
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

  const searchInput = document.getElementById('search');
  searchInput.addEventListener('input', () => applySearch(searchInput.value));

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('blocked-list').style.display = tab === 'blocked' ? '' : 'none';
      document.getElementById('allowed-list').style.display = tab === 'allowed' ? '' : 'none';
      document.getElementById('top-list').style.display = tab === 'top' ? '' : 'none';
      searchInput.value = '';
    });
  });

  await refresh();
  setInterval(refresh, REFRESH_MS);
  setInterval(renderPausedStatus, 1000);
});
