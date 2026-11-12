const fs = require('fs');
const tty = require('tty');
const port = process.parentPort;
let wfd = -1;
let lost = false;
const lose = () => { if (!lost) { lost = true; port.postMessage({ op: 'lost' }); } };
port.on('message', (_a) => {
  const _b = (_a && _a.data) || {};
  if (_b.op === 'open') {
    try {
      const _c = fs.constants.O_RDWR | fs.constants.O_NOCTTY | fs.constants.O_NONBLOCK;
      const _d = fs.openSync(_b.path, _c);
      wfd = fs.openSync(_b.path, _c);
      const _e = new tty.ReadStream(_d);
      _e.on('data', (_f) => port.postMessage({ op: 'data', b: new Uint8Array(_f) }));
      for (const _g of ['error', 'end', 'close']) _e.on(_g, lose);
      port.postMessage({ op: 'opened', ok: true });
    } catch {
      port.postMessage({ op: 'opened', ok: false });
    }
  } else if (_b.op === 'write') {
    if (wfd < 0) { port.postMessage({ op: 'wrote', id: _b.id, ok: false }); return; }
    fs.write(wfd, Buffer.from(_b.b), (_h) => {
      port.postMessage({ op: 'wrote', id: _b.id, ok: !_h, code: _h ? _h.code : '' });
    });
  }
});
