import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "ScoutAI — AI Location Scouting for Filmmakers",
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
      <body
        className={`${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable} bg-neutral-950 font-sans text-neutral-100 antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
