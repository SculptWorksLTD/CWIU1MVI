'use strict';
const { app, safeStorage, net } = require('electron');
const path = require('path');
const fs = require('fs');
const PRG = 'CWIU1MVI';
const API = 'https://www.hamqth.com/api/v2';
const file = () => path.join(app.getPath('userData'), 'hamqth.json');
let sess = { token: '', at: 0 };
const cache = new Map();
function loadCred() {
  try {
    const _a = JSON.parse(fs.readFileSync(file(), 'utf8'));
    const _b = (_c) => (safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(_c, 'base64')) : Buffer.from(_c, 'base64').toString('utf8'));
    return { user: _a.user || '', pass: _a.pass ? _b(_a.pass) : '' };
  } catch { return { user: '', pass: '' }; }
}
function saveCred(_d, _e) {
  const _f = (_g) => (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(_g).toString('base64') : Buffer.from(_g, 'utf8').toString('base64'));
  if (!_d) { try { fs.unlinkSync(file()); } catch {} sess = { token: '', at: 0 }; cache.clear(); return; }
  const _h = loadCred();
  const _i = _e === undefined || _e === null ? _h.pass : _e;
  fs.writeFileSync(file(), JSON.stringify({ user:_d, pass: _i ? _f(_i) : '' }), { mode: 0o600 });
  sess = { token: '', at: 0 }; cache.clear();
}
async function req(_j, _k, { token:_l, json:_m } = {}) {
  const _n = { 'User-Agent': PRG, Accept: 'application/json' };
  if (_l) _n.Authorization = 'Bearer ' + _l;
  if (_m) _n['Content-Type'] = 'application/json';
  const _o = await net.fetch(_k, { method:_j, headers:_n, body: _m ? JSON.stringify(_m) : undefined });
  const _p = await _o.text(); let _q = null; try { _q = JSON.parse(_p); } catch {}
  return { status: _o.status, data:_q, text: _p.slice(0, 300) };
}
async function login(_r) {
  if (!_r && sess.token && Date.now() - sess.at < 50 * 60000) return sess.token;
  const _s = loadCred();
  if (!_s.user || !_s.pass) throw new Error('nocred');
  const _t = await req('POST', API + '/login', { json: { callsign: _s.user, password: _s.pass } });
  if (_t.status === 401) throw new Error('Wrong user name or password');
  if (_t.status === 429) throw new Error('Too many wrong passwords: wait a few minutes');
  const _u = _t.data && _t.data.token;
  if (!_u) throw new Error((_t.data && (_t.data.detail || _t.data.title)) || ('login ' + _t.status));
  sess = { token:_u, at: Date.now() };
  return _u;
}
const yes = (_v) => (_v === true || _v === 1 || _v === 'Y' || _v === 'y' || _v === '1' ? 'Y' : '');
function gridOf(_w, _x) {
  if (typeof _w !== 'number' || typeof _x !== 'number' || !isFinite(_w) || !isFinite(_x)) return '';
  const _y = _x + 180, _z = _w + 90; if (_y < 0 || _y >= 360 || _z < 0 || _z >= 180) return '';
  return String.fromCharCode(65 + Math.floor(_y / 20), 65 + Math.floor(_z / 10)) + Math.floor((_y % 20) / 2) + Math.floor(_z % 10);
}
function flat(_A) {
  const _B = _A.location || {}, _C = _A.qsl || {}, _D = _A.region || {}, _E = _A.address || {}, _F = _A.links || {};
  const _G = { ok: true, callsign: _A.callsign, nick: _A.nick || _A.name || '', qth: _A.qth, country: _A.country, adif: _A.dxcc, itu: _A.itu, cq: _A.cq,
    grid: _B.grid || gridOf(_B.lat, _B.lon), continent: _A.continent, utc_offset: _A.utcOffset, qsl_via: _C.via, lotw: yes(_C.lotw), eqsl: yes(_C.eqsl), qsl: yes(_C.bureau), qsldirect: yes(_C.direct),
    iota: _A.iota, web: _F.web, picture: _A.picture, adr_name: _E.name, district: _D.district, dok: _D.dok, lic_year: _A.licensedSince };
  for (const _H of Object.keys(_G)) if (_G[_H] == null || _G[_H] === '') delete _G[_H];
  _G.ok = true; return _G;
}
async function dxcc(_I, _J) {
  try {
    const _K = await req('GET', API + '/dxcc?callsign=' + encodeURIComponent(_I));
    if (_K.status !== 200 || !_K.data) return null;
    const _L = _K.data, _M = _L.entity || {};
    const _N = Object.assign({ ok: true, dxccOnly: true, callsign: _I, country: _M.name || '', qth: _L.details && _L.details !== _M.name ? _L.details : '', continent: _L.continent || _M.continent, cq: _L.waz || _M.waz, itu: _L.itu || _M.itu,
      adif: _M.adif, grid: gridOf(_L.lat != null ? _L.lat : _M.lat, _L.lon != null ? _L.lon : _M.lon), gridApprox: true }, _J || {});
    for (const _O of Object.keys(_N)) if (_N[_O] == null || _N[_O] === '') delete _N[_O];
    return _N;
  } catch { return null; }
}
async function lookup(_P) {
  _P = String(_P || '').toUpperCase().replace(/[^A-Z0-9/]/g, '');
  if (!_P) return { ok: false, error: 'call' };
  const _Q = cache.get(_P);
  if (_Q && Date.now() - _Q.t < (_Q.v.dxccOnly ? 20 * 60000 : 6 * 3600000)) return _Q.v;
  const _R = (_S) => { cache.set(_P, { t: Date.now(), v:_S }); return _S; };
  const _T = status();
  if (!_T.user || !_T.hasPass) { const _U = await dxcc(_P, { nocred: true }); if (_U) return _R(_U); throw new Error('nocred'); }
  for (let _V = 0; _V < 2; _V++) {
    const _W = await login(_V > 0);
    const _X = await req('GET', API + '/callbook/' + _P.split('/').map(encodeURIComponent).join('/') + '?app=' + PRG, { token:_W });
    if (_X.status === 401) continue;
    if (_X.status === 200 && _X.data) return _R(flat(_X.data));
    if (_X.status === 404) { const _Y = await dxcc(_P); return _R(_Y || { ok: false, error: 'Callsign not found' }); }
    return { ok: false, error: (_X.data && (_X.data.detail || _X.data.title)) || ('HTTP ' + _X.status) };
  }
  return { ok: false, error: 'session' };
}
function adifFields(_Z) {
  const _aa = {}; const _ab = /<([A-Za-z0-9_]+):(\d+)(?::[^>]*)?>/g; let _ac; const _ad = String(_Z || '');
  while ((_ac = _ab.exec(_ad))) { const _ae = _ac[1].toLowerCase(), _af = +_ac[2], _ag = _ad.substr(_ab.lastIndex, _af); if (_ae !== 'eor' && _ae !== 'eoh' && _ag) _aa[_ae] = _ag; _ab.lastIndex += _af; }
  return _aa;
}
async function upload(_ah) {
  const _ai = loadCred();
  if (!_ai.user || !_ai.pass) return { ok: false, error: 'nocred' };
  const _aj = adifFields(_ah);
  if (!_aj.call || !_aj.qso_date || !_aj.time_on) return { ok: false, error: 'record' };
  for (const _ak of Object.keys(_aj)) if (/^app_|^station_callsign$|^my_/.test(_ak)) delete _aj[_ak];
  for (let _al = 0; _al < 2; _al++) {
    const _am = await login(_al > 0);
    const _an = await req('POST', API + '/log/qso', { token:_am, json: { qso:_aj } });
    if (_an.status === 401) continue;
    if (_an.status === 201 || _an.status === 200) return { ok: true, status: _an.status };
    if (_an.status === 409) return { ok: true, status: 409, dup: true };
    return { ok: false, status: _an.status, text: (_an.data && (_an.data.detail || _an.data.title)) || _an.text };
  }
  return { ok: false, error: 'session' };
}
function status() { let _ao = {}; try { _ao = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch {} return { user: _ao.user || '', hasPass: !!_ao.pass, enc: true }; }
async function test() { try { await login(true); return { ok: true }; } catch (_ap) { return { ok: false, error: String(_ap.message || _ap) }; } }
module.exports = { saveCred, status, lookup, upload, test, _adifFields: adifFields, _flat: flat, _gridOf: gridOf };
