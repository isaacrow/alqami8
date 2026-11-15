// Browser IndexedDB + Fast In-Memory Artifact Database Manager for Alqami
// Ensures instant non-blocking startup on mobile browsers even if IndexedDB version upgrade is blocked by another tab

const DB_NAME = 'AlqamiArtifactDB';
const DB_VERSION = 5; // Bumped to v5 for 1280-D WebGL MobileNetV2 + Foreground-Masked 3D Statue Vectors
const STORE_NAME = 'artifacts';
const SEED_SYNC_KEY = 'alqami_seed_sync_v5_webgl_masked';

export class ArtifactDatabase {
  constructor() {
    this.db = null;
    this.isReady = false;
    this.memoryStore = new Map();
    this.baseUrl = (import.meta.env.BASE_URL || './') + 'alqami3/sweep/'; // ALQAMI: this mode's files live under alqami3/sweep/
  }

  async init() {
    if (this.isReady && this.memoryStore.size > 0) return true;

    // 1. Always load latest seed-artifacts.json into memory first for instant, guaranteed availability
    const isSynced = localStorage.getItem(SEED_SYNC_KEY);
    if (this.memoryStore.size === 0) {
      await this._loadSeedIntoMemory();
    }

    // 2. Open IndexedDB with a safety timeout so blocked tab upgrades never hang mobile camera startup
    try {
      await new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          console.warn('IndexedDB open timed out or blocked; using fast in-memory artifact store.');
          this.isReady = true;
          resolve(true);
        }, 1200);

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        };

        request.onblocked = () => {
          clearTimeout(timeoutId);
          console.warn('IndexedDB upgrade blocked by another open tab; using in-memory store.');
          this.isReady = true;
          resolve(true);
        };

        request.onsuccess = async (e) => {
          clearTimeout(timeoutId);
          this.db = e.target.result;
          this.isReady = true;

          if (!isSynced) {
            await this._syncMemoryToIndexedDB();
            localStorage.setItem(SEED_SYNC_KEY, 'true');
          } else {
            // Merge any custom user-captured angles from IndexedDB into memoryStore
            const idbItems = await this._getAllFromIDB();
            for (const item of idbItems) {
              if (item && item.id && item.embeddings && item.embeddings.length > 0) {
                const firstVec = item.embeddings[0].vector;
                // Only merge if vector dimension matches 1280-D MobileNetV2
                if (firstVec && firstVec.length === 1280) {
                  this.memoryStore.set(item.id, item);
                }
              }
            }
          }
          resolve(true);
        };

        request.onerror = () => {
          clearTimeout(timeoutId);
          this.isReady = true;
          resolve(true);
        };
      });
    } catch (e) {
      console.warn('IndexedDB fallback to memoryStore:', e);
      this.isReady = true;
    }

    return true;
  }

  async _loadSeedIntoMemory() {
    try {
      const resp = await fetch(`${this.baseUrl}data/seed-artifacts.json?v=${Date.now()}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const seedList = await resp.json();
      for (const artifact of seedList) {
        this.memoryStore.set(artifact.id, artifact);
      }
      console.log(`Loaded ${seedList.length} multi-angle 3D artifacts into memory.`);
    } catch (err) {
      console.warn('Could not load seed-artifacts.json:', err);
    }
  }

  async _syncMemoryToIndexedDB() {
    if (!this.db) return;
    try {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      for (const artifact of this.memoryStore.values()) {
        store.put(artifact);
      }
    } catch (e) {
      console.warn('Could not sync memoryStore to IndexedDB:', e);
    }
  }

  async _getAllFromIDB() {
    if (!this.db) return [];
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async getAll() {
    await this.init();
    return Array.from(this.memoryStore.values());
  }

  async get(id) {
    await this.init();
    return this.memoryStore.get(id) || null;
  }

  async save(artifact) {
    await this.init();
    this.memoryStore.set(artifact.id, artifact);
    if (this.db) {
      try {
        await new Promise((resolve) => {
          const tx = this.db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.put(artifact);
          req.onsuccess = () => resolve(artifact);
          req.onerror = () => resolve(artifact);
        });
      } catch {
        // Ignore IDB write error; memoryStore is updated
      }
    }
    return artifact;
  }

  async delete(id) {
    await this.init();
    this.memoryStore.delete(id);
    if (this.db) {
      try {
        await new Promise((resolve) => {
          const tx = this.db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.delete(id);
          req.onsuccess = () => resolve(true);
          req.onerror = () => resolve(false);
        });
      } catch {
        // Ignore
      }
    }
    return true;
  }

  async exportJSON() {
    const all = await this.getAll();
    return JSON.stringify(all, null, 2);
  }

  async importJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (!Array.isArray(parsed)) throw new Error('Root must be an array of artifacts');
      for (const item of parsed) {
        if (!item.id) continue;
        await this.save(item);
      }
      return true;
    } catch (err) {
      console.error('Failed to import artifacts JSON:', err);
      throw err;
    }
  }

  async resetToDefault() {
    this.memoryStore.clear();
    await this._loadSeedIntoMemory();
    await this._syncMemoryToIndexedDB();
    localStorage.setItem(SEED_SYNC_KEY, 'true');
    return true;
  }
}
