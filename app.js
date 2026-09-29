let walletAddress = localStorage.getItem('derom-devnet-address') || '';
let nodeState = null;
let toastTimer;
const toast = document.querySelector('#toast');
const walletDialog = document.querySelector('#walletDialog');
const setupDialog = document.querySelector('#setupDialog');
function showToast(message) {
  toast.textContent = message; toast.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2700);
}
function targetLabel(seconds) {
  return seconds % 60 === 0 ? `${seconds / 60} minute${seconds === 60 ? '' : 's'}` : `${seconds} seconds`;
}
function updateWallet(address) {
  walletAddress = address; localStorage.setItem('derom-devnet-address', address);
  document.querySelector('#walletEmpty').classList.add('hidden');
  document.querySelector('#walletCreated').classList.remove('hidden');
  document.querySelector('#addressText').textContent = address;
  document.querySelector('#copyAddress').disabled = false;
  refreshBalance();
}
async function copyText(value, success) {
  try { await navigator.clipboard.writeText(value); showToast(success); }
  catch { showToast('Clipboard access is unavailable in this browser'); }
}
async function api(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options, headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Node request failed (${response.status})`);
  return data;
}
async function refreshBalance() {
  if (!walletAddress) { document.querySelector('#balance').textContent = '0.00'; return; }
  try {
    const data = await api('/api/balance/' + encodeURIComponent(walletAddress));
    const amount = Number(BigInt(data.atomicUnits)) / 100_000_000;
    const formatted = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 });
    document.querySelector('#balance').textContent = formatted;
    document.querySelector('#balanceNote').textContent = formatted + ' DERM';
  } catch { /* A stopped node is shown by the connection status. */ }
}
async function refreshState() {
  try {
    nodeState = await api('/api/state');
    document.querySelector('#nodeLabel').textContent = 'Node running';
    const blockTarget = targetLabel(nodeState.targetSpacingSeconds || 300);
    const minShareDiff = Number(nodeState.minimumShareDifficulty);
    const shareFloorLoaded = Number.isSafeInteger(minShareDiff) && minShareDiff > 0;
    document.querySelector('#shareDifficulty').textContent = shareFloorLoaded ? minShareDiff.toLocaleString() : 'Restart node to apply';
    document.querySelector('#shareDescription').textContent = shareFloorLoaded
      ? `Mine directly against this node. Stratum accepts shares at difficulty ${minShareDiff.toLocaleString()} or higher; network-valid solutions become coinbase rewards.`
      : 'This node is running an older version. Restart it to apply the 1,000 minimum share difficulty and share counter.';
    document.querySelector('#nodeDetail').textContent = `${nodeState.network} · height ${nodeState.height} · ${blockTarget} target`;
    document.querySelector('#nodeDot').style.background = '#b7f36a';
    document.querySelector('#networkPill').innerHTML = '<i></i> DEVNET · CONNECTED';
    document.querySelector('#height').textContent = nodeState.height.toLocaleString();
    document.querySelector('#heightHint').innerHTML = '<span class="muted-dot"></span> Local development chain';
    document.querySelector('#miners').textContent = nodeState.miners;
    document.querySelector('#minerHint').innerHTML = `<span class="muted-dot"></span> ${nodeState.miners ? 'Mining connections active' : 'No ASIC has authorized'} · ${shareFloorLoaded ? `${Number(nodeState.acceptedShares || 0).toLocaleString()} accepted / ${Number(nodeState.rejectedShares || 0).toLocaleString()} rejected` : 'restart node to enable share counting'}`;
    document.querySelector('#endpoint').textContent = nodeState.stratum;
    document.querySelector('#endpointHelp').textContent = nodeState.miners
      ? `Connected · ${nodeState.network} · ${blockTarget} block target · ${shareFloorLoaded ? `min share diff ${minShareDiff.toLocaleString()}` : 'restart node to apply share floor'}`
      : nodeState.stratum.includes('127.0.0.1')
        ? 'No miner yet. 127.0.0.1 works only on this computer; for a separate ASIC, stop this node and start it with start-lan.bat.'
        : `No miner yet. Configure the ASIC to this node’s LAN address on port ${nodeState.stratum.split(':').pop()}.`;
    document.querySelector('#minerStatus').innerHTML = `<i class="${nodeState.miners ? '' : 'muted-dot'}"></i> ${nodeState.miners ? `${nodeState.miners} miner${nodeState.miners === 1 ? '' : 's'} connected` : 'No miner authorized yet'}`;
    const activity = document.querySelector('.activity-empty');
    if (nodeState.latest) {
      activity.innerHTML = `<div class="activity-orbit"><span>⌁</span></div><div><b>Block ${nodeState.latest.height.toLocaleString()} mined</b><p>${nodeState.latest.id} · ${(Number(BigInt(nodeState.latest.reward)) / 100_000_000).toLocaleString()} DERM coinbase reward</p></div><span class="activity-status"><i></i> Latest block</span>`;
    } else {
      activity.innerHTML = '<div class="activity-orbit"><span>⌁</span></div><div><b>No blocks mined yet</b><p>Connect a SHA-256d miner to this node’s Stratum endpoint.</p></div><span class="activity-status"><i></i> Waiting for miner</span>';
    }
    if (walletAddress) await refreshBalance();
  } catch {
    nodeState = null;
    document.querySelector('#nodeLabel').textContent = 'Node not running';
    document.querySelector('#nodeDetail').textContent = 'Start the local node';
    document.querySelector('#nodeDot').style.background = '#d5a54f';
    document.querySelector('#networkPill').innerHTML = '<i></i> DEVNET · OFFLINE';
    document.querySelector('#height').textContent = '—';
    document.querySelector('#heightHint').innerHTML = '<span class="muted-dot"></span> Waiting for local node';
    document.querySelector('#miners').textContent = '—';
    document.querySelector('#minerHint').innerHTML = '<span class="muted-dot"></span> No node data';
    document.querySelector('#endpointHelp').textContent = 'Start the local node to enable mining';
  }
}
function openWalletDialog() {
  document.querySelector('#walletError').textContent = '';
  document.querySelector('#walletForm').reset();
  walletDialog.showModal();
}
document.querySelector('#createWallet').addEventListener('click', openWalletDialog);
document.querySelector('#createWalletSecondary').addEventListener('click', openWalletDialog);
document.querySelector('#walletForm').addEventListener('submit', async event => {
  event.preventDefault();
  const passphrase = document.querySelector('#passphrase').value;
  const confirm = document.querySelector('#passphraseConfirm').value;
  const error = document.querySelector('#walletError');
  const submit = document.querySelector('#walletSubmit');
  error.textContent = '';
  if (passphrase !== confirm) { error.textContent = 'The passphrases do not match.'; return; }
  submit.disabled = true; submit.textContent = 'Generating and encrypting key…';
  try {
    const result = await api('/api/wallet/create', { method: 'POST', body: JSON.stringify({ passphrase }) });
    updateWallet(result.address); walletDialog.close();
    showToast('Encrypted DeroM development wallet created');
    downloadBackup(result.backup, result.address);
  } catch (e) { error.textContent = e.message; }
  finally { submit.disabled = false; submit.textContent = 'Create encrypted wallet'; }
});
function downloadBackup(data, address) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `derom-wallet-${address}.json`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
document.querySelector('#backupBtn').addEventListener('click', async () => {
  if (!walletAddress) return;
  try { downloadBackup(await api('/api/wallet/backup/' + encodeURIComponent(walletAddress)), walletAddress); showToast('Encrypted wallet backup downloaded'); }
  catch (e) { showToast(e.message); }
});
document.querySelector('#copyAddress').addEventListener('click', () => copyText(walletAddress, 'Wallet address copied'));
document.querySelector('#copyAddressInline').addEventListener('click', () => copyText(walletAddress, 'Wallet address copied'));
document.querySelector('#copyEndpoint').addEventListener('click', () => copyText(nodeState?.stratum || 'stratum+tcp://127.0.0.1:3333', 'Stratum address copied'));
document.querySelector('#refreshBalance').addEventListener('click', refreshBalance);
document.querySelector('#refresh').addEventListener('click', async () => { await refreshState(); showToast('Node information refreshed'); });
document.querySelector('#setupNode').addEventListener('click', () => setupDialog.showModal());
document.querySelectorAll('.close-dialog,.close-action').forEach(el => el.addEventListener('click', () => el.closest('dialog').close()));
for (const dialog of [walletDialog, setupDialog]) dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
if (walletAddress) updateWallet(walletAddress);
refreshState();
setInterval(refreshState, 2500);
