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
			ref.current.style.left = `${window.innerWidth - rect.width - 12}px`;
		}
		if (rect.bottom > window.innerHeight) {
			ref.current.style.top = `${window.innerHeight - rect.height - 12}px`;
		}
	}, [x, y]);

	return (
		<div
			ref={ref}
			className="fixed z-50 min-w-[200px] rounded-2xl bg-surface border border-border shadow-2xl py-2 backdrop-blur-xl"
			style={{ left: x, top: y }}
		>
			{items.map((item, i) =>
				item.separator ? (
					<div key={`sep-${i}`} className="my-1.5 mx-3 h-px bg-border" />
				) : (
					<button
						key={item.label}
						type="button"
						disabled={item.disabled}
						onClick={() => {
							onClose();
							item.onClick();
						}}
						className={`w-full text-left px-4 py-2 text-[13px] flex items-center gap-3 transition-colors disabled:opacity-30 cursor-pointer
							${item.danger ? 'text-danger hover:bg-danger/10' : 'text-foreground hover:bg-muted'}`}
					>
						{item.icon && <span className="w-5 text-center text-sm opacity-70">{item.icon}</span>}
						<span className="font-medium">{item.label}</span>
					</button>
				)
			)}
		</div>
	);
};

export type { MenuItem };
export default ContextMenu;
