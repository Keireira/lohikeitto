'use client';

import { useEffect, useRef, useState } from 'react';
import { API_URL } from '@/lib/api';
import { toast } from '@/lib/toast';

type LogoEntry = {
	url: string;
	blobUrl: string;
	source: string;
	size: number;
	width: number;
	height: number;
	format: string;
};

type Props = {
	domain: string;
	slug: string;
	onSave: (source: string) => Promise<void>;
	onClose: () => void;
};

const TABS = ['brandfetch', 'logodev', 'local'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = { brandfetch: 'Brandfetch', logodev: 'logo.dev', local: 'Local' };

const formatSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const LogoStudio = ({ domain, slug, onSave, onClose }: Props) => {
	const [tab, setTab] = useState<Tab>('brandfetch');
	const [logos, setLogos] = useState<Record<string, LogoEntry | null>>({});
	const [loading, setLoading] = useState<Set<string>>(new Set());
	const [selected, setSelected] = useState<LogoEntry | null>(null);
	const [saving, setSaving] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);

	const fetchLogo = async (source: Tab) => {
		if (source === 'local' || loading.has(source)) return;
		setLoading((prev) => new Set(prev).add(source));
		try {
			const res = await fetch(`${API_URL}/logos/fetch`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ domain, slug, source })
			});
			if (!res.ok) throw new Error(`${res.status}`);
			const data = await res.json();

			const imgRes = await fetch(data.url);
			if (!imgRes.ok) throw new Error('Image not found');
			const blob = await imgRes.blob();
			const blobUrl = URL.createObjectURL(blob);
			const format = blob.type.split('/').pop() ?? 'unknown';
			const dims = await new Promise<{ w: number; h: number }>((resolve) => {
				const img = new Image();
				img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
				img.onerror = () => resolve({ w: 0, h: 0 });
				img.src = blobUrl;
			});

			const entry: LogoEntry = { url: data.url, blobUrl, source, size: blob.size, width: dims.w, height: dims.h, format };
			setLogos((prev) => ({ ...prev, [source]: entry }));
			setSelected(entry);
		} catch (e) {
			toast.error(`${source}: ${e instanceof Error ? e.message : 'Failed'}`);
			setLogos((prev) => ({ ...prev, [source]: null }));
		} finally {
			setLoading((prev) => { const n = new Set(prev); n.delete(source); return n; });
		}
	};

	const handleLocalFile = async (file: File) => {
		const blobUrl = URL.createObjectURL(file);
		const format = file.type.split('/').pop() ?? file.name.split('.').pop() ?? 'unknown';
		const dims = await new Promise<{ w: number; h: number }>((resolve) => {
			const img = new Image();
			img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
			img.onerror = () => resolve({ w: 0, h: 0 });
			img.src = blobUrl;
		});
		const entry: LogoEntry = { url: blobUrl, blobUrl, source: 'local', size: file.size, width: dims.w, height: dims.h, format };
		setLogos((prev) => ({ ...prev, local: entry }));
		setSelected(entry);
	};

	// Auto-fetch on tab switch
	useEffect(() => {
		if (tab !== 'local' && !logos[tab] && !loading.has(tab)) {
			fetchLogo(tab);
		} else if (logos[tab]) {
			setSelected(logos[tab]);
		}
	}, [tab]);

	const handleSave = async () => {
		if (!selected || saving) return;
		setSaving(true);
		try {
			if (selected.source === 'local') {
				// Verify it's an image
				if (!selected.format.match(/webp|png|jpe?g|svg|gif/i)) {
					throw new Error(`Unsupported format: ${selected.format}`);
				}
				const res = await fetch(selected.blobUrl);
				const blob = await res.blob();
				const uploadRes = await fetch(`${API_URL}/s3/upload/logos/${slug}.webp`, {
					method: 'PUT',
					body: await blob.arrayBuffer()
				});
				if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);
				toast.success(`Logo uploaded as logos/${slug}.webp`);
			} else {
				await onSave(selected.source);
			}
			onClose();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Save failed');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
			<div
				className="w-[800px] max-w-[95vw] max-h-[85vh] rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden flex"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Left — preview */}
				<div className="w-[400px] shrink-0 bg-muted/30 flex flex-col">
					<div className="flex-1 flex items-center justify-center p-8">
						{selected ? (
							<img src={selected.blobUrl} alt="" className="max-w-full max-h-[300px] object-contain" />
						) : loading.size > 0 ? (
							<p className="text-sm text-muted-fg">Loading...</p>
						) : (
							<p className="text-sm text-muted-fg">Select a source</p>
						)}
					</div>
					{selected && (
						<div className="px-6 py-3 border-t border-border bg-surface/50 flex items-center gap-3 text-[11px] text-muted-fg">
							<span>{selected.width}x{selected.height}</span>
							<span className="opacity-30">·</span>
							<span>{formatSize(selected.size)}</span>
							<span className="opacity-30">·</span>
							<span className="uppercase">{selected.format}</span>
						</div>
					)}
				</div>

				{/* Right — tabs + actions */}
				<div className="flex-1 flex flex-col border-l border-border">
					{/* Header */}
					<div className="px-5 py-4 border-b border-border flex items-center justify-between">
						<h3 className="text-sm font-bold text-foreground">Logo Studio</h3>
						<button type="button" onClick={onClose} className="text-xs text-muted-fg hover:text-foreground cursor-pointer">{'✕'}</button>
					</div>

					{/* Tabs */}
					<div className="flex border-b border-border">
						{TABS.map((t) => (
							<button
								key={t}
								type="button"
								onClick={() => setTab(t)}
								className={`flex-1 py-2.5 text-xs font-medium transition-colors cursor-pointer ${tab === t ? 'text-accent border-b-2 border-accent' : 'text-muted-fg hover:text-foreground'}`}
							>
								{TAB_LABELS[t]}
								{loading.has(t) && ' ...'}
								{logos[t] && !loading.has(t) && ' ✓'}
							</button>
						))}
					</div>

					{/* Tab content */}
					<div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
						{tab === 'local' ? (
							<div className="space-y-3">
								<input
									ref={fileRef}
									type="file"
									accept="image/*"
									className="hidden"
									onChange={(e) => { if (e.target.files?.[0]) handleLocalFile(e.target.files[0]); e.target.value = ''; }}
								/>
								<button
									type="button"
									onClick={() => fileRef.current?.click()}
									className="w-full rounded-xl border-2 border-dashed border-border py-8 text-sm text-muted-fg hover:border-accent hover:text-accent transition-colors cursor-pointer"
								>
									Choose file...
								</button>
								{logos.local && (
									<div
										onClick={() => setSelected(logos.local!)}
										className={`rounded-xl border p-3 flex items-center gap-3 cursor-pointer transition-colors ${selected?.source === 'local' ? 'border-accent bg-accent/5' : 'border-border hover:border-muted-fg/30'}`}
									>
										<img src={logos.local.blobUrl} alt="" className="size-12 rounded-lg object-cover bg-muted" />
										<div className="flex-1 min-w-0">
											<p className="text-sm font-medium text-foreground">Local file</p>
											<p className="text-[10px] text-muted-fg">{logos.local.width}x{logos.local.height} · {formatSize(logos.local.size)} · {logos.local.format.toUpperCase()}</p>
										</div>
									</div>
								)}
							</div>
						) : (
							<div className="space-y-3">
								{loading.has(tab) && (
									<div className="rounded-xl bg-muted/50 py-8 text-center text-sm text-muted-fg">
										Fetching from {TAB_LABELS[tab]}...
									</div>
								)}
								{logos[tab] === null && !loading.has(tab) && (
									<div className="space-y-3">
										<div className="rounded-xl bg-danger/5 border border-danger/20 py-6 text-center text-sm text-danger">
											No logo found
										</div>
										<button
											type="button"
											onClick={() => fetchLogo(tab)}
											className="w-full rounded-xl border border-border py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
										>
											Retry
										</button>
									</div>
								)}
								{logos[tab] && !loading.has(tab) && (
									<div
										onClick={() => setSelected(logos[tab]!)}
										className={`rounded-xl border p-3 flex items-center gap-3 cursor-pointer transition-colors ${selected?.source === tab ? 'border-accent bg-accent/5' : 'border-border hover:border-muted-fg/30'}`}
									>
										<img src={logos[tab]!.blobUrl} alt="" className="size-12 rounded-lg object-cover bg-muted" />
										<div className="flex-1 min-w-0">
											<p className="text-sm font-medium text-foreground">{TAB_LABELS[tab]}</p>
											<p className="text-[10px] text-muted-fg">{logos[tab]!.width}x{logos[tab]!.height} · {formatSize(logos[tab]!.size)} · {logos[tab]!.format.toUpperCase()}</p>
										</div>
										{selected?.source === tab && <span className="text-accent text-xs font-bold">Selected</span>}
									</div>
								)}
								{!logos[tab] && !loading.has(tab) && logos[tab] !== null && (
									<button
										type="button"
										onClick={() => fetchLogo(tab)}
										className="w-full rounded-xl border border-border py-8 text-sm text-muted-fg hover:border-accent hover:text-accent transition-colors cursor-pointer"
									>
										Fetch from {TAB_LABELS[tab]}
									</button>
								)}
							</div>
						)}
					</div>

					{/* Footer */}
					<div className="px-5 py-4 border-t border-border flex gap-3">
						<button
							type="button"
							disabled={!selected || saving}
							onClick={handleSave}
							className="flex-1 rounded-xl bg-accent py-2.5 text-sm font-bold text-white hover:opacity-90 transition-colors cursor-pointer disabled:opacity-50"
						>
							{saving ? 'Saving...' : `Use this → logos/${slug}.webp`}
						</button>
						<button
							type="button"
							onClick={onClose}
							className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
						>
							Cancel
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};

export default LogoStudio;
