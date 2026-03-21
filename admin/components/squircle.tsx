'use client';

import { useEffect, useId, useState } from 'react';

type SquircleProps = {
	size: number;
	color?: string;
	src?: string;
	fallback?: string;
	className?: string;
	onClick?: () => void;
	style?: React.CSSProperties;
};

const Squircle = ({ size, color, src, fallback, className, onClick, style }: SquircleProps) => {
	const [imgOk, setImgOk] = useState(false);

	useEffect(() => {
		if (!src) { setImgOk(false); return; }
		const img = new Image();
		img.onload = () => setImgOk(true);
		img.onerror = () => setImgOk(false);
		img.src = src;
	}, [src]);

	const id = useId();

	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 1 1"
			className={`shrink-0 ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''} ${className ?? ''}`}
			onClick={onClick}
			style={style}
		>
			<defs>
				<clipPath id={id}>
					<path d="M 0.5 0 C 0.8275 0, 1 0.1725, 1 0.5 C 1 0.8275, 0.8275 1, 0.5 1 C 0.1725 1, 0 0.8275, 0 0.5 C 0 0.1725, 0.1725 0, 0.5 0" />
				</clipPath>
			</defs>
			<g clipPath={`url(#${id})`}>
				<rect width="1" height="1" fill={color ?? '#888'} />
				{imgOk && src && (
					<image href={src} width="1" height="1" preserveAspectRatio="xMidYMid slice" />
				)}
				{!imgOk && fallback && (
					<text x="0.5" y="0.5" textAnchor="middle" dominantBaseline="central" fill="currentColor" fontSize="0.4" fontWeight="bold">
						{fallback}
					</text>
				)}
			</g>
		</svg>
	);
};

export default Squircle;
