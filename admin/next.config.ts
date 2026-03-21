import type { NextConfig } from 'next';

const ADMIN_API = process.env.ADMIN_API_URL ?? 'http://localhost:1337';

const nextConfig: NextConfig = {
	reactCompiler: true,
	rewrites: async () => [
		{
			source: '/api/:path*',
			destination: `${ADMIN_API}/:path*`
		},
		{
			source: '/proxy-s3/:path*',
			destination: `${process.env.S3_BASE_URL ?? 'https://s3.uha.app'}/:path*`
		}
	]
};

export default nextConfig;
