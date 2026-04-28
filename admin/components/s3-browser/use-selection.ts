'use client';

import { useEffect, useRef, useState } from 'react';
import type { Entry } from './s3-browser.d';

export type UseSelectionReturn = {
	selected: Set<string>;
	toggle: (idx: number, e: React.MouseEvent, fromCheckbox?: boolean) => void;
	selectAll: () => void;
	clear: () => void;
};

export const useSelection = (entries: Entry[]): UseSelectionReturn => {
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const lastClickRef = useRef<number | null>(null);

	const toggle = (idx: number, e: React.MouseEvent, fromCheckbox = false) => {
		const key = entries[idx].fullKey;

		if (e.shiftKey && lastClickRef.current !== null) {
			// Range select
			const from = Math.min(lastClickRef.current, idx);
			const to = Math.max(lastClickRef.current, idx);
			setSelected((prev) => {
				const next = new Set(prev);
				for (let i = from; i <= to; i++) {
					next.add(entries[i].fullKey);
				}
				return next;
			});
		} else if (fromCheckbox || e.metaKey || e.ctrlKey) {
			// Additive toggle
			setSelected((prev) => {
				const next = new Set(prev);
				if (next.has(key)) {
					next.delete(key);
				} else {
					next.add(key);
				}
				return next;
			});
		} else {
			// Single select
			setSelected(new Set([key]));
		}
		lastClickRef.current = idx;
	};

	const selectAll = () => {
		setSelected(new Set(entries.map((e) => e.fullKey)));
	};

	const clear = () => {
		setSelected(new Set());
		lastClickRef.current = null;
	};

	// Clear selection when entries change (navigation)
	useEffect(() => {
		setSelected((prev) => (prev.size === 0 ? prev : new Set()));
		lastClickRef.current = null;
	}, []);

	// Esc to clear selection
	useEffect(() => {
		if (selected.size === 0) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setSelected(new Set());
				lastClickRef.current = null;
			}
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, [selected.size]);

	return { selected, toggle, selectAll, clear };
};
