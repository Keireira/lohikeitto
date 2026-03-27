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
		{/* Preview: side by side */}
		<div className="flex flex-1 min-h-0">
			<div className="flex-1 flex flex-col items-center justify-center p-6 border-r border-border bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:12px_12px]">
				<img src={blobUrl} alt="Original" className="max-w-full max-h-[400px] object-contain" />
				<p className="text-[10px] text-muted-fg mt-3 uppercase tracking-wider">Raster</p>
			</div>
			<div className="flex-1 flex flex-col items-center justify-center p-6 bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:12px_12px]">
				{svgString ? (
					<div
						className="w-full h-full max-h-[400px] flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-[400px]"
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
				<p className="text-[10px] text-muted-fg mt-3 uppercase tracking-wider">Vector</p>
				{svgString && (
					<p className="text-[10px] text-muted-fg mt-1 tabular-nums">{(svgString.length / 1024).toFixed(1)} KB</p>
				)}
			</div>
		</div>

		{/* Footer: controls + actions */}
		<div className="px-6 py-4 border-t border-border flex items-center gap-4 bg-muted/5 shrink-0">
			{/* Engine toggle */}
			<div className="flex items-center gap-1 rounded-xl border border-border p-0.5">
				{(['potrace', 'multicolor'] as const).map((e) => (
					<button
						key={e}
						type="button"
						onClick={() => setEngine(e)}
						className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer capitalize ${
							engine === e ? 'bg-accent/10 text-accent' : 'text-muted-fg hover:text-foreground'
						}`}
					>
						{e === 'potrace' ? '2-Color' : 'Multi'}
					</button>
				))}
			</div>

			<div className="w-px h-6 bg-border" />

			{/* Engine-specific controls */}
			{engine === 'potrace' ? (
				<>
					<div className="flex items-center gap-2.5">
						<span className="text-xs text-muted-fg shrink-0">Threshold</span>
						<input
							type="range"
							min={1}
							max={254}
							value={threshold}
							onChange={(e) => setThreshold(Number(e.target.value))}
							className="w-28 accent-accent"
						/>
						<input
							type="number"
							min={1}
							max={254}
							value={threshold}
							onChange={(e) => setThreshold(Math.max(1, Math.min(254, Number(e.target.value) || 1)))}
							className="w-14 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-center font-mono tabular-nums focus:outline-none focus:border-accent"
						/>
					</div>
					<button
						type="button"
						onClick={() => setInvert(!invert)}
						className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
							invert ? 'bg-accent/10 text-accent' : 'text-muted-fg hover:text-foreground hover:bg-muted/50'
						}`}
					>
						Invert
					</button>
				</>
			) : (
				<div className="flex items-center gap-2.5">
					<span className="text-xs text-muted-fg shrink-0">Colors</span>
					<input
						type="range"
						min={2}
						max={32}
						value={colors}
						onChange={(e) => setColors(Number(e.target.value))}
						className="w-28 accent-accent"
					/>
					<input
						type="number"
						min={2}
						max={32}
						value={colors}
						onChange={(e) => setColors(Math.max(2, Math.min(32, Number(e.target.value) || 2)))}
						className="w-14 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-center font-mono tabular-nums focus:outline-none focus:border-accent"
					/>
				</div>
			)}

			<div className="flex-1" />

			{/* Actions */}
			{svgString && (
				<>
					<button
						type="button"
						onClick={copySvg}
						className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
					>
						Copy
					</button>
					<button
						type="button"
						onClick={downloadSvg}
						className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
					>
						Download .svg
					</button>
				</>
			)}
			<button
				type="button"
				disabled={tracing}
				onClick={trace}
				className="rounded-xl bg-accent px-6 py-2 text-sm font-bold text-white hover:opacity-90 transition-colors cursor-pointer disabled:opacity-40"
			>
				{tracing ? 'Tracing...' : 'Vectorize'}
			</button>
		</div>
	</>
);

export default VectorTab;
