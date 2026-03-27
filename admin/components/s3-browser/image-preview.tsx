'use client';

import { useEffect, useState } from 'react';
import { formatDate, formatSize } from '@/lib/format';
import type { PreviewData } from './s3-browser.d';

const ImagePreview = ({
	data,
	onClose,
	onPrev,
	onNext,
	onDownload,
	onDelete
}: {
	data: PreviewData;
	onClose: () => void;
	onPrev: (() => void) | null;
	onNext: (() => void) | null;
	onDownload: () => void;
	onDelete: () => void;
}) => {
	const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
	const ext = data.name.split('.').pop()?.toUpperCase() ?? '';

	useEffect(() => {
		setDims(null);
	}, [data.src]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
			if ((e.key === 'ArrowUp' || e.key === 'ArrowLeft') && onPrev) onPrev();
			if ((e.key === 'ArrowDown' || e.key === 'ArrowRight') && onNext) onNext();
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, [onClose, onPrev, onNext]);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
			<div
				className="relative max-w-3xl max-h-[85vh] rounded-lg overflow-hidden bg-background border border-border shadow-2xl"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between px-4 py-2 border-b border-border">
					<div className="flex items-center gap-3">
						{onPrev && (
							<button type="button" onClick={onPrev} className="text-muted-fg hover:text-foreground text-sm">
								{'↑'}
							</button>
						)}
						{onNext && (
							<button type="button" onClick={onNext} className="text-muted-fg hover:text-foreground text-sm">
								{'↓'}
							</button>
						)}
						<span className="text-sm font-mono text-muted-fg">{data.name}</span>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={onDownload}
							className="rounded border border-border px-2 py-0.5 text-xs text-muted-fg hover:text-foreground hover:bg-muted transition-colors"
						>
							{'↓'}
						</button>
						<button
							type="button"
							onClick={onDelete}
							className="rounded border border-red-400/30 px-2 py-0.5 text-xs text-red-400 hover:bg-red-400/10 transition-colors"
						>
							{'🗑'}
						</button>
						<button type="button" onClick={onClose} className="text-muted-fg hover:text-foreground text-sm ml-2">
							{'esc'}
						</button>
					</div>
				</div>
				<div
					className="p-4 flex items-center justify-center"
					style={{ background: 'repeating-conic-gradient(#80808015 0% 25%, transparent 0% 50%) 50% / 16px 16px' }}
				>
					<img
						src={data.src}
						alt={data.name}
						className="max-w-full max-h-[60vh] object-contain"
						onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
					/>
				</div>
				<div className="flex flex-wrap gap-x-6 gap-y-1 px-4 py-3 border-t border-border text-xs text-muted-fg font-mono">
					<span>{ext}</span>
					<span>{formatSize(data.size)}</span>
					{dims && (
						<span>
							{dims.w} x {dims.h}
						</span>
					)}
					<span>{formatDate(data.lastModified)}</span>
				</div>
			</div>
		</div>
	);
};

export default ImagePreview;
