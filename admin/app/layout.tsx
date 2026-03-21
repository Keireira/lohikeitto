import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import DownloadWidget from '@/components/download-widget';
import Sidebar from '@/components/sidebar';
import './globals.css';

const geistSans = Geist({
	variable: '--font-geist-sans',
	subsets: ['latin']
});

const geistMono = Geist_Mono({
	variable: '--font-geist-mono',
	subsets: ['latin']
});

export const metadata: Metadata = {
	title: 'Lohikeitto Admin',
	description: 'Service catalog management'
};

const RootLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => (
	<html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
		<body className="min-h-screen bg-background text-foreground font-sans">
			<Sidebar />
			<main className="ml-16 min-h-screen">{children}</main>
			<DownloadWidget />
		</body>
	</html>
);

export default RootLayout;
