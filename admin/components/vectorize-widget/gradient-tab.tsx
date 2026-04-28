'use client';

import { toast } from '@/lib/toast';
import type { GradientData, GradientMode } from './vectorize-widget.d';

const GradientTab = ({
	blobUrl,
	gradient,
	gradientLoading,
	gradMode,
	setGradMode,
	gradTarget,
	setGradTarget,
	gradStops,
	setGradStops,
	fetchGradient
}: {
	blobUrl: string;
	gradient: GradientData | null;
	gradientLoading: boolean;
	gradMode: GradientMode;
	setGradMode: (m: GradientMode) => void;
	gradTarget: 'bg' | 'logo';
	setGradTarget: (t: 'bg' | 'logo') => void;
	gradStops: number;
	setGradStops: (v: number) => void;
	fetchGradient: () => void;
}) => (
	<>
		{/* Preview: side by side */}
		<div className="flex flex-1 min-h-0">
			{/* Original */}
			<div className="flex-1 flex flex-col items-center justify-center p-6 border-r border-border bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:12px_12px]">
				<img src={blobUrl} alt="Original" className="max-w-[80%] max-h-[400px] object-contain" />
				<p className="text-[10px] text-muted-fg mt-3 uppercase tracking-wider">Original</p>
			</div>
			{/* Gradient preview */}
			<div className="flex-1 flex flex-col items-center justify-center p-6 bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:12px_12px]">
				{gradient ? (
					<>
						<div
							className="w-full max-w-[320px] aspect-square rounded-2xl border border-border shadow-lg"
							style={{ background: gradient.css_gradient }}
						/>
						{/* Gradient bar */}
						<div
							className="w-full max-w-[320px] h-6 rounded-lg border border-border mt-3"
							style={{ background: gradient.css_gradient }}
						/>
						{/* Stops */}
						<div className="flex flex-wrap gap-1 mt-3 w-full max-w-[320px]">
							{gradient.stops.map((stop, i) => (
								<button
									key={i}
									type="button"
									onClick={() => {
										navigator.clipboard.writeText(stop.color);
										toast.success(`Copied ${stop.color}`);
									}}
									className="size-6 rounded-md border border-border shadow-sm cursor-pointer hover:scale-110 transition-transform"
									style={{ backgroundColor: stop.color }}
									title={`${stop.color} (${Math.round(stop.offset * 100)}%)`}
								/>
							))}
						</div>
						<p className="text-[10px] text-muted-fg mt-2 capitalize">
							{gradient.mode} {gradient.mode === 'linear' ? `${Math.round(gradient.angle_deg)}°` : ''} /{' '}
							{gradient.stops.length} stops
						</p>
					</>
				) : gradientLoading ? (
					<div className="flex flex-col items-center gap-2">
						<div className="size-6 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
						<p className="text-xs text-muted-fg">Analyzing...</p>
					</div>
				) : (
					<p className="text-xs text-muted-fg/40">Press Extract</p>
				)}
				<p className="text-[10px] text-muted-fg mt-3 uppercase tracking-wider">Gradient</p>
			</div>
		</div>

		{/* Footer: controls + actions */}
		<div className="px-6 py-4 border-t border-border flex items-center gap-4 bg-muted/5 shrink-0">
			<div className="flex items-center gap-1 rounded-xl border border-border p-0.5">
				{(
					[
						['bg', 'BG'],
						['logo', 'Logo']
					] as const
				).map(([val, label]) => (
					<button
						key={val}
						type="button"
						onClick={() => setGradTarget(val)}
						className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
							gradTarget === val ? 'bg-accent/10 text-accent' : 'text-muted-fg hover:text-foreground'
						}`}
					>
						{label}
					</button>
				))}
			</div>

			<div className="flex items-center gap-1 rounded-xl border border-border p-0.5">
				{(['linear', 'radial'] as const).map((m) => (
					<button
						key={m}
						type="button"
						onClick={() => setGradMode(m)}
						className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer capitalize ${
							gradMode === m ? 'bg-accent/10 text-accent' : 'text-muted-fg hover:text-foreground'
						}`}
					>
						{m}
					</button>
				))}
			</div>

			<div className="w-px h-6 bg-border" />

			<div className="flex items-center gap-1 rounded-xl border border-border p-0.5">
				<button
					type="button"
					onClick={() => setGradStops(0)}
					className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
						gradStops === 0 ? 'bg-accent/10 text-accent' : 'text-muted-fg hover:text-foreground'
					}`}
				>
					Auto
				</button>
				<button
					type="button"
					onClick={() => setGradStops(8)}
					className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
						gradStops > 0 ? 'bg-accent/10 text-accent' : 'text-muted-fg hover:text-foreground'
					}`}
				>
					Manual
				</button>
			</div>
			{gradStops > 0 && (
				<div className="flex items-center gap-2">
					<input
						type="range"
						min={2}
						max={100}
						value={gradStops}
						onChange={(e) => setGradStops(Number(e.target.value))}
						className="w-20 accent-accent"
					/>
					<input
						type="number"
						min={2}
						max={100}
						value={gradStops}
						onChange={(e) => setGradStops(Math.max(2, Math.min(100, Number(e.target.value) || 2)))}
						className="w-14 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-center font-mono tabular-nums focus:outline-none focus:border-accent"
					/>
				</div>
			)}

			<div className="flex-1" />

			{gradient && (
				<>
					<button
						type="button"
						onClick={() => {
							navigator.clipboard.writeText(gradient.css_gradient);
							toast.success('CSS copied');
						}}
						className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
					>
						Copy CSS
					</button>
					<button
						type="button"
						onClick={() => {
							navigator.clipboard.writeText(gradient.svg_gradient);
							toast.success('SVG copied');
						}}
						className="rounded-xl border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
					>
						Copy SVG
					</button>
				</>
			)}
			<button
				type="button"
				disabled={gradientLoading}
				onClick={fetchGradient}
				className="rounded-xl bg-accent px-6 py-2 text-sm font-bold text-white hover:opacity-90 transition-colors cursor-pointer disabled:opacity-40"
			>
				{gradientLoading ? 'Analyzing...' : gradient ? 'Re-extract' : 'Extract'}
			</button>
		</div>
	</>
);

export default GradientTab;
