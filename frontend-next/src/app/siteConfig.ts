export const siteConfig = {
    name: "Quang Anh",
    url: "https://vps-mx16.vercel.app",
    description: "Advanced stock analysis platform for Vietnam market.",
    baseLinks: {
        home: "/",
        market: "/market",
        about: "/about",
        changelog: "/changelog",
        pricing: "/pricing",
        imprint: "/imprint",
        privacy: "/privacy",
        terms: "/terms",
    },
    stockLogoUrl: (symbol: string) => `https://vietcap-documents.s3.ap-southeast-1.amazonaws.com/sentiment/logo/${symbol.toUpperCase()}.jpeg`,
}

export type siteConfig = typeof siteConfig
