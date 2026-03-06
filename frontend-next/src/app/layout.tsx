import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/ui/Navbar";
import Footer from "@/components/ui/Footer";
import { ThemeProvider } from "next-themes";
import { TickerTape } from "@/components/TickerTape";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { siteConfig } from "@/app/siteConfig";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: false,
  variable: '--font-inter',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: "Quang Anh | Phân tích & Định giá Cổ phiếu Việt Nam",
    template: "%s | Quang Anh",
  },
  description: siteConfig.description,
  keywords: [
    "cổ phiếu", "chứng khoán việt nam", "vnindex", "định giá cổ phiếu",
    "dcf", "phân tích tài chính", "heatmap thị trường", "vn30",
    "stock valuation", "vietnam stock market", "financial analysis",
  ],
  authors: [{ name: "Quang Anh", url: siteConfig.url }],
  creator: "Quang Anh",
  publisher: "Quang Anh",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180' },
    shortcut: '/favicon.ico',
  },
  openGraph: {
    title: "Quang Anh | Phân tích & Định giá Cổ phiếu Việt Nam",
    description: siteConfig.description,
    url: siteConfig.url,
    siteName: "Quang Anh",
    type: "website",
    locale: "vi_VN",
  },
  twitter: {
    card: "summary_large_image",
    title: "Quang Anh | Phân tích Cổ phiếu Việt Nam",
    description: siteConfig.description,
    creator: "@quanganh",
  },
  alternates: {
    canonical: siteConfig.url,
  },
  verification: {
    google: "", // thêm Google Search Console verification token vào đây
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Quang Anh",
    "url": siteConfig.url,
    "description": siteConfig.description,
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": `${siteConfig.url}/stock/{search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0" />
        <link rel="manifest" href="/site.webmanifest" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${inter.className} ${inter.variable} min-h-screen scroll-auto antialiased selection:bg-indigo-100 selection:text-indigo-700 dark:bg-gray-950`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
        >
          <Navbar />
          <TickerTape />
          <ErrorBoundary>
            <main className="pt-[112px] md:pt-[140px] min-h-[calc(100vh-400px)]">{/* Adjusted padding for new TickerTape position */}
              {children}
            </main>
          </ErrorBoundary>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
