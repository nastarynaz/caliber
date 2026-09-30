import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-ui-source'});

const geistMono = Geist_Mono({
  variable: "--font-code-source",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Chandra Asri Knowledge Hub", template: "%s · Chandra Asri Knowledge Hub" },
  description: "Chandra Asri equipment knowledge, technical evidence, and reviewed maintenance experience.",
  applicationName: "Chandra Asri Knowledge Hub",
  manifest: "/favicon/site.webmanifest?v=20260930",
  icons: {
    icon: [
      { url: "/favicon/favicon.ico?v=20260930", type: "image/x-icon", sizes: "any" },
      { url: "/favicon/favicon-16x16.png?v=20260930", type: "image/png", sizes: "16x16" },
      { url: "/favicon/favicon-32x32.png?v=20260930", type: "image/png", sizes: "32x32" },
      { url: "/favicon/android-chrome-192x192.png?v=20260930", type: "image/png", sizes: "192x192" },
      { url: "/favicon/android-chrome-512x512.png?v=20260930", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon/favicon.ico?v=20260930",
    apple: [{ url: "/favicon/apple-touch-icon.png?v=20260930", type: "image/png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = { themeColor: "#25407B" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistMono.variable, "font-sans", inter.variable)}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
