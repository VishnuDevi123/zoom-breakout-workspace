import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";

import DemoSection from "./landing/DemoSection";
import Faq from "./landing/Faq";
import Footer from "./landing/Footer";
import Hero from "./landing/Hero";
import HowItWorks from "./landing/HowItWorks";
import SiteHeader from "./landing/SiteHeader";
import "./landing/landing.css";

// Display serif for the hero's accent words only; everything else stays in the app's fonts.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Breakout Workspace",
};

/** Landing page, served at / and /home. */
export default function LandingPage() {
  return (
    <div className={`lp-page ${instrumentSerif.variable}`}>
      <div className="lp-backdrop" aria-hidden="true">
        <span className="lp-backdrop__blob lp-backdrop__blob--indigo" />
        <span className="lp-backdrop__blob lp-backdrop__blob--teal" />
        <span className="lp-backdrop__blob lp-backdrop__blob--amber" />
      </div>
      <SiteHeader />
      <main>
        <Hero />
        <DemoSection />
        <HowItWorks />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
