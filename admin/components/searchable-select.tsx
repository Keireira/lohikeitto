'use client';

import { useEffect, useRef, useState } from 'react';

type Option = { value: string; label: string; icon?: React.ReactNode };

type SearchableSelectProps = {
	options: Option[];
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	allLabel?: string;
	className?: string;
};

const SearchableSelect = ({
	options,
	value,
	onChange,
	placeholder = 'Select...',
	allLabel = 'All',
	className
}: SearchableSelectProps) => {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState('');
	const ref = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const selected = options.find((o) => o.value === value);
	const filtered = search ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase())) : options;

	useEffect(() => {
		if (!open) return;
		inputRef.current?.focus();
		const handleClick = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		const handleEsc = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				setOpen(false);
			}
		};
		document.addEventListener('mousedown', handleClick);
		document.addEventListener('keydown', handleEsc);
		return () => {
			document.removeEventListener('mousedown', handleClick);
			document.removeEventListener('keydown', handleEsc);
		};
	}, [open]);

	useEffect(() => {
		if (!open) setSearch('');
	}, [open]);

	return (
		<div ref={ref} className={`relative ${className ?? ''}`}>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className={`rounded-xl bg-muted px-3 py-2.5 text-sm cursor-pointer flex items-center gap-2 w-full text-left ${open ? 'ring-2 ring-accent/50' : ''}`}
			>
				<span className={`flex-1 truncate ${value ? 'text-foreground' : 'text-muted-fg'}`}>
					{selected ? selected.label : allLabel}
				</span>
				<span className="text-[10px] text-muted-fg">{'▾'}</span>
			</button>

			{open && (
				<div className="absolute top-full left-0 mt-1 bg-surface rounded-2xl border border-border shadow-2xl z-30 w-full min-w-[200px] overflow-hidden">
					{options.length > 5 && (
						<div className="px-3 pt-3 pb-1">
							<input
								ref={inputRef}
								type="text"
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder="Search..."
								className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm placeholder:text-muted-fg focus:outline-none focus:ring-1 focus:ring-accent/50"
							/>
						</div>
					)}
					<div className="max-h-60 overflow-y-auto py-1">
						<button
							type="button"
							onClick={() => {
								onChange('');
								setOpen(false);
							}}
							className={`w-full text-left px-4 py-2 text-sm cursor-pointer transition-colors ${!value ? 'bg-accent/5 text-accent font-medium' : 'text-foreground hover:bg-muted'}`}
						>
							{allLabel}
						</button>
						{filtered.map((o) => (
							<button
								key={o.value}
								type="button"
								onClick={() => {
									onChange(o.value);
									setOpen(false);
								}}
								className={`w-full text-left px-4 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2 ${value === o.value ? 'bg-accent/5 text-accent font-medium' : 'text-foreground hover:bg-muted'}`}
							>
								{o.icon}
								<span className="truncate">{o.label}</span>
							</button>
						))}
						{filtered.length === 0 && <p className="px-4 py-3 text-sm text-muted-fg">No matches</p>}
					</div>
				</div>
			)}
		</div>
	);
};

export default SearchableSelect;
