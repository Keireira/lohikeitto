'use client';

import { useRef, useState } from 'react';
import { toast } from '@/lib/toast';

const PRESETS = {
	default: { label: 'Default', desc: 'Balanced paths, good for most logos' },
	posterized2: { label: 'Posterized', desc: 'Flat color regions, minimal detail' },
	curvy: { label: 'Curvy', desc: 'Smooth bezier curves, organic shapes' },
	sharp: { label: 'Sharp', desc: 'Straight edges, geometric shapes' },
	detailed: { label: 'Detailed', desc: 'Maximum detail, larger SVG output' },
} as const;

type Preset = keyof typeof PRESETS;

const VectorizeWidget = ({ blobUrl, slug, onClose }: { blobUrl: string; slug: string; onClose: () => void }) => {
	const [svgString, setSvgString] = useState<string | null>(null);
	const [tracing, setTracing] = useState(false);
	const [preset, setPreset] = useState<Preset>('default');
	const [colors, setColors] = useState(2);
	const [smoothing, setSmoothing] = useState(4);
	const [strokeSmooth, setStrokeSmooth] = useState(true);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	const trace = async () => {
		setTracing(true);
		setSvgString(null);
		try {
			// Load image to canvas to get ImageData
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

			// Dynamic import to avoid SSR issues
			const ImageTracer = (await import('imagetracerjs')).default;

			const options = { ...(ImageTracer.optionpresets[preset] ?? {}) };
			options.numberofcolors = colors;
			// Higher = smoother curves (more deviation from pixel edges allowed)
			options.ltres = 0.1 + smoothing * 0.3;
			options.qtres = 0.5 + smoothing * 0.5;
			// Pre-trace blur removes pixel staircase
			options.blurradius = 2 + smoothing;
			options.blurdelta = 40;
			options.pathomit = 4 + smoothing * 2;
			options.roundcoords = 2;
			if (strokeSmooth) {
				options.strokewidth = 1 + smoothing * 0.3;
			}

			let svg = ImageTracer.imagedataToSVG(imageData, options);
			// Normalize SVG: add viewBox scaled back to original size, remove fixed dimensions
			svg = svg.replace(
				/(<svg[^>]*?)(\s+width="\d+")(\s+height="\d+")/,
				(_m, pre) => `${pre} viewBox="0 0 ${canvas.width} ${canvas.height}"`
			);
			// Post-process: stroke smoothing via CSS rounded joins
			if (strokeSmooth) {
				svg = svg.replace(
					/<\/svg>/,
					'<style>path{paint-order:stroke fill;stroke-linejoin:round;stroke-linecap:round}</style></svg>'
				);
			}
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
				{/* Body */}
				<div className="flex flex-1 min-h-0">
					{/* Left — preview */}
					<div className="flex-1 flex flex-col">
						{/* Before/After */}
						<div className="flex-1 flex min-h-0">
							{/* Original */}
							<div className="flex-1 flex flex-col items-center justify-center p-6 border-r border-border bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:12px_12px]">
								<img src={blobUrl} alt="Original" className="max-w-full max-h-[300px] object-contain" />
								<p className="text-[10px] text-muted-fg mt-2 uppercase tracking-wider">Raster</p>
							</div>
							{/* Vector */}
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

						{/* SVG meta */}
						{svgString && (
							<div className="px-6 py-2 border-t border-border flex items-center gap-4 text-xs text-muted-fg bg-muted/10">
								<span>{(svgString.length / 1024).toFixed(1)} KB</span>
								<span className="uppercase font-mono">SVG</span>
							</div>
						)}
					</div>

					{/* Right — controls */}
					<div className="w-56 shrink-0 border-l border-border flex flex-col bg-background">
						<div className="px-5 pt-5 pb-4 border-b border-border">
							<p className="text-[11px] font-bold text-accent uppercase tracking-widest">Vectorize</p>
							<div className="flex items-center justify-between mt-1">
								<h3 className="text-lg font-bold text-foreground">Settings</h3>
								<button
									type="button"
									onClick={onClose}
									className="size-8 rounded-lg flex items-center justify-center text-muted-fg hover:text-foreground hover:bg-muted cursor-pointer transition-colors text-xl"
								>
									{'×'}
								</button>
							</div>
						</div>

						<div className="flex-1 px-5 py-4 space-y-4">
							{/* Preset */}
							<div>
								<p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-2">Preset</p>
								<div className="space-y-1">
									{(Object.entries(PRESETS) as [Preset, (typeof PRESETS)[Preset]][]).map(([key, { label, desc }]) => (
										<button
											key={key}
											type="button"
											onClick={() => setPreset(key)}
											className={`w-full text-left rounded-lg px-3 py-2 transition-all cursor-pointer ${preset === key ? 'bg-accent/10 ring-1 ring-accent/20' : 'hover:bg-muted'}`}
										>
											<p className={`text-sm ${preset === key ? 'text-accent font-semibold' : 'text-foreground'}`}>{label}</p>
											<p className="text-[10px] text-muted-fg">{desc}</p>
										</button>
									))}
								</div>
							</div>

							{/* Colors */}
							<div>
								<p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-2">Colors</p>
								<input
									type="range"
									min={2}
									max={64}
									value={colors}
									onChange={(e) => setColors(Number(e.target.value))}
									className="w-full accent-accent"
								/>
								<p className="text-xs text-muted-fg text-center mt-1">{colors}</p>
							</div>

							{/* Smoothing */}
							<div>
								<p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-2">Smoothing</p>
								<input
									type="range"
									min={0}
									max={6}
									step={1}
									value={smoothing}
									onChange={(e) => setSmoothing(Number(e.target.value))}
									className="w-full accent-accent"
								/>
								<p className="text-xs text-muted-fg text-center mt-1">{smoothing}</p>
							</div>

							{/* Stroke smooth */}
							<label className="flex items-center justify-between cursor-pointer">
								<span className="text-[10px] font-bold text-accent uppercase tracking-widest">Stroke smooth</span>
								<input
									type="checkbox"
									checked={strokeSmooth}
									onChange={(e) => setStrokeSmooth(e.target.checked)}
									className="accent-accent cursor-pointer"
								/>
							</label>
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
