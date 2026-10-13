import type { Metadata } from "next";
import { Geist, IBM_Plex_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });

export const metadata: Metadata = {
	title: "Palace",
	description: "A calm, Markdown-first space for your notes.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="en" className={`${geist.variable} ${plexMono.variable} ${jetbrainsMono.variable}`}>
			<body>{children}</body>
		</html>
	);
}
