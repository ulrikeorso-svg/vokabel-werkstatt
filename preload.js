const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vwdb", {
  init: function () { return ipcRenderer.invoke("vw:db-init"); },
  get: function (store, key) { return ipcRenderer.invoke("vw:db-get", store, key); },
  getAll: function (store) { return ipcRenderer.invoke("vw:db-getAll", store); },
  tx: function (aktionen) { return ipcRenderer.invoke("vw:db-tx", aktionen); },
  info: function () { return ipcRenderer.invoke("vw:db-info"); },
  backup: function () { return ipcRenderer.invoke("vw:db-backup"); }
});
