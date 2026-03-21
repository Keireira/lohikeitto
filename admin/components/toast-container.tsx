'use client';

import { useToastStore } from '@/lib/toast';

const ToastContainer = () => {
	const toasts = useToastStore((s) => s.toasts);
	const remove = useToastStore((s) => s.remove);

	if (toasts.length === 0) return null;

	const colors = {
		error: 'bg-danger/10 border-danger/20 text-danger',
		success: 'bg-success/10 border-success/20 text-success',
		info: 'bg-accent/10 border-accent/20 text-accent',
	};

	return (
		<div className="fixed top-20 right-6 z-[60] space-y-2 w-80">
			{toasts.map((t) => (
				<div
					key={t.id}
					className={`rounded-xl border px-4 py-3 text-sm font-medium shadow-lg flex items-center gap-3 animate-[fadeIn_0.15s] ${colors[t.type]}`}
				>
					<span className="flex-1">{t.message}</span>
					<button type="button" onClick={() => remove(t.id)} className="opacity-50 hover:opacity-100 cursor-pointer text-xs">{'✕'}</button>
				</div>
			))}
		</div>
	);
};

export default ToastContainer;
