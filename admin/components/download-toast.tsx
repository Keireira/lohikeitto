'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Phase = 'fetching' | 'packaging' | 'downloading' | 'done' | 'error';

type DownloadState = {
	visible: boolean;
	phase: Phase;
	errorAt: Phase | null;
	fetched: number;
	total: number;
	downloadPct: number;
	downloadDetail: string;
	error: string | null;
};

const initialState: DownloadState = {
	visible: false,
	phase: 'fetching',
	errorAt: null,
	fetched: 0,
	total: 0,
	downloadPct: 0,
	downloadDetail: '',
	error: null
};

const formatEta = (seconds: number): string => {
	if (!Number.isFinite(seconds) || seconds < 0) return '';
	if (seconds < 1) return '< 1s';
	if (seconds < 60) return `~${Math.ceil(seconds)}s`;
	return `~${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
};

const formatBytes = (bytes: number): string => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL ?? 'http://localhost:1337';

const useDownload = () => {
	const [state, setState] = useState<DownloadState>(initialState);
	const abortRef = useRef<AbortController | null>(null);

	const start = useCallback(async (archiveUrl: string, filename: string) => {
		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;

		setState({ ...initialState, visible: true });

		try {
			// Phase 1: SSE — server fetches from S3 and packages
			const sseUrl = archiveUrl.replace('/s3/archive', '/s3/archive');
			const eventSource = new EventSource(sseUrl);

			const token = await new Promise<string>((resolve, reject) => {
				eventSource.addEventListener('fetching', (e) => {
					const [fetched, total] = (e as MessageEvent).data.split('/').map(Number);
					setState((s) => ({ ...s, phase: 'fetching', fetched, total }));
				});

				eventSource.addEventListener('packaging', () => {
					setState((s) => ({ ...s, phase: 'packaging' }));
				});

				eventSource.addEventListener('ready', (e) => {
					eventSource.close();
					resolve((e as MessageEvent).data);
				});

				eventSource.addEventListener('error', (e) => {
					eventSource.close();
					const msg = (e as MessageEvent).data ?? 'Connection lost';
					reject(new Error(msg));
				});

				eventSource.onerror = () => {
					eventSource.close();
					reject(new Error('SSE connection failed'));
				};

				controller.signal.addEventListener('abort', () => {
					eventSource.close();
					reject(new Error('Aborted'));
				});
			});

			// Phase 2: Download the ready archive
			setState((s) => ({ ...s, phase: 'downloading', downloadDetail: 'Starting...' }));

			const prefix = new URL(sseUrl).searchParams.get('prefix') ?? '';
			const downloadUrl = `${API_URL}/s3/archive/${token}${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ''}`;
			const res = await fetch(downloadUrl, { signal: controller.signal });

			if (!res.ok) throw new Error(`Download failed: ${res.status}`);

			const contentLength = Number(res.headers.get('content-length') ?? 0);
			const reader = res.body?.getReader();

			if (!reader || contentLength === 0) {
				const blob = await res.blob();
				triggerSave(blob, filename);
				setState((s) => ({ ...s, phase: 'done', downloadPct: 100, downloadDetail: formatBytes(blob.size) }));
				autoHide();
				return;
			}

			const chunks: Uint8Array[] = [];
			let received = 0;
			const t0 = Date.now();

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
				received += value.length;

				const pct = Math.round((received / contentLength) * 100);
				const elapsed = (Date.now() - t0) / 1000;
				const speed = received / elapsed;
				const eta = (contentLength - received) / speed;

				setState((s) => ({
					...s,
					downloadPct: pct,
					downloadDetail: `${pct}% — ${formatBytes(received)} / ${formatBytes(contentLength)} — ${formatEta(eta)}`
				}));
			}

			triggerSave(new Blob(chunks as BlobPart[]), filename);
			setState((s) => ({ ...s, phase: 'done', downloadPct: 100, downloadDetail: formatBytes(received) }));
			autoHide();
		} catch (e) {
			if (controller.signal.aborted) return;
			const msg = e instanceof Error ? e.message : 'Failed';
			setState((s) => ({ ...s, phase: 'error', errorAt: s.phase as Phase, error: msg }));
		}

		function autoHide() {
			setTimeout(() => setState(initialState), 3000);
		}
	}, []);

	const dismiss = useCallback(() => {
		abortRef.current?.abort();
		setState(initialState);
	}, []);

	// Warn on page unload during download
	useEffect(() => {
		const active = state.visible && state.phase !== 'done' && state.phase !== 'error';
		if (!active) return;

		const handler = (e: BeforeUnloadEvent) => {
			e.preventDefault();
		};
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	}, [state.visible, state.phase]);

	return { state, start, dismiss };
};

const triggerSave = (blob: Blob, filename: string) => {
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = filename;
	a.click();
	URL.revokeObjectURL(a.href);
};

const PhaseRow = ({
	label,
	active,
	done,
	error,
	detail
}: {
	label: string;
	active: boolean;
	done: boolean;
	error: boolean;
	detail?: string;
}) => {
	const icon = error ? '✕' : done ? '✓' : active ? '●' : '○';
	const iconClass = error
		? 'text-red-400'
		: done
			? 'text-emerald-400'
			: active
				? 'text-accent animate-pulse'
				: 'text-muted-fg/30';
	const textClass = error
		? 'text-red-400'
		: active
			? 'text-foreground'
			: done
				? 'text-muted-fg'
				: 'text-muted-fg/50';

	return (
		<div className="space-y-1">
			<div className="flex items-center gap-2.5">
				<span className={iconClass}>{icon}</span>
				<span className={`text-sm ${textClass}`}>{label}</span>
			</div>
			{detail && <p className={`text-xs ml-7 font-mono ${done ? 'text-muted-fg/50' : 'text-muted-fg'}`}>{detail}</p>}
		</div>
	);
};

const DownloadToast = ({
	state,
	onDismiss
}: {
	state: DownloadState;
	onDismiss: () => void;
}) => {
	if (!state.visible) return null;

	const { phase, errorAt, fetched, total, downloadPct, downloadDetail, error } = state;
	const phases: Phase[] = ['fetching', 'packaging', 'downloading'];
	const activePhase = phase === 'error' ? errorAt : phase;
	const phaseIdx = phases.indexOf(activePhase ?? 'fetching');
	const isDone = phase === 'done';
	const isError = phase === 'error';

	const overallPct = isDone
		? 100
		: phase === 'fetching'
			? total > 0 ? Math.round((fetched / total) * 60) : 0
			: phase === 'packaging'
				? 65
				: 70 + Math.round(downloadPct * 0.3);

	return (
		<div className="fixed bottom-6 right-6 z-50 w-96 rounded-lg border border-border bg-background shadow-2xl p-4 space-y-3">
			<div className="flex items-center justify-between">
				<span className="text-sm font-medium">Download</span>
				<button type="button" onClick={onDismiss} className="text-muted-fg hover:text-foreground text-xs">
					{'✕'}
				</button>
			</div>

			<div className="space-y-2.5">
				<PhaseRow
					label="Fetching from S3"
					active={activePhase === 'fetching' && !isError}
					done={phaseIdx > 0 || isDone}
					error={isError && errorAt === 'fetching'}
					detail={activePhase === 'fetching' && total > 0 ? `${fetched} / ${total} files` : undefined}
				/>
				<PhaseRow
					label="Packaging"
					active={activePhase === 'packaging' && !isError}
					done={phaseIdx > 1 || isDone}
					error={isError && errorAt === 'packaging'}
				/>
				<PhaseRow
					label="Downloading"
					active={activePhase === 'downloading' && !isError}
					done={isDone}
					error={isError && errorAt === 'downloading'}
					detail={downloadDetail || undefined}
				/>
			</div>

			<div className="h-1.5 rounded-full bg-muted overflow-hidden">
				<div
					className={`h-full rounded-full transition-all duration-200 ${isDone ? 'bg-emerald-400' : isError ? 'bg-red-400' : 'bg-accent'}`}
					style={{ width: `${overallPct}%` }}
				/>
			</div>

			{!isDone && !isError && (
				<button
					type="button"
					onClick={onDismiss}
					className="w-full rounded border border-border py-1.5 text-xs text-muted-fg hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
				>
					Cancel
				</button>
			)}

			{error && <p className="text-xs text-red-400">{error}</p>}
		</div>
	);
};

export { DownloadToast, useDownload };
