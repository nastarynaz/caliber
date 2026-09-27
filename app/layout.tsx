import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-ui-source'});

const geistMono = Geist_Mono({
  variable: "--font-code-source",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Knowledge Hub · Manufacturing",
  description: "Equipment knowledge, technical evidence, and reviewed maintenance experience.",
};

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
