import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono, Montserrat } from "next/font/google";
import "./globals.css";
import SessionBoot from "@/components/sessionBoot";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin", "latin-ext"],
})

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Psiu!",
  description: "Chame o garçom ou peça a conta pela mesa",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${montserrat.variable} h-full antialiased`}
    >
      <body className="min-h-dvh flex flex-col">
        {/* usePathname exige Suspense para não bloquear o prerender */}
        <Suspense fallback={null}>
          <SessionBoot />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
