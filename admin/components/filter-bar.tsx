'use client';

import { useRef, useState } from 'react';
import useClickOutside from '@/lib/use-click-outside';

type ChipProps = {
	label: string;
	value?: string;
	active?: boolean;
	onClear?: () => void;
	onClick?: () => void;
	children?: React.ReactNode;
};

const FilterChip = ({ label, value, active, onClear, onClick, children }: ChipProps) => {
	const ref = useRef<HTMLDivElement>(null);
	const [open, setOpen] = useState(false);

	useClickOutside(ref, () => setOpen(false));

	if (onClick && !children) {
		return (
			<button
				type="button"
				onClick={onClick}
				className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm transition-all cursor-pointer ${
					active ? 'bg-accent/10 text-accent font-medium' : 'text-muted-fg hover:text-foreground hover:bg-muted'
				}`}
			>
				<span className="opacity-50">{label}</span>
				{value && <span className="font-medium text-foreground">{value}</span>}
				{active && onClear && (
					<span
						onClick={(e) => {
							e.stopPropagation();
							onClear();
						}}
						className="ml-0.5 opacity-40 hover:opacity-100"
					>
						{'×'}
					</span>
				)}
			</button>
		);
	}

	return (
		<div ref={ref} className="relative inline-flex">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm transition-all cursor-pointer ${
					active ? 'bg-accent/10 text-accent font-medium' : 'text-muted-fg hover:text-foreground hover:bg-muted'
				} ${open ? 'bg-muted text-foreground' : ''}`}
			>
				<span className="opacity-50">{label}</span>
				{value && <span className="font-medium text-foreground">{value}</span>}
				{active && onClear && (
					<span
						onClick={(e) => {
							e.stopPropagation();
							onClear();
						}}
						className="ml-0.5 opacity-40 hover:opacity-100"
					>
						{'×'}
					</span>
				)}
			</button>
			{open && children && <div className="absolute top-full left-0 mt-1 z-30">{children}</div>}
		</div>
	);
};

type Option = { value: string; label: string; count?: number };

const CheckList = ({
	options,
	selected,
	onChange,
	searchable = false
}: {
	options: Option[];
	selected: Set<string>;
	onChange: (s: Set<string>) => void;
	searchable?: boolean;
}) => {
	const [search, setSearch] = useState('');
	const filtered = search ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase())) : options;
	const allSelected = options.length > 0 && options.every((o) => selected.has(o.value));

	const toggle = (v: string) => {
		const next = new Set(selected);
		if (next.has(v)) next.delete(v);
		else next.add(v);
		onChange(next);
	};

	return (
		<div className="bg-surface rounded-xl border border-border shadow-2xl w-60 overflow-hidden">
			{searchable && (
				<div className="px-3 py-2 border-b border-border">
					<input
						type="text"
						placeholder="Filter..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						autoFocus
						className="w-full text-sm bg-transparent placeholder:text-muted-fg/50 focus:outline-none"
					/>
				</div>
			)}
			<div className="max-h-64 overflow-y-auto py-0.5">
				{!allSelected && (
					<button
						type="button"
						onClick={() => onChange(new Set(options.map((o) => o.value)))}
						className="w-full text-left px-3.5 py-2 text-[11px] text-accent hover:bg-accent/5 transition-colors cursor-pointer"
					>
						Select all
					</button>
				)}
				{allSelected && options.length > 0 && (
					<button
						type="button"
						onClick={() => onChange(new Set())}
						className="w-full text-left px-3.5 py-2 text-[11px] text-muted-fg hover:bg-muted transition-colors cursor-pointer"
					>
						Deselect all
					</button>
				)}
				{filtered.map((o) => (
					<button
						key={o.value}
						type="button"
						onClick={() => toggle(o.value)}
						className="w-full flex items-center gap-2 px-3.5 py-2 text-sm cursor-pointer hover:bg-muted/50 transition-colors text-left"
					>
						<div
							className={`size-3.5 rounded-[4px] border flex items-center justify-center shrink-0 transition-all ${
								selected.has(o.value) ? 'bg-accent border-accent' : 'border-muted-fg/30'
							}`}
						>
							{selected.has(o.value) && <span className="text-white text-[7px] font-bold">{'✓'}</span>}
						</div>
						<span className="flex-1 truncate">{o.label}</span>
						{o.count !== undefined && <span className="text-[10px] text-muted-fg/50 tabular-nums">{o.count}</span>}
					</button>
				))}
			</div>
		</div>
	);
};

export { CheckList, FilterChip };
