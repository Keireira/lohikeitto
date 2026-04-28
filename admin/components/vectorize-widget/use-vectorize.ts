'use client';

import { type Dispatch, type RefObject, type SetStateAction, useRef, useState } from 'react';
import { API_URL } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { Engine, GradientData, GradientMode } from './vectorize-widget.d';

export type UseVectorizeReturn = {
	svgString: string | null;
	tracing: boolean;
	engine: Engine;
	setEngine: Dispatch<SetStateAction<Engine>>;
	threshold: number;
	setThreshold: Dispatch<SetStateAction<number>>;
	invert: boolean;
	setInvert: Dispatch<SetStateAction<boolean>>;
	colors: number;
	setColors: Dispatch<SetStateAction<number>>;
	gradient: GradientData | null;
	gradientLoading: boolean;
	gradMode: GradientMode;
	setGradMode: Dispatch<SetStateAction<GradientMode>>;
	gradTarget: 'bg' | 'logo';
	setGradTarget: Dispatch<SetStateAction<'bg' | 'logo'>>;
	gradStops: number;
	setGradStops: Dispatch<SetStateAction<number>>;
	canvasRef: RefObject<HTMLCanvasElement | null>;
	trace: () => Promise<void>;
	downloadSvg: () => void;
	copySvg: () => void;
	fetchGradient: () => Promise<void>;
};

export const useVectorize = ({ blobUrl, slug }: { blobUrl: string; slug: string }): UseVectorizeReturn => {
	const [svgString, setSvgString] = useState<string | null>(null);
	const [tracing, setTracing] = useState(false);
	const [engine, setEngine] = useState<Engine>('potrace');
	const [threshold, setThreshold] = useState(128);
	const [invert, setInvert] = useState(false);
	const [colors, setColors] = useState(4);
	const [gradient, setGradient] = useState<GradientData | null>(null);
	const [gradientLoading, setGradientLoading] = useState(false);
	const [gradMode, setGradMode] = useState<GradientMode>('linear');
	const [gradTarget, setGradTarget] = useState<'bg' | 'logo'>('bg');
	const [gradStops, setGradStops] = useState(0); // 0 = auto
	const canvasRef = useRef<HTMLCanvasElement>(null);

	const tracePotrace = async () => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new Error('Failed to load image'));
			img.src = blobUrl;
		});
		const canvas = canvasRef.current!;
		const MAX_DIM = 2048;
		const scale = Math.min(MAX_DIM / img.naturalWidth, MAX_DIM / img.naturalHeight, 6);
		canvas.width = Math.round(img.naturalWidth * scale);
		canvas.height = Math.round(img.naturalHeight * scale);
		const ctx = canvas.getContext('2d')!;
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
		const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
		const d = imageData.data;
		for (let i = 0; i < d.length; i += 4) {
			const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
			const bw = invert ? (lum >= threshold ? 0 : 255) : lum < threshold ? 0 : 255;
			d[i] = bw;
			d[i + 1] = bw;
			d[i + 2] = bw;
			d[i + 3] = 255;
		}
		ctx.putImageData(imageData, 0, 0);
		const { loadFromCanvas } = await import('potrace-wasm');
		let svg: string = await loadFromCanvas(canvas);
		svg = svg.replace(
			/(<svg[^>]*?)(\s+width="\d+")(\s+height="\d+")/,
			(_m, pre) => `${pre} viewBox="0 0 ${canvas.width} ${canvas.height}"`
		);
		return svg;
	};

	const traceMulticolor = async () => {
		const res = await fetch(`${API_URL}/logos/vectorize`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ slug, colors })
		});
		if (!res.ok) throw new Error(`Server: ${res.status}`);
		return await res.text();
	};

	const trace = async () => {
		setTracing(true);
		setSvgString(null);
		try {
			const svg = engine === 'potrace' ? await tracePotrace() : await traceMulticolor();
			setSvgString(svg);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Vectorization failed');
		} finally {
			setTracing(false);
		}
	};

	const downloadSvg = () => {
		if (!svgString) return;
		const blob = new Blob([svgString], { type: 'image/svg+xml' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${slug}.svg`;
		a.click();
		URL.revokeObjectURL(url);
	};

	const copySvg = () => {
		if (!svgString) return;
		navigator.clipboard.writeText(svgString);
		toast.success('SVG copied');
	};

	const fetchGradient = async () => {
		setGradientLoading(true);
		try {
			const res = await fetch(blobUrl);
			const imgBlob = await res.blob();
			const gradRes = await fetch(
				`${API_URL}/logos/gradient?stops=${gradStops}&mode=${gradMode}&target=${gradTarget}`,
				{
					method: 'POST',
					body: imgBlob
				}
			);
			if (!gradRes.ok) throw new Error(`${gradRes.status}`);
			const data: GradientData = await gradRes.json();
			setGradient(data);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Gradient extraction failed');
		} finally {
			setGradientLoading(false);
		}
	};

	return {
		svgString,
		tracing,
		engine,
		setEngine,
		threshold,
		setThreshold,
		invert,
		setInvert,
		colors,
		setColors,
		gradient,
		gradientLoading,
		gradMode,
		setGradMode,
		gradTarget,
		setGradTarget,
		gradStops,
		setGradStops,
		canvasRef,
		trace,
		downloadSvg,
		copySvg,
		fetchGradient
	};
};
