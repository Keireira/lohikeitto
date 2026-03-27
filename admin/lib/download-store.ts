import { create } from 'zustand';

type Phase = 'fetching' | 'packaging' | 'downloading' | 'done' | 'error';

type DownloadJob = {
	id: string;
	filename: string;
	phase: Phase;
	errorAt: Phase | null;
	fetched: number;
	total: number;
	downloadPct: number;
	downloadDetail: string;
	error: string | null;
	abort?: () => void;
};

type DownloadStore = {
	jobs: Map<string, DownloadJob>;
	minimized: boolean;
	activeJobId: string | null;

	startJob: (filename: string) => string;
	updateJob: (id: string, patch: Partial<DownloadJob>) => void;
	cancelJob: (id: string) => void;
	removeJob: (id: string) => void;
	toggleMinimized: () => void;
};

let jobCounter = 0;

const useDownloadStore = create<DownloadStore>((set) => ({
	jobs: new Map(),
	minimized: false,
	activeJobId: null,

	startJob: (filename: string) => {
		const id = `dl-${++jobCounter}-${Date.now()}`;
		const job: DownloadJob = {
			id,
			filename,
			phase: 'fetching',
			errorAt: null,
			fetched: 0,
			total: 0,
			downloadPct: 0,
			downloadDetail: '',
			error: null
		};
		set((s) => {
			const jobs = new Map(s.jobs);
			jobs.set(id, job);
			return { jobs, activeJobId: id, minimized: false };
		});
		return id;
	},

	updateJob: (id, patch) => {
		set((s) => {
			const jobs = new Map(s.jobs);
			const existing = jobs.get(id);
			if (existing) jobs.set(id, { ...existing, ...patch });
			return { jobs };
		});
	},

	cancelJob: (id) => {
		const job = useDownloadStore.getState().jobs.get(id);
		if (job?.abort) job.abort();
		set((s) => {
			const jobs = new Map(s.jobs);
			jobs.delete(id);
			return { jobs };
		});
	},

	removeJob: (id) => {
		set((s) => {
			const jobs = new Map(s.jobs);
			jobs.delete(id);
			return { jobs, activeJobId: s.activeJobId === id ? null : s.activeJobId };
		});
	},

	toggleMinimized: () => set((s) => ({ minimized: !s.minimized }))
}));

export type { DownloadJob, Phase };
export default useDownloadStore;
