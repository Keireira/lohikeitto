'use client';

import { API_URL } from '@/lib/api';
import useDownloadStore from '@/lib/download-store';
import { formatEta, formatSize, triggerSave } from '@/lib/format';

const useGlobalDownload = () => {
	const startJob = useDownloadStore((s) => s.startJob);
	const updateJob = useDownloadStore((s) => s.updateJob);

	const start = async (url: string, filename: string) => {
		const id = startJob(filename);
		const controller = new AbortController();
		updateJob(id, {
			abort: () => {
				controller.abort();
			}
		});

		try {
			const sseUrl = url;
			const eventSource = new EventSource(sseUrl);
			controller.signal.addEventListener('abort', () => {
				eventSource.close();
			});

			const token = await new Promise<string>((resolve, reject) => {
				eventSource.addEventListener('fetching', (e) => {
					const [fetched, total] = (e as MessageEvent).data.split('/').map(Number);
					updateJob(id, { phase: 'fetching', fetched, total });
				});
				eventSource.addEventListener('packaging', () => {
					updateJob(id, { phase: 'packaging' });
				});
				eventSource.addEventListener('ready', (e) => {
					eventSource.close();
					resolve((e as MessageEvent).data);
				});
				eventSource.addEventListener('error', (e) => {
					eventSource.close();
					reject(new Error((e as MessageEvent).data ?? 'Connection lost'));
				});
				eventSource.onerror = () => {
					eventSource.close();
					reject(new Error('SSE connection failed'));
				};
			});

			updateJob(id, { phase: 'downloading', downloadDetail: 'Starting...' });

			const prefix = new URL(sseUrl).searchParams.get('prefix') ?? '';
			const downloadUrl = `${API_URL}/s3/archive/${token}${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ''}`;
			const res = await fetch(downloadUrl, { signal: controller.signal });

			if (!res.ok) throw new Error(`Download failed: ${res.status}`);

			const contentLength = Number(res.headers.get('content-length') ?? 0);
			const reader = res.body?.getReader();

			if (!reader || contentLength === 0) {
				const blob = await res.blob();
				triggerSave(blob, filename);
				updateJob(id, { phase: 'done', downloadPct: 100, downloadDetail: formatSize(blob.size) });
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

				updateJob(id, {
					downloadPct: pct,
					downloadDetail: `${pct}% — ${formatSize(received)} / ${formatSize(contentLength)} — ${formatEta(eta)}`
				});
			}

			triggerSave(new Blob(chunks as BlobPart[]), filename);
			updateJob(id, { phase: 'done', downloadPct: 100, downloadDetail: formatSize(received) });
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Failed';
			const current = useDownloadStore.getState().jobs.get(id);
			updateJob(id, { phase: 'error', errorAt: current?.phase ?? 'fetching', error: msg });
		}
	};

	const startFile = async (url: string, filename: string) => {
		const id = startJob(filename);
		const controller = new AbortController();
		updateJob(id, { abort: () => controller.abort() });

		try {
			updateJob(id, { phase: 'downloading', downloadDetail: 'Downloading...' });
			const res = await fetch(url, { signal: controller.signal });
			if (!res.ok) throw new Error(`${res.status}`);
			const blob = await res.blob();
			triggerSave(blob, filename);
			updateJob(id, { phase: 'done', downloadPct: 100, downloadDetail: formatSize(blob.size) });
		} catch (e) {
			updateJob(id, { phase: 'error', errorAt: 'downloading', error: e instanceof Error ? e.message : 'Failed' });
		}
	};

	const startKeys = async (keys: string[], filename: string) => {
		const id = startJob(filename);
		const controller = new AbortController();
		updateJob(id, { abort: () => controller.abort() });

		try {
			const sseRes = await fetch(`${API_URL}/s3/archive-keys`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(keys),
				signal: controller.signal
			});

			if (!sseRes.ok) throw new Error(`${sseRes.status}`);

			const reader = sseRes.body?.getReader();
			if (!reader) throw new Error('No stream');

			const decoder = new TextDecoder();
			let buffer = '';
			let token = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });

				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (line.startsWith('event: ')) {
						const event = line.slice(7).trim();
						const dataLine = lines[lines.indexOf(line) + 1];
						const data = dataLine?.startsWith('data: ') ? dataLine.slice(6).trim() : '';

						if (event === 'fetching' && data) {
							const [fetched, total] = data.split('/').map(Number);
							updateJob(id, { phase: 'fetching', fetched, total });
						} else if (event === 'packaging') {
							updateJob(id, { phase: 'packaging' });
						} else if (event === 'ready') {
							token = data;
						} else if (event === 'error') {
							throw new Error(data || 'Server error');
						}
					}
				}
			}

			if (!token) throw new Error('No download token received');

			updateJob(id, { phase: 'downloading', downloadDetail: 'Starting...' });
			const dlRes = await fetch(`${API_URL}/s3/archive/${token}`, { signal: controller.signal });
			if (!dlRes.ok) throw new Error(`Download: ${dlRes.status}`);

			const blob = await dlRes.blob();
			triggerSave(blob, filename);
			updateJob(id, { phase: 'done', downloadPct: 100, downloadDetail: formatSize(blob.size) });
		} catch (e) {
			if (controller.signal.aborted) return;
			const msg = e instanceof Error ? e.message : 'Failed';
			const current = useDownloadStore.getState().jobs.get(id);
			updateJob(id, { phase: 'error', errorAt: current?.phase ?? 'fetching', error: msg });
		}
	};

	return { start, startFile, startKeys };
};

export default useGlobalDownload;
