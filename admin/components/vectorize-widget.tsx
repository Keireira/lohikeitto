'use client';

import { useRef, useState } from 'react';
import { toast } from '@/lib/toast';
import { API_URL } from '@/lib/api';

type Engine = 'potrace' | 'multicolor';
type Tab = 'vector' | 'gradient';

type GradientMode = 'linear' | 'radial';
type GradientStop = { offset: number; color: string };
type GradientData = {
	mode: string;
	angle_deg: number;
	stops: GradientStop[];
	svg_gradient: string;
	css_gradient: string;
};

const VectorizeWidget = ({ blobUrl, slug, onClose }: { blobUrl: string; slug: string; onClose: () => void }) => {
	const [tab, setTab] = useState<Tab>('vector');
	const [svgString, setSvgString] = useState<string | null>(null);
	const [tracing, setTracing] = useState(false);
	const [engine, setEngine] = useState<Engine>('potrace');
	const [threshold, setThreshold] = useState(128);
	const [invert, setInvert] = useState(false);
	const [colors, setColors] = useState(4);
	const [gradient, setGradient] = useState<GradientData | null>(null);
	const [gradientLoading, setGradientLoading] = useState(false);
	const [gradMode, setGradMode] = useState<GradientMode>('linear');
	const [gradTarget, setGradTarget] = useState<'bg' | 'logo'>('bg');
	const [gradStops, setGradStops] = useState(0);  // 0 = auto
	const canvasRef = useRef<HTMLCanvasElement>(null);

	const tracePotrace = async () => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new Error('Failed to load image'));
			img.src = blobUrl;
		});
		const canvas = canvasRef.current!;
		const MAX_DIM = 2048;
		const scale = Math.min(MAX_DIM / img.naturalWidth, MAX_DIM / img.naturalHeight, 6);
		canvas.width = Math.round(img.naturalWidth * scale);
		canvas.height = Math.round(img.naturalHeight * scale);
		const ctx = canvas.getContext('2d')!;
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		const d = imageData.data;
		for (let i = 0; i < d.length; i += 4) {
			const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
			const bw = invert ? (lum >= threshold ? 0 : 255) : (lum < threshold ? 0 : 255);
			d[i] = bw; d[i + 1] = bw; d[i + 2] = bw; d[i + 3] = 255;
		}
		ctx.putImageData(imageData, 0, 0);
		const { loadFromCanvas } = await import('potrace-wasm');
		let svg: string = await loadFromCanvas(canvas);
		svg = svg.replace(/(<svg[^>]*?)(\s+width="\d+")(\s+height="\d+")/, (_m, pre) => `${pre} viewBox="0 0 ${canvas.width} ${canvas.height}"`);
		return svg;
	};

	const traceMulticolor = async () => {
		const res = await fetch(`${API_URL}/logos/vectorize`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ slug, colors }),
		});
		if (!res.ok) throw new Error(`Server: ${res.status}`);
		return await res.text();
	};

	const trace = async () => {
		setTracing(true);
		setSvgString(null);
		try {
			const svg = engine === 'potrace' ? await tracePotrace() : await traceMulticolor();
			setSvgString(svg);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Vectorization failed');
		} finally {
			setTracing(false);
		}
	};

	const downloadSvg = () => {
		if (!svgString) return;
		const blob = new Blob([svgString], { type: 'image/svg+xml' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${slug}.svg`;
		a.click();
		URL.revokeObjectURL(url);
	};

	const copySvg = () => {
		if (!svgString) return;
		navigator.clipboard.writeText(svgString);
		toast.success('SVG copied');
	};

	const fetchGradient = async () => {
		setGradientLoading(true);
		try {
			const res = await fetch(blobUrl);
			const imgBlob = await res.blob();
			const gradRes = await fetch(`${API_URL}/logos/gradient?stops=${gradStops}&mode=${gradMode}&target=${gradTarget}`, {
				method: 'POST',
				body: imgBlob,
			});
			if (!gradRes.ok) throw new Error(`${gradRes.status}`);
			const data: GradientData = await gradRes.json();
			setGradient(data);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Gradient extraction failed');
		} finally {
			setGradientLoading(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
			<div className="bg-surface rounded-2xl border border-border shadow-2xl w-[1100px] max-w-[95vw] max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>

				{/* Tab bar */}
				<div className="flex border-b border-border shrink-0">
					{(['vector', 'gradient'] as const).map((t) => (
						<button
							key={t}
							type="button"
							onClick={() => setTab(t)}
							className={`flex-1 py-3 text-sm font-medium transition-colors cursor-pointer ${tab === t ? 'text-accent border-b-2 border-accent' : 'text-muted-fg hover:text-foreground'}`}
						>
							{t === 'vector' ? 'Vectorize' : 'Gradient'}
						</button>
					))}
					<button type="button" onClick={onClose} className="px-4 text-muted-fg hover:text-foreground cursor-pointer transition-colors">{'x'}</button>
				</div>

				{tab === 'vector' ? (
					<>
						<div className="flex flex-1 min-h-0">
							<div className="flex-1 flex flex-col">
								<div className="flex-1 flex min-h-0">
									<div className="flex-1 flex flex-col items-center justify-center p-6 border-r border-border bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:12px_12px]">
										<img src={blobUrl} alt="Original" className="max-w-full max-h-[300px] object-contain" />
										<p className="text-[10px] text-muted-fg mt-2 uppercase tracking-wider">Raster</p>
									</div>
									<div className="flex-1 flex flex-col items-center justify-center p-6 bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:12px_12px]">
										{svgString ? (
											<div className="w-full h-full max-h-[300px] flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-[300px]" dangerouslySetInnerHTML={{ __html: svgString }} />
										) : tracing ? (
											<div className="flex flex-col items-center gap-2">
												<div className="size-6 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
												<p className="text-xs text-muted-fg">Tracing...</p>
											</div>
										) : (
											<p className="text-xs text-muted-fg/40">Press Vectorize</p>
										)}
										<p className="text-[10px] text-muted-fg mt-2 uppercase tracking-wider">Vector</p>
									</div>
								</div>
								{svgString && (
									<div className="px-6 py-2 border-t border-border flex items-center gap-4 text-xs text-muted-fg bg-muted/10">
										<span>{(svgString.length / 1024).toFixed(1)} KB</span>
										<span className="uppercase font-mono">SVG</span>
									</div>
								)}
							</div>

							<div className="w-56 shrink-0 border-l border-border flex flex-col bg-background">
								<div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
									<div>
										<p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-2">Engine</p>
										<div className="space-y-1">
											<button type="button" onClick={() => setEngine('potrace')} className={`w-full text-left rounded-lg px-3 py-2 transition-all cursor-pointer ${engine === 'potrace' ? 'bg-accent/10 ring-1 ring-accent/20' : 'hover:bg-muted'}`}>
												<p className={`text-sm ${engine === 'potrace' ? 'text-accent font-semibold' : 'text-foreground'}`}>Potrace</p>
												<p className="text-[10px] text-muted-fg">2-color, smooth bezier curves</p>
											</button>
											<button type="button" onClick={() => setEngine('multicolor')} className={`w-full text-left rounded-lg px-3 py-2 transition-all cursor-pointer ${engine === 'multicolor' ? 'bg-accent/10 ring-1 ring-accent/20' : 'hover:bg-muted'}`}>
												<p className={`text-sm ${engine === 'multicolor' ? 'text-accent font-semibold' : 'text-foreground'}`}>Multicolor</p>
												<p className="text-[10px] text-muted-fg">Server-side, multiple colors</p>
											</button>
										</div>
									</div>
									{engine === 'potrace' ? (
										<>
											<div>
												<p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-1">Threshold</p>
												<p className="text-[10px] text-muted-fg mb-2">Brightness cutoff: darker = black, lighter = white</p>
												<input type="range" min={1} max={254} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full accent-accent" />
												<p className="text-xs text-muted-fg text-center mt-1">{threshold}</p>
											</div>
											<label className="flex items-center justify-between cursor-pointer">
												<span className="text-[10px] font-bold text-accent uppercase tracking-widest">Invert</span>
												<input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} className="accent-accent cursor-pointer" />
											</label>
										</>
									) : (
										<div>
											<p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-2">Colors</p>
											<input type="range" min={2} max={32} value={colors} onChange={(e) => setColors(Number(e.target.value))} className="w-full accent-accent" />
											<p className="text-xs text-muted-fg text-center mt-1">{colors}</p>
										</div>
									)}
								</div>
							</div>
						</div>
						<div className="px-5 py-3.5 border-t border-border flex items-center gap-3 bg-muted/10">
							<button type="button" disabled={tracing} onClick={trace} className="rounded-xl bg-accent px-6 py-2 text-sm font-bold text-white hover:opacity-90 transition-colors cursor-pointer disabled:opacity-40">
								{tracing ? 'Tracing...' : 'Vectorize'}
							</button>
							{svgString && (
								<>
									<button type="button" onClick={downloadSvg} className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors cursor-pointer">Download .svg</button>
									<button type="button" onClick={copySvg} className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors cursor-pointer">Copy SVG</button>
								</>
							)}
							<div className="flex-1" />
							<button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-muted-fg hover:text-foreground hover:bg-muted transition-colors cursor-pointer">Close</button>
						</div>
					</>
				) : (
					/* ── Gradient tab ── */
					<div className="flex-1 flex min-h-0">
						{/* Left: preview */}
						<div className="flex-1 flex flex-col">
							<div className="flex-1 flex min-h-0">
								{/* Original */}
								<div className="flex-1 flex flex-col items-center justify-center p-6 border-r border-border bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:12px_12px]">
									<img src={blobUrl} alt="Original" className="max-w-full max-h-[300px] object-contain" />
									<p className="text-[10px] text-muted-fg mt-2 uppercase tracking-wider">Original</p>
								</div>
								{/* Gradient preview */}
								<div className="flex-1 flex flex-col items-center justify-center p-6 bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:12px_12px]">
									{gradient ? (
										<div
											className="w-full max-w-[300px] aspect-square rounded-2xl border border-border shadow-lg"
											style={{
												background: gradient.css_gradient
											}}
										/>
									) : gradientLoading ? (
										<div className="flex flex-col items-center gap-2">
											<div className="size-6 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
											<p className="text-xs text-muted-fg">Analyzing...</p>
										</div>
									) : (
										<p className="text-xs text-muted-fg/40">Press Extract</p>
									)}
									<p className="text-[10px] text-muted-fg mt-2 uppercase tracking-wider">Gradient</p>
								</div>
							</div>
						</div>

						{/* Right: gradient details */}
						<div className="w-72 shrink-0 border-l border-border flex flex-col bg-background">
							<div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
								{/* Target */}
								<div>
									<p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-2">Target</p>
									<div className="flex gap-1">
										{([['bg', 'Background'], ['logo', 'Logo']] as const).map(([val, label]) => (
											<button
												key={val}
												type="button"
												onClick={() => setGradTarget(val)}
												className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all cursor-pointer ${gradTarget === val ? 'bg-accent/10 text-accent ring-1 ring-accent/20' : 'text-foreground hover:bg-muted'}`}
											>
												{label}
											</button>
										))}
									</div>
									<p className="text-[10px] text-muted-fg mt-1">{gradTarget === 'bg' ? 'Scan background colors, ignore icon' : 'Scan icon/foreground colors, ignore background'}</p>
								</div>

								{/* Mode */}
								<div>
									<p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-2">Type</p>
									<div className="flex gap-1">
										{(['linear', 'radial'] as const).map((m) => (
											<button
												key={m}
												type="button"
												onClick={() => setGradMode(m)}
												className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all cursor-pointer capitalize ${gradMode === m ? 'bg-accent/10 text-accent ring-1 ring-accent/20' : 'text-foreground hover:bg-muted'}`}
											>
												{m}
											</button>
										))}
									</div>
								</div>

								{/* Stops */}
								<div>
									<p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-2">Stops</p>
									<div className="flex gap-1 mb-2">
										<button
											type="button"
											onClick={() => setGradStops(0)}
											className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all cursor-pointer ${gradStops === 0 ? 'bg-accent/10 text-accent ring-1 ring-accent/20' : 'text-foreground hover:bg-muted'}`}
										>
											Auto
										</button>
										<button
											type="button"
											onClick={() => setGradStops(8)}
											className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all cursor-pointer ${gradStops > 0 ? 'bg-accent/10 text-accent ring-1 ring-accent/20' : 'text-foreground hover:bg-muted'}`}
										>
											Manual
										</button>
									</div>
									{gradStops > 0 && (
										<>
											<input type="range" min={2} max={100} value={gradStops} onChange={(e) => setGradStops(Number(e.target.value))} className="w-full accent-accent" />
											<p className="text-xs text-muted-fg text-center mt-1">{gradStops}</p>
										</>
									)}
									{gradStops === 0 && <p className="text-[10px] text-muted-fg">Automatically detect optimal number of stops</p>}
								</div>

								<button
									type="button"
									disabled={gradientLoading}
									onClick={fetchGradient}
									className="w-full rounded-xl bg-accent py-2.5 text-sm font-bold text-white hover:opacity-90 transition-colors cursor-pointer disabled:opacity-40"
								>
									{gradientLoading ? 'Analyzing...' : gradient ? 'Re-extract' : 'Extract Gradient'}
								</button>

								{gradient && (
									<>
										{/* Direction + info */}
										<div className="flex items-center gap-3">
											<div className="size-10 rounded-lg border border-border shrink-0" style={{
												background: gradient.css_gradient
											}} />
											<div>
												<p className="text-sm font-semibold text-foreground capitalize">{gradient.mode}</p>
												<p className="text-[10px] text-muted-fg">{gradient.stops.length} stops{gradient.mode === 'linear' ? `, ${Math.round(gradient.angle_deg)} deg` : ''}</p>
											</div>
										</div>

										{/* Full gradient bar */}
										<div
											className="h-6 rounded-lg border border-border w-full"
											style={{
												background: gradient.css_gradient
											}}
										/>

										{/* Stops list */}
										<div>
											<p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-3">Stops</p>
											<div className="space-y-2">
												{gradient.stops.map((stop, i) => (
													<div key={i} className="flex items-center gap-2.5">
														<div className="size-5 rounded-md shrink-0 border border-border shadow-sm" style={{ backgroundColor: stop.color }} />
														<span className="text-xs font-mono text-foreground flex-1">{stop.color}</span>
														<span className="text-[10px] text-muted-fg tabular-nums w-8 text-right">{Math.round(stop.offset * 100)}%</span>
													</div>
												))}
											</div>
										</div>

										{/* Copy actions */}
										<div className="space-y-2 pt-3 border-t border-border">
											<button
												type="button"
												onClick={() => { navigator.clipboard.writeText(gradient.css_gradient); toast.success('CSS copied'); }}
												className="w-full rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer text-left"
											>
												<p className="font-bold mb-0.5">Copy CSS</p>
												<p className="font-mono text-muted-fg truncate">{gradient.css_gradient}</p>
											</button>
											<button
												type="button"
												onClick={() => { navigator.clipboard.writeText(gradient.svg_gradient); toast.success('SVG copied'); }}
												className="w-full rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer text-left"
											>
												<p className="font-bold mb-0.5">Copy SVG</p>
												<p className="font-mono text-muted-fg truncate">{'<svg>...<linearGradient>...</svg>'}</p>
											</button>
										</div>
									</>
								)}
							</div>
						</div>
					</div>
				)}

				<canvas ref={canvasRef} className="hidden" />
			</div>
		</div>
	);
};

export default VectorizeWidget;
