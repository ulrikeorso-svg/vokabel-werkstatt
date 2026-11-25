const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

let db = null; // better-sqlite3 Handle
let dbPfad = null;

function dbOeffnen() {
  const Database = require("better-sqlite3");
  const ordner = app.getPath("userData");
  fs.mkdirSync(ordner, { recursive: true });
  dbPfad = path.join(ordner, "vokabel-werkstatt.sqlite");
  db = new Database(dbPfad);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS karten (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meta (
      schluessel TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

function hole(store, key) {
  if (store === "karten") {
    const zeile = db.prepare("SELECT json FROM karten WHERE id = ?").get(String(key));
    return zeile ? JSON.parse(zeile.json) : null;
  }
  const zeile = db.prepare("SELECT value FROM meta WHERE schluessel = ?").get(String(key));
  return zeile ? JSON.parse(zeile.value) : null;
}

function holeAlle(store) {
  if (store === "karten") {
    return db.prepare("SELECT json FROM karten ORDER BY id").all().map(function (z) { return JSON.parse(z.json); });
  }
  return [];
}

function transaktion(aktionen) {
  const laufen = db.transaction(function () {
    for (const a of aktionen) {
      if (a.op === "put") {
        if (a.store === "karten") {
          const wert = (a.value && typeof a.value === "object") ? a.value : {};
          db.prepare("INSERT INTO karten (id, json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json")
            .run(String(wert.id), JSON.stringify(wert));
        } else if (a.store === "meta") {
          db.prepare("INSERT INTO meta (schluessel, value) VALUES (?, ?) ON CONFLICT(schluessel) DO UPDATE SET value = excluded.value")
            .run(String(a.key), JSON.stringify(a.value === undefined ? null : a.value));
        }
      } else if (a.op === "delete") {
        if (a.store === "karten") db.prepare("DELETE FROM karten WHERE id = ?").run(String(a.key));
        else if (a.store === "meta") db.prepare("DELETE FROM meta WHERE schluessel = ?").run(String(a.key));
      }
    }
  });
  laufen();
  return true;
}

function erzeugeFenster() {
  const win = new BrowserWindow({
    width: 1550,
    height: 950,
    minWidth: 900,
    minHeight: 600,
    title: "Vokabel-Werkstatt 3.0",
    backgroundColor: "#f8fafc",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.loadFile(path.join(__dirname, "index.html"));
  return win;
}

app.whenReady().then(function () {
  dbOeffnen();

  ipcMain.handle("vw:db-init", function () {
    try { db.prepare("SELECT 1").get(); return true; } catch (e) { return false; }
  });
  ipcMain.handle("vw:db-get", function (e, store, key) { return hole(store, key); });
  ipcMain.handle("vw:db-getAll", function (e, store) { return holeAlle(store); });
  ipcMain.handle("vw:db-tx", function (e, aktionen) { return transaktion(aktionen || []); });
  ipcMain.handle("vw:db-info", function () { return { pfad: dbPfad }; });
  // Sichert die SQLite-Datenbank in eine Datei, die Ulrike im Dialog auswaehlt
  ipcMain.handle("vw:db-backup", async function () {
    const res = await dialog.showSaveDialog({
      title: "Datenbank sichern",
      defaultPath: "vokabel-werkstatt-" + new Date().toISOString().slice(0, 10) + ".sqlite"
    });
    if (res.canceled || !res.filePath) return { ok: false };
    const backup = db.backup(res.filePath);
    await new Promise(function (resolve, reject) {
      backup.once("completed", resolve);
      backup.once("failed", reject);
      backup.start();
    });
    return { ok: true, pfad: res.filePath };
  });

  erzeugeFenster();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) erzeugeFenster();
  });
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", function () {
  try { if (db) db.close(); } catch (e) {}
});
