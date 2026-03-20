'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ThemeToggle from '@/components/theme-toggle';

const links = [
	{ href: '/', label: 'Services' },
	{ href: '/s3', label: 'S3' }
];

type NavProps = {
	serviceCount?: number;
	bucketName?: string;
	bucketEndpoint?: string;
	bucketBaseUrl?: string;
};

const Nav = ({ serviceCount, bucketName, bucketEndpoint, bucketBaseUrl }: NavProps) => {
	const pathname = usePathname();

	return (
		<header className="mb-8">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-6">
					<div className="flex items-center gap-3">
						<div className="size-9 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-base">
							L
						</div>
						<div>
							<h1 className="text-lg font-semibold tracking-tight leading-tight">Lohikeitto</h1>
							<p className="text-xs text-muted-fg">Admin</p>
						</div>
					</div>
					<nav className="flex gap-1 rounded-lg bg-muted p-1">
						{links.map((link) => (
							<Link
								key={link.href}
								href={link.href}
								className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
									pathname === link.href
										? 'bg-background text-foreground shadow-sm'
										: 'text-muted-fg hover:text-foreground'
								}`}
							>
								{link.label}
							</Link>
						))}
					</nav>
				</div>
				<div className="flex items-center gap-4">
					{serviceCount !== undefined && (
						<div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5">
							<span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
							<span className="text-xs text-muted-fg">{serviceCount} services</span>
						</div>
					)}
					{bucketName && (
						<div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5">
							{bucketBaseUrl ? (
								<a href={bucketBaseUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-fg font-mono hover:text-accent transition-colors">{bucketBaseUrl}</a>
							) : bucketEndpoint ? (
								<span className="text-xs text-muted-fg/50 font-mono">{bucketEndpoint}</span>
							) : null}
							<span className="text-xs text-muted-fg/30">{'|'}</span>
							<span className="text-xs text-muted-fg font-mono">{bucketName}</span>
						</div>
					)}
					<ThemeToggle />
				</div>
			</div>
			<div className="mt-6 h-px bg-border" />
		</header>
	);
};

export default Nav;
