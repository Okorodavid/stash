import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { THEME_KEY } from "@/lib/themeKey";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stash on Arc",
  description: "USDC savings on Arc that a stolen key or seed phrase can't drain.",
  applicationName: "Stash",
  appleWebApp: { capable: true, title: "Stash", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

// Runs before first paint so a saved theme choice never flashes the other theme.
// Dark unless the visitor picked light with the toggle.
const themeBoot = `try{var t=localStorage.getItem("${THEME_KEY}");document.documentElement.dataset.theme=t==="light"?"light":"dark"}catch(e){document.documentElement.dataset.theme="dark"}`;

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0f0e" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme is set by the boot script before React hydrates.
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        {/* Sign-in starts by calling Privy; open the connection while the app code downloads. */}
        <link rel="preconnect" href="https://auth.privy.io" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://auth.privy.io" />
      </head>
      {/* Browser extensions (e.g. Grammarly) add attributes to <body>; ignore those hydration diffs. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
