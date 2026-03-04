import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/ui/Navbar";
import Footer from "@/components/ui/Footer";
import { ThemeProvider } from "next-themes";
import { TickerTape } from "@/components/TickerTape";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: "Quang Anh - Stock Valuation & Market Insights",
  description: "Professional stock valuation tool with DCF, P/E, and P/B methods. Track the Vietnam stock market in real-time.",
  keywords: ["stock valuation", "Vietnam stock market", "vnindex", "dcf", "financial analysis"],
  authors: [{ name: "Quang Anh" }],
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180' },
  },
  openGraph: {
    title: "Quang Anh - Stock Valuation",
    description: "Stock valuation tool with DCF, P/E, and P/B methods",
    type: "website",
    locale: "en_US",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0" />
        <link rel="manifest" href="/site.webmanifest" />
      </head>
      <body className={`${inter.className} ${inter.variable} min-h-screen scroll-auto antialiased selection:bg-indigo-100 selection:text-indigo-700 dark:bg-gray-950`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
        >
          <Navbar />
          <TickerTape />
          <main className="pt-24 md:pt-32 min-h-[calc(100vh-400px)]">{/* pt-24 mobile (navbar64+ticker32) + pt-32 desktop (navbar80+ticker32+gap) */}
            {children}
          </main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
