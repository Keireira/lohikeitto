'use client';

import { useState } from 'react';
import { API_URL } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { CategoryT, ServiceT, LimbusT } from '@/lib/types';

type Mode = 'service' | 'limbus';

type AddServiceDialogProps = {
	mode: Mode;
	categories?: CategoryT[];
	onClose: () => void;
	onCreated: (item: ServiceT | LimbusT) => void;
};

const AddServiceDialog = ({ mode, categories, onClose, onCreated }: AddServiceDialogProps) => {
	const [name, setName] = useState('');
	const [domain, setDomain] = useState('');
	const [slug, setSlug] = useState('');
	const [color, setColor] = useState('#0053db');
	const [categoryId, setCategoryId] = useState('');
	const [source, setSource] = useState('admin');
	const [saving, setSaving] = useState(false);

	const autoSlug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

	const handleSubmit = async () => {
		if (!name.trim() || !domain.trim() || saving) return;
		setSaving(true);
		try {
			if (mode === 'service') {
				const res = await fetch(`${API_URL}/services`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: name.trim(),
						slug: slug.trim() || autoSlug,
						domains: [domain.trim()],
						category_id: categoryId || null,
						colors: { primary: color },
						ref_link: null
					})
				});
				if (!res.ok) throw new Error(`${res.status}`);
				const created: ServiceT = await res.json();
				onCreated(created);
			} else {
				const res = await fetch(`${API_URL}/limbus`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: name.trim(),
						domain: domain.trim(),
						logo_url: null,
						source: source.trim() || 'admin'
					})
				});
				if (!res.ok) throw new Error(`${res.status}`);
				const created: LimbusT = await res.json();
				onCreated(created);
			}
			onClose();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to create');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
			<div
				className="w-full max-w-md rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="px-6 py-4 border-b border-border">
					<h3 className="text-base font-bold text-foreground">
						{mode === 'service' ? 'Add Service' : 'Add to Limbus'}
					</h3>
					<p className="text-xs text-muted-fg mt-0.5">
						{mode === 'service' ? 'Create a new service in the catalogue' : 'Add an entry to the review queue'}
					</p>
				</div>

				<div className="px-6 py-5 space-y-4">
					{/* Name */}
					<div>
						<label className="text-xs font-medium text-muted-fg block mb-1.5">Name</label>
						<input
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Service name"
							autoFocus
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent/50"
						/>
					</div>

					{/* Domain */}
					<div>
						<label className="text-xs font-medium text-muted-fg block mb-1.5">Domain</label>
						<input
							type="text"
							value={domain}
							onChange={(e) => setDomain(e.target.value)}
							placeholder="example.com"
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent/50"
						/>
					</div>

					{mode === 'service' && (
						<>
							{/* Slug */}
							<div>
								<label className="text-xs font-medium text-muted-fg block mb-1.5">Slug</label>
								<input
									type="text"
									value={slug}
									onChange={(e) => setSlug(e.target.value)}
									placeholder={autoSlug || 'auto-generated'}
									className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent/50"
								/>
							</div>

							{/* Color + Category row */}
							<div className="flex gap-3">
								<div className="flex-1">
									<label className="text-xs font-medium text-muted-fg block mb-1.5">Category</label>
									<select
										value={categoryId}
										onChange={(e) => setCategoryId(e.target.value)}
										className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent/50 cursor-pointer"
									>
										<option value="">None</option>
										{categories?.map((c) => (
											<option key={c.id} value={c.id}>
												{c.title}
											</option>
										))}
									</select>
								</div>
								<div className="w-24">
									<label className="text-xs font-medium text-muted-fg block mb-1.5">Color</label>
									<div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5">
										<input
											type="color"
											value={color}
											onChange={(e) => setColor(e.target.value)}
											className="size-6 rounded cursor-pointer border-0 p-0"
										/>
										<span className="text-xs font-mono text-muted-fg">{color}</span>
									</div>
								</div>
							</div>
						</>
					)}

					{mode === 'limbus' && (
						<div>
							<label className="text-xs font-medium text-muted-fg block mb-1.5">Source</label>
							<input
								type="text"
								value={source}
								onChange={(e) => setSource(e.target.value)}
								placeholder="admin"
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent/50"
							/>
						</div>
					)}
				</div>

				<div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
					<button
						type="button"
						onClick={onClose}
						className="rounded-lg px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleSubmit}
						disabled={!name.trim() || !domain.trim() || saving}
						className="rounded-lg bg-accent px-5 py-2 text-sm font-bold text-white hover:opacity-90 transition-colors cursor-pointer disabled:opacity-50"
					>
						{saving ? 'Creating...' : 'Create'}
					</button>
				</div>
			</div>
		</div>
	);
};

export default AddServiceDialog;
