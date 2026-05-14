chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('poll', { periodInMinutes: 1 });
  poll();
});

chrome.runtime.onStartup.addListener(poll);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'poll') poll();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'pausedUntil' in changes) poll();
});

function makeIcon(color) {
  const imageData = {};
  for (const size of [16, 32]) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const r = size / 2;
    ctx.beginPath();
    ctx.arc(r, r, r - 1, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    imageData[size] = ctx.getImageData(0, 0, size, size);
  }
  return imageData;
}

async function poll() {
  const { piholeIp, piholeToken, pausedUntil } = await chrome.storage.local.get(['piholeIp', 'piholeToken', 'pausedUntil']);
  if (!piholeIp || !piholeToken) {
    chrome.action.setIcon({ imageData: makeIcon('#888888') });
    chrome.action.setBadgeText({ text: '?' });
    chrome.action.setBadgeBackgroundColor({ color: '#888' });
    return;
  }
  try {
    const res = await fetch(
      `http://${piholeIp}/admin/api.php?summary&auth=${piholeToken}`,
      { signal: AbortSignal.timeout(5000), cache: 'no-store' }
    );
    const data = await res.json();
    const pct = Math.round(parseFloat(data.ads_percentage_today) || 0);
    const isPaused = data.status !== 'enabled' && pausedUntil !== undefined;
    const color = data.status === 'enabled' ? '#a6e3a1' : isPaused ? '#fab387' : '#f38ba8';
    chrome.action.setIcon({ imageData: makeIcon(color) });
    chrome.action.setBadgeText({ text: `${pct}%` });
    chrome.action.setBadgeBackgroundColor({ color });
  } catch {
    chrome.action.setIcon({ imageData: makeIcon('#f38ba8') });
    chrome.action.setBadgeText({ text: 'ERR' });
    chrome.action.setBadgeBackgroundColor({ color: '#f38ba8' });
  }
}
