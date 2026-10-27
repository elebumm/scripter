import type { Metadata } from "next";
import localFont from "next/font/local";
import { Inter } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const cabinetGrotesk = localFont({
  src: [
    { path: "../../public/fonts/CabinetGrotesk-Medium.woff2", weight: "500" },
    { path: "../../public/fonts/CabinetGrotesk-Bold.woff2", weight: "700" },
  ],
  variable: "--font-cabinet",
  display: "swap",
});

const switzer = localFont({
  src: [
    { path: "../../public/fonts/Switzer-Regular.woff2", weight: "400" },
    { path: "../../public/fonts/Switzer-Medium.woff2", weight: "500" },
    { path: "../../public/fonts/Switzer-SemiBold.woff2", weight: "600" },
  ],
  variable: "--font-switzer",
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Zen Canvas",
  description: "AI-powered script writing sanctuary",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light">
      <body
        className={`${cabinetGrotesk.variable} ${switzer.variable} ${inter.variable} antialiased`}
      >
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
