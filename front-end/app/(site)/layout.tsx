import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

const geist = localFont({
  variable: "--font-geist",
  display: "swap",
  src: [
    { path: "./fonts/geist-sans-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/geist-sans-latin-500-normal.woff2", weight: "500" },
    { path: "./fonts/geist-sans-latin-600-normal.woff2", weight: "600" },
    { path: "./fonts/geist-sans-latin-700-normal.woff2", weight: "700" },
  ],
});
const jakarta = localFont({
  variable: "--font-jakarta",
  display: "swap",
  src: [
    { path: "./fonts/plus-jakarta-sans-latin-600-normal.woff2", weight: "600" },
    { path: "./fonts/plus-jakarta-sans-latin-700-normal.woff2", weight: "700" },
    { path: "./fonts/plus-jakarta-sans-latin-800-normal.woff2", weight: "800" },
  ],
});
const inter = localFont({
  variable: "--font-inter",
  display: "swap",
  src: [
    { path: "./fonts/inter-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/inter-latin-500-normal.woff2", weight: "500" },
  ],
});

export const metadata: Metadata = {
  title: "Psiu — um toque na mesa",
  description: "Chame o garçom por aproximação, sem aplicativo.",
};
export const viewport: Viewport = { themeColor: "#07080b" };

// As variáveis das fontes ficam num wrapper para não mexer no <html> do app
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${geist.variable} ${jakarta.variable} ${inter.variable} w-full`}>
      {children}
    </div>
  );
}
