const DB_NAME = 'img-cache';
const STORE_NAME = 'blobs';

const openCacheDb = (): Promise<IDBDatabase> =>
	new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});

const memCache = new Map<string, string>();

const getCachedImage = async (url: string): Promise<string> => {
	const mem = memCache.get(url);
	if (mem) return mem;

	try {
		const db = await openCacheDb();
		const blob: Blob | undefined = await new Promise((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readonly');
			const req = tx.objectStore(STORE_NAME).get(url);
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});

		if (blob instanceof Blob) {
			const blobUrl = URL.createObjectURL(blob);
			memCache.set(url, blobUrl);
			return blobUrl;
		}

		const res = await fetch(url);
		if (!res.ok) throw new Error(`${res.status}`);
		const fetched = await res.blob();
		const blobUrl = URL.createObjectURL(fetched);
		memCache.set(url, blobUrl);

		const writeTx = db.transaction(STORE_NAME, 'readwrite');
		writeTx.objectStore(STORE_NAME).put(fetched, url);

		return blobUrl;
	} catch {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`${res.status}`);
		const blob = await res.blob();
		const blobUrl = URL.createObjectURL(blob);
		memCache.set(url, blobUrl);
		return blobUrl;
	}
};

const clearImageCache = async () => {
	memCache.forEach((u) => URL.revokeObjectURL(u));
	memCache.clear();
	try {
		const db = await openCacheDb();
		const tx = db.transaction(STORE_NAME, 'readwrite');
		tx.objectStore(STORE_NAME).clear();
	} catch { /* */ }
};

export { getCachedImage, clearImageCache };
