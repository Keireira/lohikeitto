'use client';

import { useRef, useState } from 'react';
import { toast } from '@/lib/toast';
import { API_URL } from '@/lib/api';

type Engine = 'potrace' | 'multicolor';

const VectorizeWidget = ({ blobUrl, slug, onClose }: { blobUrl: string; slug: string; onClose: () => void }) => {
	const [svgString, setSvgString] = useState<string | null>(null);
	const [tracing, setTracing] = useState(false);
	const [engine, setEngine] = useState<Engine>('potrace');
	const [threshold, setThreshold] = useState(128);
	const [invert, setInvert] = useState(false);
	const [colors, setColors] = useState(4);
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

		// Threshold to black/white for potrace
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

		// Add viewBox, remove fixed dimensions
		svg = svg.replace(
			/(<svg[^>]*?)(\s+width="\d+")(\s+height="\d+")/,
			(_m, pre) => `${pre} viewBox="0 0 ${canvas.width} ${canvas.height}"`
		);

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

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
			<div
				className="bg-surface rounded-2xl border border-border shadow-2xl w-[1100px] max-w-[95vw] max-h-[85vh] overflow-hidden flex flex-col"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex flex-1 min-h-0">
					{/* Left -- preview */}
					<div className="flex-1 flex flex-col">
						<div className="flex-1 flex min-h-0">
							<div className="flex-1 flex flex-col items-center justify-center p-6 border-r border-border bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:12px_12px]">
								<img src={blobUrl} alt="Original" className="max-w-full max-h-[300px] object-contain" />
								<p className="text-[10px] text-muted-fg mt-2 uppercase tracking-wider">Raster</p>
							</div>
							<div className="flex-1 flex flex-col items-center justify-center p-6 bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:12px_12px]">
								{svgString ? (
									<div
										className="w-full h-full max-h-[300px] flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-[300px]"
										dangerouslySetInnerHTML={{ __html: svgString }}
									/>
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

					{/* Right -- controls */}
					<div className="w-56 shrink-0 border-l border-border flex flex-col bg-background">
						<div className="px-5 pt-5 pb-4 border-b border-border">
							<p className="text-[11px] font-bold text-accent uppercase tracking-widest">Vectorize</p>
							<div className="flex items-center justify-between mt-1">
								<h3 className="text-lg font-bold text-foreground">Settings</h3>
								<button type="button" onClick={onClose} className="size-8 rounded-lg flex items-center justify-center text-muted-fg hover:text-foreground hover:bg-muted cursor-pointer transition-colors text-xl">{'x'}</button>
							</div>
						</div>

						<div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
							{/* Engine */}
							<div>
								<p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-2">Engine</p>
								<div className="space-y-1">
									<button
										type="button"
										onClick={() => setEngine('potrace')}
										className={`w-full text-left rounded-lg px-3 py-2 transition-all cursor-pointer ${engine === 'potrace' ? 'bg-accent/10 ring-1 ring-accent/20' : 'hover:bg-muted'}`}
									>
										<p className={`text-sm ${engine === 'potrace' ? 'text-accent font-semibold' : 'text-foreground'}`}>Potrace</p>
										<p className="text-[10px] text-muted-fg">2-color, smooth bezier curves</p>
									</button>
									<button
										type="button"
										onClick={() => setEngine('multicolor')}
										className={`w-full text-left rounded-lg px-3 py-2 transition-all cursor-pointer ${engine === 'multicolor' ? 'bg-accent/10 ring-1 ring-accent/20' : 'hover:bg-muted'}`}
									>
										<p className={`text-sm ${engine === 'multicolor' ? 'text-accent font-semibold' : 'text-foreground'}`}>Multicolor</p>
										<p className="text-[10px] text-muted-fg">Server-side, multiple colors</p>
									</button>
								</div>
							</div>

							{engine === 'potrace' ? (
								<>
									{/* Threshold */}
									<div>
										<p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-1">Threshold</p>
										<p className="text-[10px] text-muted-fg mb-2">Brightness cutoff: pixels darker than this become black, lighter become white</p>
										<input
											type="range"
											min={1}
											max={254}
											value={threshold}
											onChange={(e) => setThreshold(Number(e.target.value))}
											className="w-full accent-accent"
										/>
										<p className="text-xs text-muted-fg text-center mt-1">{threshold}</p>
									</div>

									{/* Invert */}
									<label className="flex items-center justify-between cursor-pointer">
										<span className="text-[10px] font-bold text-accent uppercase tracking-widest">Invert</span>
										<input
											type="checkbox"
											checked={invert}
											onChange={(e) => setInvert(e.target.checked)}
											className="accent-accent cursor-pointer"
										/>
									</label>
								</>
							) : (
								<div>
									<p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-2">Colors</p>
									<input
										type="range"
										min={2}
										max={32}
										value={colors}
										onChange={(e) => setColors(Number(e.target.value))}
										className="w-full accent-accent"
									/>
									<p className="text-xs text-muted-fg text-center mt-1">{colors}</p>
								</div>
							)}
						</div>
					</div>
				</div>

				{/* Footer */}
				<div className="px-5 py-3.5 border-t border-border flex items-center gap-3 bg-muted/10">
					<button
						type="button"
						disabled={tracing}
						onClick={trace}
						className="rounded-xl bg-accent px-6 py-2 text-sm font-bold text-white hover:opacity-90 transition-colors cursor-pointer disabled:opacity-40"
					>
						{tracing ? 'Tracing...' : 'Vectorize'}
					</button>
					{svgString && (
						<>
							<button
								type="button"
								onClick={downloadSvg}
								className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
							>
								Download .svg
							</button>
							<button
								type="button"
								onClick={copySvg}
								className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
							>
								Copy SVG
							</button>
						</>
					)}
					<div className="flex-1" />
					<button
						type="button"
						onClick={onClose}
						className="rounded-xl px-4 py-2 text-sm text-muted-fg hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
					>
						Close
					</button>
				</div>

				<canvas ref={canvasRef} className="hidden" />
			</div>
		</div>
	);
};

export default VectorizeWidget;
