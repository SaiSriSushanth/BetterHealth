import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Albert_Sans } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/components/AppProvider";
import { Nav } from "@/components/Nav";
import { ReminderRunner } from "@/components/ReminderRunner";
import { PwaRegister } from "@/components/PwaRegister";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap", axes: ["opsz", "wdth"] });
const body = Albert_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "BetterHealth",
  description: "Train every muscle, log what you eat, and get a coach that reads your day.",
  applicationName: "BetterHealth",
  appleWebApp: { capable: true, title: "BetterHealth", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = { themeColor: "#F3F7F5", viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <AppProvider>
          <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-sun focus:p-3 focus:font-bold">Skip to content</a>
          <Nav />
          <main id="main" className="px-4 pb-32 pt-4 md:pl-32 md:pr-8 md:pb-16 md:pt-8">
            <div className="mx-auto max-w-5xl">
              {children}
              <p className="mt-14 text-sm text-muted">
                BetterHealth gives estimates, not medical advice. Talk to a doctor before big changes to your diet or training.
              </p>
            </div>
          </main>
          <ReminderRunner />
          <PwaRegister />
        </AppProvider>
      </body>
    </html>
  );
}
