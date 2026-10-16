import type { Metadata } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Same fonts as the app, so the copied globals.css tokens resolve.
const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const DESCRIPTION =
  "A Zoom App prototype: plan breakout rounds with AI, launch Zoom's rooms in one click and follow every room live. Try the interactive demo.";

// The shared-link card (LinkedIn, Slack, X). The image is app/opengraph-image.jpg; on Vercel,
// Next.js makes its URL absolute from the production domain, so no metadataBase is needed.
export const metadata: Metadata = {
  title: "Breakout Workspace",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Breakout Workspace",
    title: "Breakout Workspace · a Zoom App prototype",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Breakout Workspace · a Zoom App prototype",
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${hankenGrotesk.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
