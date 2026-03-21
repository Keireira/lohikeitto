'use client';

import { useEffect, useRef, useState } from 'react';
import { API_URL } from '@/lib/api';
import { toast } from '@/lib/toast';

type LogoEntry = {
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
	currentLogoUrl: string;
	onSave: (source: string, slug: string) => Promise<void>;
	onClose: () => void;
};

const SOURCES = ['current', 'brandfetch', 'logodev', 'local'] as const;
type Source = (typeof SOURCES)[number];

const fmtSize = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

const probeImage = (blobUrl: string): Promise<{ w: number; h: number }> =>
	new Promise((resolve) => {
		const img = new Image();
		img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
		img.onerror = () => resolve({ w: 0, h: 0 });
		img.src = blobUrl;
	});

const LogoStudio = ({ domain, slug: initialSlug, currentLogoUrl, onSave, onClose }: Props) => {
	const [active, setActive] = useState<Source>('current');
	const [logos, setLogos] = useState<Partial<Record<Source, LogoEntry>>>({});
	const [loading, setLoading] = useState<Set<Source>>(new Set());
	const [slugValue, setSlugValue] = useState(initialSlug);
	const [saving, setSaving] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);

	// Load current on mount
	useEffect(() => {
		if (!currentLogoUrl) return;
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch(currentLogoUrl, { cache: 'no-store' });
				if (!res.ok) return;
				const blob = await res.blob();
				const blobUrl = URL.createObjectURL(blob);
				const dims = await probeImage(blobUrl);
				if (!cancelled) setLogos((p) => ({ ...p, current: { blobUrl, source: 'current', size: blob.size, width: dims.w, height: dims.h, format: blob.type.split('/').pop() ?? '?' } }));
			} catch { /* no current */ }
		})();
		return () => { cancelled = true; };
	}, [currentLogoUrl]);

	// Cleanup blobs on unmount
	useEffect(() => () => { for (const e of Object.values(logos)) if (e) URL.revokeObjectURL(e.blobUrl); }, []);

	const fetchRemote = async (source: 'brandfetch' | 'logodev') => {
		if (loading.has(source)) return;
		setLoading((p) => new Set(p).add(source));
		try {
			const res = await fetch(`${API_URL}/logos/fetch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain, slug: slugValue, source }) });
			if (!res.ok) throw new Error(`${res.status}`);
			const data = await res.json();
			const imgRes = await fetch(data.url);
			if (!imgRes.ok) throw new Error('Not found');
			const blob = await imgRes.blob();
			const blobUrl = URL.createObjectURL(blob);
			const dims = await probeImage(blobUrl);
			setLogos((p) => ({ ...p, [source]: { blobUrl, source, size: blob.size, width: dims.w, height: dims.h, format: blob.type.split('/').pop() ?? '?' } }));
			setActive(source);
		} catch (e) {
			toast.error(`${source}: ${e instanceof Error ? e.message : 'Failed'}`);
		} finally {
			setLoading((p) => { const n = new Set(p); n.delete(source); return n; });
		}
	};

	const handleLocal = async (file: File) => {
		const blobUrl = URL.createObjectURL(file);
		const dims = await probeImage(blobUrl);
		setLogos((p) => ({ ...p, local: { blobUrl, source: 'local', size: file.size, width: dims.w, height: dims.h, format: file.type.split('/').pop() ?? file.name.split('.').pop() ?? '?' } }));
		setActive('local');
	};

	const handleSave = async () => {
		const entry = logos[active];
		if (!entry || saving || !slugValue.trim() || active === 'current') return;
		setSaving(true);
		try {
			if (active === 'local') {
				const res = await fetch(entry.blobUrl);
				const blob = await res.blob();
				const up = await fetch(`${API_URL}/s3/upload/logos/${slugValue}.webp`, { method: 'PUT', body: await blob.arrayBuffer() });
				if (!up.ok) throw new Error(`Upload: ${up.status}`);
				toast.success(`Saved logos/${slugValue}.webp`);
			} else {
				await onSave(active, slugValue);
			}
			onClose();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Save failed');
		} finally {
			setSaving(false);
		}
	};

	const selected = logos[active] ?? null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
			<div
				className="bg-surface rounded-2xl border border-border shadow-2xl w-[960px] max-w-[95vw] max-h-[85vh] overflow-hidden flex flex-col"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Body */}
				<div className="flex flex-1 min-h-0">
					{/* Left — viewer */}
					<div className="flex-1 flex flex-col">
						{/* Carousel */}
						<div className="flex items-center gap-3 px-6 py-4 border-b border-border">
							{SOURCES.map((src) => {
								const entry = logos[src];
								const isActive = active === src;
								return (
									<button
										key={src}
										type="button"
										onClick={() => entry && setActive(src)}
										className={`shrink-0 rounded-xl overflow-hidden transition-all cursor-pointer ring-2 ring-offset-2 ring-offset-surface ${
											isActive ? 'ring-accent' : entry ? 'ring-border hover:ring-muted-fg/40' : 'ring-transparent'
										}`}
									>
										{entry ? (
											<img src={entry.blobUrl} alt={src} className="size-12 object-cover bg-muted" />
										) : (
											<div className="size-12 flex items-center justify-center bg-muted/40">
												{loading.has(src) ? (
													<div className="size-3 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
												) : (
													<span className="text-[8px] text-muted-fg/30 uppercase tracking-wider">{src === 'logodev' ? 'L.D' : src.slice(0, 3)}</span>
												)}
											</div>
										)}
									</button>
								);
							})}
						</div>

						{/* Image viewer */}
						<div className="flex-1 flex items-center justify-center p-10 bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
							{selected ? (
								<img src={selected.blobUrl} alt="" className="max-w-full max-h-[360px] object-contain drop-shadow-lg" />
							) : (
								<p className="text-sm text-muted-fg/50">{loading.size > 0 ? 'Fetching...' : 'No logo'}</p>
							)}
						</div>

						{/* Meta bar */}
						{selected && (
							<div className="px-6 py-2.5 border-t border-border flex items-center gap-5 text-xs text-muted-fg bg-muted/10">
								<span className="font-mono tabular-nums">{selected.width} × {selected.height}</span>
								<span>{fmtSize(selected.size)}</span>
								<span className="uppercase font-mono">{selected.format}</span>
							</div>
						)}
					</div>

					{/* Right — panel */}
					<div className="w-64 shrink-0 border-l border-border flex flex-col bg-background">
						{/* Header */}
						<div className="px-5 pt-5 pb-4 border-b border-border">
							<p className="text-[11px] font-bold text-accent uppercase tracking-widest">Logo Studio</p>
							<div className="flex items-center justify-between mt-1">
								<h3 className="text-lg font-bold text-foreground">Select Logo</h3>
								<button type="button" onClick={onClose} className="text-muted-fg hover:text-foreground transition-colors cursor-pointer text-lg">{'×'}</button>
							</div>
						</div>

						{/* Source buttons */}
						<div className="flex-1 overflow-y-auto px-5 py-4 space-y-1.5">
							<p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-2">Source</p>

							<button
								type="button"
								onClick={() => logos.current && setActive('current')}
								className={`w-full text-left rounded-xl px-4 py-3 text-sm transition-all cursor-pointer ${active === 'current' ? 'bg-accent/10 text-accent font-semibold ring-1 ring-accent/20' : 'text-foreground hover:bg-muted'}`}
							>
								Current
							</button>

							<button
								type="button"
								onClick={() => logos.brandfetch ? setActive('brandfetch') : fetchRemote('brandfetch')}
								disabled={loading.has('brandfetch')}
								className={`w-full text-left rounded-xl px-4 py-3 text-sm transition-all cursor-pointer disabled:opacity-50 ${active === 'brandfetch' ? 'bg-accent/10 text-accent font-semibold ring-1 ring-accent/20' : 'text-foreground hover:bg-muted'}`}
							>
								{loading.has('brandfetch') ? (
									<span className="flex items-center gap-2"><span className="size-3 rounded-full border-2 border-accent/30 border-t-accent animate-spin" /> Fetching...</span>
								) : (
									<span className="flex items-center justify-between">Brandfetch{logos.brandfetch && <span className="text-success text-xs">{'✓'}</span>}</span>
								)}
							</button>

							<button
								type="button"
								onClick={() => logos.logodev ? setActive('logodev') : fetchRemote('logodev')}
								disabled={loading.has('logodev')}
								className={`w-full text-left rounded-xl px-4 py-3 text-sm transition-all cursor-pointer disabled:opacity-50 ${active === 'logodev' ? 'bg-accent/10 text-accent font-semibold ring-1 ring-accent/20' : 'text-foreground hover:bg-muted'}`}
							>
								{loading.has('logodev') ? (
									<span className="flex items-center gap-2"><span className="size-3 rounded-full border-2 border-accent/30 border-t-accent animate-spin" /> Fetching...</span>
								) : (
									<span className="flex items-center justify-between">logo.dev{logos.logodev && <span className="text-success text-xs">{'✓'}</span>}</span>
								)}
							</button>

							<div className="h-px bg-border my-3" />

							<input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleLocal(e.target.files[0]); e.target.value = ''; }} />
							<button
								type="button"
								onClick={() => logos.local ? setActive('local') : fileRef.current?.click()}
								className={`w-full text-left rounded-xl px-4 py-3 text-sm transition-all cursor-pointer ${active === 'local' ? 'bg-accent/10 text-accent font-semibold ring-1 ring-accent/20' : 'text-foreground hover:bg-muted'}`}
							>
								<span className="flex items-center justify-between">Upload file{logos.local && <span className="text-success text-xs">{'✓'}</span>}</span>
							</button>
							{logos.local && (
								<button
									type="button"
									onClick={() => fileRef.current?.click()}
									className="w-full text-left px-4 py-2 text-xs text-muted-fg hover:text-foreground transition-colors cursor-pointer"
								>
									Replace...
								</button>
							)}
						</div>
					</div>
				</div>

				{/* Footer */}
				<div className="px-5 py-3.5 border-t border-border flex items-center gap-3 bg-muted/10">
					<div className="flex items-center gap-1.5 flex-1 min-w-0">
						<span className="text-xs text-muted-fg/50 font-mono shrink-0">logos/</span>
						<input
							type="text"
							value={slugValue}
							onChange={(e) => setSlugValue(e.target.value)}
							className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm font-mono flex-1 min-w-0 focus:outline-none focus:ring-1 focus:ring-accent/50"
						/>
						<span className="text-xs text-muted-fg/50 font-mono shrink-0">.webp</span>
					</div>
					<button
						type="button"
						disabled={!selected || active === 'current' || saving || !slugValue.trim()}
						onClick={handleSave}
						className="rounded-xl bg-accent px-6 py-2 text-sm font-bold text-white hover:opacity-90 transition-colors cursor-pointer disabled:opacity-30"
					>
						{saving ? 'Saving...' : 'Save'}
					</button>
					<button
						type="button"
						onClick={onClose}
						className="rounded-xl px-4 py-2 text-sm text-muted-fg hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
};

export default LogoStudio;
