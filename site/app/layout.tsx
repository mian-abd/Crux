import type { Metadata, Viewport } from "next";
import { Gilda_Display, Google_Sans, Google_Sans_Code } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// Display: Gilda Display, a high-contrast serif (SIL OFL). Text: Google Sans, with its Greek
// subset so formulas render μ, α and π in the same face (SIL OFL). Numbers in tables: Google
// Sans Code (SIL OFL).
const display = Gilda_Display({ variable: "--font-display", subsets: ["latin"], weight: "400" });
const sans = Google_Sans({ variable: "--font-text", subsets: ["latin", "greek"] });
const mono = Google_Sans_Code({ variable: "--font-code", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Crux", template: "%s · Crux" },
  description:
    "Crux is a team of AI scientists that settles disagreements by running the most informative experiment instead of voting.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#171613" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow"
        >
          Skip to content
        </a>
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
