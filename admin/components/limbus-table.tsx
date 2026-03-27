'use client';

import { useState } from 'react';
import AddServiceDialog from '@/components/add-service-dialog';
import Squircle from '@/components/squircle';
import { API_URL } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { LimbusT } from '@/lib/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatDate = (iso: string): string => {
	const d = new Date(iso);
	const day = String(d.getDate()).padStart(2, '0');
	const mon = MONTHS[d.getMonth()];
	const year = d.getFullYear();
	const time = d.toTimeString().slice(0, 5);
	return `${day} ${mon} ${year}, ${time}`;
};

const SourceBadge = ({ source }: { source: string }) => {
	const colors: Record<string, string> = {
		brandfetch: 'bg-blue-500/10 text-blue-500',
		'logo.dev': 'bg-purple-500/10 text-purple-500',
		discovered: 'bg-amber-500/10 text-amber-500'
	};
	return (
		<span className={`rounded-lg px-2.5 py-1 text-xs font-medium ${colors[source] ?? 'bg-muted text-muted-fg'}`}>
			{source}
		</span>
	);
};

const LimbusTable = ({ data: initialData }: { data: LimbusT[] }) => {
	const [data, setData] = useState(initialData);
	const [search, setSearch] = useState('');
	const [approving, setApproving] = useState<string | null>(null);
	const [showAddDialog, setShowAddDialog] = useState(false);

	const filtered = search
		? data.filter(
				(e) =>
					e.name.toLowerCase().includes(search.toLowerCase()) || e.domain.toLowerCase().includes(search.toLowerCase())
			)
		: data;

	const handleReject = async (id: string) => {
		if (!window.confirm('Reject and remove this entry?')) return;
		try {
			const res = await fetch(`${API_URL}/limbus/${id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error(`Failed: ${res.status}`);
			setData((prev) => prev.filter((e) => e.id !== id));
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Reject failed');
		}
	};

	const handleApprove = async (entry: LimbusT) => {
		const slug = window.prompt('Slug for this service:', entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
		if (!slug) return;

		setApproving(entry.id);
		try {
			const res = await fetch(`${API_URL}/limbus/${entry.id}/approve`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					slug,
					category_id: null,
					colors: { primary: '#888888' }
				})
			});
			if (!res.ok) throw new Error(`Failed: ${res.status}`);
			setData((prev) => prev.filter((e) => e.id !== entry.id));
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Approve failed');
		} finally {
			setApproving(null);
		}
	};

	return (
		<div className="space-y-5">
			<div className="flex items-center justify-between">
				<input
					type="text"
					placeholder="Search limbus..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="rounded-xl bg-muted px-4 py-2.5 text-sm placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-accent/50 w-64"
				/>
				<span className="text-xs text-muted-fg">{filtered.length} entries</span>
				<button
					type="button"
					onClick={() => setShowAddDialog(true)}
					className="rounded-xl bg-accent px-4 py-2.5 text-xs font-bold text-white hover:opacity-90 transition-colors cursor-pointer"
				>
					+ Add to Limbus
				</button>
			</div>

			<div className="rounded-2xl bg-surface border border-border overflow-hidden">
				<table className="w-full">
					<thead>
						<tr className="bg-muted/30 text-left">
							<th className="px-8 py-5 text-[11px] font-bold text-muted-fg tracking-wider uppercase">Service</th>
							<th className="px-8 py-5 text-[11px] font-bold text-muted-fg tracking-wider uppercase">Domain</th>
							<th className="px-8 py-5 text-[11px] font-bold text-muted-fg tracking-wider uppercase">Source</th>
							<th className="px-8 py-5 text-[11px] font-bold text-muted-fg tracking-wider uppercase">Discovered</th>
							<th className="px-8 py-5 text-[11px] font-bold text-muted-fg tracking-wider uppercase text-right">
								Actions
							</th>
						</tr>
					</thead>
					<tbody>
						{filtered.length === 0 && (
							<tr>
								<td colSpan={5} className="px-8 py-16 text-center text-muted-fg">
									{data.length === 0 ? 'Limbus is empty — no pending services' : 'No matches'}
								</td>
							</tr>
						)}
						{filtered.map((entry) => (
							<tr key={entry.id} className="border-t border-border hover:bg-muted/30 transition-colors">
								<td className="px-8 py-5">
									<div className="flex items-center gap-4">
										<Squircle
											size={40}
											color="#e8eff3"
											src={entry.logo_url ?? undefined}
											fallback={!entry.logo_url ? entry.name.charAt(0).toUpperCase() : undefined}
											style={{ color: '#566166' }}
										/>
										<p className="font-semibold text-foreground">{entry.name}</p>
									</div>
								</td>
								<td className="px-8 py-5">
									<a
										href={`https://${entry.domain}`}
										target="_blank"
										rel="noopener noreferrer"
										className="text-sm text-accent hover:underline"
									>
										{entry.domain}
									</a>
								</td>
								<td className="px-8 py-5">
									<SourceBadge source={entry.source} />
								</td>
								<td className="px-8 py-5 text-sm text-muted-fg">{formatDate(entry.created_at)}</td>
								<td className="px-8 py-5">
									<div className="flex items-center justify-end gap-2">
										<button
											type="button"
											onClick={() => handleApprove(entry)}
											disabled={approving === entry.id}
											className="rounded-lg bg-success/10 px-3 py-1.5 text-xs font-bold text-success hover:bg-success/20 transition-colors cursor-pointer disabled:opacity-50"
										>
											{approving === entry.id ? '...' : 'Approve'}
										</button>
										<button
											type="button"
											onClick={() => handleReject(entry.id)}
											className="rounded-lg bg-danger/10 px-3 py-1.5 text-xs font-bold text-danger hover:bg-danger/20 transition-colors cursor-pointer"
										>
											Reject
										</button>
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{showAddDialog && (
				<AddServiceDialog
					mode="limbus"
					onClose={() => setShowAddDialog(false)}
					onCreated={(item) => setData((prev) => [item as LimbusT, ...prev])}
				/>
			)}
		</div>
	);
};

export default LimbusTable;
