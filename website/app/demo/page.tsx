import type { Metadata } from "next";

import { nexusScenario } from "@/data/scenarios/nexus";

import DemoApp from "./components/DemoApp";
import "./demo.css";

export const metadata: Metadata = {
  title: "Interactive demo · Breakout Workspace",
  description: "A simulated Zoom meeting running Breakout Workspace, with host and participant views.",
  openGraph: {
    type: "website",
    siteName: "Breakout Workspace",
    title: "Interactive demo · Breakout Workspace",
    description: "Host a breakout round in a simulated Zoom meeting, then join a room as a participant. About 2 minutes.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Interactive demo · Breakout Workspace",
    description: "Host a breakout round in a simulated Zoom meeting, then join a room as a participant. About 2 minutes.",
  },
};

export default function DemoPage() {
  return <DemoApp scenario={nexusScenario} />;
}
