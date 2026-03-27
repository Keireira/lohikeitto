'use client';

import ThemeToggle from '@/components/theme-toggle';

type TopBarProps = {
	title: string;
	subtitle?: string;
	actions?: React.ReactNode;
};

const TopBar = ({ title, subtitle, actions }: TopBarProps) => (
	<header className="sticky top-0 z-20 bg-background/80 backdrop-blur-lg border-b border-border px-8 h-[72px] flex items-center justify-between">
		<div className="flex items-center gap-8">
			<div>
				<h2 className="text-lg font-bold text-foreground leading-tight">{title}</h2>
				{subtitle && <p className="text-xs text-muted-fg">{subtitle}</p>}
			</div>
		</div>
		<div className="flex items-center gap-4">
			{actions}
			<ThemeToggle />
		</div>
	</header>
);

export default TopBar;
