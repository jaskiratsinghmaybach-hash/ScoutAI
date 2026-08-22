import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Bricolage_Grotesque, Parkinsans } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-display",
});

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600"],
});

const script = Parkinsans({
  subsets: ["latin"],
  variable: "--font-script",
  weight: ["400"],
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "ScoutAI — AI Location Scouting",
  description:
    "Describe your scene. Get real, permit-checked filming locations researched by an AI agent, powered by Gemini and Parallel Search.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${mono.variable} ${display.variable} ${script.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
