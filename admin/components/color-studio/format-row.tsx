'use client';

import { toast } from '@/lib/toast';

const FormatRow = ({ label, value }: { label: string; value: string }) => (
	<div className="flex items-center gap-3 py-1">
		<span className="text-[10px] text-muted-fg w-12 shrink-0 uppercase font-bold tracking-wider">{label}</span>
		<span className="text-sm font-mono text-foreground flex-1 truncate">{value}</span>
		<button
			type="button"
			onClick={() => {
				navigator.clipboard.writeText(value);
				toast.success(`${label} copied`);
			}}
			className="text-[11px] text-muted-fg hover:text-accent cursor-pointer shrink-0"
		>
			Copy
		</button>
	</div>
);

export default FormatRow;
