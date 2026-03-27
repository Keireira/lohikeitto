'use client';

import type { Engine } from './vectorize-widget.d';

const VectorTab = ({
	blobUrl,
	svgString,
	tracing,
	engine,
	setEngine,
	threshold,
	setThreshold,
	invert,
	setInvert,
	colors,
	setColors,
	trace,
	downloadSvg,
	copySvg,
	onClose
}: {
	blobUrl: string;
	svgString: string | null;
	tracing: boolean;
	engine: Engine;
	setEngine: (e: Engine) => void;
	threshold: number;
	setThreshold: (v: number) => void;
	invert: boolean;
	setInvert: (v: boolean) => void;
	colors: number;
	setColors: (v: number) => void;
	trace: () => void;
	downloadSvg: () => void;
	copySvg: () => void;
	onClose: () => void;
}) => (
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

			<div className="w-56 shrink-0 border-l border-border flex flex-col bg-background">
				<div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
					<div>
						<p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-2">Engine</p>
						<div className="space-y-1">
							<button
								type="button"
								onClick={() => setEngine('potrace')}
								className={`w-full text-left rounded-lg px-3 py-2 transition-all cursor-pointer ${engine === 'potrace' ? 'bg-accent/10 ring-1 ring-accent/20' : 'hover:bg-muted'}`}
							>
								<p className={`text-sm ${engine === 'potrace' ? 'text-accent font-semibold' : 'text-foreground'}`}>
									Potrace
								</p>
								<p className="text-[10px] text-muted-fg">2-color, smooth bezier curves</p>
							</button>
							<button
								type="button"
								onClick={() => setEngine('multicolor')}
								className={`w-full text-left rounded-lg px-3 py-2 transition-all cursor-pointer ${engine === 'multicolor' ? 'bg-accent/10 ring-1 ring-accent/20' : 'hover:bg-muted'}`}
							>
								<p className={`text-sm ${engine === 'multicolor' ? 'text-accent font-semibold' : 'text-foreground'}`}>
									Multicolor
								</p>
								<p className="text-[10px] text-muted-fg">Server-side, multiple colors</p>
							</button>
						</div>
					</div>
					{engine === 'potrace' ? (
						<>
							<div>
								<p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-1">Threshold</p>
								<p className="text-[10px] text-muted-fg mb-2">Brightness cutoff: darker = black, lighter = white</p>
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
	</>
);

export default VectorTab;
