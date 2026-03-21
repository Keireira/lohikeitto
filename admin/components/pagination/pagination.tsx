'use client';

import type { PaginationState, Table } from '@tanstack/react-table';
import { getPageRange, scrollToTop } from './utils';

const PAGE_SIZES = [25, 50, 75, 100] as const;

// ── Full pagination (bottom of table) ─────────────

const Pagination = ({
	table,
	pagination,
	filtered,
	total
}: {
	// biome-ignore lint: generic not needed
	table: Table<any>;
	pagination: PaginationState;
	filtered: number;
	total: number;
}) => {
	const { pageIndex, pageSize } = pagination;
	const pageCount = Math.ceil(filtered / pageSize);
	const canPrev = pageIndex > 0;
	const canNext = pageIndex < pageCount - 1;
	const from = pageIndex * pageSize + 1;
	const to = Math.min((pageIndex + 1) * pageSize, filtered);

	if (filtered === 0) return null;

	return (
		<div className="flex items-center justify-between px-2 py-5">
			<div className="flex items-center gap-4">
				<span className="text-xs text-muted-fg">
					{from}–{to} of {filtered}
					{filtered !== total ? ` (${total} total)` : ''}
				</span>
				<select
					value={pageSize}
					onChange={(e) => {
						table.setPageSize(Number(e.target.value));
						table.setPageIndex(0);
					}}
					className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-foreground cursor-pointer"
				>
					{PAGE_SIZES.map((s) => (
						<option key={s} value={s}>
							{s} / page
						</option>
					))}
					<option value={total}>All</option>
				</select>
			</div>
			{pageCount > 1 && (
				<div className="flex items-center gap-1">
					<button
						type="button"
						disabled={!canPrev}
						onClick={() => { table.previousPage(); scrollToTop(); }}
						className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-foreground hover:bg-muted transition-colors disabled:opacity-30 cursor-pointer outline-none"
					>
						{'‹'}
					</button>
					{getPageRange(pageIndex, pageCount).map((p, i) =>
						p === '...' ? (
							<span key={`e${i}`} className="px-1 text-xs text-muted-fg">...</span>
						) : (
							<button
								key={p}
								type="button"
								onClick={() => { table.setPageIndex(p); scrollToTop(); }}
								className={`rounded-lg size-8 text-xs font-bold transition-colors cursor-pointer outline-none ${p === pageIndex ? 'bg-accent text-white' : 'text-foreground hover:bg-muted'}`}
							>
								{p + 1}
							</button>
						)
					)}
					<button
						type="button"
						disabled={!canNext}
						onClick={() => { table.nextPage(); scrollToTop(); }}
						className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-foreground hover:bg-muted transition-colors disabled:opacity-30 cursor-pointer outline-none"
					>
						{'›'}
					</button>
				</div>
			)}
		</div>
	);
};

// ── Quick nav (top of table) ──────────────────────

export const QuickNav = ({
	table,
	pagination,
	filtered
}: {
	// biome-ignore lint: generic not needed
	table: Table<any>;
	pagination: PaginationState;
	filtered: number;
}) => {
	const { pageIndex, pageSize } = pagination;
	const pageCount = Math.ceil(filtered / pageSize);
	const canPrev = pageIndex > 0;
	const canNext = pageIndex < pageCount - 1;

	if (pageCount <= 1) return null;

	return (
		<div className="flex items-center gap-2">
			<button
				type="button"
				disabled={!canPrev}
				onClick={() => { table.previousPage(); scrollToTop(); }}
				className="rounded-full border border-border px-3.5 py-1.5 text-xs font-bold text-foreground hover:bg-muted transition-colors disabled:opacity-30 cursor-pointer outline-none"
			>
				Previous
			</button>
			<span className="text-xs text-muted-fg tabular-nums">
				{pageIndex + 1}/{pageCount}
			</span>
			<button
				type="button"
				disabled={!canNext}
				onClick={() => { table.nextPage(); scrollToTop(); }}
				className="rounded-full border border-border px-3.5 py-1.5 text-xs font-bold text-foreground hover:bg-muted transition-colors disabled:opacity-30 cursor-pointer outline-none"
			>
				Next
			</button>
		</div>
	);
};

export default Pagination;
