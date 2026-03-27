import type { NextConfig } from 'next';

const ADMIN_API = process.env.ADMIN_API_URL ?? 'http://localhost:1337';

const nextConfig: NextConfig = {
	reactCompiler: true,
	turbopack: {
		resolveAlias: {
			fs: { browser: './empty-module.js' },
			path: { browser: './empty-module.js' },
			crypto: { browser: './empty-module.js' },
		},
	},
	rewrites: async () => [
		{
			source: '/api/:path*',
			destination: `${ADMIN_API}/:path*`
		}
	]
};

export default nextConfig;
