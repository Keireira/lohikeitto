'use client';

import { useState } from 'react';
import { API_URL } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { CategoryT, ServiceT } from '@/lib/types';

type AddServiceDialogProps = {
	categories?: CategoryT[];
	onClose: () => void;
	onCreated: (item: ServiceT) => void;
};

const AddServiceDialog = ({ categories, onClose, onCreated }: AddServiceDialogProps) => {
	const [name, setName] = useState('');
	const [domain, setDomain] = useState('');
	const [slug, setSlug] = useState('');
	const [color, setColor] = useState('#0053db');
	const [categorySlug, setCategorySlug] = useState('');
	const [saving, setSaving] = useState(false);

	const autoSlug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

	const handleSubmit = async () => {
		if (!name.trim() || !domain.trim() || saving) return;
		setSaving(true);
		try {
			const res = await fetch(`${API_URL}/services`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: name.trim(),
					slug: slug.trim() || autoSlug,
					domains: [domain.trim()],
					category_slug: categorySlug || null,
					colors: { primary: color },
					ref_link: null
				})
			});
			if (!res.ok) throw new Error(`${res.status}`);
			const created: ServiceT = await res.json();
			onCreated(created);
			onClose();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to create');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			<button
				type="button"
				aria-label="Close dialog"
				className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default"
				onClick={onClose}
			/>
			<div className="relative w-full max-w-md rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden">
				<div className="px-6 py-4 border-b border-border">
					<h3 className="text-base font-bold text-foreground">Add Service</h3>
					<p className="text-xs text-muted-fg mt-0.5">Create a new service in the catalogue</p>
				</div>

				<div className="px-6 py-5 space-y-4">
					{/* Name */}
					<div>
						<label htmlFor="add-service-name" className="text-xs font-medium text-muted-fg block mb-1.5">
							Name
						</label>
						<input
							id="add-service-name"
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Service name"
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent/50"
						/>
					</div>

					{/* Domain */}
					<div>
						<label htmlFor="add-service-domain" className="text-xs font-medium text-muted-fg block mb-1.5">
							Domain
						</label>
						<input
							id="add-service-domain"
							type="text"
							value={domain}
							onChange={(e) => setDomain(e.target.value)}
							placeholder="example.com"
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent/50"
						/>
					</div>

					{/* Slug */}
					<div>
						<label htmlFor="add-service-slug" className="text-xs font-medium text-muted-fg block mb-1.5">
							Slug
						</label>
						<input
							id="add-service-slug"
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
							<label htmlFor="add-service-category" className="text-xs font-medium text-muted-fg block mb-1.5">
								Category
							</label>
							<select
								id="add-service-category"
								value={categorySlug}
								onChange={(e) => setCategorySlug(e.target.value)}
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent/50 cursor-pointer"
							>
								<option value="">None</option>
								{categories?.map((c) => (
									<option key={c.slug} value={c.slug}>
										{c.title}
									</option>
								))}
							</select>
						</div>
						<div className="w-24">
							<label htmlFor="add-service-color" className="text-xs font-medium text-muted-fg block mb-1.5">
								Color
							</label>
							<div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5">
								<input
									id="add-service-color"
									type="color"
									value={color}
									onChange={(e) => setColor(e.target.value)}
									className="size-6 rounded cursor-pointer border-0 p-0"
								/>
								<span className="text-xs font-mono text-muted-fg">{color}</span>
							</div>
						</div>
					</div>
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
