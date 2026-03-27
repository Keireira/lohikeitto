import { create } from 'zustand';

type LogoCacheStore = {
	blobs: Map<string, string>;
	get: (slug: string) => string | undefined;
	set: (slug: string, blobUrl: string) => void;
	bust: (slug: string) => void;
	version: number;
};

const useLogoCacheStore = create<LogoCacheStore>((set, get) => ({
	blobs: new Map(),
	version: 0,
	get: (slug) => get().blobs.get(slug),
	set: (slug, blobUrl) =>
		set((s) => {
			const old = s.blobs.get(slug);
			if (old) URL.revokeObjectURL(old);
			const next = new Map(s.blobs);
			next.set(slug, blobUrl);
			return { blobs: next, version: s.version + 1 };
		}),
	bust: (slug) =>
		set((s) => {
			const old = s.blobs.get(slug);
			if (old) URL.revokeObjectURL(old);
			const next = new Map(s.blobs);
			next.delete(slug);
			return { blobs: next, version: s.version + 1 };
		})
}));

export { useLogoCacheStore };
