import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";

const display = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["SOFT", "opsz"], style: ["normal", "italic"] });
const sans = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Chalkline — change orders, signed and paid on site",
  description:
    "Say what changed in any language. Chalkline writes the change order, the homeowner signs on your phone, and PayPal pays you before you leave the house.",
};

export const viewport: Viewport = {
  themeColor: "#f2eee6",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
