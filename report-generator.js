/**
 * Report Generator Module
 * Handles generation of Excel and CSV reports
 */

// Lazy loading state
let librariesLoaded = false;
let librariesLoading = false;

/**
 * Dynamically load a script and return a promise
 */
function loadScript(src) {
    return new Promise((resolve, reject) => {
        // Check if already loaded
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

/**
 * Lazy load ExcelJS, FileSaver, and JSZip libraries
 * Only loads once, subsequent calls return immediately
 */
async function loadExportLibraries() {
    if (librariesLoaded) return true;
    if (librariesLoading) {
        // Wait for existing load to complete
        while (librariesLoading) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return librariesLoaded;
    }

    librariesLoading = true;
    try {
        console.log('📦 Loading export libraries (ExcelJS, FileSaver, JSZip)...');
        await Promise.all([
            loadScript('https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js'),
            loadScript('https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js'),
            loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js')
        ]);
        librariesLoaded = true;
        console.log('✅ Export libraries loaded successfully');
        return true;
    } catch (error) {
        console.error('❌ Failed to load export libraries:', error);
        return false;
    } finally {
        librariesLoading = false;
    }
}

class ReportGenerator {
    constructor(api, toastManager) {
        this.api = api;
        this.toast = toastManager || { show: console.log, hide: () => { } };
        this.apiBaseUrl = api.baseUrl;
    }

    /**
     * Show status message using Toast
     */
    showStatus(message, type = 'info') {
        if (this.toast && this.toast.show) {
            this.toast.show(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    /**
     * Helper to format currency
     */
    formatCurrency(value) {
        if (window.AppUtils) return window.AppUtils.formatCurrency(value);
        // Fallback if AppUtils not available
        if (!value && value !== 0) return '--';
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
    }

    formatNumber(value, decimals = 2) {
        if (window.AppUtils) return window.AppUtils.formatNumber(value, decimals);
        return value ? value.toFixed(decimals) : '--';
    }

    formatLargeNumber(value) {
        if (window.AppUtils) return window.AppUtils.formatLargeNumber(value);
        return this.formatCurrency(value);
    }

    formatPercent(value) {
        if (window.AppUtils) return window.AppUtils.formatPercent(value);
        return value ? `${value.toFixed(1)}%` : '--';
    }

    /**
     * Helper: Convert Vietnamese labels to English
     */
    toEnglishLabel(text) {
        if (typeof text !== 'string') return String(text);
        if (/^[\d\s,.%\-+()/:]+$/.test(text)) return text;

        const mappings = {
            'Thông tin công ty': 'Company Information',
            'Dữ liệu thị trường': 'Market Data',
            'Kết quả định giá': 'Valuation Results',
            'So sánh thị trường': 'Market Comparison',
            'Giả định mô hình': 'Model Assumptions',
            'Chỉ số tài chính': 'Financial Metrics',
            'Khuyến nghị đầu tư': 'Investment Recommendation',
            'Mua mạnh': 'STRONG BUY',
            'Mua': 'BUY',
            'Giữ': 'HOLD',
            'Bán': 'SELL',
            'Bán mạnh': 'STRONG SELL'
        };

        return mappings[text] || text;
    }

    // =========================================================================
    // EXPORT HANDLERS
    // =========================================================================

    async exportReport(stockData, valuationResults, assumptions, modelWeights, currentStock, lang) {
        // Direct call to Excel export (PDF functionality removed)
        await this.exportExcelReport(stockData, valuationResults, assumptions, modelWeights, currentStock, lang);
    }

    async exportExcelReport(stockData, valuationResults, assumptions, modelWeights, currentStock, lang) {
        if (!stockData || !valuationResults) {
            this.showStatus('No data available to export Excel report', 'error');
            return;
        }

        try {
            // Lazy load libraries if not already loaded
            if (typeof ExcelJS === 'undefined' || typeof JSZip === 'undefined') {
                this.showStatus('Loading export libraries...', 'info');
                const loaded = await loadExportLibraries();
                if (!loaded) {
                    this.showStatus('Failed to load export libraries. Please try again.', 'error');
                    return;
                }
            }

            // Libraries are now loaded, proceed with export

            const zip = new JSZip();
            const symbol = currentStock;
            const dateStr = new Date().toISOString().split('T')[0];

            // FILE 1: Create valuation report Excel
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'quanganh.org';
            workbook.created = new Date();

            // SHEET: Summary Dashboard
            const summarySheet = workbook.addWorksheet('Summary Dashboard', { views: [{ showGridLines: false }] });
            await this.createSummaryDashboard(summarySheet, stockData, valuationResults, modelWeights, currentStock, lang);

            // SHEET: FCFE Analysis
            const fcfeSheet = workbook.addWorksheet('FCFE Analysis', { views: [{ showGridLines: true }] });
            this.createFCFESheet(fcfeSheet, stockData, valuationResults, assumptions);

            // SHEET: FCFF Analysis
            const fcffSheet = workbook.addWorksheet('FCFF Analysis', { views: [{ showGridLines: true }] });
            this.createFCFFSheet(fcffSheet, stockData, valuationResults, assumptions);

            // SHEET: P/E Analysis (now with sector peers)
            const peSheet = workbook.addWorksheet('PE Analysis', { views: [{ showGridLines: true }] });
            this.createPESheet(peSheet, stockData, assumptions, valuationResults);

            // SHEET: P/B Analysis (now with sector peers)
            const pbSheet = workbook.addWorksheet('PB Analysis', { views: [{ showGridLines: true }] });
            this.createPBSheet(pbSheet, stockData, assumptions, valuationResults);

            // SHEET: Sector Peers Comparison (NEW)
            const sectorPeersSheet = workbook.addWorksheet('Sector Peers', { views: [{ showGridLines: true }] });
            this.createSectorPeersSheet(sectorPeersSheet, stockData, valuationResults);

            // SHEET: Company Data
            const companyDataSheet = workbook.addWorksheet('Company Data', { views: [{ showGridLines: false }] });
            this.createCompanyDataSheet(companyDataSheet, stockData, currentStock);

            // SHEET: Assumptions
            const assumptionsSheet = workbook.addWorksheet('Assumptions', { views: [{ showGridLines: true }] });
            this.createAssumptionsSheet(assumptionsSheet, stockData, assumptions, modelWeights, currentStock);

            // Generate valuation Excel buffer
            const valuationBuffer = await workbook.xlsx.writeBuffer();
            zip.file(`${symbol}_Valuation_${dateStr}.xlsx`, valuationBuffer);

            // FILE 2: Try to fetch original financial data Excel
            let originalDataAdded = false;
            try {
                // Use ApiClient to check and get download URL
                const isAvailable = await this.api.checkDownloadAvailability(symbol);
                if (isAvailable) {
                    const downloadUrl = this.api.getDownloadUrl(symbol);
                    const response = await fetch(downloadUrl);
                    if (response.ok) {
                        const originalBuffer = await response.arrayBuffer();
                        zip.file(`${symbol}_Financial_Data.xlsx`, originalBuffer);
                        originalDataAdded = true;
                    }
                }
            } catch (error) {
                console.error('Error fetching original financial data:', error);
            }

            // Generate ZIP and download
            const zipBlob = await zip.generateAsync({ type: 'blob' });

            if (typeof saveAs !== 'undefined') {
                saveAs(zipBlob, `${symbol}_Complete_Report_${dateStr}.zip`);
            } else {
                const url = URL.createObjectURL(zipBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${symbol}_Complete_Report_${dateStr}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }

            const successMsg = originalDataAdded
                ? `ZIP package downloaded with valuation report and original financial data!`
                : `ZIP package downloaded with valuation report!`;
            this.showStatus(successMsg, 'success');

        } catch (error) {
            console.error('Error generating Excel report:', error);
            this.showStatus('Error generating Excel report: ' + error.message, 'error');
        }
    }

    async downloadFinancialData(symbol) {
        if (!symbol) {
            console.warn('No symbol available for Excel download');
            return;
        }

        try {
            const isAvailable = await this.api.checkDownloadAvailability(symbol);
            if (!isAvailable) {
                console.warn(`Excel data not available for ${symbol}`);
                return;
            }

            const fileUrl = this.api.getDownloadUrl(symbol);
            const tempLink = document.createElement('a');
            tempLink.href = fileUrl;
            tempLink.download = `${symbol}_Financial_Data.xlsx`;
            tempLink.style.display = 'none';
            document.body.appendChild(tempLink);
            tempLink.click();
            document.body.removeChild(tempLink);

            console.log(`Excel financial data downloaded for ${symbol}`);
        } catch (error) {
            console.error('Error downloading Excel data:', error);
        }
    }

    // =========================================================================
    // CSV GENERATION
    // =========================================================================

    generateCSVReport(stockData, valuationResults, assumptions, modelWeights, currentStock, lang) {
        const t = (typeof translations !== 'undefined' && translations[lang]) ? translations[lang] : {};

        const weightedValue = valuationResults.weighted_average;
        const currentPrice = stockData.current_price;
        const upside = ((weightedValue - currentPrice) / currentPrice) * 100;

        let csv = [];
        const SEP = ',';

        // Brand Header
        csv.push('═══════════════════════════════════════════════════════════════════════════════');
        csv.push(`${t.valuationReport || 'STOCK VALUATION REPORT'}`);
        csv.push('Powered by quanganh.org | Professional Stock Analysis Platform');
        csv.push('═══════════════════════════════════════════════════════════════════════════════');
        csv.push('');

        // Report Metadata
        csv.push(`${t.companyInformation || 'Company'}${SEP}${stockData.name} (${currentStock})`);
        csv.push(`${t.reportDate || 'Report Date'}${SEP}${new Date().toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`);
        csv.push(`${t.dataPeriod || 'Data Period'}${SEP}${stockData.data_frequency === 'quarter' ? (t.latestQuarter || 'Latest Quarter') : (t.latestYear || 'Latest Year')}`);
        csv.push('');
        csv.push('───────────────────────────────────────────────────────────────────────────────');

        // SECTION 1: Company Overview
        csv.push('');
        csv.push(`═══ 1. ${t.companyInformation || 'COMPANY INFORMATION'} ═══`);
        csv.push(`${t.symbol || 'Stock Symbol'}${SEP}${stockData.symbol || '--'}`);
        csv.push(`${t.name || 'Company Name'}${SEP}${stockData.name || '--'}`);
        csv.push(`${t.industry || 'Industry'}${SEP}${stockData.sector || '--'}`);
        csv.push(`${t.exchange || 'Exchange'}${SEP}${stockData.exchange || '--'}`);
        csv.push('');

        // SECTION 2: Market Data
        csv.push(`═══ 2. ${t.marketData || 'MARKET DATA'} ═══`);
        csv.push(`Metric${SEP}Value${SEP}Unit`);
        csv.push(`${t.currentPrice || 'Current Price'}${SEP}${currentPrice.toLocaleString('vi-VN')}${SEP}VND`);
        csv.push(`${t.marketCap || 'Market Cap'}${SEP}${(stockData.market_cap / 1e9).toFixed(2)}${SEP}Billion VND`);
        csv.push(`${t.sharesOutstanding || 'Shares Outstanding'}${SEP}${(stockData.shares_outstanding / 1e6).toFixed(2)}${SEP}Million shares`);
        csv.push(`${t.eps || 'EPS'}${SEP}${(stockData.eps_ttm || stockData.eps)?.toLocaleString('vi-VN') || '--'}${SEP}VND`);
        csv.push(`${t.bookValuePerShare || 'Book Value/Share'}${SEP}${(stockData.bvps || stockData.book_value_per_share)?.toLocaleString('vi-VN') || '--'}${SEP}VND`);
        csv.push(`${t.peRatio || 'P/E Ratio'}${SEP}${stockData.pe_ratio?.toFixed(2) || '--'}${SEP}x`);
        csv.push(`${t.pbRatio || 'P/B Ratio'}${SEP}${stockData.pb_ratio?.toFixed(2) || '--'}${SEP}x`);
        csv.push('');

        // SECTION 3: Valuation Summary
        csv.push(`═══ 3. ${t.valuationResults || 'VALUATION SUMMARY'} ═══`);
        csv.push(`Model${SEP}Fair Value (VND)${SEP}Weight${SEP}Difference vs Market`);
        const fcfe = valuationResults.fcfe;
        const fcfeDiff = ((fcfe.shareValue - currentPrice) / currentPrice * 100).toFixed(1);
        csv.push(`FCFE${SEP}${fcfe.shareValue.toLocaleString('vi-VN')}${SEP}${modelWeights.fcfe}%${SEP}${fcfeDiff}%`);

        const fcff = valuationResults.fcff;
        const fcffDiff = ((fcff.shareValue - currentPrice) / currentPrice * 100).toFixed(1);
        csv.push(`FCFF${SEP}${fcff.shareValue.toLocaleString('vi-VN')}${SEP}${modelWeights.fcff}%${SEP}${fcffDiff}%`);

        const pe = valuationResults.justified_pe;
        const peDiff = ((pe.shareValue - currentPrice) / currentPrice * 100).toFixed(1);
        csv.push(`Comparable P/E${SEP}${pe.shareValue.toLocaleString('vi-VN')}${SEP}${modelWeights.justified_pe}%${SEP}${peDiff}%`);

        const pb = valuationResults.justified_pb;
        const pbDiff = ((pb.shareValue - currentPrice) / currentPrice * 100).toFixed(1);
        csv.push(`Comparable P/B${SEP}${pb.shareValue.toLocaleString('vi-VN')}${SEP}${modelWeights.justified_pb}%${SEP}${pbDiff}%`);

        csv.push('───────────────────────────────────────────────────────────────────────────────');
        csv.push(`>>> ${t.weightedAverageTargetPrice || 'WEIGHTED TARGET PRICE'}${SEP}${weightedValue.toLocaleString('vi-VN')} VND${SEP}${SEP}${upside >= 0 ? '+' : ''}${upside.toFixed(2)}%`);
        csv.push('───────────────────────────────────────────────────────────────────────────────');
        csv.push('');

        // SECTION 4: Detailed Calculations - FCFE
        csv.push(`═══ 4. ${t.modelDetails || 'DETAILED VALUATION CALCULATIONS'} ═══`);
        csv.push('');
        csv.push('4.1 FCFE (Free Cash Flow to Equity) Method');
        csv.push(`Description${SEP}Value (VND)`);
        if (fcfe.projectedCashFlows && fcfe.projectedCashFlows.length > 0) {
            csv.push('Projected FCFE:');
            fcfe.projectedCashFlows.forEach((cf, idx) => {
                csv.push(`  Year ${idx + 1}${SEP}${cf.toLocaleString('vi-VN')}`);
            });
            csv.push(`Terminal Value (Year ${fcfe.projectedCashFlows.length})${SEP}${(fcfe.terminalValue || 0).toLocaleString('vi-VN')}`);
            csv.push(`Total Present Value (Equity Value)${SEP}${(fcfe.equityValue || 0).toLocaleString('vi-VN')}`);
            csv.push(`÷ Shares Outstanding${SEP}${stockData.shares_outstanding.toLocaleString('vi-VN')}`);
            csv.push(`= Fair Value per Share${SEP}${fcfe.shareValue.toLocaleString('vi-VN')}`);
        }
        csv.push(`Formula${SEP}PV = Σ(FCFE_t / (1+r)^t) + TV / (1+r)^n`);
        csv.push(`Growth Rate (g)${SEP}${assumptions.revenueGrowth}%`);
        csv.push(`Discount Rate (r)${SEP}${assumptions.requiredReturn}%`);
        csv.push('');

        // 4.2 FCFF
        csv.push('4.2 FCFF (Free Cash Flow to Firm) Method');
        csv.push(`Description${SEP}Value (VND)`);
        if (fcff.projectedCashFlows && fcff.projectedCashFlows.length > 0) {
            csv.push('Projected FCFF:');
            fcff.projectedCashFlows.forEach((cf, idx) => {
                csv.push(`  Year ${idx + 1}${SEP}${cf.toLocaleString('vi-VN')}`);
            });
            csv.push(`Terminal Value (Year ${fcff.projectedCashFlows.length})${SEP}${(fcff.terminalValue || 0).toLocaleString('vi-VN')}`);
            csv.push(`Enterprise Value${SEP}${(fcff.enterpriseValue || 0).toLocaleString('vi-VN')}`);
            csv.push(`− Net Debt${SEP}${(fcff.netDebt || 0).toLocaleString('vi-VN')}`);
            csv.push(`= Equity Value${SEP}${(fcff.equityValue || 0).toLocaleString('vi-VN')}`);
            csv.push(`÷ Shares Outstanding${SEP}${stockData.shares_outstanding.toLocaleString('vi-VN')}`);
            csv.push(`= Fair Value per Share${SEP}${fcff.shareValue.toLocaleString('vi-VN')}`);
        }
        csv.push(`Formula${SEP}EV = Σ(FCFF_t / (1+WACC)^t) + TV / (1+WACC)^n`);
        csv.push(`WACC${SEP}${assumptions.wacc}%`);
        csv.push('');

        // 4.3 P/E
        csv.push('4.3 Comparable P/E Valuation (Sector Comparable)');
        csv.push(`Description${SEP}Value`);
        csv.push(`Current EPS${SEP}${(stockData.eps_ttm || stockData.eps)?.toLocaleString('vi-VN')} VND`);
        csv.push(`Sector Median P/E${SEP}${pe.ratio?.toFixed(2)}x`);
        csv.push(`= Fair Value per Share${SEP}${pe.shareValue.toLocaleString('vi-VN')} VND`);
        csv.push(`Formula${SEP}Fair Value = Median P/E × Current EPS`);
        csv.push(`Payout Ratio${SEP}${(assumptions.payoutRatio || 40)}%`);
        csv.push(`Growth Rate (g)${SEP}${assumptions.revenueGrowth}%`);
        csv.push(`Required Return (r)${SEP}${assumptions.requiredReturn}%`);
        csv.push('');

        // 4.4 P/B
        csv.push('4.4 Comparable P/B Valuation (Sector Comparable)');
        csv.push(`Description${SEP}Value`);
        csv.push(`Book Value per Share${SEP}${(stockData.bvps || stockData.book_value_per_share)?.toLocaleString('vi-VN')} VND`);
        csv.push(`Sector Median P/B${SEP}${pb.ratio?.toFixed(2)}x`);
        csv.push(`= Fair Value per Share${SEP}${pb.shareValue.toLocaleString('vi-VN')} VND`);
        csv.push(`Formula${SEP}Fair Value = Median P/B × Book Value per Share`);
        csv.push(`ROE${SEP}${stockData.roe?.toFixed(2)}%`);
        csv.push('');

        // SECTION 5: Investment Decision
        csv.push(`═══ 5. ${t.recommendation || 'INVESTMENT RECOMMENDATION'} ═══`);
        csv.push(`Current Market Price${SEP}${currentPrice.toLocaleString('vi-VN')} VND`);
        csv.push(`Fair Value (Weighted Average)${SEP}${weightedValue.toLocaleString('vi-VN')} VND`);
        csv.push(`Upside/Downside Potential${SEP}${upside >= 0 ? '+' : ''}${upside.toFixed(2)}%`);
        if (valuationResults.market_comparison?.recommendation) {
            const rec = valuationResults.market_comparison.recommendation;
            csv.push(`>>> Investment Recommendation${SEP}${rec.toUpperCase()}`);
        }
        csv.push('');

        // SECTION 6: Assumptions & Parameters
        csv.push(`═══ 6. ${t.modelAssumptions || 'VALUATION ASSUMPTIONS'} ═══`);
        csv.push(`Parameter${SEP}Value`);
        csv.push(`Revenue Growth Rate${SEP}${assumptions.revenueGrowth}%`);
        csv.push(`Terminal Growth Rate${SEP}${assumptions.terminalGrowth}%`);
        csv.push(`WACC (Weighted Average Cost of Capital)${SEP}${assumptions.wacc}%`);
        csv.push(`Cost of Equity (Required Return)${SEP}${assumptions.requiredReturn}%`);
        csv.push(`Corporate Tax Rate${SEP}${assumptions.taxRate}%`);
        csv.push(`Projection Period${SEP}${assumptions.projectionYears} years`);
        csv.push('');

        // SECTION 7: Financial Health
        csv.push(`═══ 7. ${t.financialMetrics || 'FINANCIAL HEALTH METRICS'} ═══`);
        csv.push(`Metric${SEP}Value${SEP}Unit`);
        csv.push(`Revenue (TTM)${SEP}${(stockData.revenue_ttm / 1e9).toFixed(2)}${SEP}Billion VND`);
        csv.push(`Net Income (TTM)${SEP}${(stockData.net_income_ttm / 1e9).toFixed(2)}${SEP}Billion VND`);
        csv.push(`EBITDA${SEP}${(stockData.ebitda / 1e9).toFixed(2)}${SEP}Billion VND`);
        csv.push(`ROE (Return on Equity)${SEP}${stockData.roe?.toFixed(2) || '--'}${SEP}%`);
        csv.push(`ROA (Return on Assets)${SEP}${stockData.roa?.toFixed(2) || '--'}${SEP}%`);
        csv.push(`Debt/Equity Ratio${SEP}${stockData.debt_to_equity?.toFixed(2) || '--'}${SEP}x`);
        csv.push('');

        // Footer
        csv.push('═══════════════════════════════════════════════════════════════════════════════');
        csv.push('DISCLAIMER');
        csv.push('This report is for informational purposes only and does not constitute investment');
        csv.push('advice. Past performance does not guarantee future results. Please consult with a');
        csv.push('qualified financial advisor before making investment decisions.');
        csv.push('');
        csv.push('Generated by quanganh.org - Professional Stock Valuation Platform');
        csv.push(`Report Generated: ${new Date().toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US')}`);
        csv.push('Website: https://valuation.quanganh.org | API: https://api.quanganh.org');
        csv.push('═══════════════════════════════════════════════════════════════════════════════');

        return csv.join('\n');
    }

    // =========================================================================
    // EXCEL HELPER METHODS
    // =========================================================================

    async createSummaryDashboard(sheet, stockData, valuationResults, modelWeights, currentStock, lang) {
        // Logic from app.js createSummaryDashboard, using arguments
        let row = 1;
        sheet.mergeCells('A1:F1');
        sheet.getCell('A1').value = 'COMPREHENSIVE STOCK VALUATION REPORT';
        sheet.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FFFFFF' } };
        sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0066CC' } };
        row += 2;

        // ... Implementation from app.js ...
        // Re-implementing key parts:
        sheet.getCell(`A${row}`).value = 'VALUATION SUMMARY';
        row++;
        // ...
        ['Method', 'Fair Value', 'Current Price', 'Upside', 'Weight', 'Weighted Value'].forEach((h, i) => {
            sheet.getCell(row, i + 1).value = h;
            sheet.getCell(row, i + 1).font = { bold: true };
        });
        row++;

        // FCFE
        sheet.getCell(`A${row}`).value = 'FCFE';
        sheet.getCell(`B${row}`).value = valuationResults.fcfe.shareValue;
        sheet.getCell(`C${row}`).value = stockData.current_price;
        row++;
        // FCFF
        sheet.getCell(`A${row}`).value = 'FCFF';
        sheet.getCell(`B${row}`).value = valuationResults.fcff.shareValue;
        sheet.getCell(`C${row}`).value = stockData.current_price;
        row++;
        // PE
        sheet.getCell(`A${row}`).value = 'P/E';
        sheet.getCell(`B${row}`).value = valuationResults.justified_pe.shareValue;
        sheet.getCell(`C${row}`).value = stockData.current_price;
        row++;
        // PB
        sheet.getCell(`A${row}`).value = 'P/B';
        sheet.getCell(`B${row}`).value = valuationResults.justified_pb.shareValue;
        sheet.getCell(`C${row}`).value = stockData.current_price;
        row++;

        sheet.getCell(`A${row}`).value = 'WEIGHTED AVERAGE';
        sheet.getCell(`F${row}`).value = valuationResults.weighted_average;
    }

    createFCFESheet(sheet, stockData, valuationResults, assumptions) {
        let row = 1;

        // Extract details from backend response
        const details = valuationResults.fcfe_details || {};
        const inputs = details.inputs || {};
        const assumptionsUsed = details.assumptions || {};

        // Use backend inputs if available, otherwise fallback
        const netIncome = inputs.netIncome !== undefined ? inputs.netIncome : (stockData.net_income_ttm || 0);
        const depreciation = inputs.depreciation !== undefined ? inputs.depreciation : (stockData.depreciation || 0);
        const netBorrowing = inputs.netBorrowing !== undefined ? inputs.netBorrowing : (stockData.net_borrowing || 0);
        const wcChange = inputs.workingCapitalInvestment !== undefined ? inputs.workingCapitalInvestment : (stockData.working_capital_change || 0);
        const capex = inputs.fixedCapitalInvestment !== undefined ? Math.abs(inputs.fixedCapitalInvestment) : Math.abs(stockData.capex || 0);

        // Header
        sheet.mergeCells('A1:E1');
        sheet.getCell('A1').value = 'FCFE (FREE CASH FLOW TO EQUITY) ANALYSIS';
        sheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
        sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '28A745' } };
        sheet.getCell('A1').alignment = { horizontal: 'center' };
        row += 2;

        // Formula Explanation
        sheet.getCell(`A${row}`).value = 'FORMULA';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
        row++;
        sheet.getCell(`A${row}`).value = 'FCFE = Net Income + Depreciation + Net Borrowing − ΔWorking Capital − CapEx';
        sheet.getCell(`A${row}`).font = { italic: true, color: { argb: '6B7280' } };
        row++;
        sheet.getCell(`A${row}`).value = 'Equity Value = Σ(FCFEₜ / (1+r)ᵗ) + Terminal Value / (1+r)ⁿ';
        sheet.getCell(`A${row}`).font = { italic: true, color: { argb: '6B7280' } };
        row += 2;

        // Input Data Section
        sheet.getCell(`A${row}`).value = 'INPUT DATA (Source: Backend/VNSTOCK)';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
        row++;

        // Helper for formatting
        const setRow = (label, value, note, indent = false) => {
            sheet.getCell(`A${row}`).value = indent ? `    ${label}` : label;
            if (indent) {
                sheet.getCell(`A${row}`).font = { color: { argb: '6B7280' } };
            }
            sheet.getCell(`B${row}`).value = value;
            sheet.getCell(`B${row}`).numFmt = '#,##0';
            sheet.getCell(`C${row}`).value = 'VND';
            if (note) {
                sheet.getCell(`D${row}`).value = note;
                sheet.getCell(`D${row}`).font = { italic: true, color: { argb: '6B7280' } };
            }
            row++;
        };

        // Get detailed breakdown values from backend
        const receivablesChange = inputs.receivablesChange || 0;
        const inventoriesChange = inputs.inventoriesChange || 0;
        const payablesChange = inputs.payablesChange || 0;
        const proceedsBorrowings = inputs.proceedsBorrowings || 0;
        const repaymentBorrowings = inputs.repaymentBorrowings || 0;

        setRow('Net Income', netIncome, 'From Income Statement');
        setRow('Depreciation & Amortization', depreciation, 'From Cash Flow Statement');

        // Net Borrowing breakdown
        sheet.getCell(`A${row}`).value = 'Net Borrowing Calculation:';
        sheet.getCell(`A${row}`).font = { bold: true, color: { argb: '1F2937' } };
        row++;
        setRow('(+) Proceeds from Borrowings', proceedsBorrowings, '', true);
        setRow('(+) Repayment of Borrowings', repaymentBorrowings, 'Usually negative', true);
        sheet.getCell(`A${row}`).value = '    = Net Borrowing';
        sheet.getCell(`A${row}`).font = { bold: true };
        sheet.getCell(`B${row}`).value = netBorrowing;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`B${row}`).font = { bold: true };
        sheet.getCell(`C${row}`).value = 'VND';
        row++;

        // Working Capital breakdown
        sheet.getCell(`A${row}`).value = 'Working Capital Investment:';
        sheet.getCell(`A${row}`).font = { bold: true, color: { argb: '1F2937' } };
        row++;
        setRow('(+) Δ Receivables', receivablesChange, 'Increase = cash outflow', true);
        setRow('(+) Δ Inventories', inventoriesChange, 'Increase = cash outflow', true);
        setRow('(-) Δ Payables', payablesChange, 'Increase = cash inflow', true);
        sheet.getCell(`A${row}`).value = '    = Working Capital Investment';
        sheet.getCell(`A${row}`).font = { bold: true };
        sheet.getCell(`B${row}`).value = wcChange;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`B${row}`).font = { bold: true };
        sheet.getCell(`C${row}`).value = 'VND';
        sheet.getCell(`D${row}`).value = 'Negative = WC decreased = more cash';
        sheet.getCell(`D${row}`).font = { italic: true, color: { argb: '6B7280' } };
        row++;

        // CapEx
        setRow('Capital Expenditure (CapEx)', -capex, 'Purchase - Disposal (always outflow)');
        row++;

        // Assumptions Section
        sheet.getCell(`A${row}`).value = 'ASSUMPTIONS';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
        row++;

        const r = assumptionsUsed.costOfEquity !== undefined ? assumptionsUsed.costOfEquity : ((assumptions.requiredReturn || 12) / 100);
        const g = assumptionsUsed.shortTermGrowth !== undefined ? assumptionsUsed.shortTermGrowth : ((assumptions.revenueGrowth || 5) / 100);
        const terminalG = assumptionsUsed.terminalGrowth !== undefined ? assumptionsUsed.terminalGrowth : ((assumptions.terminalGrowth || 2) / 100);
        const forecastYears = assumptionsUsed.forecastYears || (assumptions.projectionYears || 5);
        const shares = details.sharesOutstanding || stockData.shares_outstanding || 1;

        sheet.getCell(`A${row}`).value = 'Cost of Equity (Required Return)';
        sheet.getCell(`B${row}`).value = r;
        sheet.getCell(`B${row}`).numFmt = '0.00%';
        row++;

        sheet.getCell(`A${row}`).value = 'Short-term Growth Rate';
        sheet.getCell(`B${row}`).value = g;
        sheet.getCell(`B${row}`).numFmt = '0.00%';
        row++;

        sheet.getCell(`A${row}`).value = 'Terminal Growth Rate';
        sheet.getCell(`B${row}`).value = terminalG;
        sheet.getCell(`B${row}`).numFmt = '0.00%';
        row++;

        sheet.getCell(`A${row}`).value = 'Forecast Period';
        sheet.getCell(`B${row}`).value = forecastYears;
        sheet.getCell(`C${row}`).value = 'years';
        row++;

        sheet.getCell(`A${row}`).value = 'Shares Outstanding';
        sheet.getCell(`B${row}`).value = shares;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        row += 2;

        // Calculate Base FCFE
        sheet.getCell(`A${row}`).value = 'BASE FCFE CALCULATION';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
        row++;

        const baseFCFE = details.baseFCFE !== undefined ? details.baseFCFE : (netIncome + depreciation + netBorrowing - wcChange - capex);

        sheet.getCell(`A${row}`).value = 'Base FCFE (Year 0)';
        sheet.getCell(`B${row}`).value = baseFCFE;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`B${row}`).font = { bold: true };
        sheet.getCell(`C${row}`).value = 'VND';
        sheet.getCell(`D${row}`).value = '= Net Income + Dep + Net Borrowing - Working Capital - CapEx';
        sheet.getCell(`D${row}`).font = { italic: true };
        row += 2;

        // Projected Cash Flows
        sheet.getCell(`A${row}`).value = 'PROJECTED CASH FLOWS';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
        row++;

        // Table header
        ['Year', 'Growth Formula', 'Projected FCFE', 'Discount Factor', 'PV Formula', 'Present Value'].forEach((h, i) => {
            sheet.getCell(row, i + 1).value = h;
            sheet.getCell(row, i + 1).font = { bold: true };
            sheet.getCell(row, i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E8F5E9' } };
        });
        row++;

        const projected = details.projectedCashFlows || [];
        const presentValues = details.presentValues || [];
        let totalPV = 0;
        const projectedFCFEs = [];

        // Determine loop counts
        const projectionYears = projected.length > 0 ? projected.length : forecastYears;

        if (projected.length > 0) {
            projected.forEach((val, i) => {
                const year = i + 1;
                const pv = presentValues[i] || 0;
                totalPV += pv;
                projectedFCFEs.push(val);

                sheet.getCell(`A${row}`).value = year;
                sheet.getCell(`B${row}`).value = `${(g * 100).toFixed(1)}% Growth`;
                sheet.getCell(`C${row}`).value = val;
                sheet.getCell(`C${row}`).numFmt = '#,##0';
                sheet.getCell(`D${row}`).value = Math.pow(1 + r, -year);
                sheet.getCell(`D${row}`).numFmt = '0.0000';
                sheet.getCell(`E${row}`).value = `FCFE${year} / (1+${(r * 100).toFixed(1)}%)^${year}`; // Match column header PV Formula
                sheet.getCell(`E${row}`).font = { italic: true, color: { argb: '6B7280' } };
                sheet.getCell(`F${row}`).value = pv;
                sheet.getCell(`F${row}`).numFmt = '#,##0';
                row++;
            });
        } else {
            for (let year = 1; year <= forecastYears; year++) {
                const projectedFCFE = baseFCFE * Math.pow(1 + g, year);
                const pv = projectedFCFE * Math.pow(1 + r, -year);
                totalPV += pv;
                projectedFCFEs.push(projectedFCFE);

                sheet.getCell(`A${row}`).value = year;
                sheet.getCell(`B${row}`).value = `${(g * 100).toFixed(1)}% Growth`;
                sheet.getCell(`C${row}`).value = projectedFCFE;
                sheet.getCell(`C${row}`).numFmt = '#,##0';
                sheet.getCell(`D${row}`).value = Math.pow(1 + r, -year);
                sheet.getCell(`D${row}`).numFmt = '0.0000';
                sheet.getCell(`E${row}`).value = `FCFE${year} / (1+${(r * 100).toFixed(1)}%)^${year}`;
                sheet.getCell(`E${row}`).font = { italic: true, color: { argb: '6B7280' } };
                sheet.getCell(`F${row}`).value = pv;
                sheet.getCell(`F${row}`).numFmt = '#,##0';
                row++;
            }
        }

        // Sum of PV row
        sheet.getCell(`A${row}`).value = 'Sum of PV (Years 1-' + projectionYears + ')';
        sheet.getCell(`A${row}`).font = { bold: true };
        sheet.getCell(`F${row}`).value = totalPV;
        sheet.getCell(`F${row}`).numFmt = '#,##0';
        sheet.getCell(`F${row}`).font = { bold: true };
        sheet.getCell(`F${row}`).border = { top: { Style: 'double' } };
        row += 2;

        // Terminal Value
        sheet.getCell(`A${row}`).value = 'TERMINAL VALUE CALCULATION';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
        row++;

        const lastFCFE = projectedFCFEs.length > 0 ? projectedFCFEs[projectedFCFEs.length - 1] : baseFCFE;

        // Use backend logic for terminal value if available
        let terminalValue = details.terminalValue;
        let pvTerminal = details.pvTerminal;

        if (terminalValue === undefined) {
            terminalValue = lastFCFE * (1 + terminalG) / (r - terminalG);
        }
        if (pvTerminal === undefined) {
            pvTerminal = terminalValue * Math.pow(1 + r, -forecastYears);
        }

        sheet.getCell(`A${row}`).value = 'Formula: TV = FCFE₅ × (1 + g) / (r - g)';
        sheet.getCell(`A${row}`).font = { italic: true, color: { argb: '6B7280' } };
        row++;

        sheet.getCell(`A${row}`).value = `TV = ${lastFCFE.toLocaleString()} × (1 + ${(terminalG * 100).toFixed(1)}%) / (${(r * 100).toFixed(1)}% - ${(terminalG * 100).toFixed(1)}%)`;
        sheet.getCell(`A${row}`).font = { color: { argb: '6B7280' } };
        row++;

        sheet.getCell(`A${row}`).value = 'Terminal Value (at end of forecast)';
        sheet.getCell(`B${row}`).value = terminalValue;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`D${row}`).value = `= FCFE${forecastYears} × (1+g_term) / (r - g_term)`;
        row++;

        sheet.getCell(`A${row}`).value = 'Present Value of Terminal Value';
        sheet.getCell(`B${row}`).value = pvTerminal;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`D${row}`).value = `= TV / (1+r)^${forecastYears}`;
        row += 2;

        // Final Results
        sheet.getCell(`A${row}`).value = 'FINAL VALUATION';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12, color: { argb: 'FFFFFF' } };
        sheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '28A745' } };
        row++;

        const totalEquityValue = details.totalEquityValue || (totalPV + pvTerminal);
        const shareValue = details.shareValue || (totalEquityValue / shares);

        sheet.getCell(`A${row}`).value = 'Total Equity Value';
        sheet.getCell(`B${row}`).value = totalEquityValue;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`C${row}`).value = 'VND';
        row++;

        sheet.getCell(`A${row}`).value = 'Fair Value per Share';
        sheet.getCell(`B${row}`).value = shareValue;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`B${row}`).font = { bold: true, size: 14, color: { argb: '28A745' } };
        sheet.getCell(`C${row}`).value = 'VND';
        row++;

        sheet.getCell(`A${row}`).value = 'Current Market Price';
        sheet.getCell(`B${row}`).value = stockData.current_price || 0;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`C${row}`).value = 'VND';
        row++;

        const upside = stockData.current_price ? ((shareValue - stockData.current_price) / stockData.current_price) : 0;
        sheet.getCell(`A${row}`).value = 'Upside/Downside';
        sheet.getCell(`B${row}`).value = upside;
        sheet.getCell(`B${row}`).numFmt = '+0.00%;-0.00%';
        sheet.getCell(`B${row}`).font = { bold: true, color: { argb: upside >= 0 ? '28A745' : 'DC3545' } };
        row += 2;

        if (details.baseFCFE !== undefined) {
            sheet.getCell(`A${row}`).value = '✅ Verified: Data sourced directly from Backend financial engine (vnstock API)';
            sheet.getCell(`A${row}`).font = { italic: true, color: { argb: '28A745' } };
        } else {
            sheet.getCell(`A${row}`).value = '⚠️ Note: Calculated from frontend estimates. Backend detailed data unavailable.';
            sheet.getCell(`A${row}`).font = { italic: true, color: { argb: 'F59E0B' } };
        }

        // Set column widths
        sheet.getColumn(1).width = 55;
        sheet.getColumn(2).width = 25;
        sheet.getColumn(3).width = 18;
        sheet.getColumn(4).width = 15;
        sheet.getColumn(5).width = 30;
        sheet.getColumn(6).width = 18;
    }

    createFCFFSheet(sheet, stockData, valuationResults, assumptions) {
        let row = 1;

        // Extract details from backend response
        const details = valuationResults.fcff_details || {};
        const inputs = details.inputs || {};
        const assumptionsUsed = details.assumptions || {};

        // Use backend inputs if available, otherwise fallback
        // Note: For FCFF, backend might provide operating income (EBIT) or related metrics
        const ebit = (stockData.ebit || stockData.ebitda || 0); // Default fallback
        // In backend model, we might use Net Income + Interest * (1-t) as proxy if EBIT not direct, but let's stick to standard if available.
        // Actually, let's use the explicit inputs if backend provides them.

        const taxRate = assumptionsUsed.taxRate !== undefined ? assumptionsUsed.taxRate : ((assumptions.taxRate || 20) / 100);
        const depreciation = inputs.depreciation !== undefined ? inputs.depreciation : (stockData.depreciation || 0);
        const wcChange = inputs.workingCapitalInvestment !== undefined ? inputs.workingCapitalInvestment : (stockData.working_capital_change || 0);
        const capex = inputs.fixedCapitalInvestment !== undefined ? Math.abs(inputs.fixedCapitalInvestment) : Math.abs(stockData.capex || 0);

        // Interest Expense handling (FCFF = EBIT(1-t) + Dep - CapEx - dWC)
        // OR FCFF = NI + Interest(1-t) + Dep - CapEx - dWC
        // Backend 'inputs' has 'interestExpense' and 'interestAfterTax'.

        const interestExpense = inputs.interestExpense !== undefined ? inputs.interestExpense : (stockData.interest_expense || 0);
        const interestAfterTax = inputs.interestAfterTax !== undefined ? inputs.interestAfterTax : (interestExpense * (1 - taxRate));
        const netIncome = inputs.netIncome !== undefined ? inputs.netIncome : (stockData.net_income_ttm || 0);

        // Header
        sheet.mergeCells('A1:E1');
        sheet.getCell('A1').value = 'FCFF (FREE CASH FLOW TO FIRM) ANALYSIS';
        sheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
        sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0066CC' } };
        sheet.getCell('A1').alignment = { horizontal: 'center' };
        row += 2;

        // Formula Explanation
        sheet.getCell(`A${row}`).value = 'FORMULA';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
        row++;
        sheet.getCell(`A${row}`).value = 'FCFF = Net Income + Interest(1-t) + Depreciation − CapEx − ΔWorking Capital';
        sheet.getCell(`A${row}`).font = { italic: true, color: { argb: '6B7280' } };
        row++;
        sheet.getCell(`A${row}`).value = 'Enterprise Value = Σ(FCFFₜ / (1+WACC)ᵗ) + Terminal Value / (1+WACC)ⁿ';
        sheet.getCell(`A${row}`).font = { italic: true, color: { argb: '6B7280' } };
        row++;
        sheet.getCell(`A${row}`).value = 'Equity Value = Enterprise Value − Net Debt';
        sheet.getCell(`A${row}`).font = { italic: true, color: { argb: '6B7280' } };
        row += 2;

        // Input Data Section
        sheet.getCell(`A${row}`).value = 'INPUT DATA (Source: Backend/VNSTOCK)';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
        row++;

        // Helper for formatting
        const setRow = (label, value, note, indent = false) => {
            sheet.getCell(`A${row}`).value = indent ? `    ${label}` : label;
            if (indent) {
                sheet.getCell(`A${row}`).font = { color: { argb: '6B7280' } };
            }
            sheet.getCell(`B${row}`).value = value;
            sheet.getCell(`B${row}`).numFmt = '#,##0';
            sheet.getCell(`C${row}`).value = 'VND';
            if (note) {
                sheet.getCell(`D${row}`).value = note;
                sheet.getCell(`D${row}`).font = { italic: true, color: { argb: '6B7280' } };
            }
            row++;
        };

        // Get detailed breakdown values from backend
        const receivablesChange = inputs.receivablesChange || 0;
        const inventoriesChange = inputs.inventoriesChange || 0;
        const payablesChange = inputs.payablesChange || 0;
        const shortTermDebt = inputs.shortTermDebt || 0;
        const longTermDebt = inputs.longTermDebt || 0;

        setRow('Net Income', netIncome, 'From Income Statement');

        // Interest After Tax calculation
        sheet.getCell(`A${row}`).value = 'Interest After Tax Calculation:';
        sheet.getCell(`A${row}`).font = { bold: true, color: { argb: '1F2937' } };
        row++;
        setRow('Interest Expense', interestExpense, 'From Income Statement', true);
        sheet.getCell(`A${row}`).value = '    Tax Rate';
        sheet.getCell(`A${row}`).font = { color: { argb: '6B7280' } };
        sheet.getCell(`B${row}`).value = taxRate;
        sheet.getCell(`B${row}`).numFmt = '0.00%';
        row++;
        sheet.getCell(`A${row}`).value = '    = Interest × (1 - Tax Rate)';
        sheet.getCell(`A${row}`).font = { bold: true };
        sheet.getCell(`B${row}`).value = interestAfterTax;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`B${row}`).font = { bold: true };
        sheet.getCell(`C${row}`).value = 'VND';
        row++;

        setRow('Depreciation & Amortization', depreciation, 'From Cash Flow Statement');

        // Working Capital breakdown
        sheet.getCell(`A${row}`).value = 'Working Capital Investment:';
        sheet.getCell(`A${row}`).font = { bold: true, color: { argb: '1F2937' } };
        row++;
        setRow('(+) Δ Receivables', receivablesChange, 'Increase = cash outflow', true);
        setRow('(+) Δ Inventories', inventoriesChange, 'Increase = cash outflow', true);
        setRow('(-) Δ Payables', payablesChange, 'Increase = cash inflow', true);
        sheet.getCell(`A${row}`).value = '    = Working Capital Investment';
        sheet.getCell(`A${row}`).font = { bold: true };
        sheet.getCell(`B${row}`).value = wcChange;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`B${row}`).font = { bold: true };
        sheet.getCell(`C${row}`).value = 'VND';
        sheet.getCell(`D${row}`).value = 'Negative = WC decreased = more cash';
        sheet.getCell(`D${row}`).font = { italic: true, color: { argb: '6B7280' } };
        row++;

        // CapEx
        setRow('Capital Expenditure (CapEx)', -capex, 'Purchase - Disposal (always outflow)');
        row++;

        // Debt and Cash section
        const totalDebt = details.totalDebt !== undefined ? details.totalDebt : (stockData.total_debt || 0);
        const cash = details.cash !== undefined ? details.cash : (stockData.cash || 0);
        const netDebt = (details.totalDebt !== undefined && details.cash !== undefined) ? (details.totalDebt - details.cash) : (stockData.net_debt || (totalDebt - cash));

        sheet.getCell(`A${row}`).value = 'DEBT & CASH (For Equity Value Calculation)';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
        row++;
        setRow('Short-term Debt', shortTermDebt, '', true);
        setRow('Long-term Debt', longTermDebt, '', true);
        sheet.getCell(`A${row}`).value = '    = Total Debt';
        sheet.getCell(`A${row}`).font = { bold: true };
        sheet.getCell(`B${row}`).value = totalDebt;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`B${row}`).font = { bold: true };
        sheet.getCell(`C${row}`).value = 'VND';
        row++;
        setRow('Cash & Equivalents', cash, 'From Balance Sheet');
        sheet.getCell(`A${row}`).value = 'Net Debt (Debt - Cash)';
        sheet.getCell(`B${row}`).value = netDebt;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`B${row}`).font = { bold: true };
        sheet.getCell(`C${row}`).value = 'VND';
        row += 2;

        // Assumptions
        sheet.getCell(`A${row}`).value = 'ASSUMPTIONS';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
        row++;

        const wacc = assumptionsUsed.wacc !== undefined ? assumptionsUsed.wacc : ((assumptions.wacc || 10) / 100);
        const g = assumptionsUsed.shortTermGrowth !== undefined ? assumptionsUsed.shortTermGrowth : ((assumptions.revenueGrowth || 5) / 100);
        const terminalG = assumptionsUsed.terminalGrowth !== undefined ? assumptionsUsed.terminalGrowth : ((assumptions.terminalGrowth || 2) / 100);
        const forecastYears = assumptionsUsed.forecastYears || (assumptions.projectionYears || 5);
        const shares = details.sharesOutstanding || stockData.shares_outstanding || 1;

        sheet.getCell(`A${row}`).value = 'WACC (Weighted Avg Cost of Capital)';
        sheet.getCell(`B${row}`).value = wacc;
        sheet.getCell(`B${row}`).numFmt = '0.00%';
        row++;

        sheet.getCell(`A${row}`).value = 'Short-term Growth Rate';
        sheet.getCell(`B${row}`).value = g;
        sheet.getCell(`B${row}`).numFmt = '0.00%';
        row++;

        sheet.getCell(`A${row}`).value = 'Terminal Growth Rate';
        sheet.getCell(`B${row}`).value = terminalG;
        sheet.getCell(`B${row}`).numFmt = '0.00%';
        row++;

        sheet.getCell(`A${row}`).value = 'Forecast Period';
        sheet.getCell(`B${row}`).value = forecastYears;
        sheet.getCell(`C${row}`).value = 'years';
        row++;

        sheet.getCell(`A${row}`).value = 'Shares Outstanding';
        sheet.getCell(`B${row}`).value = shares;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        row += 2;

        // Calculate Base FCFF
        sheet.getCell(`A${row}`).value = 'BASE FCFF CALCULATION';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
        row++;

        const baseFCFF = details.baseFCFF !== undefined ? details.baseFCFF : (netIncome + interestAfterTax + depreciation - wcChange - capex);

        sheet.getCell(`A${row}`).value = 'Base FCFF = Net Income + Interest*(1-t) + Depreciation - ΔWC - CapEx';
        sheet.getCell(`A${row}`).font = { italic: true, color: { argb: '6B7280' } };
        row++;

        sheet.getCell(`A${row}`).value = `Base FCFF = ${netIncome.toLocaleString()} + ${interestAfterTax.toLocaleString()} + ${depreciation.toLocaleString()} - ${wcChange.toLocaleString()} - ${capex.toLocaleString()}`;
        sheet.getCell(`A${row}`).font = { color: { argb: '6B7280' } };
        row++;

        sheet.getCell(`A${row}`).value = 'Base FCFF (Year 0)';
        sheet.getCell(`B${row}`).value = baseFCFF;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`B${row}`).font = { bold: true };
        sheet.getCell(`C${row}`).value = 'VND';
        row += 2;

        // Projected Cash Flows
        sheet.getCell(`A${row}`).value = 'PROJECTED CASH FLOWS';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
        row++;

        // Table header
        ['Year', 'Growth Formula', 'Projected FCFF', 'Discount Factor', 'PV Formula', 'Present Value'].forEach((h, i) => {
            sheet.getCell(row, i + 1).value = h;
            sheet.getCell(row, i + 1).font = { bold: true };
            sheet.getCell(row, i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E3F2FD' } };
        });
        row++;

        const projected = details.projectedCashFlows || [];
        const presentValues = details.presentValues || [];
        let totalPV = 0;
        const projectedFCFFs = [];
        const projectionYears = projected.length > 0 ? projected.length : forecastYears;

        if (projected.length > 0) {
            projected.forEach((val, i) => {
                const year = i + 1;
                const pv = presentValues[i] || 0;
                totalPV += pv;
                projectedFCFFs.push(val);

                sheet.getCell(`A${row}`).value = year;
                sheet.getCell(`B${row}`).value = `${(g * 100).toFixed(1)}% Growth`;
                sheet.getCell(`C${row}`).value = val;
                sheet.getCell(`C${row}`).numFmt = '#,##0';
                sheet.getCell(`D${row}`).value = Math.pow(1 + wacc, -year);
                sheet.getCell(`D${row}`).numFmt = '0.0000';
                sheet.getCell(`E${row}`).value = `FCFF${year} / (1+${(wacc * 100).toFixed(1)}%)^${year}`;
                sheet.getCell(`E${row}`).font = { italic: true, color: { argb: '6B7280' } };
                sheet.getCell(`F${row}`).value = pv;
                sheet.getCell(`F${row}`).numFmt = '#,##0';
                row++;
            });
        } else {
            for (let year = 1; year <= forecastYears; year++) {
                const projectedFCFF = baseFCFF * Math.pow(1 + g, year);
                const discountFactor = 1 / Math.pow(1 + wacc, year);
                const pv = projectedFCFF * discountFactor;
                totalPV += pv;
                projectedFCFFs.push(projectedFCFF);

                sheet.getCell(`A${row}`).value = year;
                sheet.getCell(`B${row}`).value = `FCFF₀ × (1+${(g * 100).toFixed(1)}%)^${year}`;
                sheet.getCell(`B${row}`).font = { italic: true, color: { argb: '6B7280' } };
                sheet.getCell(`C${row}`).value = projectedFCFF;
                sheet.getCell(`C${row}`).numFmt = '#,##0';
                sheet.getCell(`D${row}`).value = discountFactor;
                sheet.getCell(`D${row}`).numFmt = '0.0000';
                sheet.getCell(`E${row}`).value = `FCFF${year} / (1+${(wacc * 100).toFixed(1)}%)^${year}`;
                sheet.getCell(`E${row}`).font = { italic: true, color: { argb: '6B7280' } };
                sheet.getCell(`F${row}`).value = pv;
                sheet.getCell(`F${row}`).numFmt = '#,##0';
                row++;
            }
        }

        // Sum of PV row
        sheet.getCell(`A${row}`).value = 'Sum of PV (Years 1-' + projectionYears + ')';
        sheet.getCell(`A${row}`).font = { bold: true };
        sheet.getCell(`F${row}`).value = totalPV;
        sheet.getCell(`F${row}`).numFmt = '#,##0';
        sheet.getCell(`F${row}`).font = { bold: true };
        row += 2;

        // Terminal Value
        sheet.getCell(`A${row}`).value = 'TERMINAL VALUE CALCULATION';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
        row++;

        const lastFCFF = projectedFCFFs.length > 0 ? projectedFCFFs[projectedFCFFs.length - 1] : baseFCFF;

        let terminalValue = details.terminalValue;
        let pvTerminal = details.pvTerminal;

        if (terminalValue === undefined) {
            terminalValue = lastFCFF * (1 + terminalG) / (wacc - terminalG);
        }
        if (pvTerminal === undefined) {
            pvTerminal = terminalValue * Math.pow(1 + wacc, -forecastYears);
        }

        sheet.getCell(`A${row}`).value = 'Formula: TV = FCFF₅ × (1 + g) / (WACC - g)';
        sheet.getCell(`A${row}`).font = { italic: true, color: { argb: '6B7280' } };
        row++;

        sheet.getCell(`A${row}`).value = `TV = ${lastFCFF.toLocaleString()} × (1 + ${(terminalG * 100).toFixed(1)}%) / (${(wacc * 100).toFixed(1)}% - ${(terminalG * 100).toFixed(1)}%)`;
        sheet.getCell(`A${row}`).font = { color: { argb: '6B7280' } };
        row++;

        sheet.getCell(`A${row}`).value = 'Terminal Value';
        sheet.getCell(`B${row}`).value = terminalValue;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`C${row}`).value = 'VND';
        row++;

        sheet.getCell(`A${row}`).value = `PV of Terminal Value = TV / (1+WACC)^${forecastYears}`;
        sheet.getCell(`A${row}`).font = { italic: true, color: { argb: '6B7280' } };
        row++;

        sheet.getCell(`A${row}`).value = 'PV of Terminal Value';
        sheet.getCell(`B${row}`).value = pvTerminal;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`C${row}`).value = 'VND';
        row += 2;

        // Final Results
        const enterpriseValue = details.enterpriseValue || (totalPV + pvTerminal);
        const equityValue = details.equityValue || (enterpriseValue - netDebt);
        const valShareValue = details.shareValue || (equityValue / shares);

        sheet.getCell(`A${row}`).value = 'FINAL VALUATION';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12, color: { argb: 'FFFFFF' } };
        sheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0066CC' } };
        row++;

        sheet.getCell(`A${row}`).value = 'Enterprise Value = Sum of PV + PV of Terminal Value';
        sheet.getCell(`A${row}`).font = { italic: true, color: { argb: '6B7280' } };
        row++;

        sheet.getCell(`A${row}`).value = 'Enterprise Value';
        sheet.getCell(`B${row}`).value = enterpriseValue;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`C${row}`).value = 'VND';
        row++;

        sheet.getCell(`A${row}`).value = '− Net Debt';
        sheet.getCell(`B${row}`).value = netDebt;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`C${row}`).value = 'VND';
        row++;

        sheet.getCell(`A${row}`).value = '= Equity Value';
        sheet.getCell(`B${row}`).value = equityValue;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`C${row}`).value = 'VND';
        sheet.getCell(`B${row}`).font = { bold: true };
        row++;

        sheet.getCell(`A${row}`).value = 'Fair Value per Share';
        sheet.getCell(`B${row}`).value = valShareValue;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`B${row}`).font = { bold: true, size: 14, color: { argb: '0066CC' } };
        sheet.getCell(`C${row}`).value = 'VND';
        row++;

        sheet.getCell(`A${row}`).value = 'Current Market Price';
        sheet.getCell(`B${row}`).value = stockData.current_price || 0;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`C${row}`).value = 'VND';
        row++;

        const upside = stockData.current_price ? ((valShareValue - stockData.current_price) / stockData.current_price) : 0;
        sheet.getCell(`A${row}`).value = 'Upside/Downside';
        sheet.getCell(`B${row}`).value = upside;
        sheet.getCell(`B${row}`).numFmt = '+0.00%;-0.00%';
        sheet.getCell(`B${row}`).font = { bold: true, color: { argb: upside >= 0 ? '28A745' : 'DC3545' } };
        row += 2;

        if (details.baseFCFF !== undefined) {
            sheet.getCell(`A${row}`).value = '✅ Verified: Data sourced directly from Backend financial engine';
            sheet.getCell(`A${row}`).font = { italic: true, color: { argb: '28A745' } };
        } else {
            sheet.getCell(`A${row}`).value = '⚠️ Note: Calculated from frontend estimates.';
            sheet.getCell(`A${row}`).font = { italic: true, color: { argb: 'F59E0B' } };
        }

        // Set column widths
        sheet.getColumn(1).width = 55;
        sheet.getColumn(2).width = 25;
        sheet.getColumn(3).width = 18;
        sheet.getColumn(4).width = 15;
        sheet.getColumn(5).width = 30;
        sheet.getColumn(6).width = 18;
    }

    createPESheet(sheet, stockData, assumptions, valuationResults = {}) {
        let row = 1;

        sheet.mergeCells('A1:E1');
        sheet.getCell('A1').value = 'SECTOR COMPARABLE P/E VALUATION';
        sheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
        sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC107' } };
        sheet.getCell('A1').alignment = { horizontal: 'center' };
        row += 2;

        // Method description
        sheet.getCell(`A${row}`).value = 'METHODOLOGY';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
        row++;

        sheet.getCell(`A${row}`).value = 'Fair Value = Median P/E (Sector) × Current EPS';
        sheet.getCell(`A${row}`).font = { italic: true, color: { argb: '6B7280' } };
        row++;

        sheet.getCell(`A${row}`).value = 'We use the median P/E ratio of the top 10 companies by market cap in the same sector';
        sheet.getCell(`A${row}`).font = { italic: true, color: { argb: '6B7280' } };
        row += 2;

        // Inputs
        sheet.getCell(`A${row}`).value = 'VALUATION INPUTS';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
        row++;

        const sectorPeers = valuationResults.sector_peers || {};
        const medianPE = sectorPeers.median_pe || valuationResults.justified_pe?.median_pe || 0;
        const eps = stockData.eps_ttm || stockData.eps || 0;
        const fairValue = valuationResults.justified_pe?.shareValue || (medianPE * eps);

        sheet.getCell(`A${row}`).value = 'Current EPS';
        sheet.getCell(`B${row}`).value = eps;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`C${row}`).value = 'VND';
        row++;

        sheet.getCell(`A${row}`).value = 'Sector';
        sheet.getCell(`B${row}`).value = sectorPeers.sector || stockData.sector || 'N/A';
        sheet.getCell(`B${row}`).font = { bold: true };
        row++;

        sheet.getCell(`A${row}`).value = 'Median P/E (Top 10 by Market Cap)';
        sheet.getCell(`B${row}`).value = medianPE;
        sheet.getCell(`B${row}`).numFmt = '0.00';
        sheet.getCell(`B${row}`).font = { bold: true, color: { argb: '28A745' } };
        sheet.getCell(`C${row}`).value = 'From sector_peers.json';
        sheet.getCell(`C${row}`).font = { italic: true, color: { argb: '6B7280' } };
        row += 2;

        // Calculation
        sheet.getCell(`A${row}`).value = 'VALUATION RESULT';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
        row++;

        sheet.getCell(`A${row}`).value = 'Formula: Fair Value = Median P/E × EPS';
        sheet.getCell(`A${row}`).font = { italic: true, color: { argb: '6B7280' } };
        row++;

        sheet.getCell(`A${row}`).value = `Calculation: ${medianPE.toFixed(2)} × ${eps.toLocaleString()} = ${fairValue.toLocaleString()} VND`;
        sheet.getCell(`A${row}`).font = { color: { argb: '6B7280' } };
        row++;

        sheet.getCell(`A${row}`).value = 'Fair Value per Share';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
        sheet.getCell(`B${row}`).value = fairValue;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`B${row}`).font = { bold: true, size: 12, color: { argb: 'FFC107' } };
        sheet.getCell(`C${row}`).value = 'VND';
        row += 2;

        sheet.getCell(`A${row}`).value = 'Current Market Price';
        sheet.getCell(`B${row}`).value = stockData.current_price || 0;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`C${row}`).value = 'VND';
        row++;

        const upside = stockData.current_price ? ((fairValue - stockData.current_price) / stockData.current_price) : 0;
        sheet.getCell(`A${row}`).value = 'Upside/Downside';
        sheet.getCell(`B${row}`).value = upside;
        sheet.getCell(`B${row}`).numFmt = '+0.00%;-0.00%';
        sheet.getCell(`B${row}`).font = { bold: true, color: { argb: upside >= 0 ? '28A745' : 'DC3545' } };
        row += 2;

        // ===== PEER COMPARISON TABLE =====
        if (sectorPeers.peers_detail && sectorPeers.peers_detail.length > 0) {
            sheet.getCell(`A${row}`).value = 'PEER COMPARISON (Top 10 by Market Cap)';
            sheet.getCell(`A${row}`).font = { bold: true, size: 11 };
            sheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E8F5E9' } };
            row++;

            ['Symbol', 'Market Cap (Bn)', 'P/E', 'P/B'].forEach((h, i) => {
                sheet.getCell(row, i + 1).value = h;
                sheet.getCell(row, i + 1).font = { bold: true };
                sheet.getCell(row, i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F5F5F5' } };
            });
            row++;

            // Peer data rows
            sectorPeers.peers_detail.forEach(peer => {
                sheet.getCell(`A${row}`).value = peer.symbol;
                sheet.getCell(`B${row}`).value = peer.market_cap || 0;
                sheet.getCell(`B${row}`).numFmt = '#,##0.0';
                sheet.getCell(`C${row}`).value = peer.pe_ratio || 0;
                sheet.getCell(`C${row}`).numFmt = '0.00';
                sheet.getCell(`D${row}`).value = peer.pb_ratio || 0;
                sheet.getCell(`D${row}`).numFmt = '0.00';
                row++;
            });

            // Median row
            row++;
            sheet.getCell(`A${row}`).value = 'MEDIAN';
            sheet.getCell(`A${row}`).font = { bold: true };
            sheet.getCell(`C${row}`).value = sectorPeers.median_pe || 0;
            sheet.getCell(`C${row}`).numFmt = '0.00';
            sheet.getCell(`C${row}`).font = { bold: true, color: { argb: '28A745' } };
            sheet.getCell(`D${row}`).value = sectorPeers.median_pb || 0;
            sheet.getCell(`D${row}`).numFmt = '0.00';
            sheet.getCell(`D${row}`).font = { bold: true, color: { argb: '28A745' } };
        }

        sheet.getColumn(1).width = 40;
        sheet.getColumn(2).width = 20;
        sheet.getColumn(3).width = 12;
        sheet.getColumn(4).width = 12;
    }

    createPBSheet(sheet, stockData, assumptions, valuationResults = {}) {
        let row = 1;

        sheet.mergeCells('A1:E1');
        sheet.getCell('A1').value = 'SECTOR COMPARABLE P/B VALUATION';
        sheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
        sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DC3545' } };
        sheet.getCell('A1').alignment = { horizontal: 'center' };
        row += 2;

        // Method description
        sheet.getCell(`A${row}`).value = 'METHODOLOGY';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
        row++;

        sheet.getCell(`A${row}`).value = 'Fair Value = Median P/B (Sector) × Current BVPS';
        sheet.getCell(`A${row}`).font = { italic: true, color: { argb: '6B7280' } };
        row++;

        sheet.getCell(`A${row}`).value = 'We use the median P/B ratio of the top 10 companies by market cap in the same sector';
        sheet.getCell(`A${row}`).font = { italic: true, color: { argb: '6B7280' } };
        row += 2;

        // Inputs
        sheet.getCell(`A${row}`).value = 'VALUATION INPUTS';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
        row++;

        const sectorPeers = valuationResults.sector_peers || {};
        const medianPB = sectorPeers.median_pb || valuationResults.justified_pb?.median_pb || 0;
        const bvps = stockData.book_value_per_share || stockData.bvps || 0;
        const fairValue = valuationResults.justified_pb?.shareValue || (medianPB * bvps);

        sheet.getCell(`A${row}`).value = 'Book Value per Share (BVPS)';
        sheet.getCell(`B${row}`).value = bvps;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`C${row}`).value = 'VND';
        row++;

        sheet.getCell(`A${row}`).value = 'Sector';
        sheet.getCell(`B${row}`).value = sectorPeers.sector || stockData.sector || 'N/A';
        sheet.getCell(`B${row}`).font = { bold: true };
        row++;

        sheet.getCell(`A${row}`).value = 'Median P/B (Top 10 by Market Cap)';
        sheet.getCell(`B${row}`).value = medianPB;
        sheet.getCell(`B${row}`).numFmt = '0.00';
        sheet.getCell(`B${row}`).font = { bold: true, color: { argb: 'DC3545' } };
        sheet.getCell(`C${row}`).value = 'From sector_peers.json';
        sheet.getCell(`C${row}`).font = { italic: true, color: { argb: '6B7280' } };
        row += 2;

        // Calculation
        sheet.getCell(`A${row}`).value = 'VALUATION RESULT';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
        row++;

        sheet.getCell(`A${row}`).value = 'Formula: Fair Value = Median P/B × BVPS';
        sheet.getCell(`A${row}`).font = { italic: true, color: { argb: '6B7280' } };
        row++;

        sheet.getCell(`A${row}`).value = `Calculation: ${medianPB.toFixed(2)} × ${bvps.toLocaleString()} = ${fairValue.toLocaleString()} VND`;
        sheet.getCell(`A${row}`).font = { color: { argb: '6B7280' } };
        row++;

        sheet.getCell(`A${row}`).value = 'Fair Value per Share';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
        sheet.getCell(`B${row}`).value = fairValue;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`B${row}`).font = { bold: true, size: 12, color: { argb: 'DC3545' } };
        sheet.getCell(`C${row}`).value = 'VND';
        row += 2;

        sheet.getCell(`A${row}`).value = 'Current Market Price';
        sheet.getCell(`B${row}`).value = stockData.current_price || 0;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`C${row}`).value = 'VND';
        row++;

        const upside = stockData.current_price ? ((fairValue - stockData.current_price) / stockData.current_price) : 0;
        sheet.getCell(`A${row}`).value = 'Upside/Downside';
        sheet.getCell(`B${row}`).value = upside;
        sheet.getCell(`B${row}`).numFmt = '+0.00%;-0.00%';
        sheet.getCell(`B${row}`).font = { bold: true, color: { argb: upside >= 0 ? '28A745' : 'DC3545' } };
        row += 2;

        // ===== PEER COMPARISON TABLE =====
        if (sectorPeers.peers_detail && sectorPeers.peers_detail.length > 0) {
            sheet.getCell(`A${row}`).value = 'PEER COMPARISON (Top 10 by Market Cap)';
            sheet.getCell(`A${row}`).font = { bold: true, size: 11 };
            sheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBEE' } };
            row++;

            ['Symbol', 'Market Cap (Bn)', 'P/E', 'P/B'].forEach((h, i) => {
                sheet.getCell(row, i + 1).value = h;
                sheet.getCell(row, i + 1).font = { bold: true };
                sheet.getCell(row, i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F5F5F5' } };
            });
            row++;

            // Peer data rows
            sectorPeers.peers_detail.forEach(peer => {
                sheet.getCell(`A${row}`).value = peer.symbol;
                sheet.getCell(`B${row}`).value = peer.market_cap || 0;
                sheet.getCell(`B${row}`).numFmt = '#,##0.0';
                sheet.getCell(`C${row}`).value = peer.pe_ratio || 0;
                sheet.getCell(`C${row}`).numFmt = '0.00';
                sheet.getCell(`D${row}`).value = peer.pb_ratio || 0;
                sheet.getCell(`D${row}`).numFmt = '0.00';
                row++;
            });

            // Median row
            row++;
            sheet.getCell(`A${row}`).value = 'MEDIAN';
            sheet.getCell(`A${row}`).font = { bold: true };
            sheet.getCell(`C${row}`).value = sectorPeers.median_pe || 0;
            sheet.getCell(`C${row}`).numFmt = '0.00';
            sheet.getCell(`D${row}`).value = sectorPeers.median_pb || 0;
            sheet.getCell(`D${row}`).numFmt = '0.00';
            sheet.getCell(`D${row}`).font = { bold: true, color: { argb: 'DC3545' } };
        }

        sheet.getColumn(1).width = 40;
        sheet.getColumn(2).width = 20;
        sheet.getColumn(3).width = 12;
        sheet.getColumn(4).width = 12;
    }

    createAssumptionsSheet(sheet, stockData, assumptions, modelWeights, currentStock) {
        let row = 1;
        sheet.getCell('A1').value = 'VALUATION ASSUMPTIONS';
        sheet.getCell('A1').font = { bold: true, size: 14 };
        row += 2;

        const assumptionsData = [
            ['Revenue Growth Rate (%)', assumptions.revenueGrowth],
            ['Terminal Growth Rate (%)', assumptions.terminalGrowth],
            ['WACC (%)', assumptions.wacc],
            ['Cost of Equity (%)', assumptions.requiredReturn],
            ['Tax Rate (%)', assumptions.taxRate],
            ['Projection Years', assumptions.projectionYears]
        ];

        assumptionsData.forEach(([label, value]) => {
            sheet.getCell(`A${row}`).value = label;
            sheet.getCell(`B${row}`).value = value;
            row++;
        });

        // Add Model Weights
        row += 2;
        sheet.getCell(`A${row}`).value = 'MODEL WEIGHTS';
        sheet.getCell(`A${row}`).font = { bold: true, size: 14 };
        row++;

        const weightsData = [
            ['FCFE Weight (%)', modelWeights.fcfe],
            ['FCFF Weight (%)', modelWeights.fcff],
            ['P/E Weight (%)', modelWeights.justified_pe],
            ['P/B Weight (%)', modelWeights.justified_pb]
        ];

        weightsData.forEach(([label, value]) => {
            sheet.getCell(`A${row}`).value = label;
            sheet.getCell(`B${row}`).value = value;
            row++;
        });

        sheet.getColumn(1).width = 30;
        sheet.getColumn(2).width = 20;
    }

    createSectorPeersSheet(sheet, stockData, valuationResults) {
        let row = 1;
        const sectorPeers = valuationResults.sector_peers || {};

        // Header
        sheet.mergeCells('A1:E1');
        sheet.getCell('A1').value = 'SECTOR PEER COMPARISON';
        sheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
        sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '6C757D' } };
        sheet.getCell('A1').alignment = { horizontal: 'center' };
        row += 2;

        // Sector Info
        sheet.getCell(`A${row}`).value = 'SECTOR INFORMATION';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
        row++;

        sheet.getCell(`A${row}`).value = 'Current Stock';
        sheet.getCell(`B${row}`).value = stockData.symbol || 'N/A';
        sheet.getCell(`B${row}`).font = { bold: true, color: { argb: '0066CC' } };
        row++;

        sheet.getCell(`A${row}`).value = 'Sector';
        sheet.getCell(`B${row}`).value = sectorPeers.sector || stockData.sector || 'N/A';
        sheet.getCell(`B${row}`).font = { bold: true };
        row++;

        sheet.getCell(`A${row}`).value = 'Total Companies in Sector';
        sheet.getCell(`B${row}`).value = sectorPeers.total_in_sector || 'N/A';
        row++;

        sheet.getCell(`A${row}`).value = 'Peer Count (Top by Market Cap)';
        sheet.getCell(`B${row}`).value = sectorPeers.peer_count || 0;
        row += 2;

        // Summary Statistics
        sheet.getCell(`A${row}`).value = 'VALUATION SUMMARY';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
        sheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E3F2FD' } };
        row++;

        sheet.getCell(`A${row}`).value = 'Median P/E (Sector)';
        sheet.getCell(`B${row}`).value = sectorPeers.median_pe || 'N/A';
        sheet.getCell(`B${row}`).numFmt = '0.00';
        sheet.getCell(`B${row}`).font = { bold: true, color: { argb: 'FFC107' } };
        sheet.getCell(`C${row}`).value = 'Used for Comparable P/E Valuation';
        sheet.getCell(`C${row}`).font = { italic: true, color: { argb: '6B7280' } };
        row++;

        sheet.getCell(`A${row}`).value = 'Median P/B (Sector)';
        sheet.getCell(`B${row}`).value = sectorPeers.median_pb || 'N/A';
        sheet.getCell(`B${row}`).numFmt = '0.00';
        sheet.getCell(`B${row}`).font = { bold: true, color: { argb: 'DC3545' } };
        sheet.getCell(`C${row}`).value = 'Used for Comparable P/B Valuation';
        sheet.getCell(`C${row}`).font = { italic: true, color: { argb: '6B7280' } };
        row += 2;

        // Current Stock Comparison
        sheet.getCell(`A${row}`).value = 'CURRENT STOCK vs SECTOR MEDIAN';
        sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
        sheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E0' } };
        row++;

        sheet.getCell(`A${row}`).value = `${stockData.symbol} P/E`;
        sheet.getCell(`B${row}`).value = stockData.pe_ratio || 'N/A';
        sheet.getCell(`B${row}`).numFmt = '0.00';
        const peDiff = sectorPeers.median_pe && stockData.pe_ratio
            ? ((stockData.pe_ratio - sectorPeers.median_pe) / sectorPeers.median_pe * 100)
            : 0;
        sheet.getCell(`C${row}`).value = peDiff ? `${peDiff >= 0 ? '+' : ''}${peDiff.toFixed(1)}% vs Median` : '';
        sheet.getCell(`C${row}`).font = { color: { argb: peDiff > 0 ? 'DC3545' : '28A745' } };
        row++;

        sheet.getCell(`A${row}`).value = `${stockData.symbol} P/B`;
        sheet.getCell(`B${row}`).value = stockData.pb_ratio || 'N/A';
        sheet.getCell(`B${row}`).numFmt = '0.00';
        const pbDiff = sectorPeers.median_pb && stockData.pb_ratio
            ? ((stockData.pb_ratio - sectorPeers.median_pb) / sectorPeers.median_pb * 100)
            : 0;
        sheet.getCell(`C${row}`).value = pbDiff ? `${pbDiff >= 0 ? '+' : ''}${pbDiff.toFixed(1)}% vs Median` : '';
        sheet.getCell(`C${row}`).font = { color: { argb: pbDiff > 0 ? 'DC3545' : '28A745' } };
        row += 2;

        // Peers Table
        if (sectorPeers.peers_detail && sectorPeers.peers_detail.length > 0) {
            sheet.getCell(`A${row}`).value = 'TOP PEERS BY MARKET CAP';
            sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
            sheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E8F5E9' } };
            row++;

            // Table header
            const headers = ['#', 'Symbol', 'Market Cap (Bn VND)', 'P/E Ratio', 'P/B Ratio'];
            headers.forEach((h, i) => {
                sheet.getCell(row, i + 1).value = h;
                sheet.getCell(row, i + 1).font = { bold: true };
                sheet.getCell(row, i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F5F5F5' } };
                sheet.getCell(row, i + 1).alignment = { horizontal: 'center' };
            });
            row++;

            // Peer data rows
            sectorPeers.peers_detail.forEach((peer, idx) => {
                sheet.getCell(`A${row}`).value = idx + 1;
                sheet.getCell(`A${row}`).alignment = { horizontal: 'center' };

                sheet.getCell(`B${row}`).value = peer.symbol;
                sheet.getCell(`B${row}`).font = { bold: true };

                sheet.getCell(`C${row}`).value = peer.market_cap || 0;
                sheet.getCell(`C${row}`).numFmt = '#,##0.0';
                sheet.getCell(`C${row}`).alignment = { horizontal: 'right' };

                sheet.getCell(`D${row}`).value = peer.pe_ratio || 0;
                sheet.getCell(`D${row}`).numFmt = '0.00';
                sheet.getCell(`D${row}`).alignment = { horizontal: 'right' };

                sheet.getCell(`E${row}`).value = peer.pb_ratio || 0;
                sheet.getCell(`E${row}`).numFmt = '0.00';
                sheet.getCell(`E${row}`).alignment = { horizontal: 'right' };

                row++;
            });

            // Median row
            row++;
            sheet.getCell(`A${row}`).value = '';
            sheet.getCell(`B${row}`).value = 'MEDIAN';
            sheet.getCell(`B${row}`).font = { bold: true };
            sheet.getCell(`B${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E8F5E9' } };

            sheet.getCell(`C${row}`).value = '';
            sheet.getCell(`C${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E8F5E9' } };

            sheet.getCell(`D${row}`).value = sectorPeers.median_pe || 0;
            sheet.getCell(`D${row}`).numFmt = '0.00';
            sheet.getCell(`D${row}`).font = { bold: true, color: { argb: 'FFC107' } };
            sheet.getCell(`D${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E8F5E9' } };

            sheet.getCell(`E${row}`).value = sectorPeers.median_pb || 0;
            sheet.getCell(`E${row}`).numFmt = '0.00';
            sheet.getCell(`E${row}`).font = { bold: true, color: { argb: 'DC3545' } };
            sheet.getCell(`E${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E8F5E9' } };
        } else {
            sheet.getCell(`A${row}`).value = 'No sector peer data available';
            sheet.getCell(`A${row}`).font = { italic: true, color: { argb: '6B7280' } };
        }

        // Column widths
        sheet.getColumn(1).width = 8;
        sheet.getColumn(2).width = 30;
        sheet.getColumn(3).width = 22;
        sheet.getColumn(4).width = 15;
        sheet.getColumn(5).width = 15;
    }

    createCompanyDataSheet(sheet, stockData, currentStock) {
        let row = 1;

        sheet.getCell('A1').value = 'FINANCIAL DATA REFERENCE';
        sheet.getCell('A1').font = { bold: true, size: 14 };
        row += 2;

        // Company Info
        const companyData = [
            ['Symbol', currentStock],
            ['Name', stockData.name],
            ['Sector', stockData.sector],
            ['Exchange', stockData.exchange],
            ['', ''],
            ['Current Price', stockData.current_price],
            ['Market Cap', stockData.market_cap],
            ['Shares Outstanding', stockData.shares_outstanding],
            ['EPS (TTM)', stockData.eps_ttm || stockData.eps],
            ['Book Value/Share', stockData.bvps || stockData.book_value_per_share],
            ['P/E Ratio', stockData.pe_ratio],
            ['P/B Ratio', stockData.pb_ratio],
            ['', ''],
            ['Revenue (TTM)', stockData.revenue_ttm],
            ['Net Income (TTM)', stockData.net_income_ttm],
            ['EBITDA', stockData.ebitda],
            ['ROE (%)', stockData.roe],
            ['ROA (%)', stockData.roa],
            ['Debt/Equity', stockData.debt_to_equity]
        ];

        companyData.forEach(([label, value]) => {
            sheet.getCell(`A${row}`).value = label;
            sheet.getCell(`B${row}`).value = value;
            if (typeof value === 'number' && label !== '') {
                sheet.getCell(`B${row}`).numFmt = '#,##0.00';
            }
            if (label !== '') {
                sheet.getCell(`A${row}`).font = { bold: true };
            }
            row++;
        });

        sheet.getColumn(1).width = 30;
        sheet.getColumn(2).width = 25;
    }
}
