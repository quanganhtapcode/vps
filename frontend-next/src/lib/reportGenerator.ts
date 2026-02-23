import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { getExcelExportUrl } from './stockApi';

/**
 * Report Generator Module
 * Ported from report-generator.js for Next.js
 */
export class ReportGenerator {
    private toast: any;

    constructor(toastManager?: any) {
        this.toast = toastManager || { show: console.log, hide: () => { } };
    }

    private showStatus(message: string, type: 'info' | 'error' | 'success' = 'info') {
        if (this.toast && this.toast.show) {
            this.toast.show(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    private formatCurrency(value: number) {
        if (!value && value !== 0) return '--';
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
    }

    async exportReport(stockData: any, valuationResults: any, assumptions: any, modelWeights: any, symbol: string) {
        if (!stockData || !valuationResults) {
            this.showStatus('No data available to export report', 'error');
            return;
        }

        try {
            this.showStatus('Generating comprehensive report package...', 'info');
            const zip = new JSZip();
            const dateStr = new Date().toISOString().split('T')[0];

            // 1. Create Valuation Excel Report
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'quanganh.org';
            workbook.created = new Date();

            // Add sheets (matching the structure in report-generator.js)
            const summarySheet = workbook.addWorksheet('Summary Dashboard', { views: [{ showGridLines: false }] });
            this.createSummaryDashboard(summarySheet, stockData, valuationResults, modelWeights, symbol);

            const fcfeSheet = workbook.addWorksheet('FCFE Analysis');
            this.createFCFESheet(fcfeSheet, stockData, valuationResults, assumptions);

            const fcffSheet = workbook.addWorksheet('FCFF Analysis');
            this.createFCFFSheet(fcffSheet, stockData, valuationResults, assumptions);

            const peSheet = workbook.addWorksheet('PE Analysis');
            this.createPESheet(peSheet, stockData, assumptions, valuationResults);

            const pbSheet = workbook.addWorksheet('PB Analysis');
            this.createPBSheet(pbSheet, stockData, assumptions, valuationResults);

            const sectorPeersSheet = workbook.addWorksheet('Sector Peers');
            this.createSectorPeersSheet(sectorPeersSheet, stockData, valuationResults);

            const companyDataSheet = workbook.addWorksheet('Company Data');
            this.createCompanyDataSheet(companyDataSheet, stockData, symbol);

            const assumptionsSheet = workbook.addWorksheet('Assumptions');
            this.createAssumptionsSheet(assumptionsSheet, stockData, assumptions, modelWeights);

            // Write Buffer
            const valuationBuffer = await workbook.xlsx.writeBuffer();
            zip.file(`${symbol}_Valuation_Report_${dateStr}.xlsx`, valuationBuffer);

            // 2. Fetch Original Financial Data (if available)
            let originalDataAdded = false;
            try {
                const downloadUrl = await getExcelExportUrl(symbol);
                if (downloadUrl) {
                    const response = await fetch(downloadUrl);
                    if (response.ok) {
                        const originalBuffer = await response.arrayBuffer();
                        zip.file(`${symbol}_Financial_Statement_Data.xlsx`, originalBuffer);
                        originalDataAdded = true;
                    }
                }
            } catch (error) {
                console.error('Error fetching original financial data:', error);
            }

            // 3. Generate ZIP and Download
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            saveAs(zipBlob, `${symbol}_Complete_Valuation_Package_${dateStr}.zip`);

            const successMsg = originalDataAdded
                ? `ZIP package downloaded with valuation report and original financial data!`
                : `ZIP package downloaded with valuation report!`;
            this.showStatus(successMsg, 'success');

        } catch (error: any) {
            console.error('Error generating report:', error);
            this.showStatus('Error generating report: ' + error.message, 'error');
        }
    }

    private createSummaryDashboard(sheet: ExcelJS.Worksheet, stockData: any, valuationResults: any, modelWeights: any, symbol: string) {
        let row = 1;
        sheet.mergeCells('A1:F1');
        const headerCell = sheet.getCell('A1');
        headerCell.value = `VALUATION SUMMARY REPORT: ${symbol}`;
        headerCell.font = { bold: true, size: 18, color: { argb: 'FFFFFF' } };
        headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E293B' } };
        headerCell.alignment = { horizontal: 'center', vertical: 'middle' };
        row += 2;

        const weightedAvg = valuationResults.valuations?.weighted_average || 0;
        const currentPrice = stockData.current_price || 0;
        const upside = currentPrice > 0 ? ((weightedAvg - currentPrice) / currentPrice) : 0;

        // Key Metrics Row
        sheet.getCell(`A${row}`).value = 'Intrinsic Value (VND)';
        sheet.getCell(`B${row}`).value = weightedAvg;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`B${row}`).font = { bold: true, size: 14, color: { argb: '0F172A' } };

        sheet.getCell(`C${row}`).value = 'Upside/Downside';
        sheet.getCell(`D${row}`).value = upside;
        sheet.getCell(`D${row}`).numFmt = '+0.0%;-0.0%';
        sheet.getCell(`D${row}`).font = { bold: true, size: 14, color: { argb: upside >= 0 ? '059669' : 'DC2626' } };

        row += 2;

        // Table of models
        sheet.getCell(`A${row}`).value = 'Valuation Model';
        sheet.getCell(`B${row}`).value = 'Value (VND)';
        sheet.getCell(`C${row}`).value = 'Weight (%)';
        sheet.getCell(`D${row}`).value = 'Contribution';
        [sheet.getCell(`A${row}`), sheet.getCell(`B${row}`), sheet.getCell(`C${row}`), sheet.getCell(`D${row}`)].forEach(c => {
            c.font = { bold: true };
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
        });
        row++;

        const models = [
            { name: 'FCFE (Free Cash Flow to Equity)', key: 'fcfe' },
            { name: 'FCFF (Free Cash Flow to Firm)', key: 'fcff' },
            { name: 'P/E Comparables', key: 'justified_pe' },
            { name: 'P/B Comparables', key: 'justified_pb' },
            { name: 'Graham Formula', key: 'graham' }
        ];

        models.forEach(m => {
            const val = valuationResults.valuations?.[m.key] || 0;
            const weight = modelWeights[m.key] || 0;
            if (weight > 0) {
                sheet.getCell(`A${row}`).value = m.name;
                sheet.getCell(`B${row}`).value = val;
                sheet.getCell(`B${row}`).numFmt = '#,##0';
                sheet.getCell(`C${row}`).value = weight / 100;
                sheet.getCell(`C${row}`).numFmt = '0%';
                sheet.getCell(`D${row}`).value = val * (weight / 100);
                sheet.getCell(`D${row}`).numFmt = '#,##0';
                row++;
            }
        });

        sheet.getColumn(1).width = 40;
        sheet.getColumn(2).width = 20;
        sheet.getColumn(3).width = 15;
        sheet.getColumn(4).width = 20;
    }

    private createFCFESheet(sheet: ExcelJS.Worksheet, stockData: any, valuationResults: any, assumptions: any) {
        const details = valuationResults.details?.fcfe_details || valuationResults.details?.fcfe || {};
        const inputs = details.inputs || {};
        let row = 1;

        sheet.getCell('A1').value = 'FCFE (FREE CASH FLOW TO EQUITY) ANALYSIS';
        sheet.getCell('A1').font = { bold: true, size: 14 };
        row += 2;

        const fcfe_data = [
            ['Net Income', inputs.netIncome || 0],
            ['Depreciation', inputs.depreciation || 0],
            ['Working Capital Change', inputs.workingCapitalInvestment || 0],
            ['CapEx', inputs.fixedCapitalInvestment || 0],
            ['Net Borrowing', inputs.netBorrowing || 0],
            ['', ''],
            ['Base FCFE (Year 0)', details.baseFCFE || 0]
        ];

        fcfe_data.forEach(([label, value]) => {
            sheet.getCell(`A${row}`).value = label;
            sheet.getCell(`B${row}`).value = value;
            if (typeof value === 'number') sheet.getCell(`B${row}`).numFmt = '#,##0';
            row++;
        });

        row += 1;
        sheet.getCell(`A${row}`).value = 'Projections:';
        sheet.getCell(`A${row}`).font = { bold: true };
        row++;

        const cf = details.projectedCashFlows || [];
        cf.forEach((val: number, i: number) => {
            sheet.getCell(`A${row}`).value = `Year ${i + 1}`;
            sheet.getCell(`B${row}`).value = val;
            sheet.getCell(`B${row}`).numFmt = '#,##0';
            row++;
        });

        sheet.getColumn(1).width = 30;
        sheet.getColumn(2).width = 25;
    }

    private createFCFFSheet(sheet: ExcelJS.Worksheet, stockData: any, valuationResults: any, assumptions: any) {
        const details = valuationResults.details?.fcff_details || valuationResults.details?.fcff || {};
        const inputs = details.inputs || {};
        let row = 1;

        sheet.getCell('A1').value = 'FCFF (FREE CASH FLOW TO FIRM) ANALYSIS';
        sheet.getCell('A1').font = { bold: true, size: 14 };
        row += 2;

        const fcff_data = [
            ['Net Income', inputs.netIncome || 0],
            ['Interest After Tax', inputs.interestAfterTax || 0],
            ['Depreciation', inputs.depreciation || 0],
            ['Working Capital Change', inputs.workingCapitalInvestment || 0],
            ['CapEx', inputs.fixedCapitalInvestment || 0],
            ['', ''],
            ['Base FCFF (Year 0)', details.baseFCFF || 0]
        ];

        fcff_data.forEach(([label, value]) => {
            sheet.getCell(`A${row}`).value = label;
            sheet.getCell(`B${row}`).value = value;
            if (typeof value === 'number') sheet.getCell(`B${row}`).numFmt = '#,##0';
            row++;
        });

        sheet.getColumn(1).width = 30;
        sheet.getColumn(2).width = 25;
    }

    private createPESheet(sheet: ExcelJS.Worksheet, stockData: any, assumptions: any, valuationResults: any) {
        const details = valuationResults.details?.justified_pe || {};
        let row = 1;

        sheet.getCell('A1').value = 'P/E COMPARABLE VALUATION';
        sheet.getCell('A1').font = { bold: true, size: 14 };
        row += 2;

        sheet.getCell(`A${row}`).value = 'EPS (TTM)';
        sheet.getCell(`B${row}`).value = details.eps || stockData.eps_ttm || 0;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        row++;

        sheet.getCell(`A${row}`).value = 'P/E Multiple Used';
        sheet.getCell(`B${row}`).value = details.ratio || 0;
        sheet.getCell(`B${row}`).numFmt = '0.00';
        row++;

        sheet.getCell(`A${row}`).value = 'Fair Value per Share';
        sheet.getCell(`B${row}`).value = details.shareValue || 0;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`B${row}`).font = { bold: true };
        row++;

        sheet.getColumn(1).width = 30;
        sheet.getColumn(2).width = 25;
    }

    private createPBSheet(sheet: ExcelJS.Worksheet, stockData: any, assumptions: any, valuationResults: any) {
        const details = valuationResults.details?.justified_pb || {};
        let row = 1;

        sheet.getCell('A1').value = 'P/B COMPARABLE VALUATION';
        sheet.getCell('A1').font = { bold: true, size: 14 };
        row += 2;

        sheet.getCell(`A${row}`).value = 'BVPS';
        sheet.getCell(`B${row}`).value = details.bvps || stockData.bvps || 0;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        row++;

        sheet.getCell(`A${row}`).value = 'P/B Multiple Used';
        sheet.getCell(`B${row}`).value = details.ratio || 0;
        sheet.getCell(`B${row}`).numFmt = '0.00';
        row++;

        sheet.getCell(`A${row}`).value = 'Fair Value per Share';
        sheet.getCell(`B${row}`).value = details.shareValue || 0;
        sheet.getCell(`B${row}`).numFmt = '#,##0';
        sheet.getCell(`B${row}`).font = { bold: true };
        row++;

        sheet.getColumn(1).width = 30;
        sheet.getColumn(2).width = 25;
    }

    private createSectorPeersSheet(sheet: ExcelJS.Worksheet, stockData: any, valuationResults: any) {
        const sectorPeers = valuationResults.sector_peers || {};
        let row = 1;

        sheet.getCell('A1').value = 'SECTOR PEERS COMPARISON';
        sheet.getCell('A1').font = { bold: true, size: 14 };
        row += 2;

        sheet.getCell(`A${row}`).value = 'Sector';
        sheet.getCell(`B${row}`).value = sectorPeers.sector || 'N/A';
        row++;

        sheet.getCell(`A${row}`).value = 'Median P/E';
        sheet.getCell(`B${row}`).value = sectorPeers.median_pe || 0;
        sheet.getCell(`B${row}`).numFmt = '0.00';
        row++;

        sheet.getCell(`A${row}`).value = 'Median P/B';
        sheet.getCell(`B${row}`).value = sectorPeers.median_pb || 0;
        sheet.getCell(`B${row}`).numFmt = '0.00';
        row += 2;

        // Peer Table
        const peers = sectorPeers.peers_detail || [];
        if (peers.length > 0) {
            ['#', 'Symbol', 'Market Cap (Bn)', 'P/E', 'P/B'].forEach((h, i) => {
                sheet.getCell(row, i + 1).value = h;
                sheet.getCell(row, i + 1).font = { bold: true };
                sheet.getCell(row, i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F1F5F9' } };
            });
            row++;

            peers.forEach((p: any, i: number) => {
                sheet.getCell(`A${row}`).value = i + 1;
                sheet.getCell(`B${row}`).value = p.symbol;
                sheet.getCell(`C${row}`).value = p.market_cap;
                sheet.getCell(`C${row}`).numFmt = '#,##0.0';
                sheet.getCell(`D${row}`).value = p.pe_ratio;
                sheet.getCell(`D${row}`).numFmt = '0.00';
                sheet.getCell(`E${row}`).value = p.pb_ratio;
                sheet.getCell(`E${row}`).numFmt = '0.00';
                row++;
            });
        }

        sheet.getColumn(2).width = 15;
        sheet.getColumn(3).width = 20;
    }

    private createCompanyDataSheet(sheet: ExcelJS.Worksheet, stockData: any, symbol: string) {
        let row = 1;
        sheet.getCell('A1').value = 'FINANCIAL METRICS REFERENCE';
        sheet.getCell('A1').font = { bold: true, size: 14 };
        row += 2;

        const data = [
            ['Symbol', symbol],
            ['Company Name', stockData.companyName || symbol],
            ['Sector', stockData.sector || 'N/A'],
            ['Market Cap', stockData.market_cap || stockData.marketCap || 0],
            ['EPS', stockData.eps_ttm || stockData.eps || 0],
            ['BVPS', stockData.bvps || stockData.bookValue || 0],
            ['P/E Ratio', stockData.pe_ratio || stockData.pe || 0],
            ['P/B Ratio', stockData.pb_ratio || stockData.pb || 0],
            ['ROE (%)', stockData.roe || 0],
            ['ROA (%)', stockData.roa || 0],
        ];

        data.forEach(([label, value]) => {
            sheet.getCell(`A${row}`).value = label;
            sheet.getCell(`B${row}`).value = value;
            if (typeof value === 'number') sheet.getCell(`B${row}`).numFmt = '#,##0.00';
            row++;
        });

        sheet.getColumn(1).width = 30;
        sheet.getColumn(2).width = 30;
    }

    private createAssumptionsSheet(sheet: ExcelJS.Worksheet, stockData: any, assumptions: any, modelWeights: any) {
        let row = 1;
        sheet.getCell('A1').value = 'VALUATION ASSUMPTIONS';
        sheet.getCell('A1').font = { bold: true, size: 14 };
        row += 2;

        Object.entries(assumptions).forEach(([k, v]) => {
            sheet.getCell(`A${row}`).value = k;
            sheet.getCell(`B${row}`).value = v as any;
            row++;
        });

        row += 2;
        sheet.getCell(`A${row}`).value = 'MODEL WEIGHTS';
        sheet.getCell(`A${row}`).font = { bold: true };
        row++;

        Object.entries(modelWeights).forEach(([k, v]) => {
            sheet.getCell(`A${row}`).value = k;
            sheet.getCell(`B${row}`).value = v as any;
            row++;
        });

        sheet.getColumn(1).width = 30;
        sheet.getColumn(2).width = 20;
    }
}
