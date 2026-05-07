// ⚠️ Browser-only: do not use in Node.js.

import { IDB_DB_NAME, IDB_STORE_NAME } from './constants'

const DB_NAME = IDB_DB_NAME
const STORE   = IDB_STORE_NAME

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

export async function saveAudio(key: string, buf: ArrayBuffer): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(buf, key)
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

export async function loadAudio(key: string): Promise<ArrayBuffer | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror   = () => reject(req.error)
  })
}

/** Delete all IDB entries whose keys start with the given prefix. */
export async function deleteByPrefix(prefix: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const req = store.openCursor()
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        if (String(cursor.key).startsWith(prefix)) cursor.delete()
        cursor.continue()
      }
    }
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}
