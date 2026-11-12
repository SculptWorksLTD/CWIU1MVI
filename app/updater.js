const { app, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');
const REPO = 'SculptWorksLTD/CWIU1MVI';
const WEB_BASES = ['https://raw.githubusercontent.com/SculptWorksLTD/CWIU1MVI/main/web/', 'https://raw.githubusercontent.com/SculptWorksLTD/CWIU1MVIRelease/main/web/'];
const crypto = require('crypto');
const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
function myBuild() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'build.json'), 'utf8')).build | 0; } catch { return 0; }
}
const cmpVer = (_a, _b) => {
  const _c = String(_a).split('.').map(Number), _d = String(_b).split('.').map(Number);
  for (let _e = 0; _e < 3; _e++) { if ((_c[_e] || 0) !== (_d[_e] || 0)) return (_c[_e] || 0) - (_d[_e] || 0); }
  return 0;
};
function installedWithSetup() {
  try { return fs.readdirSync(path.dirname(app.getPath('exe'))).some((_f) => /^Uninstall .*\.exe$/i.test(_f)); } catch { return false; }
}
function readJson(_g) { try { return JSON.parse(fs.readFileSync(_g, 'utf8')); } catch { return null; } }
const webDir = () => path.join(app.getPath('userData'), 'web');
const bundledWeb = () => (readJson(path.join(__dirname, 'web.json')) || {}).web || '0.0.0';
function cachedWeb() {
  const _h = readJson(path.join(webDir(), 'web.json')), _i = path.join(webDir(), 'cwiu1mvi.html');
  if (!_h || !_h.web || !fs.existsSync(_i)) return null;
  if (cmpVer(_h.web, bundledWeb()) <= 0) return null;
  if (_h.minShell && cmpVer(_h.minShell, app.getVersion()) > 0) return null;
  return { web: _h.web, file: _i };
}
function pagePath() { const _j = cachedWeb(); return _j ? _j.file : path.join(__dirname, 'cwiu1mvi.html'); }
function webVersion() { const _k = cachedWeb(); return _k ? _k.web : bundledWeb(); }
function info() { return { version: app.getVersion(), build: myBuild(), web: webVersion() }; }
async function checkWeb() {
  let _l = null, _m = WEB_BASES[0];
  for (const _n of WEB_BASES) {
    try { const _o = await net.fetch(_n + 'manifest.json?t=' + Date.now(), { headers: { 'User-Agent': 'CWIU1MVI-updater', 'Cache-Control': 'no-cache' } }); if (_o.ok) { _l = _o; _m = _n; break; } _l = _l || _o; } catch (_p) { if (!_l && _n === WEB_BASES[WEB_BASES.length - 1]) throw _p; }
  }
  if (!_l || !_l.ok) return { available: false, reason: 'web ' + (_l ? _l.status : 'rete') };
  const _q = await _l.json();
  if (!_q || !_q.web || !_q.file || !/^[a-z0-9.-]+\.html$/i.test(_q.file) || !/^[0-9a-f]{64}$/.test(_q.sha256 || '')) return { available: false, reason: 'manifest' };
  if (_q.minShell && cmpVer(_q.minShell, app.getVersion()) > 0) return { available: false, reason: 'shell', needShell: _q.minShell };
  if (cmpVer(_q.web, webVersion()) <= 0) return { available: false, current: info() };
  return { available: true, kind: 'web', version: _q.web, build: 0, current: info(), url: _m + _q.file, sha256: _q.sha256, size: _q.size || 0, minShell: _q.minShell || '', writable: true };
}
async function installWeb(_r, _s) {
  const _t = await net.fetch(_r.url + '?t=' + Date.now(), { headers: { 'User-Agent': 'CWIU1MVI-updater', 'Cache-Control': 'no-cache' } });
  if (!_t.ok) throw new Error('download ' + _t.status);
  const _u = Buffer.from(await _t.arrayBuffer());
  _s(1);
  if (crypto.createHash('sha256').update(_u).digest('hex') !== _r.sha256) throw new Error('checksum mismatch');
  const _v = webDir();
  await fs.promises.mkdir(_v, { recursive: true });
  await fs.promises.writeFile(path.join(_v, 'cwiu1mvi.html.tmp'), _u);
  await fs.promises.rename(path.join(_v, 'cwiu1mvi.html.tmp'), path.join(_v, 'cwiu1mvi.html'));
  await fs.promises.writeFile(path.join(_v, 'web.json'), JSON.stringify({ web: _r.version, minShell: _r.minShell }));
  return path.join(_v, 'cwiu1mvi.html');
}
function installTarget() {
  const _w = app.getPath('exe');
  return isMac ? path.resolve(_w, '../../..') : path.dirname(_w);
}
async function check() {
  if (!app.isPackaged) return { available: false, reason: 'dev' };
  let _x = null;
  try { _x = await checkFull(); } catch (_y) { _x = null; }
  if (_x && _x.available) {
    if (failedBefore(_x)) { logLine('aggiornamento a ' + _x.version + ' già tentato senza successo: niente nuovo tentativo automatico'); _x = { ..._x, available: false, failed: true }; }
    else return _x;
  }
  try { const _z = await checkWeb(); if (_z.available) return _z; return (_x && _x.failed) ? _x : (_x || _z); } catch (_A) { if (_x) return _x; throw _A; }
}
async function checkFull() {
  if (!isMac && !isWin) return { available: false, reason: 'platform' };
  const _B = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'CWIU1MVI-updater' },
  });
  if (!_B.ok) throw new Error('GitHub ' + _B.status);
  const _C = await _B.json();
  const _D = /^v?(\d+\.\d+\.\d+)(?:-build(\d+))?$/.exec(_C.tag_name || '');
  if (!_D) return { available: false, reason: 'tag' };
  const _E = _D[1], _F = +(_D[2] || 0), _G = info();
  const _H = cmpVer(_E, _G.version) > 0 || (cmpVer(_E, _G.version) === 0 && _G.build > 0 && _F > _G.build);
  const _I = isWin && installedWithSetup() ? (_C.assets || []).find((_J) => /-Setup\.exe$/.test(_J.name)) : null;
  const _K = isMac ? /-Mac\.zip$/ : /-Windows\.zip$/;
  const _L = _I || (_C.assets || []).find((_M) => _K.test(_M.name));
  if (!_H || !_L) return { available: false, version:_E, build:_F, current: _G };
  const _N = installTarget();
  let _O = true;
  try { await fs.promises.access(path.dirname(_N), fs.constants.W_OK); } catch { _O = false; }
  if (isMac && /AppTranslocation/.test(_N)) _O = false;
  return { available: true, kind: 'app', version:_E, build:_F, current: _G, url: _L.browser_download_url, size: _L.size, writable:_O, target:_N, setup: !!_I };
}
const stateFile = () => path.join(app.getPath('userData'), 'update-state.json');
const logFile = () => path.join(app.getPath('userData'), 'update-log.txt');
function logLine(_P) { try { fs.appendFileSync(logFile(), new Date().toISOString() + ' ' + _P + '\n'); } catch {} }
function markAttempt(_Q) {
  const _R = _Q.version + '-' + (_Q.build || 0), _S = readJson(stateFile()) || {};
  const _T = _S.target === _R ? (_S.tries || 0) + 1 : 1;
  try { fs.writeFileSync(stateFile(), JSON.stringify({ target: _R, tries:_T, at: Date.now(), from: app.getVersion() + '-' + myBuild() })); } catch {}
  logLine(`tentativo ${_T} di aggiornare ${app.getVersion()}-${myBuild()} a ${_R} (${_Q.setup ? 'installer' : 'zip'})`);
}
function failedBefore(_U) {
  const _V = readJson(stateFile());
  return !!(_V && _V.target === _U.version + '-' + (_U.build || 0) && _V.tries >= 1 && Date.now() - _V.at < 7 * 864e5);
}
let abort = null;
function cancel() { if (abort) abort.abort(); abort = null; }
async function download(_W, _X, _Y, _Z) {
  abort = new AbortController();
  const _aa = await net.fetch(_W, { signal: abort.signal, headers: { 'User-Agent': 'CWIU1MVI-updater' } });
  if (!_aa.ok || !_aa.body) throw new Error('download ' + _aa.status);
  const _ab = +_aa.headers.get('content-length') || _X || 0;
  const _ac = fs.createWriteStream(_Y);
  const _ad = _aa.body.getReader();
  let _ae = 0, _af = 0;
  try {
    for (;;) {
      const { value:_ag, done:_ah } = await _ad.read();
      if (_ah) break;
      _ae += _ag.length;
      if (!_ac.write(Buffer.from(_ag))) await new Promise((_ai) => _ac.once('drain', _ai));
      const _aj = Date.now();
      if (_aj - _af > 150) { _af = _aj; _Z(_ab ? _ae / _ab : 0); }
    }
  } finally {
    await new Promise((_ak) => _ac.end(_ak));
    abort = null;
  }
  if (_ab && _ae < _ab) throw new Error('incomplete download');
  _Z(1);
}
const run = (_al, _am) => new Promise((_an, _ao) => execFile(_al, _am, { windowsHide: true }, (_ap) => (_ap ? _ao(_ap) : _an())));
function findNew(_aq) {
  const _ar = isMac ? (_as) => _as.endsWith('.app') : (_at) => _at.toLowerCase() === 'cwiu1mvi.exe';
  const _au = (_av, _aw) => {
    for (const _ax of fs.readdirSync(_av)) {
      const _ay = path.join(_av, _ax);
      if (_ar(_ax)) return isMac ? _ay : _av;
      if (_aw < 3 && fs.statSync(_ay).isDirectory() && !_ax.endsWith('.app')) { const _az = _au(_ay, _aw + 1); if (_az) return _az; }
    }
    return null;
  };
  return _au(_aq, 0);
}
async function install(_aA, _aB) {
  const _aC = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cwiu1mvi-upd-'));
  const _aD = process.pid;
  const _aE = (_aF) => "'" + String(_aF).replace(/'/g, "''") + "'";
  const _aG = () => `$log = ${_aE(logFile())}
function L($m) { Add-Content -LiteralPath $log -Value ((Get-Date -Format s) + ' ' + $m) }
L 'script di aggiornamento avviato'
$dir = ${_aE(path.dirname(app.getPath('exe')))}
$t = 0; while ((Get-Process -Id ${_aD} -ErrorAction SilentlyContinue) -and $t -lt 600) { Start-Sleep -Milliseconds 200; $t++ }
function Start-App($exe) {
  for ($i = 0; $i -lt 3; $i++) {
    Start-Sleep -Seconds 3
    if (Mine) { L 'app ripartita'; return }
    if ($i -eq 0) { L 'app non ripartita: la avvio'; Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) }
    else { L 'app ancora ferma: la avvio tramite explorer'; Start-Process -FilePath 'explorer.exe' -ArgumentList ('"' + $exe + '"') }
  }
  Start-Sleep -Seconds 3
  if (Mine) { L 'app ripartita' } else { L 'app NON ripartita' }
}
function Mine { Get-Process -Name 'CWIU1MVI' -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($dir, [System.StringComparison]::OrdinalIgnoreCase) } }
$t = 0; while ((Mine) -and $t -lt 150) { Start-Sleep -Milliseconds 200; $t++ }
Mine | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
L 'app chiusa, inizio sostituzione'
`;
  const _aH = async (_aI, _aJ) => {
    const _aK = path.join(_aC, _aI);
    await fs.promises.writeFile(_aK, '\ufeff' + _aG() + _aJ, 'utf8');
    const _aL = `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${_aK}"`;
    const _aM = await new Promise((_aN) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = ${_aE(_aL)} }; exit [int]$r.ReturnValue`],
      { windowsHide: true, timeout: 20000 }, (_aO) => _aN(!_aO));
    });
    logLine('script di aggiornamento lanciato ' + (_aM ? 'tramite WMI' : 'direttamente (WMI non disponibile)'));
    if (!_aM) spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', _aK], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  };
  if (isWin && _aA.setup) {
    const _aP = path.join(_aC, 'CWIU1MVI-Setup.exe');
    await download(_aA.url, _aA.size, _aP, _aB);
    markAttempt(_aA);
    await _aH('setup.ps1', `$p = Start-Process -FilePath ${_aE(_aP)} -ArgumentList '/S','/currentuser','--force-run' -Wait -PassThru
L ('installer terminato, codice ' + $p.ExitCode)
Start-App ${_aE(app.getPath('exe'))}
Remove-Item -LiteralPath ${_aE(_aC)} -Recurse -Force -ErrorAction SilentlyContinue
`);
    setTimeout(() => app.quit(), 1000);
    return;
  }
  const _aQ = path.join(_aC, 'update.zip');
  await download(_aA.url, _aA.size, _aQ, _aB);
  const _aR = path.join(_aC, 'x');
  await fs.promises.mkdir(_aR);
  if (isMac) await run('/usr/bin/ditto', ['-x', '-k', _aQ, _aR]);
  else await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${_aQ.replace(/'/g, "''")}' -DestinationPath '${_aR.replace(/'/g, "''")}' -Force`]);
  const _aS = findNew(_aR);
  if (!_aS) throw new Error('invalid archive');
  const _aT = installTarget();
  markAttempt(_aA);
  if (isMac) {
    const _aU = path.join(_aC, 'swap.sh');
    await fs.promises.writeFile(_aU, `#!/bin/sh
while kill -0 ${_aD} 2>/dev/null; do sleep 0.3; done
OLD=${JSON.stringify(_aT)}
NEW=${JSON.stringify(_aS)}
mv "$OLD" "$OLD.old-update" && mv "$NEW" "$OLD" || { mv "$OLD.old-update" "$OLD" 2>/dev/null; open "$OLD"; exit 1; }
rm -rf "$OLD.old-update"
xattr -dr com.apple.quarantine "$OLD" 2>/dev/null
open "$OLD"
rm -rf ${JSON.stringify(_aC)}
`);
    spawn('/bin/sh', [_aU], { detached: true, stdio: 'ignore' }).unref();
  } else {
    await _aH('swap.ps1', `robocopy ${_aE(_aS)} ${_aE(_aT)} /E /IS /IT /R:10 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
L ('copia terminata, codice robocopy ' + $LASTEXITCODE)
Start-Process -FilePath ${_aE(path.join(_aT, path.basename(app.getPath('exe'))))}
Start-App ${_aE(path.join(_aT, path.basename(app.getPath('exe'))))}
Remove-Item -LiteralPath ${_aE(_aC)} -Recurse -Force -ErrorAction SilentlyContinue
`);
  }
  setTimeout(() => app.quit(), 300);
}
module.exports = { check, install, installWeb, cancel, info, pagePath, logFile };
