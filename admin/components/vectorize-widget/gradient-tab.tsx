'use client';

import { toast } from '@/lib/toast';
import type { GradientMode, GradientData } from './vectorize-widget.d';

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
						{(
							[
								['bg', 'Background'],
								['logo', 'Logo']
							] as const
						).map(([val, label]) => (
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
					<p className="text-[10px] text-muted-fg mt-1">
						{gradTarget === 'bg'
							? 'Scan background colors, ignore icon'
							: 'Scan icon/foreground colors, ignore background'}
					</p>
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
							<input
								type="range"
								min={2}
								max={100}
								value={gradStops}
								onChange={(e) => setGradStops(Number(e.target.value))}
								className="w-full accent-accent"
							/>
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
							<div
								className="size-10 rounded-lg border border-border shrink-0"
								style={{
									background: gradient.css_gradient
								}}
							/>
							<div>
								<p className="text-sm font-semibold text-foreground capitalize">{gradient.mode}</p>
								<p className="text-[10px] text-muted-fg">
									{gradient.stops.length} stops
									{gradient.mode === 'linear' ? `, ${Math.round(gradient.angle_deg)} deg` : ''}
								</p>
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
										<div
											className="size-5 rounded-md shrink-0 border border-border shadow-sm"
											style={{ backgroundColor: stop.color }}
										/>
										<span className="text-xs font-mono text-foreground flex-1">{stop.color}</span>
										<span className="text-[10px] text-muted-fg tabular-nums w-8 text-right">
											{Math.round(stop.offset * 100)}%
										</span>
									</div>
								))}
							</div>
						</div>

						{/* Copy actions */}
						<div className="space-y-2 pt-3 border-t border-border">
							<button
								type="button"
								onClick={() => {
									navigator.clipboard.writeText(gradient.css_gradient);
									toast.success('CSS copied');
								}}
								className="w-full rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer text-left"
							>
								<p className="font-bold mb-0.5">Copy CSS</p>
								<p className="font-mono text-muted-fg truncate">{gradient.css_gradient}</p>
							</button>
							<button
								type="button"
								onClick={() => {
									navigator.clipboard.writeText(gradient.svg_gradient);
									toast.success('SVG copied');
								}}
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
);

export default GradientTab;
