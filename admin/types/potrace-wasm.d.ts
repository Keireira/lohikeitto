declare module 'potrace-wasm' {
	export const loadFromCanvas: (canvas: HTMLCanvasElement) => Promise<string>;
}
