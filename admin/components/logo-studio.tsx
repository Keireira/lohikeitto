'use client';

import { useEffect, useRef, useState } from 'react';
import { useVectorize } from '@/components/vectorize-widget/use-vectorize';
import VectorTab from '@/components/vectorize-widget/vector-tab';
import GradientTab from '@/components/vectorize-widget/gradient-tab';
import type { Tab } from '@/components/vectorize-widget/vectorize-widget.d';
import { API_URL } from '@/lib/api';
import { formatSize } from '@/lib/format';
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

const SOURCE_LABELS: Record<Source, string> = {
	current: 'Current',
	brandfetch: 'Brandfetch',
	logodev: 'logo.dev',
	local: 'Upload'
};

type View = 'logo' | 'vectorize' | 'gradient';

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
	const [view, setView] = useState<View>('logo');
	const [dragOver, setDragOver] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);

	const selected = logos[active] ?? null;
	const v = useVectorize({ blobUrl: selected?.blobUrl ?? '', slug: slugValue });

	const addLogo = (source: Source, blob: Blob, blobUrl: string, dims: { w: number; h: number }) => {
		setLogos((p) => ({
			...p,
			[source]: {
				blobUrl,
				source,
				size: blob.size,
				width: dims.w,
				height: dims.h,
				format: blob.type.split('/').pop() ?? '?'
			}
		}));
	};

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
				if (!cancelled) addLogo('current', blob, blobUrl, dims);
			} catch {
				/* no current */
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [currentLogoUrl]);

	useEffect(
		() => () => {
			for (const e of Object.values(logos)) if (e) URL.revokeObjectURL(e.blobUrl);
		},
		[]
	);

	const fetchRemote = async (source: 'brandfetch' | 'logodev') => {
		if (loading.has(source)) return;
		setLoading((p) => new Set(p).add(source));
		try {
			const res = await fetch(`${API_URL}/logos/fetch`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ domain, slug: slugValue, source })
			});
			if (!res.ok) throw new Error(`${res.status}`);
			const data = await res.json();
			const imgRes = await fetch(data.url);
			if (!imgRes.ok) throw new Error('Not found');
			const blob = await imgRes.blob();
			const blobUrl = URL.createObjectURL(blob);
			const dims = await probeImage(blobUrl);
			addLogo(source, blob, blobUrl, dims);
			setActive(source);
		} catch (e) {
			toast.error(`${source}: ${e instanceof Error ? e.message : 'Failed'}`);
		} finally {
			setLoading((p) => {
				const n = new Set(p);
				n.delete(source);
				return n;
			});
		}
	};

	const handleLocal = async (file: File) => {
		const blobUrl = URL.createObjectURL(file);
		const dims = await probeImage(blobUrl);
		addLogo('local', file, blobUrl, dims);
		setActive('local');
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setDragOver(false);
		const file = e.dataTransfer.files[0];
		if (file?.type.startsWith('image/')) handleLocal(file);
	};

	const handleSave = async () => {
		const entry = logos[active];
		if (!entry || saving || !slugValue.trim() || active === 'current') return;
		setSaving(true);
		try {
			if (active === 'local') {
				const res = await fetch(entry.blobUrl);
				const blob = await res.blob();
				const up = await fetch(`${API_URL}/s3/upload/logos/${slugValue}.webp`, {
					method: 'PUT',
					body: await blob.arrayBuffer()
				});
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

	const canSave = selected && active !== 'current' && slugValue.trim() && !saving;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
			<div
				className={`bg-surface rounded-2xl border border-border shadow-2xl max-w-[95vw] min-h-[900px] max-h-[90vh] overflow-hidden flex flex-col ${view === 'logo' ? 'w-[780px]' : 'w-[1100px]'}`}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header + Tabs */}
				<div className="flex items-center gap-8 px-8 py-5 border-b border-border shrink-0">
					<h2 className="text-lg font-bold text-foreground shrink-0">Logo Studio</h2>
					{selected && (
						<nav className="flex items-center gap-1.5">
							{(['logo', 'vectorize', 'gradient'] as const).map((t) => {
								const label = t === 'logo' ? 'Source' : t === 'vectorize' ? 'Vectorize' : 'Gradient';
								const isActive = view === t;
								return (
									<button
										key={t}
										type="button"
										onClick={() => setView(t)}
										className={`px-5 py-2 text-base font-medium rounded-xl transition-colors cursor-pointer ${
											isActive ? 'bg-accent/10 text-accent' : 'text-muted-fg hover:text-foreground hover:bg-muted/50'
										}`}
									>
										{label}
									</button>
								);
							})}
						</nav>
					)}
					<div className="flex-1" />
					<span className="text-sm text-muted-fg shrink-0">{domain}</span>
					<button
						type="button"
						onClick={onClose}
						className="size-9 rounded-xl flex items-center justify-center text-muted-fg hover:text-foreground hover:bg-muted cursor-pointer transition-colors shrink-0 text-lg"
					>
						{'×'}
					</button>
				</div>

				{/* Content */}
				{view === 'logo' && (
					<>
						{/* Preview */}
						<div
							className={`relative flex items-center justify-center p-8 flex-1 max-h-[70vh] overflow-hidden bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] ${dragOver ? 'ring-2 ring-inset ring-accent' : ''}`}
							onDragOver={(e) => {
								e.preventDefault();
								setDragOver(true);
							}}
							onDragLeave={() => setDragOver(false)}
							onDrop={handleDrop}
						>
							{selected ? (
								<img
									src={selected.blobUrl}
									alt=""
									style={{ maxWidth: '70%', maxHeight: 640 }}
									className="object-contain drop-shadow-lg"
								/>
							) : (
								<div className="text-center py-16">
									<p className="text-sm text-muted-fg/50">{loading.size > 0 ? 'Fetching logos...' : 'No logo'}</p>
									<p className="text-xs text-muted-fg/30 mt-1">Drop an image here or pick a source below</p>
								</div>
							)}
							{selected && (
								<div className="absolute top-3 right-3 flex items-center gap-3 rounded-full bg-surface/90 border border-border backdrop-blur-sm px-4 py-1.5 text-[11px] text-muted-fg tabular-nums">
									<span className="font-mono">
										{selected.width}×{selected.height}
									</span>
									<span className="w-px h-3 bg-border" />
									<span>{formatSize(selected.size)}</span>
									<span className="w-px h-3 bg-border" />
									<span className="uppercase font-mono">{selected.format}</span>
								</div>
							)}
						</div>

						{/* Source cards */}
						<div className="grid grid-cols-4 gap-2 px-6 py-4 border-t border-border">
							{SOURCES.map((src) => {
								const entry = logos[src];
								const isActive = active === src;
								const isLoading = loading.has(src);
								const isLocal = src === 'local';

								return (
									<button
										key={src}
										type="button"
										onClick={() => {
											if (isLocal && !entry) fileRef.current?.click();
											else if (entry) setActive(src);
											else if (src === 'brandfetch' || src === 'logodev') fetchRemote(src);
										}}
										className={`group rounded-xl border-2 p-3 transition-all cursor-pointer ${
											isActive
												? 'border-accent bg-accent/5'
												: entry
													? 'border-border hover:border-muted-fg/30 bg-background'
													: 'border-dashed border-border hover:border-muted-fg/30 bg-background'
										}`}
									>
										<div className="flex items-center gap-3">
											<div className="size-10 rounded-lg overflow-hidden shrink-0 bg-muted/40 flex items-center justify-center">
												{entry ? (
													<img src={entry.blobUrl} alt="" className="size-full object-cover" />
												) : isLoading ? (
													<div className="size-4 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
												) : (
													<span className="text-muted-fg/30 text-lg">{isLocal ? '+' : '?'}</span>
												)}
											</div>
											<div className="text-left min-w-0">
												<p className={`text-xs font-medium truncate ${isActive ? 'text-accent' : 'text-foreground'}`}>
													{SOURCE_LABELS[src]}
												</p>
												<p className="text-[10px] text-muted-fg/50 truncate">
													{isLoading
														? 'Loading...'
														: entry
															? formatSize(entry.size)
															: isLocal
																? 'Drop or click'
																: 'Click to fetch'}
												</p>
											</div>
										</div>
									</button>
								);
							})}
						</div>

						<input
							ref={fileRef}
							type="file"
							accept="image/*"
							className="hidden"
							onChange={(e) => {
								if (e.target.files?.[0]) handleLocal(e.target.files[0]);
								e.target.value = '';
							}}
						/>

						{/* Footer */}
						<div className="px-6 py-3.5 border-t border-border flex items-center gap-3 bg-muted/5">
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
								disabled={!canSave}
								onClick={handleSave}
								className="rounded-xl bg-accent px-6 py-2 text-sm font-bold text-white hover:opacity-90 transition-colors cursor-pointer disabled:opacity-30"
							>
								{saving ? 'Saving...' : 'Save'}
							</button>
						</div>
					</>
				)}

				{view === 'vectorize' && selected && (
					<VectorTab
						blobUrl={selected.blobUrl}
						svgString={v.svgString}
						tracing={v.tracing}
						engine={v.engine}
						setEngine={v.setEngine}
						threshold={v.threshold}
						setThreshold={v.setThreshold}
						invert={v.invert}
						setInvert={v.setInvert}
						colors={v.colors}
						setColors={v.setColors}
						trace={v.trace}
						downloadSvg={v.downloadSvg}
						copySvg={v.copySvg}
						onClose={() => setView('logo')}
					/>
				)}

				{view === 'gradient' && selected && (
					<GradientTab
						blobUrl={selected.blobUrl}
						gradient={v.gradient}
						gradientLoading={v.gradientLoading}
						gradMode={v.gradMode}
						setGradMode={v.setGradMode}
						gradTarget={v.gradTarget}
						setGradTarget={v.setGradTarget}
						gradStops={v.gradStops}
						setGradStops={v.setGradStops}
						fetchGradient={v.fetchGradient}
					/>
				)}

				<canvas ref={v.canvasRef} className="hidden" />
			</div>
		</div>
	);
};

export default LogoStudio;
