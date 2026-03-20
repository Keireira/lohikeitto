'use client';

import {
	type ColumnDef,
	type ColumnFiltersState,
	type Header,
	type SortingState,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getSortedRowModel,
	useReactTable
} from '@tanstack/react-table';
import { useEffect, useMemo, useState } from 'react';

import ServiceDetail from '@/components/service-detail';
import { contrastText } from '@/lib/color';
import type { ServiceT } from '@/lib/types';

// ── Atoms ──────────────────────────────────────────

const ServiceIcon = ({ src, name, color }: { src: string; name: string; color: string }) => {
	const [ok, setOk] = useState<boolean | null>(null);

	useEffect(() => {
		const img = new Image();
		img.onload = () => setOk(true);
		img.onerror = () => setOk(false);
		img.src = src;
	}, [src]);

	return (
		<div
			className="size-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold bg-center bg-cover"
			style={{
				backgroundColor: color,
				color: contrastText(color),
				...(ok ? { backgroundImage: `url(${src})` } : {})
			}}
		>
			{!ok && name.charAt(0).toUpperCase()}
		</div>
	);
};

const ColorChip = ({ color }: { color: string }) => (
	<span
		className="inline-block rounded-md px-2 py-0.5 text-xs font-mono font-medium"
		style={{ backgroundColor: color, color: contrastText(color) }}
	>
		{color}
	</span>
);

const DomainLink = ({ domain }: { domain: string }) => (
	<a
		href={`https://${domain}`}
		target="_blank"
		rel="noopener noreferrer"
		className="rounded bg-muted px-2 py-0.5 text-xs font-mono text-muted-fg hover:text-accent transition-colors"
	>
		{domain}
	</a>
);

const SortIcon = ({ direction }: { direction: false | 'asc' | 'desc' }) => {
	if (!direction) return <span className="ml-1 opacity-30">{'↕'}</span>;
	return <span className="ml-1">{direction === 'asc' ? '↑' : '↓'}</span>;
};

// ── Column header with sort + per-column filter ────

const ColumnHeader = <T,>({
	header,
	filterElement
}: {
	header: Header<T, unknown>;
	filterElement?: React.ReactNode;
}) => {
	const canSort = header.column.getCanSort();

	return (
		<div className="space-y-2">
			<button
				type="button"
				className={`flex items-center gap-0.5 ${canSort ? 'cursor-pointer select-none hover:text-foreground' : ''}`}
				onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
			>
				{flexRender(header.column.columnDef.header, header.getContext())}
				{canSort && <SortIcon direction={header.column.getIsSorted()} />}
			</button>
			{filterElement}
		</div>
	);
};

// ── Filter inputs ──────────────────────────────────

const TextFilter = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
	<input
		type="text"
		value={value}
		onChange={(e) => onChange(e.target.value)}
		placeholder="Filter..."
		className="w-full rounded border border-border bg-background px-2 py-1 text-xs font-normal normal-case tracking-normal placeholder:text-muted-fg/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
	/>
);

const SelectFilter = ({
	value,
	options,
	onChange
}: {
	value: string;
	options: string[];
	onChange: (v: string) => void;
}) => (
	<select
		value={value}
		onChange={(e) => onChange(e.target.value)}
		className="w-full rounded border border-border bg-background px-2 py-1 text-xs font-normal normal-case tracking-normal text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
	>
		<option value="">All</option>
		{options.map((o) => (
			<option key={o} value={o}>
				{o}
			</option>
		))}
	</select>
);

// ── Columns ────────────────────────────────────────

const columns: ColumnDef<ServiceT>[] = [
	{
		accessorKey: 'name',
		header: 'Service',
		cell: ({ row }) => (
			<div className="flex items-center gap-3">
				<ServiceIcon
					src={row.original.logo_url}
					name={row.original.name}
					color={row.original.colors.primary}
				/>
				<div>
					<span className="font-medium">{row.original.name}</span>
					<span className="ml-2 text-xs text-muted-fg font-mono">{row.original.slug}</span>
				</div>
			</div>
		),
		sortingFn: 'alphanumeric'
	},
	{
		accessorFn: (row) => row.domains.join(', '),
		id: 'domains',
		header: 'Domains',
		cell: ({ row }) => (
			<div className="flex flex-wrap gap-1">
				{row.original.domains.map((d) => (
					<DomainLink key={d} domain={d} />
				))}
			</div>
		),
		filterFn: (row, _columnId, filterValue: string) =>
			row.original.domains.some((d) => d.toLowerCase().includes(filterValue.toLowerCase())),
		sortingFn: 'alphanumeric'
	},
	{
		accessorFn: (row) => row.category?.title ?? '',
		id: 'category',
		header: 'Category',
		cell: ({ row }) =>
			row.original.category ? (
				<span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs text-accent whitespace-nowrap">
					{row.original.category.title}
				</span>
			) : (
				<span className="text-xs text-muted-fg">--</span>
			),
		sortingFn: 'alphanumeric'
	},
	{
		accessorKey: 'verified',
		header: 'Verified',
		cell: ({ row }) =>
			row.original.verified ? (
				<span className="text-emerald-400">{'✓'}</span>
			) : (
				<span className="text-muted-fg">{'✕'}</span>
			),
		filterFn: (row, _columnId, filterValue: string) => {
			if (filterValue === '') return true;
			return filterValue === 'yes' ? row.original.verified : !row.original.verified;
		}
	},
	{
		accessorFn: (row) => row.colors.primary,
		id: 'color',
		header: 'Color',
		cell: ({ row }) => <ColorChip color={row.original.colors.primary} />,
		enableGlobalFilter: false,
		sortingFn: 'alphanumeric'
	}
];

// ── Table ──────────────────────────────────────────

const ServicesTable = ({ data }: { data: ServiceT[] }) => {
	const [globalFilter, setGlobalFilter] = useState('');
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);
	const [selected, setSelected] = useState<ServiceT | null>(null);

	const categories = useMemo(() => {
		const set = new Set<string>();
		for (const s of data) {
			if (s.category) set.add(s.category.title);
		}
		return [...set].sort();
	}, [data]);

	const table = useReactTable({
		data,
		columns,
		state: { globalFilter, columnFilters, sorting },
		onGlobalFilterChange: setGlobalFilter,
		onColumnFiltersChange: setColumnFilters,
		onSortingChange: setSorting,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
		globalFilterFn: (row, _columnId, filterValue: string) => {
			const q = filterValue.toLowerCase();
			const s = row.original;
			return (
				s.name.toLowerCase().includes(q) ||
				s.slug.toLowerCase().includes(q) ||
				s.domains.some((d) => d.toLowerCase().includes(q)) ||
				(s.category?.title.toLowerCase().includes(q) ?? false) ||
				s.colors.primary.toLowerCase().includes(q)
			);
		}
	});

	const getColumnFilter = (id: string): string =>
		(columnFilters.find((f) => f.id === id)?.value as string) ?? '';

	const setColumnFilter = (id: string, value: string) => {
		setColumnFilters((prev) => {
			const without = prev.filter((f) => f.id !== id);
			return value ? [...without, { id, value }] : without;
		});
	};

	const filterElements: Record<string, React.ReactNode> = {
		name: <TextFilter value={getColumnFilter('name')} onChange={(v) => setColumnFilter('name', v)} />,
		domains: <TextFilter value={getColumnFilter('domains')} onChange={(v) => setColumnFilter('domains', v)} />,
		category: (
			<SelectFilter
				value={getColumnFilter('category')}
				options={categories}
				onChange={(v) => setColumnFilter('category', v)}
			/>
		),
		verified: (
			<SelectFilter
				value={getColumnFilter('verified')}
				options={['yes', 'no']}
				onChange={(v) => setColumnFilter('verified', v)}
			/>
		),
		color: <TextFilter value={getColumnFilter('color')} onChange={(v) => setColumnFilter('color', v)} />
	};

	return (
		<div className="flex gap-6">
		{selected && (
			<div className="w-96 shrink-0 sticky top-8 self-start">
				<ServiceDetail service={selected} onClose={() => setSelected(null)} />
			</div>
		)}
		<div className={`space-y-4 ${selected ? 'flex-1 min-w-0' : 'w-full'}`}>
			<div className="flex items-center gap-3">
				<input
					type="text"
					placeholder="Search across all columns..."
					value={globalFilter}
					onChange={(e) => setGlobalFilter(e.target.value)}
					className="rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-accent/50 w-80"
				/>
				<span className="text-xs text-muted-fg">
					{table.getFilteredRowModel().rows.length} of {data.length}
				</span>
			</div>

			<div className="overflow-x-auto rounded-lg border border-border">
				<table className="w-full text-base">
					<thead>
						{table.getHeaderGroups().map((hg) => (
							<tr key={hg.id} className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-fg">
								{hg.headers.map((header) => (
									<th
										key={header.id}
										className={`px-4 py-3 font-medium align-top ${header.id === 'verified' ? 'text-center' : ''}`}
									>
										<ColumnHeader
											header={header}
											filterElement={filterElements[header.id]}
										/>
									</th>
								))}
							</tr>
						))}
					</thead>
					<tbody>
						{table.getRowModel().rows.length === 0 && (
							<tr>
								<td colSpan={columns.length} className="px-4 py-12 text-center text-muted-fg">
									No services match your filters
								</td>
							</tr>
						)}
						{table.getRowModel().rows.map((row) => (
							<tr
								key={row.id}
								onClick={() => setSelected(row.original)}
								className={`border-b border-border hover:bg-muted/50 transition-colors cursor-pointer ${selected?.id === row.original.id ? 'bg-accent/5' : ''}`}
							>
								{row.getVisibleCells().map((cell) => (
									<td
										key={cell.id}
										className={`px-4 py-3 ${cell.column.id === 'verified' ? 'text-center' : ''}`}
									>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>

		</div>
	);
};

export default ServicesTable;
