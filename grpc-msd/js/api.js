// ============================================================
// API CLIENT - pengganti google.script.run (fetch ke GAS REST API)
// ============================================================
// Penting: POST memakai Content-Type text/plain agar browser tidak
// mengirim CORS preflight (yang tidak didukung Google Apps Script).
async function api(name, ...args) {
  const cfg = window.GRPC_CONFIG || {};
  const url = String(cfg.GAS_URL || '').trim();
  if (!/^https:\/\/script\.google\.com\/(macros\/s\/|a\/[^/]+\/macros\/s\/)[^/]+\/exec$/.test(url)) {
    throw new Error('URL backend belum diisi. Edit file js/config.js, isi GAS_URL dengan URL /exec dari deployment Apps Script.');
  }
  if (name !== 'loginUser') args.push(window.appState.sessionToken);
  const requestToken = window.appState.sessionToken;

  let result;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: name, args: args })
    });
    result = await res.json();
  } catch (err) {
    throw new Error('Koneksi server gagal. Periksa internet Anda dan pastikan deployment Apps Script berakses "Anyone".');
  }

  if (name !== 'loginUser' && requestToken !== window.appState.sessionToken) throw new Error('Sesi berubah.');
  if (result && result.success) return result;
  throw new Error((result && result.message) || 'Operasi gagal.');
}
