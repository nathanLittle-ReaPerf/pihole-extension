const ipInput = document.getElementById('piholeIp');
const tokenInput = document.getElementById('piholeToken');
const status = document.getElementById('status');

chrome.storage.local.get(['piholeIp', 'piholeToken'], (stored) => {
  if (stored.piholeIp) ipInput.value = stored.piholeIp;
  if (stored.piholeToken) tokenInput.value = stored.piholeToken;
});

document.getElementById('save-btn').addEventListener('click', async () => {
  const ip = ipInput.value.trim();
  const token = tokenInput.value.trim();

  if (!ip || !token) {
    status.textContent = 'Both fields are required.';
    status.className = 'error';
    return;
  }

  try {
    const res = await fetch(`http://${ip}/admin/api.php?summary&auth=${token}`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (!data.dns_queries_today && data.dns_queries_today !== 0) {
      throw new Error('Unexpected response — check your IP and token.');
    }

    await chrome.storage.local.set({ piholeIp: ip, piholeToken: token });
    status.textContent = 'Saved! Connection verified.';
    status.className = '';
  } catch (e) {
    status.textContent = `Error: ${e.message}`;
    status.className = 'error';
  }
});
