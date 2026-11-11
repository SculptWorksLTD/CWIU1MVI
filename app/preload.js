const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cwiuLog', {
  append: (_a, _b, _c) => ipcRenderer.invoke('log-append', { file:_a, header:_b, line:_c }),
  write: (_d, _e) => ipcRenderer.invoke('log-write', { file:_d, text:_e }),
  openFolder: () => ipcRenderer.invoke('log-open'),
  folder: () => ipcRenderer.invoke('log-dir'),
  recOpen: (_f, _g) => ipcRenderer.invoke('rec-open', { file:_f, rate:_g }),
  recAppend: (_h) => ipcRenderer.invoke('rec-append', _h),
  recClose: () => ipcRenderer.invoke('rec-close'),
  saveAs: (_i, _j) => ipcRenderer.invoke('save-as', { name:_i, text:_j }),
});
contextBridge.exposeInMainWorld('cwiuCluster', {
  connect: (_k, _l, _m) => ipcRenderer.invoke('cl-connect', { host:_k, port:_l, call:_m }),
  disconnect: () => ipcRenderer.invoke('cl-disconnect'),
  send: (_n) => ipcRenderer.invoke('cl-send', _n),
  onLines: (_o) => ipcRenderer.on('cl-lines', (_p, _q) => _o(_q)),
  onState: (_r) => ipcRenderer.on('cl-state', (_s, _t) => _r(_t)),
});
contextBridge.exposeInMainWorld('cwiuApp', {
  onMenu: (_u) => ipcRenderer.on('menu', (_v, _w) => _u(String(_w))),
  state: (_x) => ipcRenderer.send('app-state', _x),
  info: () => ipcRenderer.invoke('app-info'),
  setLang: (_y) => ipcRenderer.send('set-lang', _y),
  update: {
    check: () => ipcRenderer.invoke('upd-check'),
    install: () => ipcRenderer.invoke('upd-install'),
    cancel: () => ipcRenderer.send('upd-cancel'),
    onProgress: (_z) => ipcRenderer.on('upd-progress', (_A, _B) => _z(+_B)),
  },
});
contextBridge.exposeInMainWorld('cwiuHamqth', {
  set: (_C, _D) => ipcRenderer.invoke('hq-set', { user:_C, pass:_D }),
  status: () => ipcRenderer.invoke('hq-status'),
  test: () => ipcRenderer.invoke('hq-test'),
  lookup: (_E) => ipcRenderer.invoke('hq-lookup', _E),
  upload: (_F) => ipcRenderer.invoke('hq-upload', _F),
});
