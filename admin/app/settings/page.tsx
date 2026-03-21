'use client';

import { useState } from 'react';
import TopBar from '@/components/top-bar';
import { clearImageCache } from '@/lib/image-cache';

const SettingsPage = () => {
	const [clearing, setClearing] = useState<string | null>(null);
	const [cleared, setCleared] = useState<Set<string>>(new Set());

	const handleClear = async (key: string, fn: () => Promise<void>) => {
		setClearing(key);
		await fn();
		setClearing(null);
		setCleared((prev) => new Set(prev).add(key));
		setTimeout(() => setCleared((prev) => { const n = new Set(prev); n.delete(key); return n; }), 2000);
	};

	const caches = [
		{
			key: 'logos',
			title: 'Logo Cache',
			description: 'Cached service logos and thumbnails stored in IndexedDB. Clear to re-fetch all logos from S3.',
			action: () => clearImageCache(),
		},
		{
			key: 'nextjs',
			title: 'Next.js Cache',
			description: 'Server-side data cache. Reload the page after clearing to fetch fresh data from the API.',
			action: async () => { window.location.reload(); },
		},
	];

	return (
		<>
			<TopBar title="Settings" subtitle="Cache management and preferences" />
			<div className="p-10 space-y-8">
				<section>
					<h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Cache</h3>
					<div className="space-y-3">
						{caches.map((cache) => (
							<div key={cache.key} className="flex items-center justify-between rounded-2xl bg-surface border border-border px-6 py-5">
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
			</div>
		</>
	);
};

export default SettingsPage;
