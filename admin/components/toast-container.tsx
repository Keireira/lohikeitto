'use client';

import { useToastStore } from '@/lib/toast';

const icons = {
	error: (
		<svg className="size-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
			<path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
		</svg>
	),
	success: (
		<svg className="size-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
			<path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
		</svg>
	),
	info: (
		<svg className="size-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
			<path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
		</svg>
	),
};

const styles = {
	error: { bg: 'bg-[#1a1a1a]', icon: 'text-red-400', text: 'text-white', bar: 'bg-red-500' },
	success: { bg: 'bg-[#1a1a1a]', icon: 'text-emerald-400', text: 'text-white', bar: 'bg-emerald-500' },
	info: { bg: 'bg-[#1a1a1a]', icon: 'text-blue-400', text: 'text-white', bar: 'bg-blue-500' },
};

const ToastContainer = () => {
	const toasts = useToastStore((s) => s.toasts);
	const remove = useToastStore((s) => s.remove);

	if (toasts.length === 0) return null;

	return (
		<div className="fixed bottom-6 right-6 z-[9999] space-y-2.5 w-96">
			{toasts.map((t) => {
				const s = styles[t.type];
				return (
					<div
						key={t.id}
						className={`${s.bg} rounded-2xl shadow-2xl overflow-hidden animate-[slideUp_0.2s_ease-out]`}
					>
						<div className="flex items-start gap-3 px-4 py-3.5">
							<span className={s.icon}>{icons[t.type]}</span>
							<p className={`${s.text} text-sm font-medium flex-1 leading-snug`}>{t.message}</p>
							<button
								type="button"
								onClick={() => remove(t.id)}
								className="text-white/30 hover:text-white/70 cursor-pointer transition-colors mt-0.5 text-sm"
							>
								{'✕'}
							</button>
						</div>
						<div className={`h-0.5 ${s.bar} animate-[shrink_4s_linear_forwards]`} />
					</div>
				);
			})}
		</div>
	);
};

export default ToastContainer;
