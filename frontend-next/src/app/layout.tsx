import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/ui/Navbar";
import Footer from "@/components/ui/Footer";
import { ThemeProvider } from "next-themes";

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
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className={`${inter.className} ${inter.variable} min-h-screen scroll-auto antialiased selection:bg-indigo-100 selection:text-indigo-700 dark:bg-gray-950`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
        >
          <Navbar />
          <main className="pt-20 min-h-[calc(100vh-400px)]">{/* Add padding top for fixed header and min-height */}
            {children}
          </main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
