const net = require('net');
class ClusterLink {
  constructor(_a, _b) {
    this.onLines = _a; this.onState = _b;
    this.sock = null; this.want = null; this.buf = ''; this.loggedIn = false; this.retry = null; this.pending = []; this.flushT = null; this.tries = 0;
  }
  state(_c, _d) { try { this.onState({ state: _c, info: _d || '', host: this.want && this.want.host }); } catch {} }
  connect(_e) {
    this.disconnect(true);
    this.want = _e; this.tries = 0; this.open();
  }
  open() {
    const _f = this.want; if (!_f) return;
    this.state('connecting');
    this.buf = ''; this.loggedIn = false;
    const _g = net.createConnection({ host: _f.host, port: _f.port });
    this.sock = _g;
    _g.setEncoding('latin1'); _g.setKeepAlive(true, 60000); _g.setTimeout(25000);
    _g.on('connect', () => { _g.setTimeout(0); this.tries = 0; this.state('online'); this.loginT = setTimeout(() => this.login(), 2500); });
    _g.on('data', (_h) => this.data(_h));
    _g.on('timeout', () => _g.destroy(new Error('timeout')));
    _g.on('error', (_i) => { this.lastErr = _i && (_i.code || _i.message); });
    _g.on('close', () => {
      clearTimeout(this.loginT);
      if (this.sock !== _g) return;
      this.sock = null;
      if (this.want) {               // caduta non voluta: si riprova, sempre più piano (5 s … 60 s)
        const _j = Math.min(60000, 5000 * Math.pow(2, this.tries++));
        this.state('retry', this.lastErr || '');
        this.retry = setTimeout(() => this.open(), _j);
      } else this.state('closed');
    });
  }
  login() { if (this.loggedIn || !this.sock || !this.want) return; this.loggedIn = true; this.write(this.want.call); }
  write(_k) { if (this.sock && !this.sock.destroyed) this.sock.write(String(_k).replace(/[\r\n]/g, '') + '\r\n'); }
  data(_l) {
    _l = _l.replace(/\xff[\xfb-\xfe][\s\S]|\xff[\xf0-\xfa]/g, '');
    this.buf += _l;
    if (!this.loggedIn && /(call|login|nominativo)[^\n]*[:>]\s*$/i.test(this.buf.slice(-120))) { clearTimeout(this.loginT); this.login(); }
    const _m = this.buf.split(/\r?\n/); this.buf = _m.pop();
    if (this.buf.length > 4000) this.buf = '';
    for (const _n of _m) if (_n.trim()) this.pending.push(_n.slice(0, 300));
    if (this.pending.length && !this.flushT) this.flushT = setTimeout(() => { this.flushT = null; const _o = this.pending; this.pending = []; try { this.onLines(_o); } catch {} }, 250);
  }
  disconnect(_p) {
    this.want = null; clearTimeout(this.retry); clearTimeout(this.loginT);
    const _q = this.sock; this.sock = null;
    if (_q) { try { _q.write('bye\r\n'); } catch {} _q.destroy(); }
    if (!_p) this.state('closed');
  }
}
module.exports = { ClusterLink };
