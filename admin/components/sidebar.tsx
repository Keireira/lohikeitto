'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Squircle from '@/components/squircle';

const links = [
	{ href: '/', label: 'Services', icon: '◎' },
	{ href: '/categories', label: 'Categories', icon: '▦' },
	{ href: '/limbus', label: 'Limbus', icon: '◌' },
	{ href: '/s3', label: 'S3 Storage', icon: '☁' },
	{ href: '/settings', label: 'Settings', icon: '⚙' }
];

const Sidebar = () => {
	const pathname = usePathname();
	const [expanded, setExpanded] = useState(false);
	const [dbHost, setDbHost] = useState('localhost');
	const [s3Info, setS3Info] = useState('R2');

	useEffect(() => {
		setDbHost(localStorage.getItem('admin_db_host') ?? 'localhost');
		setS3Info(localStorage.getItem('admin_s3_info') ?? 'R2');
		const interval = setInterval(() => {
			setDbHost(localStorage.getItem('admin_db_host') ?? 'localhost');
			setS3Info(localStorage.getItem('admin_s3_info') ?? 'R2');
		}, 5000);
		return () => clearInterval(interval);
	}, []);

	return (
		<>
			{expanded && (
				<div className="fixed inset-0 z-[25]" onClick={() => setExpanded(false)} />
			)}

			<aside className={`fixed left-0 top-0 bottom-0 bg-sidebar flex flex-col border-r border-border z-[25] transition-all duration-200 overflow-hidden ${expanded ? 'w-56' : 'w-16'}`}>
				{/* Header */}
				<div className={`flex items-center h-16 shrink-0 ${expanded ? 'px-4 gap-3' : 'justify-center'}`}>
					<button
						type="button"
						onClick={() => setExpanded((v) => !v)}
						className="text-xl font-extrabold text-accent cursor-pointer shrink-0 size-9 flex items-center justify-center rounded-lg hover:bg-accent/10 transition-colors"
					>
						L
					</button>
					{expanded && (
						<div className="min-w-0">
							<p className="text-sm font-extrabold tracking-[1.5px] uppercase text-foreground truncate">Lohikeitto</p>
							<p className="text-[9px] uppercase tracking-wider text-muted-fg">Admin</p>
						</div>
					)}
				</div>

				{/* Nav */}
				<nav className={`flex flex-col gap-1 flex-1 py-4 ${expanded ? 'px-3' : 'items-center'}`}>
					{links.map((link) => {
						const active = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
						return (
							<Link
								key={link.href}
								href={link.href}
								title={link.label}
								onClick={() => setExpanded(false)}
								className={`relative flex items-center gap-3 rounded-xl transition-colors ${
									expanded ? 'px-3 py-2.5' : 'justify-center size-10'
								} ${
									active
										? 'bg-accent/10 text-accent font-semibold'
										: 'text-muted-fg hover:text-foreground hover:bg-muted'
								}`}
							>
								{active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-accent" style={{ marginLeft: expanded ? -12 : -13 }} />}
								<span className="text-lg shrink-0">{link.icon}</span>
								{expanded && <span className="text-[13px] truncate">{link.label}</span>}
							</Link>
						);
					})}
				</nav>

				{/* Footer */}
				<div className={`shrink-0 pb-4 ${expanded ? 'px-3 space-y-3' : 'flex flex-col items-center'}`}>
					{expanded && (
						<div className="space-y-0.5 px-2">
							<p className="text-[9px] font-mono text-muted-fg/40 truncate">
								<span className="text-muted-fg/60">db</span> {dbHost}
							</p>
							<p className="text-[9px] font-mono text-muted-fg/40 truncate">
								<span className="text-muted-fg/60">s3</span> {s3Info}
							</p>
						</div>
					)}
					<div className={`flex items-center gap-3 rounded-xl ${expanded ? 'px-2 py-2 bg-muted/30' : 'justify-center'}`}>
						<Squircle size={expanded ? 32 : 28} src="/avatar_stub.jpeg" color="#888" />
						{expanded && (
							<div className="min-w-0">
								<p className="text-xs font-bold text-foreground truncate">Renko</p>
								<p className="text-[9px] text-muted-fg">rwx</p>
							</div>
						)}
					</div>
				</div>
			</aside>
		</>
	);
};

export default Sidebar;
