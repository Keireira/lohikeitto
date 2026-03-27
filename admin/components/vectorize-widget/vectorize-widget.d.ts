export type Engine = 'potrace' | 'multicolor';
export type Tab = 'vector' | 'gradient';

export type GradientMode = 'linear' | 'radial';
export type GradientStop = { offset: number; color: string };
export type GradientData = {
	mode: string;
	angle_deg: number;
	stops: GradientStop[];
	svg_gradient: string;
	css_gradient: string;
};
