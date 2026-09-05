import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Bricolage_Grotesque } from "next/font/google";
import localFont from "next/font/local";
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

const script = localFont({
  src: [
    {
      path: "./fonts/Parkinsans-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/Parkinsans-Medium.ttf",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/Parkinsans-SemiBold.ttf",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/Parkinsans-Bold.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-parkinsans",
});

export const metadata: Metadata = {
  title: "ScoutAI — AI Location Scouting",
  description:
    "Describe your scene. Get real, permit-checked filming locations researched by an AI agent, powered by Gemini and Parallel Search.",
};

// Without this, phones render the page at a virtual desktop-like width
// (~980px) and scale it down to fit the screen — this is why the app
// looked correct in Chrome DevTools' responsive mode (which fakes a
// device width directly) but broke on a real phone: content appeared
// cut off on the right and the layout looked shrunk/offset instead of
// filling the screen. viewportFit "cover" also lets the app draw
// behind the iOS notch/home-indicator safe areas when combined with
// the safe-area padding below.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#000000",
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