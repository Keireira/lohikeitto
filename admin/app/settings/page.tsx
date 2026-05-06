'use client';

import { useRef, useState } from 'react';
import TopBar from '@/components/top-bar';
import { clearImageCache } from '@/lib/image-cache';
import { toast } from '@/lib/toast';

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL ?? 'http://localhost:1337';

const SettingsPage = () => {
	const [clearing, setClearing] = useState<string | null>(null);
	const [cleared, setCleared] = useState<Set<string>>(new Set());
	const [dbBusy, setDbBusy] = useState<string | null>(null);
	const importRef = useRef<HTMLInputElement>(null);

	const handleClear = async (key: string, fn: () => Promise<void>) => {
		setClearing(key);
		await fn();
		setClearing(null);
		setCleared((prev) => new Set(prev).add(key));
		setTimeout(
			() =>
				setCleared((prev) => {
					const n = new Set(prev);
					n.delete(key);
					return n;
				}),
			2000
		);
	};

	const caches = [
		{
			key: 'logos',
			title: 'Logo Cache',
			description: 'Cached service logos and thumbnails stored in IndexedDB.',
			action: () => clearImageCache()
		},
		{
			key: 'nextjs',
			title: 'Page Data',
			description: 'Reload to fetch fresh data from the API.',
			action: async () => {
				window.location.reload();
			}
		}
	];

	const handleExport = async () => {
		setDbBusy('export');
		try {
			const res = await fetch(`${API_URL}/db/export`);
			if (!res.ok) throw new Error(`${res.status}`);
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `lohikeitto-${new Date().toISOString().slice(0, 10)}.sql`;
			a.click();
			URL.revokeObjectURL(url);
			toast.success('Database exported');
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Export failed');
		} finally {
			setDbBusy(null);
		}
	};

	const handleDrop = async () => {
		if (!window.confirm('This will delete ALL data from ALL tables. Are you sure?')) return;
		if (!window.confirm('This action is irreversible. Type-confirm: continue?')) return;
		setDbBusy('drop');
		try {
			const res = await fetch(`${API_URL}/db/drop`, { method: 'POST' });
			if (!res.ok) throw new Error(`${res.status}`);
			toast.success('All tables cleared');
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Drop failed');
		} finally {
			setDbBusy(null);
		}
	};

	const handleImport = async (file: File) => {
		setDbBusy('import');
		try {
			const sql = await file.text();
			const res = await fetch(`${API_URL}/db/import`, {
				method: 'POST',
				headers: { 'Content-Type': 'text/plain' },
				body: sql
			});
			if (!res.ok) throw new Error(`${res.status}`);
			const result = await res.json();
			if (result.errors?.length > 0) {
				toast.error(`${result.executed}/${result.total} executed, ${result.errors.length} errors`);
			} else {
				toast.success(`${result.executed} statements executed`);
			}
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Import failed');
		} finally {
			setDbBusy(null);
		}
	};

	return (
		<>
			<TopBar title="Settings" subtitle="Cache management and database" />
			<div className="p-8 space-y-8 max-w-3xl">
				{/* Cache */}
				<section>
					<h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Cache</h3>
					<div className="space-y-3">
						{caches.map((cache) => (
							<div
								key={cache.key}
								className="flex items-center justify-between rounded-2xl bg-surface border border-border px-6 py-5"
							>
								<div>
									<p className="text-sm font-semibold text-foreground">{cache.title}</p>
									<p className="text-xs text-muted-fg mt-0.5">{cache.description}</p>
								</div>
								<button
									type="button"
									disabled={clearing === cache.key}
									onClick={() => handleClear(cache.key, cache.action)}
									className="rounded-xl bg-muted px-4 py-2 text-xs font-bold text-foreground hover:bg-muted-fg/20 transition-colors cursor-pointer disabled:opacity-50"
								>
									{clearing === cache.key ? 'Clearing...' : cleared.has(cache.key) ? 'Cleared' : 'Clear'}
								</button>
							</div>
						))}
					</div>
				</section>

				{/* Database */}
				<section>
					<h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Database</h3>
					<div className="space-y-3">
						{/* Export */}
						<div className="flex items-center justify-between rounded-2xl bg-surface border border-border px-6 py-5">
							<div>
								<p className="text-sm font-semibold text-foreground">Export SQL</p>
								<p className="text-xs text-muted-fg mt-0.5">Download all data as .sql file with INSERT statements.</p>
							</div>
							<button
								type="button"
								disabled={dbBusy === 'export'}
								onClick={handleExport}
								className="rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white hover:opacity-90 transition-colors cursor-pointer disabled:opacity-50"
							>
								{dbBusy === 'export' ? 'Exporting...' : 'Export'}
							</button>
						</div>

						{/* Import */}
						<div className="flex items-center justify-between rounded-2xl bg-surface border border-border px-6 py-5">
							<div>
								<p className="text-sm font-semibold text-foreground">Import SQL</p>
								<p className="text-xs text-muted-fg mt-0.5">
									Execute SQL statements from a .sql file. Supports INSERT, UPDATE, DELETE.
								</p>
							</div>
							<input
								ref={importRef}
								type="file"
								accept=".sql"
								className="hidden"
								onChange={(e) => {
									if (e.target.files?.[0]) handleImport(e.target.files[0]);
									e.target.value = '';
								}}
							/>
							<button
								type="button"
								disabled={dbBusy === 'import'}
								onClick={() => importRef.current?.click()}
								className="rounded-xl bg-muted px-4 py-2 text-xs font-bold text-foreground hover:bg-muted-fg/20 transition-colors cursor-pointer disabled:opacity-50"
							>
								{dbBusy === 'import' ? 'Importing...' : 'Import .sql'}
							</button>
						</div>

						{/* Drop */}
						<div className="flex items-center justify-between rounded-2xl bg-danger/5 border border-danger/20 px-6 py-5">
							<div>
								<p className="text-sm font-semibold text-danger">Drop All Data</p>
								<p className="text-xs text-muted-fg mt-0.5">
									Permanently delete all services and categories. Irreversible.
								</p>
							</div>
							<button
								type="button"
								disabled={dbBusy === 'drop'}
								onClick={handleDrop}
								className="rounded-xl bg-danger px-4 py-2 text-xs font-bold text-white hover:opacity-90 transition-colors cursor-pointer disabled:opacity-50"
							>
								{dbBusy === 'drop' ? 'Dropping...' : 'Drop All'}
							</button>
						</div>
					</div>
				</section>
			</div>
		</>
	);
};

export default SettingsPage;
