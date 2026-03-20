import type { Metadata } from "next";
import { Cormorant_Garamond, Bodoni_Moda, Plus_Jakarta_Sans } from "next/font/google";
import { SmoothScrollProvider } from "@/components/landing/smooth-scroll";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "600"],
  style: ["italic"],
  variable: "--font-cormorant",
  display: "swap",
});

const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  style: ["normal", "italic"],
  variable: "--font-bodoni",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://surgeweb.site";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Surge — AI-Powered Website Generation",
    template: "%s — Surge",
  },
  description:
    "Generate a stunning, production-ready website for any local business in 6 minutes. Powered by AI.",
  keywords: [
    "AI website generator",
    "website builder",
    "local business website",
    "AI-powered",
    "Next.js",
    "website generation",
  ],
  authors: [{ name: "Surge" }],
  openGraph: {
    type: "website",
    siteName: "Surge",
    title: "Surge — AI-Powered Website Generation",
    description:
      "Generate a stunning, production-ready website for any local business in 6 minutes. Powered by AI.",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Surge — AI-Powered Website Generation",
    description:
      "Generate a stunning, production-ready website for any local business in 6 minutes. Powered by AI.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${cormorant.variable} ${bodoni.variable} ${jakarta.variable} antialiased`}
      >
        <SmoothScrollProvider>
          {children}
          <Toaster position="bottom-right" richColors closeButton />
        </SmoothScrollProvider>
      </body>
    </html>
  );
}
