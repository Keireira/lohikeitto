import type { CategoryT, ServiceT } from '@/lib/types';

export type Props = {
	service?: ServiceT;
	categories: CategoryT[];
	prefillSlug?: string;
	onClose: () => void;
	onUpdate: (updated: ServiceT) => void;
	onDelete?: (id: string) => void;
};

export const EMPTY_SERVICE: ServiceT;
