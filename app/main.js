const { app, BrowserWindow, Menu, dialog, session, shell, systemPreferences, ipcMain, powerSaveBlocker } = require('electron');
if (process.platform === 'darwin') app.commandLine.appendSwitch('use-mock-keychain');
const path = require('path');
const fs = require('fs');
const updater = require('./updater');
const logDir = () => path.join(app.getPath('documents'), 'CWIU1MVI', 'Log');
const okName = (_a) => typeof _a === 'string' && /^[a-z0-9-]{1,60}\.(csv|adi)$/.test(_a);
const bom = (_b) => (/\.adi$/.test(_b) ? '' : '\ufeff');
ipcMain.handle('log-dir', () => logDir());
const appendQ = new Map();
function logAppend(_c, _d, _e) {
  const _f = logDir(), _g = path.join(_f, _c);
  const _h = async () => {
    await fs.promises.mkdir(_f, { recursive: true });
    let _i = true; try { await fs.promises.access(_g); } catch { _i = false; }
    await fs.promises.appendFile(_g, (_i ? '' : bom(_c) + (_d || '') + '\n') + _e + '\n', 'utf8');
    return true;
  };
  const _j = (appendQ.get(_g) || Promise.resolve()).then(_h, _h);
  appendQ.set(_g, _j.catch(() => {}));
  return _j;
}
ipcMain.handle('log-append', async (_k, { file:_l, header:_m, line:_n }) => {
  if (!okName(_l) || typeof _n !== 'string') return false;
  return logAppend(_l, _m, _n);
});
let mainDoing = '';
function mainLog(_o, _p) {
  const _q = new Date(), _r = '"' + String(_p == null ? '' : _p).replace(/"/g, "'") + '"';
  logAppend('eventi-' + _q.toISOString().slice(0, 10) + '.csv', 'utc;evento;dettaglio', [_q.toISOString().slice(11, 19), 'app: ' + _o, _r].join(';')).catch(() => {});
}
function mainStep(_s, _t) {   // segna cosa sta facendo il processo principale durante un'operazione che può durare
  const _u = mainDoing; mainDoing = _s;
  const _v = () => { mainDoing = _u; };
  try { const _w = _t(); if (_w && typeof _w.then === 'function') return _w.finally(_v); _v(); return _w; } catch (_x) { _v(); throw _x; }
}
{
  let _y = Date.now(), _z = Date.now();
  setInterval(() => {
    const _A = Date.now(), _B = _A - _y - 1000;
    if (_B > 3000) mainLog('bloccata', Math.round(_B / 1000) + ' s' + (mainDoing ? ' durante: ' + mainDoing : ''));
    if (_A - _z >= 5 * 60000) { _z = _A; mainLog('viva', app.getVersion() + (mainDoing ? ' · ' + mainDoing : '')); }
    _y = _A;
  }, 1000);
}
ipcMain.handle('log-write', async (_C, { file:_D, text:_E }) => {
  if (!okName(_D) || typeof _E !== 'string') return false;
  const _F = logDir();
  await fs.promises.mkdir(_F, { recursive: true });
  await fs.promises.writeFile(path.join(_F, _D), bom(_D) + _E, 'utf8');
  return true;
});
let rec = null;
const wavHead = (_G, _H) => {
  const _I = Buffer.alloc(44);
  _I.write('RIFF', 0); _I.writeUInt32LE(36 + _H, 4); _I.write('WAVE', 8); _I.write('fmt ', 12);
  _I.writeUInt32LE(16, 16); _I.writeUInt16LE(1, 20); _I.writeUInt16LE(1, 22); _I.writeUInt32LE(_G, 24);
  _I.writeUInt32LE(_G * 2, 28); _I.writeUInt16LE(2, 32); _I.writeUInt16LE(16, 34); _I.write('data', 36); _I.writeUInt32LE(_H, 40);
  return _I;
};
async function recFinish() {
  if (!rec) return false;
  const _J = rec; rec = null;
  try { await _J.fh.write(wavHead(_J.rate, _J.bytes), 0, 44, 0); await _J.fh.close(); } catch { return false; }
  return true;
}
ipcMain.handle('rec-open', async (_K, { file:_L, rate:_M }) => {
  if (typeof _L !== 'string' || !/^[a-z0-9-]{1,60}\.wav$/.test(_L)) return false;
  _M = Math.round(+_M); if (!(_M >= 4000 && _M <= 96000)) return false;
  await recFinish();
  const _N = logDir(); await fs.promises.mkdir(_N, { recursive: true });
  const _O = await fs.promises.open(path.join(_N, _L), 'w');
  await _O.write(wavHead(_M, 0), 0, 44, 0);
  rec = { fh:_O, rate:_M, bytes: 0, pos: 44 };
  return true;
});
ipcMain.handle('rec-append', async (_P, _Q) => {
  if (!rec || !(_Q instanceof Uint8Array)) return false;
  const _R = Buffer.from(_Q.buffer, _Q.byteOffset, _Q.byteLength);
  await rec.fh.write(_R, 0, _R.length, rec.pos); rec.pos += _R.length; rec.bytes += _R.length;
  return true;
});
ipcMain.handle('rec-close', () => recFinish());
const { ClusterLink } = require('./cluster');
const toPage = (_S, _T) => { if (win && !win.isDestroyed()) win.webContents.send(_S, _T); };
const cluster = new ClusterLink((_U) => toPage('cl-lines', _U), (_V) => { ui.cluster = _V.state; toPage('cl-state', _V); });
ipcMain.handle('cl-connect', (_W, _X) => {
  if (!_X || typeof _X.host !== 'string' || !/^[a-z0-9.-]{3,80}$/i.test(_X.host)) return false;
  const _Y = Math.round(+_X.port); if (!(_Y > 0 && _Y < 65536)) return false;
  const _Z = String(_X.call || '').toUpperCase(); if (!/^[A-Z0-9/]{3,15}$/.test(_Z)) return false;
  cluster.connect({ host: _X.host, port:_Y, call:_Z }); return true;
});
ipcMain.handle('cl-disconnect', () => { cluster.disconnect(); return true; });
ipcMain.handle('cl-send', (_aa, _ab) => { if (typeof _ab === 'string' && _ab.length < 120) cluster.write(_ab); return true; });
app.on('before-quit', () => cluster.disconnect(true));
app.on('before-quit', () => riggerClose());
ipcMain.handle('save-as', async (_ac, { name:_ad, text:_ae }) => {
  if (typeof _ad !== 'string' || typeof _ae !== 'string') return false;
  const _af = BrowserWindow.fromWebContents(_ac.sender) || undefined;
  const _ag = await dialog.showSaveDialog(_af, { defaultPath: path.join(app.getPath('documents'), _ad.replace(/[^\w.\-]/g, '_')), filters: [{ name: 'ADIF', extensions: ['adi'] }] });
  if (_ag.canceled || !_ag.filePath) return false;
  await fs.promises.writeFile(_ag.filePath, _ae, 'utf8');
  return _ag.filePath;
});
ipcMain.handle('log-open', async () => {
  await fs.promises.mkdir(logDir(), { recursive: true });
  return shell.openPath(logDir());
});
let upd = null;
const hamqth = require('./hamqth');
const { utilityProcess } = require('electron');
const RIGGER_DIR = '/tmp/TheRigger';
let rigger = null;
function riggerClose() {
  if (!rigger) return true;
  const _ah = rigger; rigger = null;
  if (_ah.sock) { try { _ah.sock.destroy(); } catch {} return true; }
  try { _ah.proc.kill(); } catch {}
  for (const _ai of _ah.pending.values()) _ai(false);
  _ah.pending.clear();
  return true;
}
const net = require('net');
function riggerWinEntries() {
  try {
    const _aj = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA || '', 'TheRigger', 'cat.json'), 'utf8'));
    return (Array.isArray(_aj) ? _aj : []).filter((_ak) => _ak && /^[A-Za-z0-9._-]{1,40}$/.test(_ak.id) && /^127\.0\.0\.1:\d{2,5}$/.test(_ak.addr));
  } catch { return []; }
}
function riggerWinAlive(_al) {
  return new Promise((_am) => {
    const [_an, _ao] = _al.split(':');
    const _ap = net.connect({ host:_an, port: +_ao });
    const _aq = (_ar) => { try { _ap.destroy(); } catch {} _am(_ar); };
    _ap.setTimeout(700, () => _aq(false));
    _ap.once('connect', () => _aq(true));
    _ap.once('error', () => _aq(false));
  });
}
function riggerAlive() {
  return new Promise((_as) => {
    require('child_process').execFile('ps', ['-axo', 'command='], { timeout: 3000, maxBuffer: 4 << 20 }, (_at, _au) => {
      if (_at) return _as(false);
      _as(String(_au).split('\n').some((_av) => /(^|\/)the ?rigger[^\/]*$/i.test(_av.trim().split(/\s+-/)[0])));
    });
  });
}
function riggerLost(_aw) {
  if (rigger !== _aw) return;
  riggerClose();
  if (win && !win.isDestroyed()) win.webContents.send('rigger-closed', _aw.name);
}
ipcMain.handle('rigger-list', async () => {
  if (process.platform === 'win32') {
    const _ax = riggerWinEntries();
    const _ay = await Promise.all(_ax.map((_az) => riggerWinAlive(_az.addr)));
    return _ax.filter((_aA, _aB) => _ay[_aB]).map((_aC) => _aC.id).sort();
  }
  if (!(await riggerAlive())) return [];
  try { return fs.readdirSync(RIGGER_DIR).filter((_aD) => /^[A-Za-z0-9._-]{1,40}$/.test(_aD)).sort(); } catch { return []; }
});
async function riggerOpen(_aE) {
  riggerClose();
  if (process.platform === 'win32') {
    const _aF = riggerWinEntries().find((_aG) => _aG.id === _aE);
    if (!_aF) return false;
    const [_aH, _aI] = _aF.addr.split(':');
    return await new Promise((_aJ) => {
      const _aK = net.connect({ host:_aH, port: +_aI });
      const _aL = { sock:_aK, name:_aE };
      _aK.setNoDelay(true);
      _aK.once('connect', () => { rigger = _aL; _aJ(true); });
      _aK.on('data', (_aM) => { if (rigger === _aL && win && !win.isDestroyed()) win.webContents.send('rigger-data', new Uint8Array(_aM)); });
      _aK.on('error', () => { if (rigger !== _aL) _aJ(false); riggerLost(_aL); });
      _aK.on('close', () => riggerLost(_aL));
    });
  }
  if (typeof _aE !== 'string' || !/^[A-Za-z0-9._-]{1,40}$/.test(_aE)) return false;
  if (!(await riggerAlive())) return false;
  let _aN;
  try { _aN = fs.realpathSync(path.join(RIGGER_DIR, _aE)); } catch { return false; }
  if (!/^\/dev\/(ttys\d+|pts\/\d+)$/.test(_aN)) return false;
  let _aO;
  try { _aO = utilityProcess.fork(path.join(__dirname, 'rigger-io.js'), [], { serviceName: 'CWIU1MVI porta The Rigger' }); } catch { return false; }
  const _aP = { proc:_aO, name:_aE, pending: new Map(), seq: 0 };
  rigger = _aP;
  return await new Promise((_aQ) => {
    let _aR = false;
    const _aS = (_aT) => { if (!_aR) { _aR = true; clearTimeout(_aU); _aQ(_aT); } };
    const _aU = setTimeout(() => { if (rigger === _aP) riggerClose(); _aS(false); }, 4000);
    _aO.on('message', (_aV) => {
      if (!_aV) return;
      if (_aV.op === 'opened') { if (!_aV.ok && rigger === _aP) riggerClose(); _aS(!!_aV.ok && rigger === _aP); }
      else if (_aV.op === 'data') { if (rigger === _aP && win && !win.isDestroyed()) win.webContents.send('rigger-data', _aV.b); }
      else if (_aV.op === 'lost') riggerLost(_aP);
      else if (_aV.op === 'wrote') {
        const _aW = _aP.pending.get(_aV.id);
        if (_aW) { _aP.pending.delete(_aV.id); _aW(!!_aV.ok); }
        if (!_aV.ok && _aV.code && _aV.code !== 'EAGAIN') riggerLost(_aP);
      }
    });
    _aO.on('exit', () => { _aS(false); riggerLost(_aP); });
    _aO.postMessage({ op: 'open', path: _aN });
  });
}
ipcMain.handle('rigger-open', (_aX, _aY) => mainStep('apertura porta The Rigger ' + _aY, async () => {
  const _aZ = await riggerOpen(_aY);
  mainLog('porta The Rigger', _aY + (_aZ ? ' aperta' : ' non aperta'));
  return _aZ;
}));
ipcMain.handle('rigger-write', (_ba, _bb) => new Promise((_bc) => {
  if (!rigger || !(_bb instanceof Uint8Array)) return _bc(false);
  const _bd = rigger;
  if (_bd.sock) {
    _bd.sock.write(Buffer.from(_bb.buffer, _bb.byteOffset, _bb.byteLength), (_be) => { if (_be) riggerLost(_bd); _bc(!_be); });
    return;
  }
  const _bf = ++_bd.seq;
  _bd.pending.set(_bf, _bc);
  setTimeout(() => { if (_bd.pending.has(_bf)) { _bd.pending.delete(_bf); _bc(false); } }, 3000);
  try { _bd.proc.postMessage({ op: 'write', id:_bf, b: _bb }); } catch { _bd.pending.delete(_bf); _bc(false); }
}));
ipcMain.handle('rigger-close', () => riggerClose());
ipcMain.handle('hq-set', (_bg, _bh) => { const _bi = String((_bh && _bh.user) || '').toUpperCase().replace(/[^A-Z0-9/]/g, '').slice(0, 15); const _bj = _bh && typeof _bh.pass === 'string' ? _bh.pass.slice(0, 100) : undefined; hamqth.saveCred(_bi, _bj); return hamqth.status(); });
ipcMain.handle('hq-status', () => hamqth.status());
ipcMain.handle('hq-test', () => hamqth.test());
ipcMain.handle('hq-lookup', async (_bk, _bl) => { try { return await hamqth.lookup(_bl); } catch (_bm) { return { ok: false, error: String(_bm.message || _bm) }; } });
ipcMain.handle('hq-upload', async (_bn, _bo) => { try { if (typeof _bo !== 'string' || _bo.length > 4000) return { ok: false, error: 'adif' }; return await hamqth.upload(_bo); } catch (_bp) { return { ok: false, error: String(_bp.message || _bp) }; } });
ipcMain.handle('app-info', () => updater.info());
ipcMain.handle('upd-check', async () => {
  try { upd = await mainStep('controllo aggiornamenti', () => updater.check()); return upd; } catch (_bq) { return { available: false, error: String(_bq.message || _bq) }; }
});
ipcMain.handle('upd-install', async (_br) => {
  if (!upd || !upd.available) return { ok: false, error: 'no update' };
  try {
    const _bs = (_bt) => { if (!_br.sender.isDestroyed()) _br.sender.send('upd-progress', _bt); };
    if (upd.kind === 'web') {
      mainLog('aggiornamento leggero', upd.version);
      const _bu = await mainStep('aggiornamento leggero', () => updater.installWeb(upd, _bs));
      upd = null;
      setTimeout(() => { if (win && !win.isDestroyed()) win.loadFile(_bu, { query: { updated: '1' } }); }, 900);
      return { ok: true, reload: true };
    }
    mainLog('aggiornamento completo', upd.version + (upd.build ? '-' + upd.build : ''));
    await mainStep('aggiornamento completo', () => updater.install(upd, _bs));
    return { ok: true };
  } catch (_bv) { return { ok: false, error: String(_bv.message || _bv) }; }
});
ipcMain.on('upd-cancel', () => updater.cancel());
const isMac = process.platform === 'darwin';
let win = null;
function openWindow() {
  if (win && !win.isDestroyed()) { win.focus(); return; }
  win = new BrowserWindow({
    width: 1180,
    height: 920,
    minWidth: 380,
    minHeight: 420,
    title: 'CWIU1MVI',
    backgroundColor: '#2a2e25',
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false, preload: path.join(__dirname, 'preload.js') },
  });
  win.loadFile(updater.pagePath());
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.webContents.setWindowOpenHandler(({ url:_bw }) => {
    if (/^https?:/i.test(_bw)) shell.openExternal(_bw);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (_bx, _by) => {
    if (!_by.startsWith('file:')) { _bx.preventDefault(); shell.openExternal(_by); }
  });
  win.on('closed', () => { riggerClose(); win = null; });
  win.webContents.on('did-finish-load', () => { buildMenu(); setTimeout(rescueCheck, 15000); });
}
let rescued = false;
async function rescueCheck() {
  if (rescued || !win || win.isDestroyed()) return;
  let _bz = false;
  try { _bz = await win.webContents.executeJavaScript('window.__pageOk===true', true); } catch {}
  if (_bz) return;
  rescued = true;
  try { upd = await updater.check(); } catch { return; }
  if (!upd || !upd.available) return;
  const _bA = await dialog.showMessageBox(win, { type: 'info', buttons: [L('rescueInstall'), L('cancel')], defaultId: 0, cancelId: 1, title: 'CWIU1MVI', message: L('rescueMsg').replace('{0}', upd.version || upd.web || '') });
  if (_bA.response !== 0) return;
  try {
    if (upd.kind === 'web') { const _bB = await updater.installWeb(upd, () => {}); upd = null; win.loadFile(_bB, { query: { updated: '1' } }); }
    else await updater.install(upd, () => {});
  } catch (_bC) { dialog.showMessageBox(win, { type: 'warning', message: String(_bC.message || _bC) }); }
}
function score(_bD) {
  const _bE = `${_bD.displayName || ''} ${_bD.portName || ''}`.toLowerCase();
  if (/cp210|silicon labs|icom/.test(_bE)) return 2;
  if (/usb/.test(_bE)) return 1;
  return 0;
}
function setupPermissions(_bF) {
  _bF.on('select-serial-port', async (_bG, _bH, _bI, _bJ) => {
    _bG.preventDefault();
    const _bK = BrowserWindow.fromWebContents(_bI) || undefined;
    if (!_bH || _bH.length === 0) {
      await dialog.showMessageBox(_bK, {
        type: 'warning',
        title: L('noPortTitle'),
        message: L('noPortMsg'),
        detail: L('noPortDetail'),
      });
      _bJ('');
      return;
    }
    let _bL = '';
    try { _bL = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'last-port.json'), 'utf8')).name || ''; } catch { _bL = ''; }
    const _bM = [..._bH].sort((_bN, _bO) => ((_bO.portName === _bL) - (_bN.portName === _bL)) || (score(_bO) - score(_bN)));
    const _bP = _bM.map((_bQ) => {
      const _bR = _bQ.displayName || _bQ.portName || L('serialPort');
      const _bS = _bQ.portName && _bQ.portName !== _bR ? `${_bR} (${_bQ.portName})` : _bR;
      return _bQ.portName && _bQ.portName === _bL ? _bS + ' · ' + L('lastUsed') : _bS;
    });
    const { response:_bT } = await dialog.showMessageBox(_bK, {
      type: 'question',
      title: L('portTitle'),
      message: L('portMsg'),
      detail: L('portDetail'),
      buttons: [..._bP, L('cancel')],
      cancelId: _bP.length,
      defaultId: 0,
      noLink: true,
    });
    if (_bT < _bM.length) { try { fs.writeFileSync(path.join(app.getPath('userData'), 'last-port.json'), JSON.stringify({ name: _bM[_bT].portName || '' })); } catch {} }
    _bJ(_bT < _bM.length ? _bM[_bT].portId : '');
  });
  const _bU = [[0x0bda, 0x2832], [0x0bda, 0x2838]];
  const _bV = (_bW) => _bW && _bU.some(([_bX, _bY]) => _bW.vendorId === _bX && _bW.productId === _bY);
  _bF.on('select-usb-device', (_bZ, _ca, _cb) => {
    _bZ.preventDefault();
    const _cc = (_ca.deviceList || []).find(_bV);
    _cb(_cc ? _cc.deviceId : undefined);
  });
  _bF.setPermissionCheckHandler((_cd, _ce) => ['serial', 'media', 'clipboard-sanitized-write', 'usb'].includes(_ce));
  _bF.setPermissionRequestHandler((_cf, _cg, _ch) => _ch(['media', 'clipboard-sanitized-write'].includes(_cg)));
  _bF.setDevicePermissionHandler((_ci) => _ci.deviceType === 'serial' || (_ci.deviceType === 'usb' && _bV(_ci.device)));
}
const LANGS = [['it', 'Italiano'], ['en', 'English'], ['fr', 'Français'], ['de', 'Deutsch'], ['es', 'Español'], ['pt', 'Português'], ['ja', '日本語'], ['ru', 'Русский'], ['ar', 'العربية'], ['zh', '中文（简体）']];
const MT = {
  it: {
    rescueInstall: 'Aggiorna ora', rescueMsg: 'È disponibile CWIU1MVI {0}, che corregge un problema di questa versione.',
    chase: 'Insegui gli spot del cluster', p_cl: 'Cluster CW',
    about: 'Informazioni su CWIU1MVI', checkUpd: 'Cerca aggiornamenti…', prefs: 'Preferenze…', services: 'Servizi', hide: 'Nascondi CWIU1MVI', hideOthers: 'Nascondi altre', showAll: 'Mostra tutte', quitApp: 'Esci da CWIU1MVI',
    file: 'File', openLog: 'Apri cartella del log', exportAdif: 'Esporta registro ADIF…', closeWin: 'Chiudi finestra', quit: 'Esci',
    edit: 'Modifica', undo: 'Annulla', redo: 'Ripeti', cut: 'Taglia', copy: 'Copia', paste: 'Incolla', selectAll: 'Seleziona tutto', findCall: 'Cerca nominativo', clearMsgs: 'Pulisci messaggi',
    radio: 'Radio', listen: 'Ascolta la radio', stopListen: 'Ferma ascolto', catOn: 'Collega CAT…', catOff: 'Scollega CAT', setCw: 'Metti la radio in CW', scan: 'Scansiona banda CW', hunt: 'Monitoraggio dei segnali più forti', band: 'Banda', rec: 'Registra l\'audio', recStop: 'Ferma registrazione',
    view: 'Vista', vMsg: 'Messaggi', vSta: 'Stazioni', style: 'Stile', language: 'Lingua', lock: 'Blocca pannelli', resetLayout: 'Disposizione iniziale dei pannelli', zoomIn: 'Ingrandisci', zoomOut: 'Riduci', zoomReset: 'Dimensione normale', fullscreen: 'Schermo intero',
    st_campo: 'Campo', st_notte: 'Notte', st_valvole: 'Valvole', st_chiaro: 'Chiaro', st_fosfori: 'Fosfori', st_contrasto: 'Contrasto',
    p_log: 'Registro di ascolto', p_tune: 'Frequenza e waterfall', p_rig: 'Radio e CAT', p_c7100: 'Comandi IC-7100',
    window: 'Finestra', minimize: 'Contrai', zoom: 'Ridimensiona', fill: 'Riempi lo schermo', front: 'Porta tutto in primo piano',
    help: 'Aiuto', welcome: 'Benvenuto', guide: 'Guida di CWIU1MVI', cfg7100: 'Configurare l\'IC-7100', cfg7300: 'Configurare l\'IC-7300', trouble: 'Problemi frequenti', github: 'Pagina di CWIU1MVI su GitHub',
    noPortTitle: 'Nessuna porta trovata', noPortMsg: 'Non trovo nessuna porta seriale.', noPortDetail: 'Controlla che la radio sia accesa e collegata con il cavo USB, e che sia installato il driver USB del costruttore (per Icom, Kenwood e Yaesu di solito Silicon Labs CP210x).',
    portTitle: 'Scegli la porta della radio', portMsg: 'Quale porta usa la radio?', portDetail: 'Icom e Kenwood di solito usano “Silicon Labs CP210x”. Sulle Yaesu con due porte scegli quella “Enhanced”.', lastUsed: 'usata l\'ultima volta', cancel: 'Annulla', serialPort: 'Porta seriale',
  },
  en: {
    rescueInstall: 'Update now', rescueMsg: 'CWIU1MVI {0} is available and fixes a problem in this version.',
    chase: 'Chase Cluster Spots', p_cl: 'CW Cluster',
    about: 'About CWIU1MVI', checkUpd: 'Check for Updates…', prefs: 'Settings…', services: 'Services', hide: 'Hide CWIU1MVI', hideOthers: 'Hide Others', showAll: 'Show All', quitApp: 'Quit CWIU1MVI',
    file: 'File', openLog: 'Open Log Folder', exportAdif: 'Export ADIF Log…', closeWin: 'Close Window', quit: 'Exit',
    edit: 'Edit', undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select All', findCall: 'Find Callsign', clearMsgs: 'Clear Messages',
    radio: 'Radio', listen: 'Listen to the Radio', stopListen: 'Stop Listening', catOn: 'Connect CAT…', catOff: 'Disconnect CAT', setCw: 'Put the Radio in CW', scan: 'Scan CW Band', hunt: 'Monitor the Strongest Signals', band: 'Band', rec: 'Record Audio', recStop: 'Stop Recording',
    view: 'View', vMsg: 'Messages', vSta: 'Stations', style: 'Style', language: 'Language', lock: 'Lock Panels', resetLayout: 'Default Panel Layout', zoomIn: 'Zoom In', zoomOut: 'Zoom Out', zoomReset: 'Actual Size', fullscreen: 'Full Screen',
    st_campo: 'Field', st_notte: 'Night', st_valvole: 'Valves', st_chiaro: 'Light', st_fosfori: 'Phosphor', st_contrasto: 'High Contrast',
    p_log: 'Listening Log', p_tune: 'Frequency and Waterfall', p_rig: 'Radio and CAT', p_c7100: 'IC-7100 Controls',
    window: 'Window', minimize: 'Minimize', zoom: 'Zoom', fill: 'Fill the Screen', front: 'Bring All to Front',
    help: 'Help', welcome: 'Welcome', guide: 'CWIU1MVI Guide', cfg7100: 'Setting up the IC-7100', cfg7300: 'Setting up the IC-7300', trouble: 'Troubleshooting', github: 'CWIU1MVI on GitHub',
    noPortTitle: 'No port found', noPortMsg: 'No serial port found.', noPortDetail: 'Check that the radio is on and connected with the USB cable, and that the manufacturer\'s USB driver is installed (for Icom, Kenwood and Yaesu usually Silicon Labs CP210x).',
    portTitle: 'Choose the radio port', portMsg: 'Which port does the radio use?', portDetail: 'Icom and Kenwood usually use “Silicon Labs CP210x”. On Yaesu radios with two ports choose the “Enhanced” one.', lastUsed: 'used last time', cancel: 'Cancel', serialPort: 'Serial port',
  },
  fr: {
    rescueInstall: 'Mettre à jour', rescueMsg: 'CWIU1MVI {0} est disponible et corrige un problème de cette version.',
    chase: 'Suivre les spots du cluster', p_cl: 'Cluster CW',
    about: 'À propos de CWIU1MVI', checkUpd: 'Rechercher des mises à jour…', prefs: 'Réglages…', services: 'Services', hide: 'Masquer CWIU1MVI', hideOthers: 'Masquer les autres', showAll: 'Tout afficher', quitApp: 'Quitter CWIU1MVI',
    file: 'Fichier', openLog: 'Ouvrir le dossier du journal', exportAdif: 'Exporter le journal ADIF…', closeWin: 'Fermer la fenêtre', quit: 'Quitter',
    edit: 'Édition', undo: 'Annuler', redo: 'Rétablir', cut: 'Couper', copy: 'Copier', paste: 'Coller', selectAll: 'Tout sélectionner', findCall: 'Rechercher un indicatif', clearMsgs: 'Effacer les messages',
    radio: 'Radio', listen: 'Écouter la radio', stopListen: 'Arrêter l\'écoute', catOn: 'Connecter le CAT…', catOff: 'Déconnecter le CAT', setCw: 'Passer la radio en CW', scan: 'Balayer la bande CW', hunt: 'Surveiller les signaux les plus forts', band: 'Bande', rec: 'Enregistrer l\'audio', recStop: 'Arrêter l\'enregistrement',
    view: 'Présentation', vMsg: 'Messages', vSta: 'Stations', style: 'Style', language: 'Langue', lock: 'Verrouiller les panneaux', resetLayout: 'Disposition initiale des panneaux', zoomIn: 'Agrandir', zoomOut: 'Réduire', zoomReset: 'Taille réelle', fullscreen: 'Plein écran',
    st_campo: 'Terrain', st_notte: 'Nuit', st_valvole: 'Lampes', st_chiaro: 'Clair', st_fosfori: 'Phosphore', st_contrasto: 'Contraste élevé',
    p_log: 'Journal d\'écoute', p_tune: 'Fréquence et waterfall', p_rig: 'Radio et CAT', p_c7100: 'Commandes IC-7100',
    window: 'Fenêtre', minimize: 'Réduire dans le Dock', zoom: 'Zoom', fill: 'Remplir l\'écran', front: 'Tout ramener au premier plan',
    help: 'Aide', welcome: 'Bienvenue', guide: 'Guide de CWIU1MVI', cfg7100: 'Configurer l\'IC-7100', cfg7300: 'Configurer l\'IC-7300', trouble: 'Problèmes fréquents', github: 'CWIU1MVI sur GitHub',
    noPortTitle: 'Aucun port trouvé', noPortMsg: 'Aucun port série trouvé.', noPortDetail: 'Vérifiez que la radio est allumée et reliée par le câble USB, et que le pilote USB du fabricant est installé (pour Icom, Kenwood et Yaesu, généralement Silicon Labs CP210x).',
    portTitle: 'Choisir le port de la radio', portMsg: 'Quel port la radio utilise-t-elle ?', portDetail: 'Icom et Kenwood utilisent généralement « Silicon Labs CP210x ». Sur les Yaesu à deux ports, choisissez le port « Enhanced ».', lastUsed: 'utilisé la dernière fois', cancel: 'Annuler', serialPort: 'Port série',
  },
  de: {
    rescueInstall: 'Jetzt aktualisieren', rescueMsg: 'CWIU1MVI {0} ist verfügbar und behebt ein Problem dieser Version.',
    chase: 'Cluster-Spots verfolgen', p_cl: 'CW-Cluster',
    about: 'Über CWIU1MVI', checkUpd: 'Nach Updates suchen…', prefs: 'Einstellungen…', services: 'Dienste', hide: 'CWIU1MVI ausblenden', hideOthers: 'Andere ausblenden', showAll: 'Alle einblenden', quitApp: 'CWIU1MVI beenden',
    file: 'Ablage', openLog: 'Log-Ordner öffnen', exportAdif: 'ADIF-Log exportieren…', closeWin: 'Fenster schließen', quit: 'Beenden',
    edit: 'Bearbeiten', undo: 'Widerrufen', redo: 'Wiederholen', cut: 'Ausschneiden', copy: 'Kopieren', paste: 'Einfügen', selectAll: 'Alles auswählen', findCall: 'Rufzeichen suchen', clearMsgs: 'Meldungen löschen',
    radio: 'Funkgerät', listen: 'Funkgerät hören', stopListen: 'Hören beenden', catOn: 'CAT verbinden…', catOff: 'CAT trennen', setCw: 'Funkgerät auf CW stellen', scan: 'CW-Band absuchen', hunt: 'Stärkste Signale überwachen', band: 'Band', rec: 'Audio aufnehmen', recStop: 'Aufnahme beenden',
    view: 'Darstellung', vMsg: 'Meldungen', vSta: 'Stationen', style: 'Stil', language: 'Sprache', lock: 'Bereiche sperren', resetLayout: 'Standard-Anordnung der Bereiche', zoomIn: 'Vergrößern', zoomOut: 'Verkleinern', zoomReset: 'Originalgröße', fullscreen: 'Vollbild',
    st_campo: 'Feld', st_notte: 'Nacht', st_valvole: 'Röhren', st_chiaro: 'Hell', st_fosfori: 'Phosphor', st_contrasto: 'Hoher Kontrast',
    p_log: 'Empfangslog', p_tune: 'Frequenz und Wasserfall', p_rig: 'Funkgerät und CAT', p_c7100: 'IC-7100-Bedienung',
    window: 'Fenster', minimize: 'Im Dock ablegen', zoom: 'Zoomen', fill: 'Bildschirm füllen', front: 'Alle nach vorne bringen',
    help: 'Hilfe', welcome: 'Willkommen', guide: 'CWIU1MVI-Anleitung', cfg7100: 'IC-7100 einrichten', cfg7300: 'IC-7300 einrichten', trouble: 'Häufige Probleme', github: 'CWIU1MVI auf GitHub',
    noPortTitle: 'Kein Port gefunden', noPortMsg: 'Keine serielle Schnittstelle gefunden.', noPortDetail: 'Prüfe, ob das Funkgerät eingeschaltet und per USB-Kabel verbunden ist und ob der USB-Treiber des Herstellers installiert ist (bei Icom, Kenwood und Yaesu meist Silicon Labs CP210x).',
    portTitle: 'Port des Funkgeräts wählen', portMsg: 'Welchen Port verwendet das Funkgerät?', portDetail: 'Icom und Kenwood verwenden meist „Silicon Labs CP210x“. Bei Yaesu-Geräten mit zwei Ports wähle den „Enhanced“-Port.', lastUsed: 'zuletzt verwendet', cancel: 'Abbrechen', serialPort: 'Serielle Schnittstelle',
  },
  es: {
    rescueInstall: 'Actualizar ahora', rescueMsg: 'Está disponible CWIU1MVI {0}, que corrige un problema de esta versión.',
    chase: 'Perseguir los spots del cluster', p_cl: 'Cluster CW',
    about: 'Acerca de CWIU1MVI', checkUpd: 'Buscar actualizaciones…', prefs: 'Ajustes…', services: 'Servicios', hide: 'Ocultar CWIU1MVI', hideOthers: 'Ocultar otras', showAll: 'Mostrar todas', quitApp: 'Salir de CWIU1MVI',
    file: 'Archivo', openLog: 'Abrir carpeta del registro', exportAdif: 'Exportar registro ADIF…', closeWin: 'Cerrar ventana', quit: 'Salir',
    edit: 'Edición', undo: 'Deshacer', redo: 'Rehacer', cut: 'Cortar', copy: 'Copiar', paste: 'Pegar', selectAll: 'Seleccionar todo', findCall: 'Buscar indicativo', clearMsgs: 'Borrar mensajes',
    radio: 'Radio', listen: 'Escuchar la radio', stopListen: 'Detener la escucha', catOn: 'Conectar CAT…', catOff: 'Desconectar CAT', setCw: 'Poner la radio en CW', scan: 'Explorar la banda CW', hunt: 'Vigilar las señales más fuertes', band: 'Banda', rec: 'Grabar el audio', recStop: 'Detener la grabación',
    view: 'Visualización', vMsg: 'Mensajes', vSta: 'Estaciones', style: 'Estilo', language: 'Idioma', lock: 'Bloquear paneles', resetLayout: 'Disposición inicial de los paneles', zoomIn: 'Ampliar', zoomOut: 'Reducir', zoomReset: 'Tamaño real', fullscreen: 'Pantalla completa',
    st_campo: 'Campo', st_notte: 'Noche', st_valvole: 'Válvulas', st_chiaro: 'Claro', st_fosfori: 'Fósforo', st_contrasto: 'Alto contraste',
    p_log: 'Registro de escucha', p_tune: 'Frecuencia y cascada', p_rig: 'Radio y CAT', p_c7100: 'Mandos IC-7100',
    window: 'Ventana', minimize: 'Minimizar', zoom: 'Zoom', fill: 'Llenar la pantalla', front: 'Traer todo al frente',
    help: 'Ayuda', welcome: 'Bienvenida', guide: 'Guía de CWIU1MVI', cfg7100: 'Configurar el IC-7100', cfg7300: 'Configurar el IC-7300', trouble: 'Problemas frecuentes', github: 'CWIU1MVI en GitHub',
    noPortTitle: 'No se encontró ningún puerto', noPortMsg: 'No encuentro ningún puerto serie.', noPortDetail: 'Comprueba que la radio esté encendida y conectada con el cable USB, y que esté instalado el controlador USB del fabricante (para Icom, Kenwood y Yaesu normalmente Silicon Labs CP210x).',
    portTitle: 'Elige el puerto de la radio', portMsg: '¿Qué puerto usa la radio?', portDetail: 'Icom y Kenwood suelen usar «Silicon Labs CP210x». En las Yaesu con dos puertos elige el «Enhanced».', lastUsed: 'usado la última vez', cancel: 'Cancelar', serialPort: 'Puerto serie',
  },
  pt: {
    rescueInstall: 'Atualizar agora', rescueMsg: 'Está disponível o CWIU1MVI {0}, que corrige um problema desta versão.',
    chase: 'Seguir os spots do cluster', p_cl: 'Cluster CW',
    about: 'Sobre o CWIU1MVI', checkUpd: 'Procurar atualizações…', prefs: 'Definições…', services: 'Serviços', hide: 'Ocultar CWIU1MVI', hideOthers: 'Ocultar outros', showAll: 'Mostrar tudo', quitApp: 'Sair do CWIU1MVI',
    file: 'Arquivo', openLog: 'Abrir pasta do registo', exportAdif: 'Exportar registo ADIF…', closeWin: 'Fechar janela', quit: 'Sair',
    edit: 'Editar', undo: 'Desfazer', redo: 'Refazer', cut: 'Cortar', copy: 'Copiar', paste: 'Colar', selectAll: 'Selecionar tudo', findCall: 'Procurar indicativo', clearMsgs: 'Limpar mensagens',
    radio: 'Rádio', listen: 'Ouvir o rádio', stopListen: 'Parar de ouvir', catOn: 'Ligar CAT…', catOff: 'Desligar CAT', setCw: 'Pôr o rádio em CW', scan: 'Varrer a banda CW', hunt: 'Vigiar os sinais mais fortes', band: 'Banda', rec: 'Gravar o áudio', recStop: 'Parar a gravação',
    view: 'Visualização', vMsg: 'Mensagens', vSta: 'Estações', style: 'Estilo', language: 'Idioma', lock: 'Bloquear painéis', resetLayout: 'Disposição inicial dos painéis', zoomIn: 'Ampliar', zoomOut: 'Reduzir', zoomReset: 'Tamanho real', fullscreen: 'Ecrã inteiro',
    st_campo: 'Campo', st_notte: 'Noite', st_valvole: 'Válvulas', st_chiaro: 'Claro', st_fosfori: 'Fósforo', st_contrasto: 'Alto contraste',
    p_log: 'Registo de escuta', p_tune: 'Frequência e cascata', p_rig: 'Rádio e CAT', p_c7100: 'Comandos IC-7100',
    window: 'Janela', minimize: 'Minimizar', zoom: 'Zoom', fill: 'Encher o ecrã', front: 'Trazer tudo para a frente',
    help: 'Ajuda', welcome: 'Boas-vindas', guide: 'Guia do CWIU1MVI', cfg7100: 'Configurar o IC-7100', cfg7300: 'Configurar o IC-7300', trouble: 'Problemas frequentes', github: 'CWIU1MVI no GitHub',
    noPortTitle: 'Nenhuma porta encontrada', noPortMsg: 'Não encontro nenhuma porta série.', noPortDetail: 'Verifique se o rádio está ligado e conectado pelo cabo USB, e se o controlador USB do fabricante está instalado (para Icom, Kenwood e Yaesu normalmente Silicon Labs CP210x).',
    portTitle: 'Escolha a porta do rádio', portMsg: 'Que porta usa o rádio?', portDetail: 'Icom e Kenwood costumam usar “Silicon Labs CP210x”. Nos Yaesu com duas portas escolha a “Enhanced”.', lastUsed: 'usada da última vez', cancel: 'Cancelar', serialPort: 'Porta série',
  },
  ja: {
    rescueInstall: '今すぐ更新', rescueMsg: 'CWIU1MVI {0} が利用できます。このバージョンの問題を修正します。',
    chase: 'クラスターのスポットを追跡', p_cl: 'CW クラスター',
    about: 'CWIU1MVI について', checkUpd: 'アップデートを確認…', prefs: '設定…', services: 'サービス', hide: 'CWIU1MVI を隠す', hideOthers: 'ほかを隠す', showAll: 'すべてを表示', quitApp: 'CWIU1MVI を終了',
    file: 'ファイル', openLog: 'ログフォルダを開く', exportAdif: 'ADIF ログを書き出す…', closeWin: 'ウインドウを閉じる', quit: '終了',
    edit: '編集', undo: '取り消す', redo: 'やり直す', cut: 'カット', copy: 'コピー', paste: 'ペースト', selectAll: 'すべてを選択', findCall: 'コールサインを検索', clearMsgs: 'メッセージを消去',
    radio: '無線機', listen: '無線機を受信', stopListen: '受信を停止', catOn: 'CAT を接続…', catOff: 'CAT を切断', setCw: '無線機を CW にする', scan: 'CW バンドをスキャン', hunt: '最も強い信号を監視', band: 'バンド', rec: '音声を録音', recStop: '録音を停止',
    view: '表示', vMsg: 'メッセージ', vSta: '局', style: 'スタイル', language: '言語', lock: 'パネルを固定', resetLayout: 'パネルを初期配置に戻す', zoomIn: '拡大', zoomOut: '縮小', zoomReset: '実際のサイズ', fullscreen: 'フルスクリーン',
    st_campo: 'フィールド', st_notte: 'ナイト', st_valvole: '真空管', st_chiaro: 'ライト', st_fosfori: '蛍光体', st_contrasto: 'ハイコントラスト',
    p_log: '受信ログ', p_tune: '周波数とウォーターフォール', p_rig: '無線機と CAT', p_c7100: 'IC-7100 操作',
    window: 'ウインドウ', minimize: 'しまう', zoom: '拡大/縮小', fill: '画面いっぱいに表示', front: 'すべてを手前に移動',
    help: 'ヘルプ', welcome: 'ようこそ', guide: 'CWIU1MVI ガイド', cfg7100: 'IC-7100 の設定', cfg7300: 'IC-7300 の設定', trouble: 'よくある問題', github: 'GitHub の CWIU1MVI',
    noPortTitle: 'ポートが見つかりません', noPortMsg: 'シリアルポートが見つかりません。', noPortDetail: '無線機の電源が入り USB ケーブルで接続されているか、メーカーの USB ドライバ（Icom・Kenwood・Yaesu は通常 Silicon Labs CP210x）がインストールされているか確認してください。',
    portTitle: '無線機のポートを選択', portMsg: '無線機はどのポートを使いますか？', portDetail: 'Icom と Kenwood は通常「Silicon Labs CP210x」です。ポートが 2 つある Yaesu では「Enhanced」を選んでください。', lastUsed: '前回使用', cancel: 'キャンセル', serialPort: 'シリアルポート',
  },
  ru: {
    rescueInstall: 'Обновить сейчас', rescueMsg: 'Доступна CWIU1MVI {0}, она исправляет проблему этой версии.',
    chase: 'Гоняться за спотами кластера', p_cl: 'Кластер CW',
    about: 'О программе CWIU1MVI', checkUpd: 'Проверить обновления…', prefs: 'Настройки…', services: 'Службы', hide: 'Скрыть CWIU1MVI', hideOthers: 'Скрыть остальные', showAll: 'Показать все', quitApp: 'Завершить CWIU1MVI',
    file: 'Файл', openLog: 'Открыть папку журнала', exportAdif: 'Экспорт журнала ADIF…', closeWin: 'Закрыть окно', quit: 'Выход',
    edit: 'Правка', undo: 'Отменить', redo: 'Повторить', cut: 'Вырезать', copy: 'Копировать', paste: 'Вставить', selectAll: 'Выделить всё', findCall: 'Найти позывной', clearMsgs: 'Очистить сообщения',
    radio: 'Радиостанция', listen: 'Слушать радиостанцию', stopListen: 'Остановить приём', catOn: 'Подключить CAT…', catOff: 'Отключить CAT', setCw: 'Перевести радиостанцию в CW', scan: 'Сканировать CW-участок', hunt: 'Следить за самыми сильными сигналами', band: 'Диапазон', rec: 'Записать звук', recStop: 'Остановить запись',
    view: 'Вид', vMsg: 'Сообщения', vSta: 'Станции', style: 'Стиль', language: 'Язык', lock: 'Закрепить панели', resetLayout: 'Исходное расположение панелей', zoomIn: 'Увеличить', zoomOut: 'Уменьшить', zoomReset: 'Реальный размер', fullscreen: 'Во весь экран',
    st_campo: 'Полевой', st_notte: 'Ночной', st_valvole: 'Ламповый', st_chiaro: 'Светлый', st_fosfori: 'Люминофор', st_contrasto: 'Высокий контраст',
    p_log: 'Журнал приёма', p_tune: 'Частота и водопад', p_rig: 'Радиостанция и CAT', p_c7100: 'Управление IC-7100',
    window: 'Окно', minimize: 'Свернуть', zoom: 'Изменить масштаб', fill: 'Заполнить экран', front: 'Все окна на передний план',
    help: 'Помощь', welcome: 'Добро пожаловать', guide: 'Справка CWIU1MVI', cfg7100: 'Настройка IC-7100', cfg7300: 'Настройка IC-7300', trouble: 'Решение проблем', github: 'CWIU1MVI на GitHub',
    noPortTitle: 'Порт не найден', noPortMsg: 'Не найдено ни одного последовательного порта.', noPortDetail: 'Проверьте, что радиостанция включена и подключена USB-кабелем и что установлен USB-драйвер производителя (для Icom, Kenwood и Yaesu обычно Silicon Labs CP210x).',
    portTitle: 'Выберите порт радиостанции', portMsg: 'Какой порт использует радиостанция?', portDetail: 'Icom и Kenwood обычно используют «Silicon Labs CP210x». На радиостанциях Yaesu с двумя портами выберите «Enhanced».', lastUsed: 'использовался в прошлый раз', cancel: 'Отмена', serialPort: 'Последовательный порт',
  },
  ar: {
    rescueInstall: 'حدّث الآن', rescueMsg: 'CWIU1MVI {0} متاح ويصلح مشكلة في هذا الإصدار.',
    chase: 'تتبّع spots الكلاستر', p_cl: 'كلاستر CW',
    about: 'حول CWIU1MVI', checkUpd: 'البحث عن تحديثات…', prefs: 'الإعدادات…', services: 'الخدمات', hide: 'إخفاء CWIU1MVI', hideOthers: 'إخفاء الآخرين', showAll: 'إظهار الكل', quitApp: 'إنهاء CWIU1MVI',
    file: 'ملف', openLog: 'فتح مجلد السجل', exportAdif: 'تصدير سجل ADIF…', closeWin: 'إغلاق النافذة', quit: 'خروج',
    edit: 'تحرير', undo: 'تراجع', redo: 'إعادة', cut: 'قص', copy: 'نسخ', paste: 'لصق', selectAll: 'تحديد الكل', findCall: 'ابحث عن نداء', clearMsgs: 'امسح الرسائل',
    radio: 'الراديو', listen: 'استمع إلى الراديو', stopListen: 'أوقف الاستماع', catOn: 'توصيل CAT…', catOff: 'افصل CAT', setCw: 'اضبط الراديو على CW', scan: 'مسح نطاق CW', hunt: 'راقب أقوى الإشارات', band: 'النطاق', rec: 'سجّل الصوت', recStop: 'أوقف التسجيل',
    view: 'العرض', vMsg: 'الرسائل', vSta: 'المحطات', style: 'النمط', language: 'اللغة', lock: 'قفل اللوحات', resetLayout: 'الترتيب الافتراضي للوحات', zoomIn: 'تكبير', zoomOut: 'تصغير', zoomReset: 'الحجم الفعلي', fullscreen: 'ملء الشاشة',
    st_campo: 'ميداني', st_notte: 'ليلي', st_valvole: 'صمامات', st_chiaro: 'فاتح', st_fosfori: 'فوسفور', st_contrasto: 'تباين عالٍ',
    p_log: 'سجل الاستماع', p_tune: 'التردد والشلال', p_rig: 'الراديو وCAT', p_c7100: 'أدوات التحكم في IC-7100',
    window: 'نافذة', minimize: 'تصغير إلى الحد الأدنى', zoom: 'تكبير/تصغير', fill: 'ملء الشاشة', front: 'إحضار الكل إلى الأمام',
    help: 'مساعدة', welcome: 'مرحبًا', guide: 'دليل CWIU1MVI', cfg7100: 'إعداد IC-7100', cfg7300: 'إعداد IC-7300', trouble: 'حل المشكلات', github: 'CWIU1MVI على GitHub',
    noPortTitle: 'لم يُعثر على منفذ', noPortMsg: 'لم أجد أي منفذ تسلسلي.', noPortDetail: 'تأكد أن الراديو مشغّل وموصول بكابل USB، وأن برنامج تشغيل USB من الشركة المصنّعة مثبّت (لأجهزة Icom وKenwood وYaesu عادةً Silicon Labs CP210x).',
    portTitle: 'اختر منفذ الراديو', portMsg: 'أي منفذ يستخدم الراديو؟', portDetail: 'تستخدم Icom وKenwood عادةً «Silicon Labs CP210x». في أجهزة Yaesu ذات المنفذين اختر «Enhanced».', lastUsed: 'استُخدم آخر مرة', cancel: 'إلغاء', serialPort: 'منفذ تسلسلي',
  },
  zh: {
    rescueInstall: '立即更新', rescueMsg: 'CWIU1MVI {0} 已发布，修复了此版本中的一个问题。',
    chase: '追踪集群 spot', p_cl: 'CW 集群',
    about: '关于 CWIU1MVI', checkUpd: '检查更新…', prefs: '设置…', services: '服务', hide: '隐藏 CWIU1MVI', hideOthers: '隐藏其他', showAll: '全部显示', quitApp: '退出 CWIU1MVI',
    file: '文件', openLog: '打开日志文件夹', exportAdif: '导出 ADIF 日志…', closeWin: '关闭窗口', quit: '退出',
    edit: '编辑', undo: '撤销', redo: '重做', cut: '剪切', copy: '复制', paste: '粘贴', selectAll: '全选', findCall: '查找呼号', clearMsgs: '清空消息',
    radio: '电台', listen: '收听电台', stopListen: '停止收听', catOn: '连接 CAT…', catOff: '断开 CAT', setCw: '电台切到 CW', scan: '扫描 CW 频段', hunt: '监视最强信号', band: '频段', rec: '录音', recStop: '停止录音',
    view: '视图', vMsg: '消息', vSta: '电台列表', style: '样式', language: '语言', lock: '锁定面板', resetLayout: '默认面板布局', zoomIn: '放大', zoomOut: '缩小', zoomReset: '实际大小', fullscreen: '全屏',
    st_campo: '野战', st_notte: '夜间', st_valvole: '电子管', st_chiaro: '浅色', st_fosfori: '荧光屏', st_contrasto: '高对比度',
    p_log: '收听日志', p_tune: '频率和瀑布图', p_rig: '电台和 CAT', p_c7100: 'IC-7100 控制',
    window: '窗口', minimize: '最小化', zoom: '缩放', fill: '填满屏幕', front: '全部置于顶层',
    help: '帮助', welcome: '欢迎', guide: 'CWIU1MVI 指南', cfg7100: '设置 IC-7100', cfg7300: '设置 IC-7300', trouble: '故障排除', github: 'GitHub 上的 CWIU1MVI',
    noPortTitle: '未找到端口', noPortMsg: '没有找到任何串口。', noPortDetail: '请检查电台是否已开机并用 USB 线连接，以及是否安装了厂家的 USB 驱动（Icom、Kenwood 和 Yaesu 通常是 Silicon Labs CP210x）。',
    portTitle: '选择电台端口', portMsg: '电台使用哪个端口？', portDetail: 'Icom 和 Kenwood 通常使用“Silicon Labs CP210x”。有两个端口的 Yaesu 电台请选择“Enhanced”。', lastUsed: '上次使用', cancel: '取消', serialPort: '串口',
  },
};
const langFile = () => path.join(app.getPath('userData'), 'lang.json');
let LANG = 'it';
function initLang() {
  try { LANG = JSON.parse(fs.readFileSync(langFile(), 'utf8')).lang; } catch { LANG = (app.getLocale() || 'it').slice(0, 2); }
  if (!MT[LANG]) LANG = 'en';
}
const L = (_cj) => (MT[LANG] && MT[LANG][_cj]) || MT.it[_cj] || _cj;
ipcMain.on('set-lang', (_ck, _cl) => {
  if (!MT[_cl] || _cl === LANG) return;
  LANG = _cl; try { fs.writeFileSync(langFile(), JSON.stringify({ lang:_cl })); } catch {}
  buildMenu();
});
let ui = { listening: false, cat: false, cwOk: false, locked: false, shown: {}, style: 'campo', hunting: false, rec: false };
const send = (_cm) => { if (win && !win.isDestroyed()) { win.show(); win.webContents.send('menu', _cm); } };
const clickIn = (_cn) => { if (win && !win.isDestroyed()) { win.show(); win.webContents.executeJavaScript(`document.getElementById(${JSON.stringify(_cn)}).click()`, true).catch(() => {}); } };
const PANELS = ['log', 'tune', 'rig', 'c7100'];
const STYLES = ['campo', 'notte', 'valvole', 'chiaro', 'fosfori', 'contrasto'];
const BANDS = ['160', '80', '60', '40', '30', '20', '17', '15', '12', '10', '6', '2', '70cm'];
let awakeId = -1;
function keepAwake(_co) {
  if (_co && awakeId < 0) awakeId = powerSaveBlocker.start('prevent-app-suspension');
  else if (!_co && awakeId >= 0) { try { powerSaveBlocker.stop(awakeId); } catch {} awakeId = -1; }
}
ipcMain.on('app-state', (_cp, _cq) => { if (_cq && typeof _cq === 'object') { ui = { ...ui, ..._cq }; keepAwake(!!ui.listening); buildMenu(); } });
function buildMenu() {
  const _cr = { label: L('about'), click: () => send('welcome') };
  const _cs = { label: L('checkUpd'), click: () => send('update') };
  const _ct = { label: L('prefs'), accelerator: 'CmdOrCtrl+,', click: () => send('prefs') };
  const _cu = [
    ...(isMac ? [{
      label: 'CWIU1MVI',
      submenu: [
        _cr, _cs, { type: 'separator' }, _ct,
        { type: 'separator' },
        { role: 'services', label: L('services') },
        { type: 'separator' },
        { role: 'hide', label: L('hide') },
        { role: 'hideOthers', label: L('hideOthers') },
        { role: 'unhide', label: L('showAll') },
        { type: 'separator' },
        { role: 'quit', label: L('quitApp') },
      ],
    }] : []),
    {
      label: L('file'),
      submenu: [
        { label: L('exportAdif'), accelerator: 'CmdOrCtrl+E', click: () => send('adif') },
        { label: L('openLog'), accelerator: 'CmdOrCtrl+Shift+O', click: () => send('logs') },
        { type: 'separator' },
        ...(isMac ? [] : [_ct, { type: 'separator' }]),
        isMac ? { role: 'close', label: L('closeWin') } : { role: 'quit', label: L('quit') },
      ],
    },
    {
      label: L('edit'),
      submenu: [
        { role: 'undo', label: L('undo') }, { role: 'redo', label: L('redo') }, { type: 'separator' },
        { role: 'cut', label: L('cut') }, { role: 'copy', label: L('copy') }, { role: 'paste', label: L('paste') }, { role: 'selectAll', label: L('selectAll') },
        { type: 'separator' },
        { label: L('findCall'), accelerator: 'CmdOrCtrl+F', click: () => send('find') },
        { label: L('clearMsgs'), accelerator: 'CmdOrCtrl+Shift+Backspace', click: () => send('clear') },
      ],
    },
    {
      label: L('radio'),
      submenu: [
        { label: ui.listening ? L('stopListen') : L('listen'), accelerator: 'CmdOrCtrl+Shift+L', click: () => send('listen') },
        { label: ui.cat ? L('catOff') : L('catOn'), accelerator: 'CmdOrCtrl+Shift+K', click: () => clickIn('catBtn') },
        { type: 'separator' },
        { label: L('setCw'), enabled: !!ui.cwOk, click: () => send('cw') },
        { label: L('scan'), enabled: !!ui.cat && !!ui.listening, click: () => send('scan') },
        { label: L('hunt'), type: 'checkbox', checked: !!ui.hunting, accelerator: 'CmdOrCtrl+Shift+F', enabled: !!ui.cat && !!ui.listening, click: () => send('hunt') },
        { label: L('chase'), type: 'checkbox', checked: !!ui.chasing, accelerator: 'CmdOrCtrl+Shift+S', enabled: !!ui.cat && !!ui.listening, click: () => send('chase') },
        { label: L('band'), enabled: !!ui.cat, submenu: BANDS.map((_cv) => ({ label: /cm/.test(_cv) ? _cv.replace('cm', ' cm') : `${_cv} m`, click: () => send('band:' + _cv) })) },
        { type: 'separator' },
        { label: ui.rec ? L('recStop') : L('rec'), accelerator: 'CmdOrCtrl+Shift+R', enabled: !!ui.listening || !!ui.rec, click: () => send('rec') },
      ],
    },
    {
      label: L('view'),
      submenu: [
        { label: L('vMsg'), accelerator: 'CmdOrCtrl+1', click: () => send('view:msg') },
        { label: L('vSta'), accelerator: 'CmdOrCtrl+2', click: () => send('view:sta') },
        { label: 'Cluster', accelerator: 'CmdOrCtrl+3', click: () => send('view:cl') },
        { type: 'separator' },
        { label: L('style'), submenu: STYLES.map((_cw) => ({ label: L('st_' + _cw), type: 'radio', checked: ui.style === _cw, click: () => send('style:' + _cw) })) },
        { label: L('language'), submenu: LANGS.map(([_cx, _cy]) => ({ label: _cy, type: 'radio', checked: LANG === _cx, click: () => send('lang:' + _cx) })) },
        { type: 'separator' },
        ...PANELS.map((_cz) => ({ label: L('p_' + _cz), type: 'checkbox', checked: ui.shown[_cz] !== false, click: () => send('mod:' + _cz) })),
        { type: 'separator' },
        { label: L('lock'), type: 'checkbox', checked: !!ui.locked, click: () => send('lock') },
        { label: L('resetLayout'), click: () => send('reset') },
        { type: 'separator' },
        { role: 'zoomIn', label: L('zoomIn') }, { role: 'zoomOut', label: L('zoomOut') }, { role: 'resetZoom', label: L('zoomReset') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: L('fullscreen') },
      ],
    },
    {
      label: L('window'),
      submenu: [
        { role: 'minimize', label: L('minimize') }, { role: 'zoom', label: L('zoom') },
        { label: L('fill'), click: () => { if (win) win.isMaximized() ? win.unmaximize() : win.maximize(); } },
        ...(isMac ? [{ type: 'separator' }, { role: 'front', label: L('front') }] : []),
      ],
    },
    {
      role: 'help',
      label: L('help'),
      submenu: [
        ...(isMac ? [] : [_cr, _cs, { type: 'separator' }]),
        { label: L('guide'), accelerator: 'F1', click: () => send('guide') },
        { label: L('cfg7100'), click: () => send('guide:ic7100') },
        { label: L('cfg7300'), click: () => send('guide:ic7300') },
        { label: L('trouble'), click: () => send('guide:trouble') },
        { type: 'separator' },
        { label: L('welcome'), click: () => send('welcome') },
        { label: L('github'), click: () => shell.openExternal('https://github.com/SculptWorksLTD/CWIU1MVI') },
        { role: 'toggleDevTools', visible: false, accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(_cu));
}
app.whenReady().then(async () => {
  mainLog('avviata', app.getVersion() + ' · ' + process.platform);
  initLang();
  setupPermissions(session.defaultSession);
  buildMenu();
  openWindow();
  app.on('activate', openWindow);
  if (isMac) {
    try { systemPreferences.askForMediaAccess('microphone').catch(() => {}); } catch (_cA) { /* si può concedere dopo */ }
  }
});
app.on('window-all-closed', () => app.quit());
