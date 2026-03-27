'use client';

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

export default SortHeader;
