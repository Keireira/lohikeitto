'use client';

import { useRef, useState } from 'react';
import useClickOutside from '@/lib/use-click-outside';

type CheckOption = { value: string; label: string; icon?: React.ReactNode; count?: number };

type CheckboxSelectProps = {
	options: CheckOption[];
	selected: Set<string>;
	onChange: (selected: Set<string>) => void;
	label: string;
	className?: string;
};

const CheckboxSelect = ({ options, selected, onChange, label, className }: CheckboxSelectProps) => {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	const allSelected = options.every((o) => selected.has(o.value));
	const hasFilter = !allSelected;

	useClickOutside(ref, () => setOpen(false));

	const toggle = (value: string) => {
		const next = new Set(selected);
		if (next.has(value)) next.delete(value);
		else next.add(value);
		onChange(next);
	};

	return (
		<div ref={ref} className={`relative ${className ?? ''}`}>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className={`rounded-xl bg-muted px-3 py-2.5 text-sm cursor-pointer flex items-center gap-2 ${hasFilter ? 'text-accent font-medium' : 'text-foreground'} ${open ? 'ring-2 ring-accent/50' : ''}`}
			>
				{label}
				{hasFilter ? '*' : ''}
				<span className="text-[10px] text-muted-fg">{'▾'}</span>
			</button>

			{open && (
				<div className="absolute top-full left-0 mt-1 bg-surface rounded-2xl border border-border shadow-2xl z-30 min-w-[180px] max-h-72 overflow-y-auto overflow-hidden py-1">
					{hasFilter && (
						<button
							type="button"
							onClick={() => onChange(new Set(options.map((o) => o.value)))}
							className="w-full text-left px-4 py-2 text-xs text-accent hover:bg-muted transition-colors cursor-pointer"
						>
							Reset
						</button>
					)}
					{options.map((o) => (
						<label
							key={o.value}
							className="flex items-center gap-3 px-4 py-2 text-sm cursor-pointer hover:bg-muted transition-colors whitespace-nowrap"
						>
							<input
								type="checkbox"
								checked={selected.has(o.value)}
								onChange={() => toggle(o.value)}
								className="accent-accent cursor-pointer"
							/>
							{o.icon}
							<span className="flex-1">{o.label}</span>
							{o.count !== undefined && <span className="text-xs text-muted-fg">{o.count}</span>}
						</label>
					))}
				</div>
			)}
		</div>
	);
};

export default CheckboxSelect;
