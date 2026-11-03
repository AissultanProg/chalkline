import type { Metadata, Viewport } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sans = Archivo({ variable: "--font-archivo", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jbmono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SiteTab — change orders that get paid on site",
  description: "Speak the extra work. SiteTab writes the change order, the homeowner signs, PayPal gets you paid before you leave the house.",
};

export const viewport: Viewport = {
  themeColor: "#1c1a17",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
