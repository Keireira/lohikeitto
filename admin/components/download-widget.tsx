'use client';

import { useEffect } from 'react';
import type { DownloadJob } from '@/lib/download-store';
import useDownloadStore from '@/lib/download-store';

const PhaseIcon = ({ phase, errorAt }: { phase: string; errorAt: string | null }) => {
	if (errorAt) return <span className="text-danger">{'✕'}</span>;
	if (phase === 'done') return <span className="text-success">{'✓'}</span>;
	return <span className="text-accent animate-pulse">{'●'}</span>;
};

const JobRow = ({ job }: { job: DownloadJob }) => {
	const remove = useDownloadStore((s) => s.removeJob);
	const cancel = useDownloadStore((s) => s.cancelJob);
	const isDone = job.phase === 'done';
	const isError = job.phase === 'error';
	const isActive = !isDone && !isError;

	// Per-job progress
	let pct = 0;
	if (job.phase === 'fetching' && job.total > 0) pct = Math.round((job.fetched / job.total) * 100);
	else if (job.phase === 'packaging') pct = 100;
	else if (job.phase === 'downloading') pct = job.downloadPct;
	else if (isDone) pct = 100;

	return (
		<div className="py-2.5 space-y-1.5">
			<div className="flex items-center gap-3">
				<PhaseIcon phase={job.phase} errorAt={job.errorAt} />
				<div className="flex-1 min-w-0">
					<p className="text-xs font-medium text-foreground truncate">{job.filename}</p>
					<p className="text-[10px] text-muted-fg">
						{job.phase === 'fetching' && job.total > 0 && `Fetching ${job.fetched} / ${job.total} files`}
						{job.phase === 'fetching' && job.total === 0 && 'Connecting...'}
						{job.phase === 'packaging' && 'Packaging...'}
						{job.phase === 'downloading' && job.downloadDetail}
						{isDone && 'Complete'}
						{isError && (job.error ?? 'Failed')}
					</p>
				</div>
				{isActive && (
					<button
						type="button"
						onClick={() => cancel(job.id)}
						className="text-muted-fg hover:text-danger text-[10px] cursor-pointer"
						title="Cancel"
					>
						Cancel
					</button>
				)}
				{(isDone || isError) && (
					<button
						type="button"
						onClick={() => remove(job.id)}
						className="text-muted-fg hover:text-foreground text-xs cursor-pointer"
					>
						{'✕'}
					</button>
				)}
			</div>
			{isActive && (
				<div className="h-1 rounded-full bg-muted overflow-hidden ml-6">
					<div
						className={`h-full rounded-full transition-all duration-300 ${job.phase === 'fetching' ? 'bg-accent' : 'bg-accent'}`}
						style={{ width: `${pct}%` }}
					/>
				</div>
			)}
		</div>
	);
};

const OverallProgress = ({ jobs }: { jobs: DownloadJob[] }) => {
	const active = jobs.filter((j) => j.phase !== 'done' && j.phase !== 'error');
	if (active.length === 0) return 100;
	let sum = 0;
	for (const j of active) {
		if (j.phase === 'fetching') sum += j.total > 0 ? (j.fetched / j.total) * 60 : 0;
		else if (j.phase === 'packaging') sum += 65;
		else if (j.phase === 'downloading') sum += 70 + j.downloadPct * 0.3;
	}
	return Math.round(sum / active.length);
};

const DownloadWidget = () => {
	const { jobs, minimized, toggleMinimized, cancelJob } = useDownloadStore();
	const jobList = [...jobs.values()];

	// Cancel active downloads on page unload
	useEffect(() => {
		const handler = () => {
			const { jobs } = useDownloadStore.getState();
			for (const job of jobs.values()) {
				if (job.phase !== 'done' && job.phase !== 'error') {
					job.abort?.();
				}
			}
		};
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	}, []);

	if (jobList.length === 0) return null;

	const active = jobList.filter((j) => j.phase !== 'done' && j.phase !== 'error');
	const pct = typeof OverallProgress === 'function' ? (OverallProgress({ jobs: jobList }) as number) : 100;
	const isDone = active.length === 0;

	if (minimized) {
		// Circular progress indicator
		const radius = 18;
		const circumference = 2 * Math.PI * radius;
		const offset = circumference - (pct / 100) * circumference;

		return (
			<button
				type="button"
				onClick={toggleMinimized}
				className="fixed bottom-6 right-6 z-40 size-12 rounded-full bg-surface border border-border shadow-xl cursor-pointer flex items-center justify-center hover:scale-105 transition-transform"
				title="Show downloads"
			>
				<svg width={44} height={44} className="absolute -rotate-90">
					<circle cx={22} cy={22} r={radius} fill="none" stroke="var(--border)" strokeWidth={2.5} />
					<circle
						cx={22}
						cy={22}
						r={radius}
						fill="none"
						stroke={isDone ? 'var(--success)' : 'var(--accent)'}
						strokeWidth={2.5}
						strokeDasharray={circumference}
						strokeDashoffset={offset}
						strokeLinecap="round"
						className="transition-all duration-300"
					/>
				</svg>
				<span className="text-[9px] font-bold text-foreground z-10">{isDone ? '✓' : `${active.length}`}</span>
			</button>
		);
	}

	return (
		<div className="fixed bottom-6 right-6 z-40 w-80 rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden">
			<div className="px-4 py-3 border-b border-border flex items-center justify-between">
				<span className="text-xs font-medium text-foreground">Downloads ({jobList.length})</span>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={toggleMinimized}
						className="text-muted-fg hover:text-foreground text-xs cursor-pointer rounded-full border border-border px-2 py-0.5"
					>
						Minimize
					</button>
					{isDone && (
						<button
							type="button"
							onClick={() => {
								for (const j of jobList) useDownloadStore.getState().removeJob(j.id);
							}}
							className="text-muted-fg hover:text-foreground text-xs cursor-pointer"
							title="Clear all"
						>
							{'✕'}
						</button>
					)}
				</div>
			</div>
			<div className="px-4 py-2 max-h-60 overflow-y-auto divide-y divide-border">
				{jobList.map((j) => (
					<JobRow key={j.id} job={j} />
				))}
			</div>
			{!isDone && (
				<div className="h-1 bg-muted">
					<div className="h-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
				</div>
			)}
		</div>
	);
};

export default DownloadWidget;
