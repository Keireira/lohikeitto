'use client';

import { useEffect, useRef } from 'react';

type MenuItem = {
	label: string;
	icon?: string;
	danger?: boolean;
	disabled?: boolean;
	separator?: boolean;
	onClick: () => void;
};

type ContextMenuProps = {
	x: number;
	y: number;
	items: MenuItem[];
	onClose: () => void;
};

const ContextMenu = ({ x, y, items, onClose }: ContextMenuProps) => {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				onClose();
			}
		};
		const esc = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		document.addEventListener('mousedown', handler);
		document.addEventListener('keydown', esc);
		return () => {
			document.removeEventListener('mousedown', handler);
			document.removeEventListener('keydown', esc);
		};
	}, [onClose]);

	// Clamp to viewport
	useEffect(() => {
		if (!ref.current) return;
		const rect = ref.current.getBoundingClientRect();
		if (rect.right > window.innerWidth) {
			ref.current.style.left = `${window.innerWidth - rect.width - 8}px`;
		}
		if (rect.bottom > window.innerHeight) {
			ref.current.style.top = `${window.innerHeight - rect.height - 8}px`;
		}
	}, [x, y]);

	return (
		<div
			ref={ref}
			className="fixed z-50 min-w-48 rounded-lg border border-border bg-background shadow-xl py-1"
			style={{ left: x, top: y }}
		>
			{items.map((item, i) =>
				item.separator ? (
					<div key={`sep-${i}`} className="my-1 h-px bg-border" />
				) : (
					<button
						key={item.label}
						type="button"
						disabled={item.disabled}
						onClick={() => {
							onClose();
							item.onClick();
						}}
						className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors disabled:opacity-30
							${item.danger
								? 'text-red-400 hover:bg-red-400/10'
								: 'text-foreground hover:bg-muted'
							}`}
					>
						{item.icon && <span className="w-4 text-center">{item.icon}</span>}
						{item.label}
					</button>
				)
			)}
		</div>
	);
};

export type { MenuItem };
export default ContextMenu;
