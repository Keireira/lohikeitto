'use client';

import type { ColumnDef } from '@tanstack/react-table';

import ServiceIcon from '@/components/service-icon';
import { contrastText } from '@/lib/color';
import type { ServiceT } from '@/lib/types';

export const columns: ColumnDef<ServiceT>[] = [
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
