chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('poll', { periodInMinutes: 1 });
  poll();
});

chrome.runtime.onStartup.addListener(poll);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'poll') poll();
});

async function poll() {
  const { piholeIp, piholeToken, pausedUntil } = await chrome.storage.local.get(['piholeIp', 'piholeToken', 'pausedUntil']);
  if (!piholeIp || !piholeToken) {
    chrome.action.setBadgeText({ text: '?' });
    chrome.action.setBadgeBackgroundColor({ color: '#888' });
    return;
  }
  try {
    const res = await fetch(
      `http://${piholeIp}/admin/api.php?summary&auth=${piholeToken}`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await res.json();
    const pct = Math.round(parseFloat(data.ads_percentage_today) || 0);
    chrome.action.setBadgeText({ text: `${pct}%` });
    const isPaused = data.status !== 'enabled' && pausedUntil !== undefined;
    chrome.action.setBadgeBackgroundColor({
      color: data.status === 'enabled' ? '#a6e3a1' : isPaused ? '#fab387' : '#f38ba8'
    });
  } catch {
    chrome.action.setBadgeText({ text: 'ERR' });
    chrome.action.setBadgeBackgroundColor({ color: '#f38ba8' });
  }
}
