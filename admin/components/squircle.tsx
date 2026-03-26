'use client';

import { useState } from 'react';

type SquircleProps = {
	size: number;
	color?: string;
	src?: string;
	fallback?: string;
	className?: string;
	onClick?: () => void;
	style?: React.CSSProperties;
};

const squirclePath = (s: number) =>
	`path("M ${s * 0.5} 0 C ${s * 0.8275} 0 ${s} ${s * 0.1725} ${s} ${s * 0.5} C ${s} ${s * 0.8275} ${s * 0.8275} ${s} ${s * 0.5} ${s} C ${s * 0.1725} ${s} 0 ${s * 0.8275} 0 ${s * 0.5} C 0 ${s * 0.1725} ${s * 0.1725} 0 ${s * 0.5} 0")`;

const Squircle = ({ size, color, src, fallback, className, onClick, style }: SquircleProps) => {
	const [imgOk, setImgOk] = useState(false);

	return (
		<div
			className={`relative shrink-0 overflow-hidden ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''} ${className ?? ''}`}
			style={{
				width: size,
				height: size,
				clipPath: squirclePath(size),
				backgroundColor: color ?? '#888',
				...style
			}}
			onClick={onClick}
		>
			{src && (
				<img
					src={src}
					alt=""
					className="absolute inset-0 w-full h-full object-cover"
					style={{ display: imgOk ? 'block' : 'none' }}
					onLoad={() => setImgOk(true)}
					onError={() => setImgOk(false)}
				/>
			)}
			{!imgOk && fallback && (
				<span
					className="absolute inset-0 flex items-center justify-center font-bold"
					style={{ fontSize: size * 0.4, color: style?.color ?? 'white' }}
				>
					{fallback}
				</span>
			)}
		</div>
	);
};

export default Squircle;
