declare module 'imagetracerjs' {
	const ImageTracer: {
		imagedataToSVG: (imageData: ImageData, options?: Record<string, unknown>) => string;
		optionpresets: Record<string, Record<string, unknown>>;
	};
	export default ImageTracer;
}
