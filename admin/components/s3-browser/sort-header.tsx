'use client';

import type { SortDir, SortKey } from './s3-browser.d';

const SortHeader = ({
	label,
	field,
	current,
	dir,
	onSort
}: {
	label: string;
	field: SortKey;
	current: SortKey;
	dir: SortDir;
	onSort: (k: SortKey) => void;
}) => (
	<button
		type="button"
		onClick={() => onSort(field)}
		className="flex items-center gap-1 cursor-pointer select-none hover:text-foreground transition-colors"
	>
		{label}
		{current === field && <span>{dir === 'asc' ? '↑' : '↓'}</span>}
		{current !== field && <span className="opacity-30">{'↕'}</span>}
	</button>
);

export default SortHeader;
