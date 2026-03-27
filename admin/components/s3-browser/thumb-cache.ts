import { s3FileUrl } from '@/lib/api';

export const DB_NAME = 's3-thumb-cache';
export const STORE_NAME = 'blobs';

export const openCacheDb = (): Promise<IDBDatabase> =>
	new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});

export const blobUrlCache = new Map<string, string>();

export const getCachedImageUrl = async (key: string): Promise<string> => {
	// Memory cache first
	const mem = blobUrlCache.get(key);
	if (mem) return mem;

	try {
		// IndexedDB cache
		const db = await openCacheDb();
		const blob: Blob | undefined = await new Promise((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readonly');
			const req = tx.objectStore(STORE_NAME).get(key);
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});

		if (blob instanceof Blob) {
			const url = URL.createObjectURL(blob);
			blobUrlCache.set(key, url);
			return url;
		}

		// Fetch and store
		const res = await fetch(s3FileUrl(key));
		if (!res.ok) throw new Error(`${res.status}`);
		const fetched = await res.blob();

		const url = URL.createObjectURL(fetched);
		blobUrlCache.set(key, url);

		// Store in IndexedDB (fire and forget)
		const writeTx = db.transaction(STORE_NAME, 'readwrite');
		writeTx.objectStore(STORE_NAME).put(fetched, key);

		return url;
	} catch {
		// Fallback: direct fetch without caching
		const res = await fetch(s3FileUrl(key));
		if (!res.ok) throw new Error(`${res.status}`);
		const blob = await res.blob();
		const url = URL.createObjectURL(blob);
		blobUrlCache.set(key, url);
		return url;
	}
};

export const clearImageCache = async () => {
	blobUrlCache.forEach((url) => URL.revokeObjectURL(url));
	blobUrlCache.clear();
	try {
		const db = await openCacheDb();
		const tx = db.transaction(STORE_NAME, 'readwrite');
		tx.objectStore(STORE_NAME).clear();
	} catch {
		/* */
	}
};
