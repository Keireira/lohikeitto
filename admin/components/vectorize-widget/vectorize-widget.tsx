'use client';

import { useState } from 'react';
import { useVectorize } from './use-vectorize';
import VectorTab from './vector-tab';
import GradientTab from './gradient-tab';
import type { Tab } from './vectorize-widget.d';

const VectorizeWidget = ({ blobUrl, slug, onClose }: { blobUrl: string; slug: string; onClose: () => void }) => {
	const [tab, setTab] = useState<Tab>('vector');
	const v = useVectorize({ blobUrl, slug });

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
			<div
				className="bg-surface rounded-2xl border border-border shadow-2xl w-[1100px] max-w-[95vw] max-h-[85vh] overflow-hidden flex flex-col"
				onClick={(e) => e.stopPropagation()}
			>
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
					<button
						type="button"
						onClick={onClose}
						className="px-4 text-muted-fg hover:text-foreground cursor-pointer transition-colors"
					>
						{'x'}
					</button>
				</div>

				{tab === 'vector' ? (
					<VectorTab
						blobUrl={blobUrl}
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
						onClose={onClose}
					/>
				) : (
					<GradientTab
						blobUrl={blobUrl}
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

export default VectorizeWidget;
