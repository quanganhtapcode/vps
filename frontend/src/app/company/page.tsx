import styles from './company.module.css';

export const metadata = {
    title: 'Company Directory - Quang Anh',
    description: 'Explore and analyze companies listed on the Vietnam Stock Exchange',
};

export default function CompanyPage() {
    return (
        <div className={styles.container}>
            <h1 className={styles.title}>🏢 Company Directory</h1>
            <p className={styles.subtitle}>
                Detailed insights and analysis for companies listed on HOSE, HNX, and UPCOM
            </p>

            <div className={styles.searchSection}>
                <div className={styles.searchBox}>
                    <input
                        type="text"
                        placeholder="Enter stock symbol or company name..."
                        className={styles.searchInput}
                    />
                    <button className={styles.searchButton}>Search</button>
                </div>
            </div>

            <div className={styles.comingSoon}>
                <div className={styles.icon}>🚧</div>
                <h2>Under Development</h2>
                <p>We are currently building an advanced company directory with powerful features:</p>
                <ul className={styles.featureList}>
                    <li>📊 Peer comparison by industry</li>
                    <li>📈 Historical financial charts</li>
                    <li>🔍 Advanced screening by sector, exchange, and market cap</li>
                    <li>⭐ Personal watchlist integration</li>
                </ul>
                <p className={styles.hint}>
                    In the meantime, you can use the search bar in the header to look up specific stock symbols directly.
                </p>
            </div>
        </div>
    );
}
