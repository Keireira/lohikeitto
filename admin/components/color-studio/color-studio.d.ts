export type Sample = { color: string; x: number; y: number; excluded: boolean };

export type Props = {
	color: string;
	originalColor: string;
	logoUrl: string;
	logoOk: boolean;
	name: string;
	onChange: (hex: string) => void;
	onClose: () => void;
};

export const LOUPE_SIZE = 130;
export const LOUPE_GRID = 13;
export const LOUPE_PX: number;
export const GRAB_RADIUS = 0.04;
