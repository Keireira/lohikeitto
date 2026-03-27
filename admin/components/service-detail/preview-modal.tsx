'use client';

import { useEffect } from 'react';
import Squircle from '@/components/squircle';
import { contrastText } from '@/lib/color';

const PreviewModal = ({
	color,
	logoOk,
	proxiedLogo,
	name,
	onClose
}: {
	color: string;
	logoOk: boolean;
	proxiedLogo: string;
	name: string;
	onClose: () => void;
}) => {
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopImmediatePropagation();
				onClose();
			}
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, [onClose]);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
			<div className="relative rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
				<div className="w-[480px] h-[480px] flex items-center justify-center" style={{ backgroundColor: color }}>
					<Squircle
						size={200}
						color="transparent"
						src={logoOk ? proxiedLogo : undefined}
						fallback={!logoOk ? name.charAt(0).toUpperCase() : undefined}
						style={{ color: contrastText(color), fontSize: '5rem' }}
					/>
				</div>
				<div className="absolute bottom-4 left-0 right-0 flex justify-center">
					<span
						className="rounded-full px-4 py-1.5 text-sm font-mono font-medium backdrop-blur-md"
						style={{ backgroundColor: `${contrastText(color)}20`, color: contrastText(color) }}
					>
						{color}
					</span>
				</div>
				<button
					type="button"
					onClick={onClose}
					className="absolute top-3 right-3 size-8 rounded-lg flex items-center justify-center text-sm cursor-pointer"
					style={{ backgroundColor: `${contrastText(color)}20`, color: contrastText(color) }}
				>
					{'✕'}
				</button>
			</div>
		</div>
	);
};

export default PreviewModal;
