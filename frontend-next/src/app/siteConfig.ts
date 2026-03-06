export const siteConfig = {
    name: "Quang Anh",
    url: "https://stock.quanganh.org",
    description: "Nền tảng phân tích cổ phiếu Việt Nam: định giá DCF, P/E, P/B, heatmap thị trường, tin tức và dữ liệu tài chính theo thời gian thực.",
    baseLinks: {
        home: "/",
        overview: "/overview",
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
