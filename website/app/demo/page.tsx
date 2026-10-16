import type { Metadata } from "next";

import { nexusScenario } from "@/data/scenarios/nexus";

import DemoApp from "./components/DemoApp";
import "./demo.css";

export const metadata: Metadata = {
  title: "Interactive demo · Breakout Workspace",
  description: "A simulated Zoom meeting running Breakout Workspace, with host and participant views.",
};

export default function DemoPage() {
  return <DemoApp scenario={nexusScenario} />;
}
