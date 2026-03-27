import type { RefObject } from 'react';
import { useEffect } from 'react';

const useClickOutside = (ref: RefObject<HTMLElement | null>, onClose: () => void) => {
	useEffect(() => {
		const handleClick = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) onClose();
		};
		const handleEsc = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				onClose();
			}
		};
		document.addEventListener('mousedown', handleClick);
		document.addEventListener('keydown', handleEsc);
		return () => {
			document.removeEventListener('mousedown', handleClick);
			document.removeEventListener('keydown', handleEsc);
		};
	}, [ref, onClose]);
};

export default useClickOutside;
