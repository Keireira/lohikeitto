'use client';

import {
	type ColumnDef,
	type ColumnFiltersState,
	type SortingState,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable
} from '@tanstack/react-table';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useDebouncedState } from '@tanstack/react-pacer';

import CheckboxSelect from '@/components/checkbox-select';
import Pagination, { QuickNav } from '@/components/pagination/pagination';
import ServiceEditor from '@/components/service-detail';
import Squircle from '@/components/squircle';
import { contrastText } from '@/lib/color';
import { getCachedImage } from '@/lib/image-cache';
import type { CategoryT, ServiceT } from '@/lib/types';

// ── Atoms ──────────────────────────────────────────

const proxyUrl = (url: string): string => {
	try {
		return `/proxy-s3${new URL(url).pathname}`;
	} catch {
		return url;
	}
};

const ServiceIcon = ({ src, name, color }: { src: string; name: string; color: string }) => {
	const [cachedSrc, setCachedSrc] = useState<string | undefined>(undefined);
	const proxied = proxyUrl(src);

	useEffect(() => {
		let cancelled = false;
		getCachedImage(proxied)
			.then((u) => {
				if (!cancelled) setCachedSrc(u);
			})
			.catch(() => {
				if (!cancelled) setCachedSrc(undefined);
			});
		return () => {
			cancelled = true;
		};
	}, [proxied]);

	return (
		<Squircle
			size={40}
			color={color}
			src={cachedSrc}
			fallback={!cachedSrc ? name.charAt(0).toUpperCase() : undefined}
			style={{ color: contrastText(color) }}
		/>
	);
};

const SortHeader = ({
	label,
	active,
	dir,
	onClick
}: {
	label: string;
	active: boolean;
	dir: 'asc' | 'desc';
	onClick: () => void;
}) => (
	<button
		type="button"
		onClick={onClick}
		className="flex items-center gap-1 cursor-pointer select-none hover:text-foreground transition-colors uppercase"
	>
		{label}
		{active ? (
			<span className="text-accent">{dir === 'asc' ? '↑' : '↓'}</span>
		) : (
			<span className="opacity-20">{'↕'}</span>
		)}
	</button>
);

// ── Columns ────────────────────────────────────────

const columns: ColumnDef<ServiceT>[] = [
	{
		accessorKey: 'name',
		header: 'Name',
		cell: ({ row }) => (
			<div className="flex items-center gap-4">
				<div className="relative">
					<ServiceIcon src={row.original.logo_url} name={row.original.name} color={row.original.colors.primary} />
					{row.original.verified && (
						<span
							className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-success border-2 border-surface"
							title="Verified"
						/>
					)}
				</div>
				<p className="font-semibold text-foreground">{row.original.name}</p>
			</div>
		),
		sortingFn: 'alphanumeric'
	},
	{
		accessorFn: (row) => row.domains.join(', '),
		id: 'domains',
		header: 'Domains',
		cell: ({ row }) => (
			<div className="flex flex-wrap gap-1.5">
				{row.original.domains.slice(0, 2).map((d) => (
					<a
						key={d}
						href={`https://${d}`}
						target="_blank"
						rel="noopener noreferrer"
						className="text-xs text-accent hover:underline rounded-full bg-accent/5 px-2.5 py-0.5 font-mono"
						onClick={(e) => e.stopPropagation()}
					>
						{d}
					</a>
				))}
				{row.original.domains.length > 2 && (
					<span className="text-xs text-muted-fg rounded-full bg-muted px-2 py-0.5">
						+{row.original.domains.length - 2}
					</span>
				)}
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
		cell: ({ row }) => (
			<div className="space-y-2.5">
				{row.original.category ? (
					<span className="text-sm text-muted-fg">{row.original.category.title}</span>
				) : (
					<span className="text-xs text-muted-fg/50">—</span>
				)}
				<span
					className="block w-fit rounded-full px-2 py-px text-[9px] font-mono opacity-60"
					style={{ backgroundColor: row.original.colors.primary, color: contrastText(row.original.colors.primary) }}
				>
					{row.original.colors.primary}
				</span>
			</div>
		),
		filterFn: (row, _columnId, filterValue: string[]) => {
			if (!filterValue || filterValue.length === 0) return true;
			return filterValue.includes(row.original.category?.title ?? '');
		},
		sortingFn: 'alphanumeric'
	}
];

// ── Table ──────────────────────────────────────────

const ServicesTable = ({ data: initialData, categories }: { data: ServiceT[]; categories: CategoryT[] }) => {
	const searchParams = useSearchParams();

	const [data, setData] = useState(initialData);
	const [searchInput, setSearchInput] = useState('');
	const [globalFilter, setGlobalFilter] = useDebouncedState('', { wait: 200 });
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }]);
	const [selected, setSelected] = useState<ServiceT | null>(() => {
		const editId = searchParams.get('edit');
		return editId ? (initialData.find((s) => s.id === editId) ?? null) : null;
	});
	const [showVerified, setShowVerified] = useState(true);
	const [showUnverified, setShowUnverified] = useState(true);
	const [pagination, setPagination] = useState(() => ({
		pageIndex: Math.max(0, Number(searchParams.get('page') ?? 1) - 1),
		pageSize: Number(searchParams.get('per_page')) || 50
	}));
	const tableRef = useRef<HTMLDivElement>(null);

	// Sync state → URL (without triggering Next.js navigation)
	useEffect(() => {
		const params = new URLSearchParams();
		if (selected) params.set('edit', selected.id);
		if (pagination.pageIndex > 0) params.set('page', String(pagination.pageIndex + 1));
		if (pagination.pageSize !== 50) params.set('per_page', String(pagination.pageSize));
		const qs = params.toString();
		const url = qs ? `/?${qs}` : '/';
		window.history.replaceState(null, '', url);
	}, [selected, pagination]);

	const visibleData = useMemo(
		() => (showVerified && showUnverified ? data : data.filter((s) => (s.verified ? showVerified : showUnverified))),
		[data, showVerified, showUnverified]
	);
	const verifiedCount = useMemo(() => data.filter((s) => s.verified).length, [data]);


	const categoryNames = useMemo(() => categories.map((c) => c.title).sort(), [categories]);
	const categoryCounts = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const s of data) {
			const cat = s.category?.title;
			if (cat) counts[cat] = (counts[cat] ?? 0) + 1;
		}
		return counts;
	}, [data]);
	const selectedCategories = useMemo(
		() => new Set((columnFilters.find((f) => f.id === 'category')?.value as string[]) ?? []),
		[columnFilters]
	);

	// Reset to page 0 when filters change
	const filterKey = `${showVerified}|${showUnverified}|${globalFilter}|${JSON.stringify(columnFilters)}`;
	const prevFilterKey = useRef(filterKey);
	if (filterKey !== prevFilterKey.current) {
		prevFilterKey.current = filterKey;
		if (pagination.pageIndex !== 0) setPagination((p) => ({ ...p, pageIndex: 0 }));
	}

	const table = useReactTable({
		data: visibleData,
		columns,
		state: { globalFilter, columnFilters, sorting, pagination },
		onColumnFiltersChange: setColumnFilters,
		onSortingChange: setSorting,
		onPaginationChange: setPagination,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		autoResetPageIndex: false,
		globalFilterFn: (row, _columnId, filterValue: string) => {
			const q = filterValue.toLowerCase();
			const s = row.original;
			return (
				s.name.toLowerCase().includes(q) ||
				s.slug.toLowerCase().includes(q) ||
				s.domains.some((d) => d.toLowerCase().includes(q)) ||
				(s.category?.title.toLowerCase().includes(q) ?? false)
			);
		}
	});

	// Derived counts for pagination
	const filtered = table.getFilteredRowModel().rows.length;
	const pageCount = Math.ceil(filtered / pagination.pageSize);
	if (pageCount > 0 && pagination.pageIndex >= pageCount) {
		setPagination((p) => ({ ...p, pageIndex: Math.max(0, pageCount - 1) }));
	}

	return (
		<div>
			{selected && (
				<div className="fixed top-[72px] left-[64px] bottom-0 w-[400px] z-30 overflow-y-auto overscroll-contain bg-background border-r border-border p-4">
					<ServiceEditor
						service={selected}
						categories={categories}
						onClose={() => setSelected(null)}
						onUpdate={(updated) => {
							setData((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
							setSelected(updated);
						}}
					/>
					<button
						type="button"
						onClick={() => setSelected(null)}
						className="fixed left-[448px] top-[78px] size-7 rounded-full bg-surface border border-border shadow-md flex items-center justify-center text-xs text-muted-fg hover:text-foreground transition-colors cursor-pointer z-30"
						title="Close editor"
					>
						{'✕'}
					</button>
				</div>
			)}

			<div className={`space-y-5 ${selected ? 'ml-[400px]' : ''}`}>
				{/* Filters */}
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<input
							type="text"
							placeholder="Search services..."
							value={searchInput}
							onChange={(e) => { setSearchInput(e.target.value); setGlobalFilter(e.target.value); }}
							className="rounded-xl bg-muted px-4 py-2.5 text-sm placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-accent/50 w-64"
						/>
						<CheckboxSelect
							label="Category"
							options={categoryNames.map((c) => ({ value: c, label: c, count: categoryCounts[c] ?? 0 }))}
							selected={selectedCategories}
							onChange={(s) => {
								setColumnFilters((prev) => {
									const without = prev.filter((f) => f.id !== 'category');
									return s.size > 0 ? [...without, { id: 'category', value: Array.from(s) }] : without;
								});
							}}
						/>
						<CheckboxSelect
							label="Status"
							options={[
								{
									value: 'verified',
									label: 'Verified',
									count: verifiedCount,
									icon: <span className="size-1.5 rounded-full bg-success" />
								},
								{
									value: 'unverified',
									label: 'Unverified',
									count: data.length - verifiedCount,
									icon: <span className="size-1.5 rounded-full bg-muted-fg/30" />
								}
							]}
							selected={new Set([...(showVerified ? ['verified'] : []), ...(showUnverified ? ['unverified'] : [])])}
							onChange={(s) => {
								setShowVerified(s.has('verified'));
								setShowUnverified(s.has('unverified'));
							}}
						/>
						{(searchInput || columnFilters.length > 0 || !showVerified || !showUnverified) && (
							<button
								type="button"
								onClick={() => {
									setSearchInput('');
									setGlobalFilter('');
									setColumnFilters([]);
									setShowVerified(true);
									setShowUnverified(true);
								}}
								className="text-xs text-accent hover:text-accent/70 transition-colors cursor-pointer"
							>
								Reset
							</button>
						)}
					</div>
					<QuickNav table={table} pagination={pagination} filtered={filtered} />
				</div>

				{/* Table */}
				<div ref={tableRef}>
					{/* Header */}
					<div className="flex py-4 text-[11px] font-bold text-muted-fg tracking-wider uppercase">
						<div className="flex-[3] pl-6">
							<SortHeader
								label="Name"
								active={table.getColumn('name')?.getIsSorted() !== false}
								dir={(table.getColumn('name')?.getIsSorted() || 'asc') as 'asc' | 'desc'}
								onClick={() => table.getColumn('name')?.toggleSorting()}
							/>
						</div>
						<div className="flex-[2] px-6">
							<SortHeader
								label="Domains"
								active={table.getColumn('domains')?.getIsSorted() !== false}
								dir={(table.getColumn('domains')?.getIsSorted() || 'asc') as 'asc' | 'desc'}
								onClick={() => table.getColumn('domains')?.toggleSorting()}
							/>
						</div>
						<div className="flex-[2] px-6">
							<SortHeader
								label="Category"
								active={table.getColumn('category')?.getIsSorted() !== false}
								dir={(table.getColumn('category')?.getIsSorted() || 'asc') as 'asc' | 'desc'}
								onClick={() => table.getColumn('category')?.toggleSorting()}
							/>
						</div>
					</div>

					{/* Rows */}
					<div className="space-y-2">
						{table.getRowModel().rows.length === 0 && (
							<div className="rounded-2xl bg-surface border border-border px-8 py-16 text-center text-muted-fg">
								No services match your filters
							</div>
						)}
						{table.getRowModel().rows.map((row) => (
							<div
								key={row.id}
								onClick={() => setSelected(row.original)}
								className={`rounded-2xl overflow-hidden flex items-center cursor-pointer transition-colors border ${selected?.id === row.original.id ? 'bg-accent/5 border-accent/20' : 'bg-surface border-border hover:border-muted-fg/20'}`}
							>
								{row.getVisibleCells().map((cell, i) => {
									const flex = i === 0 ? 'flex-[3]' : 'flex-[2]';
									return (
										<div key={cell.id} className={`${flex} py-4 ${i === 0 ? 'pl-6 pr-4' : 'px-6'}`}>
											{flexRender(cell.column.columnDef.cell, cell.getContext())}
										</div>
									);
								})}
							</div>
						))}
					</div>

					{/* Pagination */}
					<Pagination table={table} pagination={pagination} filtered={filtered} total={data.length} />
				</div>
			</div>
		</div>
	);
};

export default ServicesTable;
