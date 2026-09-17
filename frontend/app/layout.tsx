import type { Metadata } from "next";
import { Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Script from "next/script";

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

export const metadata: Metadata = {
  title: "Breakout Workspace",
  description: "Plan, launch and run Zoom breakout rooms from inside the meeting.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${hankenGrotesk.variable} ${plexMono.variable}`}>
      <body>
        {children}

        <Script
          src="https://appssdk.zoom.us/sdk.js"
          strategy="beforeInteractive"
        />
      </body>
    </html>
  );
}
