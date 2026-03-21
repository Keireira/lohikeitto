import { create } from 'zustand';

type Toast = {
	id: number;
	message: string;
	type: 'error' | 'success' | 'info';
};

type ToastStore = {
	toasts: Toast[];
	add: (message: string, type?: Toast['type']) => void;
	remove: (id: number) => void;
};

let nextId = 0;

const useToastStore = create<ToastStore>((set) => ({
	toasts: [],
	add: (message, type = 'error') => {
		const id = nextId++;
		set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
		setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4000);
	},
	remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

const toast = {
	error: (msg: string) => useToastStore.getState().add(msg, 'error'),
	success: (msg: string) => useToastStore.getState().add(msg, 'success'),
	info: (msg: string) => useToastStore.getState().add(msg, 'info'),
};

export { useToastStore, toast };
