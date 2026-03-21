'use client';

import { useEffect, useMemo, useState } from 'react';
import type { S3ObjectT } from '@/lib/types';

type DirPickerProps = {
	data: S3ObjectT[];
	title: string;
	onSelect: (path: string) => void;
	onClose: () => void;
};

const DirPicker = ({ data, title, onSelect, onClose }: DirPickerProps) => {
	const [path, setPath] = useState<string[]>([]);
	const currentPath = path.length > 0 ? `${path.join('/')}/` : '';

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopImmediatePropagation();
				onClose();
			}
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, [onClose]);

	const dirs = useMemo(() => {
		const set = new Set<string>();
		for (const obj of data) {
			if (!obj.key.startsWith(currentPath)) continue;
			const relative = obj.key.slice(currentPath.length);
			const slashIdx = relative.indexOf('/');
			if (slashIdx > 0) set.add(relative.slice(0, slashIdx));
			// Explicit dir placeholders
			if (obj.key.endsWith('/') && obj.size === 0) {
				const name = relative.replace(/\/$/, '');
				if (name && !name.includes('/')) set.add(name);
			}
		}
		return [...set].sort();
	}, [data, currentPath]);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
			<div
				className="bg-surface rounded-2xl border border-border shadow-2xl w-[400px] max-h-[70vh] flex flex-col overflow-hidden"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
					<div>
						<span className="text-[10px] font-bold uppercase tracking-widest text-accent">{title}</span>
						<p className="text-sm font-bold text-foreground">Select destination</p>
					</div>
					<button type="button" onClick={onClose} className="text-muted-fg hover:text-foreground cursor-pointer">
						{'✕'}
					</button>
				</div>

				{/* Breadcrumb */}
				<div className="px-5 py-2 border-b border-border flex items-center gap-0.5 text-sm font-mono shrink-0">
					<button
						type="button"
						onClick={() => setPath([])}
						className="text-muted-fg hover:text-foreground transition-colors"
					>
						/
					</button>
					{path.map((segment, i) => (
						<span key={`${segment}-${i}`} className="flex items-center gap-0.5">
							{i > 0 && <span className="text-muted-fg/30">/</span>}
							<button
								type="button"
								onClick={() => setPath((p) => p.slice(0, i + 1))}
								className={`hover:text-foreground transition-colors ${i === path.length - 1 ? 'text-foreground font-medium' : 'text-muted-fg'}`}
							>
								{segment}
							</button>
						</span>
					))}
				</div>

				{/* Directory list */}
				<div className="flex-1 overflow-y-auto">
					{path.length > 0 && (
						<button
							type="button"
							onClick={() => setPath((p) => p.slice(0, -1))}
							className="w-full text-left px-5 py-3 text-sm text-muted-fg hover:bg-muted transition-colors cursor-pointer flex items-center gap-2"
						>
							<span>📁</span> ..
						</button>
					)}
					{dirs.map((dir) => (
						<button
							key={dir}
							type="button"
							onClick={() => setPath((p) => [...p, dir])}
							className="w-full text-left px-5 py-3 text-sm text-foreground hover:bg-muted transition-colors cursor-pointer flex items-center gap-2"
						>
							<span>📁</span> {dir}/
						</button>
					))}
					{dirs.length === 0 && <p className="px-5 py-6 text-sm text-muted-fg text-center">Empty directory</p>}
				</div>

				{/* Footer */}
				<div className="px-5 py-4 border-t border-border shrink-0 flex gap-3">
					<button
						type="button"
						onClick={() => onSelect(currentPath)}
						className="flex-1 rounded-xl bg-accent py-2.5 text-sm font-bold text-white cursor-pointer hover:opacity-90 transition-colors"
					>
						Select: /{currentPath || '(root)'}
					</button>
					<button
						type="button"
						onClick={onClose}
						className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted-fg cursor-pointer hover:text-foreground transition-colors"
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
};

export default DirPicker;
