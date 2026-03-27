'use client';

import { useEffect, useRef, useState } from 'react';
import ServiceIcon from '@/components/service-icon';
import { API_URL } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { CategoryT, ServiceT } from '@/lib/types';

const ActionMenu = ({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) => {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	}, [open]);

	return (
		<div ref={ref} className="relative">
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					setOpen((v) => !v);
				}}
				className="size-7 flex items-center justify-center rounded-lg text-muted-fg hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
			>
				{'⋮'}
			</button>
			{open && (
				<div className="absolute right-0 top-full mt-1 bg-surface rounded-xl border border-border shadow-xl z-20 py-1 min-w-[120px]">
					<button
						type="button"
						onClick={() => {
							onRename();
							setOpen(false);
						}}
						className="w-full text-left px-4 py-2 text-sm hover:bg-muted transition-colors cursor-pointer"
					>
						Rename
					</button>
					<button
						type="button"
						onClick={() => {
							onDelete();
							setOpen(false);
						}}
						className="w-full text-left px-4 py-2 text-sm text-danger hover:bg-danger/5 transition-colors cursor-pointer"
					>
						Delete
					</button>
				</div>
			)}
		</div>
	);
};

const CategoriesManager = ({
	categories: initialCategories,
	services: initialServices
}: {
	categories: CategoryT[];
	services: ServiceT[];
}) => {
	const [categories, setCategories] = useState(initialCategories);
	const [services] = useState(initialServices);
	const [selectedId, setSelectedId] = useState<string | null>(categories[0]?.id ?? null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editTitle, setEditTitle] = useState('');
	const [newTitle, setNewTitle] = useState('');
	const [addingNew, setAddingNew] = useState(false);
	const [saving, setSaving] = useState(false);

	const servicesByCategory = (() => {
		const map = new Map<string, ServiceT[]>();
		for (const s of services) {
			if (s.category) {
				const list = map.get(s.category.id) ?? [];
				list.push(s);
				map.set(s.category.id, list);
			}
		}
		return map;
	})();

	const uncategorized = services.filter((s) => !s.category);
	const selectedCat = categories.find((c) => c.id === selectedId) ?? null;
	const selectedServices =
		selectedId === '__uncategorized' ? uncategorized : selectedId ? (servicesByCategory.get(selectedId) ?? []) : [];

	const handleCreate = async () => {
		const title = newTitle.trim();
		if (!title || saving) return;
		setSaving(true);
		try {
			const res = await fetch(`${API_URL}/categories`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title })
			});
			if (!res.ok) throw new Error(`${res.status}`);
			const created: CategoryT = await res.json();
			setCategories((prev) => [...prev, created].sort((a, b) => a.title.localeCompare(b.title)));
			setNewTitle('');
			setAddingNew(false);
			setSelectedId(created.id);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to create');
		} finally {
			setSaving(false);
		}
	};

	const handleRename = async (id: string) => {
		const title = editTitle.trim();
		if (!title || saving) return;
		setSaving(true);
		try {
			const res = await fetch(`${API_URL}/categories/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title })
			});
			if (!res.ok) throw new Error(`${res.status}`);
			setCategories((prev) =>
				prev.map((c) => (c.id === id ? { ...c, title } : c)).sort((a, b) => a.title.localeCompare(b.title))
			);
			setEditingId(null);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to rename');
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async (id: string, title: string) => {
		const count = servicesByCategory.get(id)?.length ?? 0;
		const msg =
			count > 0
				? `Delete "${title}"? ${count} service${count > 1 ? 's' : ''} will be uncategorized.`
				: `Delete "${title}"?`;
		if (!window.confirm(msg)) return;
		setSaving(true);
		try {
			const res = await fetch(`${API_URL}/categories/${id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error(`${res.status}`);
			setCategories((prev) => prev.filter((c) => c.id !== id));
			if (selectedId === id) setSelectedId(categories.find((c) => c.id !== id)?.id ?? null);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to delete');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="flex gap-5 items-start">
			{/* Left panel — category list */}
			<div className="w-72 shrink-0 rounded-2xl bg-surface border border-border overflow-hidden">
				<div className="flex items-center justify-between px-4 py-3 border-b border-border">
					<span className="text-xs font-bold text-foreground">{categories.length} Categories</span>
					<button
						type="button"
						onClick={() => {
							setAddingNew(true);
							setNewTitle('');
						}}
						className="rounded-lg bg-accent px-3 py-1.5 text-[11px] font-bold text-white hover:opacity-90 transition-colors cursor-pointer"
					>
						Add
					</button>
				</div>

				{addingNew && (
					<div className="px-3 py-2.5 border-b border-border bg-muted/30">
						<input
							type="text"
							placeholder="Category name..."
							value={newTitle}
							onChange={(e) => setNewTitle(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') handleCreate();
								if (e.key === 'Escape') setAddingNew(false);
							}}
							autoFocus
							className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent/50"
						/>
					</div>
				)}

				<div className="max-h-[calc(100vh-220px)] overflow-y-auto">
					{categories.map((cat) => {
						const count = servicesByCategory.get(cat.id)?.length ?? 0;
						const active = selectedId === cat.id;

						return (
							<button
								key={cat.id}
								type="button"
								onClick={() => setSelectedId(cat.id)}
								className={`w-full text-left flex items-center gap-2 px-4 py-3 border-b border-border transition-colors cursor-pointer ${
									active ? 'bg-accent/5 border-l-[3px] border-l-accent' : 'hover:bg-muted/50'
								}`}
							>
								<div className="flex-1 min-w-0">
									<p className={`text-sm truncate ${active ? 'font-semibold text-foreground' : 'text-foreground'}`}>
										{cat.title}
									</p>
									<p className="text-[11px] text-muted-fg">
										{count} service{count !== 1 ? 's' : ''}
									</p>
								</div>
							</button>
						);
					})}

					{uncategorized.length > 0 && (
						<button
							type="button"
							onClick={() => setSelectedId('__uncategorized')}
							className={`w-full text-left flex items-center gap-2 px-4 py-3 transition-colors cursor-pointer ${
								selectedId === '__uncategorized' ? 'bg-accent/5 border-l-[3px] border-l-accent' : 'hover:bg-muted/50'
							}`}
						>
							<div className="flex-1 min-w-0">
								<p className="text-sm truncate text-muted-fg">Uncategorized</p>
								<p className="text-[11px] text-muted-fg">
									{uncategorized.length} service{uncategorized.length !== 1 ? 's' : ''}
								</p>
							</div>
						</button>
					)}
				</div>
			</div>

			{/* Right panel */}
			<div className="flex-1 min-w-0 rounded-2xl bg-surface border border-border overflow-hidden">
				{selectedCat || selectedId === '__uncategorized' ? (
					<>
						<div className="px-6 py-4 border-b border-border flex items-center justify-between">
							{editingId === selectedId && selectedCat ? (
								<div className="flex items-center gap-3 flex-1">
									<input
										type="text"
										value={editTitle}
										onChange={(e) => setEditTitle(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === 'Enter') handleRename(selectedCat.id);
											if (e.key === 'Escape') setEditingId(null);
										}}
										autoFocus
										className="rounded-lg border border-accent bg-background px-3 py-1 text-base font-bold focus:outline-none flex-1 max-w-sm"
									/>
									<button
										type="button"
										onClick={() => handleRename(selectedCat.id)}
										disabled={saving}
										className="text-xs text-accent font-medium cursor-pointer"
									>
										Save
									</button>
									<button
										type="button"
										onClick={() => setEditingId(null)}
										className="text-xs text-muted-fg cursor-pointer"
									>
										Cancel
									</button>
								</div>
							) : (
								<>
									<div>
										<h3 className="text-base font-bold text-foreground">
											{selectedId === '__uncategorized' ? 'Uncategorized' : selectedCat?.title}
										</h3>
										<p className="text-[11px] text-muted-fg">
											{selectedServices.length} service{selectedServices.length !== 1 ? 's' : ''}
										</p>
									</div>
									{selectedCat && (
										<ActionMenu
											onRename={() => {
												setEditingId(selectedCat.id);
												setEditTitle(selectedCat.title);
											}}
											onDelete={() => handleDelete(selectedCat.id, selectedCat.title)}
										/>
									)}
								</>
							)}
						</div>

						<div className="max-h-[calc(100vh-260px)] overflow-y-auto">
							{selectedServices.length === 0 ? (
								<div className="px-6 py-16 text-center text-muted-fg text-sm">No services in this category</div>
							) : (
								selectedServices.map((s) => (
									<div
										key={s.id}
										className="flex items-center gap-3 px-6 py-2.5 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
									>
										<ServiceIcon src={s.logo_url} name={s.name} color={s.colors.primary} size={28} />
										<span className="text-sm font-medium text-foreground flex-1 truncate">{s.name}</span>
										{s.verified ? (
											<span className="size-2 rounded-full bg-success shrink-0" title="Verified" />
										) : (
											<span className="size-2 rounded-full bg-muted-fg/30 shrink-0" title="Unverified" />
										)}
										<span className="text-xs text-muted-fg font-mono shrink-0">{s.domains[0]}</span>
									</div>
								))
							)}
						</div>
					</>
				) : (
					<div className="px-6 py-24 text-center text-muted-fg text-sm">Select a category</div>
				)}
			</div>
		</div>
	);
};

export default CategoriesManager;
