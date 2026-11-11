const { app, BrowserWindow, Menu, dialog, session, shell, systemPreferences, ipcMain } = require('electron');
if (process.platform === 'darwin') app.commandLine.appendSwitch('use-mock-keychain');
const path = require('path');
const fs = require('fs');
const updater = require('./updater');
const logDir = () => path.join(app.getPath('documents'), 'CWIU1MVI', 'Log');
const okName = (_a) => typeof _a === 'string' && /^[a-z0-9-]{1,60}\.(csv|adi)$/.test(_a);
const bom = (_b) => (/\.adi$/.test(_b) ? '' : '\ufeff');
ipcMain.handle('log-dir', () => logDir());
ipcMain.handle('log-append', async (_c, { file:_d, header:_e, line:_f }) => {
  if (!okName(_d) || typeof _f !== 'string') return false;
  const _g = logDir(), _h = path.join(_g, _d);
  await fs.promises.mkdir(_g, { recursive: true });
  let _i = true; try { await fs.promises.access(_h); } catch { _i = false; }
  await fs.promises.appendFile(_h, (_i ? '' : bom(_d) + (_e || '') + '\n') + _f + '\n', 'utf8');
  return true;
});
ipcMain.handle('log-write', async (_j, { file:_k, text:_l }) => {
  if (!okName(_k) || typeof _l !== 'string') return false;
  const _m = logDir();
  await fs.promises.mkdir(_m, { recursive: true });
  await fs.promises.writeFile(path.join(_m, _k), bom(_k) + _l, 'utf8');
  return true;
});
let rec = null;
const wavHead = (_n, _o) => {
  const _p = Buffer.alloc(44);
  _p.write('RIFF', 0); _p.writeUInt32LE(36 + _o, 4); _p.write('WAVE', 8); _p.write('fmt ', 12);
  _p.writeUInt32LE(16, 16); _p.writeUInt16LE(1, 20); _p.writeUInt16LE(1, 22); _p.writeUInt32LE(_n, 24);
  _p.writeUInt32LE(_n * 2, 28); _p.writeUInt16LE(2, 32); _p.writeUInt16LE(16, 34); _p.write('data', 36); _p.writeUInt32LE(_o, 40);
  return _p;
};
async function recFinish() {
  if (!rec) return false;
  const _q = rec; rec = null;
  try { await _q.fh.write(wavHead(_q.rate, _q.bytes), 0, 44, 0); await _q.fh.close(); } catch { return false; }
  return true;
}
ipcMain.handle('rec-open', async (_r, { file:_s, rate:_t }) => {
  if (typeof _s !== 'string' || !/^[a-z0-9-]{1,60}\.wav$/.test(_s)) return false;
  _t = Math.round(+_t); if (!(_t >= 4000 && _t <= 96000)) return false;
  await recFinish();
  const _u = logDir(); await fs.promises.mkdir(_u, { recursive: true });
  const _v = await fs.promises.open(path.join(_u, _s), 'w');
  await _v.write(wavHead(_t, 0), 0, 44, 0);
  rec = { fh:_v, rate:_t, bytes: 0, pos: 44 };
  return true;
});
ipcMain.handle('rec-append', async (_w, _x) => {
  if (!rec || !(_x instanceof Uint8Array)) return false;
  const _y = Buffer.from(_x.buffer, _x.byteOffset, _x.byteLength);
  await rec.fh.write(_y, 0, _y.length, rec.pos); rec.pos += _y.length; rec.bytes += _y.length;
  return true;
});
ipcMain.handle('rec-close', () => recFinish());
const { ClusterLink } = require('./cluster');
const toPage = (_z, _A) => { if (win && !win.isDestroyed()) win.webContents.send(_z, _A); };
const cluster = new ClusterLink((_B) => toPage('cl-lines', _B), (_C) => { ui.cluster = _C.state; toPage('cl-state', _C); });
ipcMain.handle('cl-connect', (_D, _E) => {
  if (!_E || typeof _E.host !== 'string' || !/^[a-z0-9.-]{3,80}$/i.test(_E.host)) return false;
  const _F = Math.round(+_E.port); if (!(_F > 0 && _F < 65536)) return false;
  const _G = String(_E.call || '').toUpperCase(); if (!/^[A-Z0-9/]{3,15}$/.test(_G)) return false;
  cluster.connect({ host: _E.host, port:_F, call:_G }); return true;
});
ipcMain.handle('cl-disconnect', () => { cluster.disconnect(); return true; });
ipcMain.handle('cl-send', (_H, _I) => { if (typeof _I === 'string' && _I.length < 120) cluster.write(_I); return true; });
app.on('before-quit', () => cluster.disconnect(true));
app.on('before-quit', () => riggerClose());
ipcMain.handle('save-as', async (_J, { name:_K, text:_L }) => {
  if (typeof _K !== 'string' || typeof _L !== 'string') return false;
  const _M = BrowserWindow.fromWebContents(_J.sender) || undefined;
  const _N = await dialog.showSaveDialog(_M, { defaultPath: path.join(app.getPath('documents'), _K.replace(/[^\w.\-]/g, '_')), filters: [{ name: 'ADIF', extensions: ['adi'] }] });
  if (_N.canceled || !_N.filePath) return false;
  await fs.promises.writeFile(_N.filePath, _L, 'utf8');
  return _N.filePath;
});
ipcMain.handle('log-open', async () => {
  await fs.promises.mkdir(logDir(), { recursive: true });
  return shell.openPath(logDir());
});
let upd = null;
const hamqth = require('./hamqth');
const tty = require('tty');
const RIGGER_DIR = '/tmp/TheRigger';
let rigger = null;
function riggerClose() {
  if (!rigger) return true;
  const _O = rigger; rigger = null;
  try { _O.rs.destroy(); } catch {}
  try { fs.closeSync(_O.wfd); } catch {}
  return true;
}
function riggerAlive() {
  return new Promise((_P) => {
    require('child_process').execFile('ps', ['-axo', 'command='], { timeout: 3000, maxBuffer: 4 << 20 }, (_Q, _R) => {
      if (_Q) return _P(false);
      _P(String(_R).split('\n').some((_S) => /(^|\/)the ?rigger[^\/]*$/i.test(_S.trim().split(/\s+-/)[0])));
    });
  });
}
ipcMain.handle('rigger-list', async () => {
  if (process.platform === 'win32') return [];
  if (!(await riggerAlive())) return [];
  try { return fs.readdirSync(RIGGER_DIR).filter((_T) => /^[A-Za-z0-9._-]{1,40}$/.test(_T)).sort(); } catch { return []; }
});
ipcMain.handle('rigger-open', async (_U, _V) => {
  riggerClose();
  if (process.platform !== 'win32' && !(await riggerAlive())) return false;
  if (process.platform === 'win32' || typeof _V !== 'string' || !/^[A-Za-z0-9._-]{1,40}$/.test(_V)) return false;
  try {
    const _W = fs.realpathSync(path.join(RIGGER_DIR, _V));
    if (!/^\/dev\/(ttys\d+|pts\/\d+)$/.test(_W)) return false;
    const _X = fs.constants.O_RDWR | fs.constants.O_NOCTTY | fs.constants.O_NONBLOCK;
    const _Y = fs.openSync(_W, _X), _Z = fs.openSync(_W, _X);
    const _aa = new tty.ReadStream(_Y);
    const _ab = { rs:_aa, wfd:_Z };
    _aa.on('data', (_ac) => { if (rigger === _ab && win && !win.isDestroyed()) win.webContents.send('rigger-data', new Uint8Array(_ac)); });
    _aa.on('error', () => { if (rigger === _ab) riggerClose(); });
    rigger = _ab;
    return true;
  } catch { return false; }
});
ipcMain.handle('rigger-write', (_ad, _ae) => new Promise((_af) => {
  if (!rigger || !(_ae instanceof Uint8Array)) return _af(false);
  fs.write(rigger.wfd, Buffer.from(_ae.buffer, _ae.byteOffset, _ae.byteLength), (_ag) => _af(!_ag));
}));
ipcMain.handle('rigger-close', () => riggerClose());
ipcMain.handle('hq-set', (_ah, _ai) => { const _aj = String((_ai && _ai.user) || '').toUpperCase().replace(/[^A-Z0-9/]/g, '').slice(0, 15); const _ak = _ai && typeof _ai.pass === 'string' ? _ai.pass.slice(0, 100) : undefined; hamqth.saveCred(_aj, _ak); return hamqth.status(); });
ipcMain.handle('hq-status', () => hamqth.status());
ipcMain.handle('hq-test', () => hamqth.test());
ipcMain.handle('hq-lookup', async (_al, _am) => { try { return await hamqth.lookup(_am); } catch (_an) { return { ok: false, error: String(_an.message || _an) }; } });
ipcMain.handle('hq-upload', async (_ao, _ap) => { try { if (typeof _ap !== 'string' || _ap.length > 4000) return { ok: false, error: 'adif' }; return await hamqth.upload(_ap); } catch (_aq) { return { ok: false, error: String(_aq.message || _aq) }; } });
ipcMain.handle('app-info', () => updater.info());
ipcMain.handle('upd-check', async () => {
  try { upd = await updater.check(); return upd; } catch (_ar) { return { available: false, error: String(_ar.message || _ar) }; }
});
ipcMain.handle('upd-install', async (_as) => {
  if (!upd || !upd.available) return { ok: false, error: 'no update' };
  try {
    const _at = (_au) => { if (!_as.sender.isDestroyed()) _as.sender.send('upd-progress', _au); };
    if (upd.kind === 'web') {
      const _av = await updater.installWeb(upd, _at);
      upd = null;
      setTimeout(() => { if (win && !win.isDestroyed()) win.loadFile(_av, { query: { updated: '1' } }); }, 900);
      return { ok: true, reload: true };
    }
    await updater.install(upd, _at);
    return { ok: true };
  } catch (_aw) { return { ok: false, error: String(_aw.message || _aw) }; }
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
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, preload: path.join(__dirname, 'preload.js') },
  });
  win.loadFile(updater.pagePath());
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.webContents.setWindowOpenHandler(({ url:_ax }) => {
    if (/^https?:/i.test(_ax)) shell.openExternal(_ax);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (_ay, _az) => {
    if (!_az.startsWith('file:')) { _ay.preventDefault(); shell.openExternal(_az); }
  });
  win.on('closed', () => { riggerClose(); win = null; });
  win.webContents.on('did-finish-load', () => { buildMenu(); setTimeout(rescueCheck, 15000); });
}
let rescued = false;
async function rescueCheck() {
  if (rescued || !win || win.isDestroyed()) return;
  let _aA = false;
  try { _aA = await win.webContents.executeJavaScript('window.__pageOk===true', true); } catch {}
  if (_aA) return;
  rescued = true;
  try { upd = await updater.check(); } catch { return; }
  if (!upd || !upd.available) return;
  const _aB = await dialog.showMessageBox(win, { type: 'info', buttons: [L('rescueInstall'), L('cancel')], defaultId: 0, cancelId: 1, title: 'CWIU1MVI', message: L('rescueMsg').replace('{0}', upd.version || upd.web || '') });
  if (_aB.response !== 0) return;
  try {
    if (upd.kind === 'web') { const _aC = await updater.installWeb(upd, () => {}); upd = null; win.loadFile(_aC, { query: { updated: '1' } }); }
    else await updater.install(upd, () => {});
  } catch (_aD) { dialog.showMessageBox(win, { type: 'warning', message: String(_aD.message || _aD) }); }
}
function score(_aE) {
  const _aF = `${_aE.displayName || ''} ${_aE.portName || ''}`.toLowerCase();
  if (/cp210|silicon labs|icom/.test(_aF)) return 2;
  if (/usb/.test(_aF)) return 1;
  return 0;
}
function setupPermissions(_aG) {
  _aG.on('select-serial-port', async (_aH, _aI, _aJ, _aK) => {
    _aH.preventDefault();
    const _aL = BrowserWindow.fromWebContents(_aJ) || undefined;
    if (!_aI || _aI.length === 0) {
      await dialog.showMessageBox(_aL, {
        type: 'warning',
        title: L('noPortTitle'),
        message: L('noPortMsg'),
        detail: L('noPortDetail'),
      });
      _aK('');
      return;
    }
    let _aM = '';
    try { _aM = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'last-port.json'), 'utf8')).name || ''; } catch { _aM = ''; }
    const _aN = [..._aI].sort((_aO, _aP) => ((_aP.portName === _aM) - (_aO.portName === _aM)) || (score(_aP) - score(_aO)));
    const _aQ = _aN.map((_aR) => {
      const _aS = _aR.displayName || _aR.portName || L('serialPort');
      const _aT = _aR.portName && _aR.portName !== _aS ? `${_aS} (${_aR.portName})` : _aS;
      return _aR.portName && _aR.portName === _aM ? _aT + ' · ' + L('lastUsed') : _aT;
    });
    const { response:_aU } = await dialog.showMessageBox(_aL, {
      type: 'question',
      title: L('portTitle'),
      message: L('portMsg'),
      detail: L('portDetail'),
      buttons: [..._aQ, L('cancel')],
      cancelId: _aQ.length,
      defaultId: 0,
      noLink: true,
    });
    if (_aU < _aN.length) { try { fs.writeFileSync(path.join(app.getPath('userData'), 'last-port.json'), JSON.stringify({ name: _aN[_aU].portName || '' })); } catch {} }
    _aK(_aU < _aN.length ? _aN[_aU].portId : '');
  });
  _aG.setPermissionCheckHandler((_aV, _aW) => ['serial', 'media', 'clipboard-sanitized-write'].includes(_aW));
  _aG.setPermissionRequestHandler((_aX, _aY, _aZ) => _aZ(['media', 'clipboard-sanitized-write'].includes(_aY)));
  _aG.setDevicePermissionHandler((_ba) => _ba.deviceType === 'serial');
}
const LANGS = [['it', 'Italiano'], ['en', 'English'], ['fr', 'Français'], ['de', 'Deutsch'], ['es', 'Español'], ['pt', 'Português'], ['ja', '日本語']];
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
};
const langFile = () => path.join(app.getPath('userData'), 'lang.json');
let LANG = 'it';
function initLang() {
  try { LANG = JSON.parse(fs.readFileSync(langFile(), 'utf8')).lang; } catch { LANG = (app.getLocale() || 'it').slice(0, 2); }
  if (!MT[LANG]) LANG = 'en';
}
const L = (_bb) => (MT[LANG] && MT[LANG][_bb]) || MT.it[_bb] || _bb;
ipcMain.on('set-lang', (_bc, _bd) => {
  if (!MT[_bd] || _bd === LANG) return;
  LANG = _bd; try { fs.writeFileSync(langFile(), JSON.stringify({ lang:_bd })); } catch {}
  buildMenu();
});
let ui = { listening: false, cat: false, cwOk: false, locked: false, shown: {}, style: 'campo', hunting: false, rec: false };
const send = (_be) => { if (win && !win.isDestroyed()) { win.show(); win.webContents.send('menu', _be); } };
const clickIn = (_bf) => { if (win && !win.isDestroyed()) { win.show(); win.webContents.executeJavaScript(`document.getElementById(${JSON.stringify(_bf)}).click()`, true).catch(() => {}); } };
const PANELS = ['log', 'tune', 'rig', 'c7100'];
const STYLES = ['campo', 'notte', 'valvole', 'chiaro', 'fosfori', 'contrasto'];
const BANDS = ['160', '80', '60', '40', '30', '20', '17', '15', '12', '10', '6', '2', '70cm'];
ipcMain.on('app-state', (_bg, _bh) => { if (_bh && typeof _bh === 'object') { ui = { ...ui, ..._bh }; buildMenu(); } });
function buildMenu() {
  const _bi = { label: L('about'), click: () => send('welcome') };
  const _bj = { label: L('checkUpd'), click: () => send('update') };
  const _bk = { label: L('prefs'), accelerator: 'CmdOrCtrl+,', click: () => send('prefs') };
  const _bl = [
    ...(isMac ? [{
      label: 'CWIU1MVI',
      submenu: [
        _bi, _bj, { type: 'separator' }, _bk,
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
        ...(isMac ? [] : [_bk, { type: 'separator' }]),
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
        { label: L('band'), enabled: !!ui.cat, submenu: BANDS.map((_bm) => ({ label: /cm/.test(_bm) ? _bm.replace('cm', ' cm') : `${_bm} m`, click: () => send('band:' + _bm) })) },
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
        { label: L('style'), submenu: STYLES.map((_bn) => ({ label: L('st_' + _bn), type: 'radio', checked: ui.style === _bn, click: () => send('style:' + _bn) })) },
        { label: L('language'), submenu: LANGS.map(([_bo, _bp]) => ({ label: _bp, type: 'radio', checked: LANG === _bo, click: () => send('lang:' + _bo) })) },
        { type: 'separator' },
        ...PANELS.map((_bq) => ({ label: L('p_' + _bq), type: 'checkbox', checked: ui.shown[_bq] !== false, click: () => send('mod:' + _bq) })),
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
        ...(isMac ? [] : [_bi, _bj, { type: 'separator' }]),
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
  Menu.setApplicationMenu(Menu.buildFromTemplate(_bl));
}
app.whenReady().then(async () => {
  initLang();
  setupPermissions(session.defaultSession);
  buildMenu();
  openWindow();
  app.on('activate', openWindow);
  if (isMac) {
    try { systemPreferences.askForMediaAccess('microphone').catch(() => {}); } catch (_br) { /* si può concedere dopo */ }
  }
});
app.on('window-all-closed', () => app.quit());
