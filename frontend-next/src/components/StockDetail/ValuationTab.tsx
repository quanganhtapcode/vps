'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { calculateValuation, fetchValuationSensitivity } from '@/lib/stockApi';
import { Card, Title, Text, Metric, Button, Badge, Grid, Col, TextInput, Callout } from '@tremor/react';
import { RiRefreshLine, RiStackLine, RiMoneyDollarCircleLine, RiBuildingLine, RiBarChartLine, RiBookOpenLine, RiScales3Line, RiErrorWarningFill, RiFileZipLine, RiShoppingCart2Line } from '@remixicon/react';
import { ReportGenerator } from '@/lib/reportGenerator';

function classNames(...classes: Array<string | false | undefined | null>) {
    return classes.filter(Boolean).join(' ');
}

interface ValuationTabProps {
    symbol: string;
    currentPrice: number;
    initialData?: any;
    isBank?: boolean;
    stockData?: any; // Added for thorough reporting
}

const ValuationTab: React.FC<ValuationTabProps> = ({ symbol, currentPrice, initialData, isBank, stockData }) => {
    const [loading, setLoading] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);
    const [result, setResult] = useState<any>(initialData || null);
    const [manualPrice, setManualPrice] = useState<number>(currentPrice || 0);
    const [userEditedPrice, setUserEditedPrice] = useState<boolean>(false);
    const [sensitivityData, setSensitivityData] = useState<any>(null);
    const [sensitivityLoading, setSensitivityLoading] = useState(false);
    const [showSensitivity, setShowSensitivity] = useState(false);



    // Initial Assumptions
    const defaultAssumptions = {
        revenueGrowth: 8,
        terminalGrowth: 3,
        wacc: 10.5,
        requiredReturn: 12,
        taxRate: 20,
        projectionYears: 5
    };

    const [assumptions, setAssumptions] = useState(defaultAssumptions);

    // Models State
    const [models, setModels] = useState({
        fcfe: { id: 'fcfe', name: 'FCFE', desc: 'Free Cash Flow to Equity', enabled: !isBank, weight: isBank ? 0 : 15, icon: RiMoneyDollarCircleLine },
        fcff: { id: 'fcff', name: 'FCFF', desc: 'Free Cash Flow to Firm', enabled: !isBank, weight: isBank ? 0 : 15, icon: RiBuildingLine },
        justified_pe: { id: 'justified_pe', name: 'P/E Comparables', desc: 'Relative P/E Valuation', enabled: true, weight: isBank ? 40 : 20, icon: RiBarChartLine },
        justified_pb: { id: 'justified_pb', name: 'P/B Comparables', desc: 'Relative P/B Valuation', enabled: true, weight: isBank ? 40 : 20, icon: RiBookOpenLine },
        graham: { id: 'graham', name: 'Graham', desc: 'Benjamin Graham Formula', enabled: !isBank, weight: isBank ? 0 : 15, icon: RiScales3Line },
        justified_ps: { id: 'justified_ps', name: 'P/S Comparables', desc: 'Price-to-Sales Valuation', enabled: true, weight: isBank ? 20 : 15, icon: RiShoppingCart2Line },
    });

    // Sync to latest market price, unless user explicitly edited it
    useEffect(() => {
        if (currentPrice > 0 && !userEditedPrice) {
            // Round to 2 decimal places to prevent crazy floats like 7186.869725
            setManualPrice(Math.round(currentPrice * 100) / 100);
        }
    }, [currentPrice, userEditedPrice]);

    // Update result if initialData changes
    useEffect(() => {
        if (initialData) setResult(initialData);
    }, [initialData]);

    const handleAssumptionChange = (key: string, value: string) => {
        setAssumptions(prev => ({ ...prev, [key]: parseFloat(value) || 0 }));
    };

    const toggleModel = (key: string) => {
        setModels(prev => {
            // Correct way to update nested state without mutation
            const targetModel = prev[key as keyof typeof models];
            const newModels = {
                ...prev,
                [key]: {
                    ...targetModel,
                    enabled: !targetModel.enabled
                }
            };

            // Recalculate weights
            const enabledCount = Object.values(newModels).filter(m => m.enabled).length;
            const weight = enabledCount > 0 ? 100 / enabledCount : 0;

            Object.keys(newModels).forEach(k => {
                const m = newModels[k as keyof typeof models];
                // Update weights for ALL models based on new count
                // We must create new objects for all of them to update the weight property
                if (m.enabled) {
                    newModels[k as keyof typeof models] = { ...m, weight: weight };
                } else {
                    newModels[k as keyof typeof models] = { ...m, weight: 0 };
                }
            });

            return newModels;
        });
    };

    const selectAllModels = () => {
        setModels(prev => {
            const newModels = { ...prev };
            const totalCount = Object.keys(newModels).length;
            const weight = 100 / totalCount;
            Object.keys(newModels).forEach(k => {
                const m = newModels[k as keyof typeof models];
                newModels[k as keyof typeof models] = { ...m, enabled: true, weight };
            });
            return newModels;
        });
    };

    const handleExport = () => {
        if (!result) return;

        // 1. Prepare Data
        const csvRows = [];

        // Header
        csvRows.push(['Valuation Report', symbol, new Date().toLocaleDateString('en-US')]);
        csvRows.push([]);

        // Assumptions
        csvRows.push(['INPUT ASSUMPTIONS']);
        csvRows.push(['Indicator', 'Value']);
        csvRows.push(['Current Price', manualPrice]);
        csvRows.push(['WACC (%)', assumptions.wacc]);
        csvRows.push(['Required Return (%)', assumptions.requiredReturn]);
        csvRows.push(['Revenue Growth (%)', assumptions.revenueGrowth]);
        csvRows.push(['Terminal Growth (%)', assumptions.terminalGrowth]);
        csvRows.push(['Tax Rate (%)', assumptions.taxRate]);
        csvRows.push([]);

        // Comparables breakdown (Industry median P/E TTM & P/B)
        const exportData = result?.export;
        const comparables = exportData?.comparables;
        const peTtm = comparables?.pe_ttm;
        const pb = comparables?.pb;
        const calc = exportData?.calculation;

        const industry = comparables?.industry || result?.inputs?.industry || '';
        const epsTtm = calc?.justified_pe?.eps_ttm ?? result?.inputs?.eps_ttm ?? '';
        const bvps = calc?.justified_pb?.bvps ?? result?.inputs?.bvps ?? '';

        const peMedianComputed = peTtm?.median_computed ?? '';
        const peUsed = peTtm?.used ?? result?.inputs?.industry_median_pe_ttm_used ?? '';
        const peCount = peTtm?.count ?? result?.inputs?.industry_pe_sample_size ?? '';
        const pbMedianComputed = pb?.median_computed ?? '';
        const pbUsed = pb?.used ?? result?.inputs?.industry_median_pb_used ?? '';
        const pbCount = pb?.count ?? result?.inputs?.industry_pb_sample_size ?? '';

        const justifiedPeResult = calc?.justified_pe?.result ?? result?.valuations?.justified_pe ?? '';
        const justifiedPbResult = calc?.justified_pb?.result ?? result?.valuations?.justified_pb ?? '';

        const peValues = Array.isArray(peTtm?.values) ? peTtm.values : [];
        const pbValues = Array.isArray(pb?.values) ? pb.values : [];
        const peValuesText = peValues.length ? peValues.slice(0, 100).join(';') : '';
        const pbValuesText = pbValues.length ? pbValues.slice(0, 100).join(';') : '';

        csvRows.push(['COMPARABLES (INDUSTRY MEDIAN)']);
        csvRows.push(['Field', 'Value']);
        csvRows.push(['Industry', industry]);
        csvRows.push(['EPS TTM', epsTtm]);
        csvRows.push(['BVPS', bvps]);
        csvRows.push(['PE TTM Median (Computed)', peMedianComputed]);
        csvRows.push(['PE TTM Used', peUsed]);
        csvRows.push(['PE Sample Size', peCount]);
        csvRows.push(['PB Median (Computed)', pbMedianComputed]);
        csvRows.push(['PB Used', pbUsed]);
        csvRows.push(['PB Sample Size', pbCount]);
        csvRows.push(['Justified PE Formula', 'EPS_TTM * PE_USED']);
        csvRows.push(['Justified PE Result', justifiedPeResult]);
        csvRows.push(['Justified PB Formula', 'BVPS * PB_USED']);
        csvRows.push(['Justified PB Result', justifiedPbResult]);
        if (peValuesText) csvRows.push(['PE values used (sample; max 100)', peValuesText]);
        if (pbValuesText) csvRows.push(['PB values used (sample; max 100)', pbValuesText]);
        csvRows.push([]);

        if (exportData?.comparables?.peers_detailed && exportData.comparables.peers_detailed.length > 0) {
            csvRows.push(['DETAILED COMPARABLES']);
            csvRows.push(['Symbol', 'P/E', 'P/B']);
            exportData.comparables.peers_detailed.forEach((peer: any) => {
                csvRows.push([
                    peer.symbol,
                    peer.pe !== null ? peer.pe.toFixed(2) : '',
                    peer.pb !== null ? peer.pb.toFixed(2) : ''
                ]);
            });
            csvRows.push([]);
        }

        // DCF Steps
        const fcfe = calc?.dcf_fcfe;
        if (fcfe?.details) {
            csvRows.push(['DCF FCFE CALCULATION']);
            csvRows.push(['Field', 'Value']);
            csvRows.push(['Base Cashflow (EPS)', fcfe.details.base_cashflow_per_share]);
            csvRows.push(['Annual Growth (%)', (fcfe.details.annual_growth * 100).toFixed(2)]);
            csvRows.push(['Discount Rate (Required Return) (%)', (fcfe.details.discount_rate * 100).toFixed(2)]);
            csvRows.push(['Terminal Growth (%)', (fcfe.details.terminal_growth * 100).toFixed(2)]);
            csvRows.push(['Years Projected', fcfe.details.years]);
            if (fcfe.details.cashflows && Array.isArray(fcfe.details.cashflows)) {
                fcfe.details.cashflows.forEach((cf: any) => {
                    csvRows.push([`Year ${cf.t} Cashflow`, cf.cashflow.toFixed(2)]);
                    csvRows.push([`Year ${cf.t} Present Value`, cf.pv.toFixed(2)]);
                });
            }
            csvRows.push(['PV Sum', fcfe.details.pv_sum?.toFixed(2) || '']);
            csvRows.push(['Terminal Value (TV)', fcfe.details.terminal_value?.toFixed(2) || '']);
            csvRows.push(['Terminal Value Discounted', fcfe.details.terminal_value_discounted?.toFixed(2) || '']);
            csvRows.push(['FCFE Result', fcfe.details.result?.toFixed(2) || '']);
            if (fcfe.details.notes && fcfe.details.notes.length > 0) {
                csvRows.push(['Notes', fcfe.details.notes.join('; ')]);
            }
            csvRows.push([]);
        }

        const fcff = calc?.dcf_fcff;
        if (fcff?.details) {
            csvRows.push(['DCF FCFF CALCULATION']);
            csvRows.push(['Field', 'Value']);
            csvRows.push(['Base Cashflow (EPS)', fcff.details.base_cashflow_per_share]);
            csvRows.push(['Annual Growth (%)', (fcff.details.annual_growth * 100).toFixed(2)]);
            csvRows.push(['Discount Rate (WACC) (%)', (fcff.details.discount_rate * 100).toFixed(2)]);
            csvRows.push(['Terminal Growth (%)', (fcff.details.terminal_growth * 100).toFixed(2)]);
            csvRows.push(['Years Projected', fcff.details.years]);
            if (fcff.details.cashflows && Array.isArray(fcff.details.cashflows)) {
                fcff.details.cashflows.forEach((cf: any) => {
                    csvRows.push([`Year ${cf.t} Cashflow`, cf.cashflow.toFixed(2)]);
                    csvRows.push([`Year ${cf.t} Present Value`, cf.pv.toFixed(2)]);
                });
            }
            csvRows.push(['PV Sum', fcff.details.pv_sum?.toFixed(2) || '']);
            csvRows.push(['Terminal Value (TV)', fcff.details.terminal_value?.toFixed(2) || '']);
            csvRows.push(['Terminal Value Discounted', fcff.details.terminal_value_discounted?.toFixed(2) || '']);
            csvRows.push(['FCFF Result', fcff.details.result?.toFixed(2) || '']);
            if (fcff.details.notes && fcff.details.notes.length > 0) {
                csvRows.push(['Notes', fcff.details.notes.join('; ')]);
            }
            csvRows.push([]);
        }

        // Graham Step
        csvRows.push(['GRAHAM FORMULA CALCULATION']);
        csvRows.push(['Field', 'Value']);
        csvRows.push(['EPS', epsTtm]);
        csvRows.push(['BVPS', bvps]);
        csvRows.push(['Formula', 'SQRT(22.5 * EPS * BVPS)']);
        csvRows.push(['Graham Result', result?.valuations?.graham?.toFixed(2) || '']);
        csvRows.push([]);

        // Models
        csvRows.push(['VALUATION METHOD', 'Weight (%)', 'Value (CUR)', 'Upside (%)']);
        Object.keys(models).forEach(key => {
            const m = models[key as keyof typeof models];
            if (m.enabled) {
                const val = result.valuations[key] || 0;
                const up = getUpside(val);
                csvRows.push([m.name, m.weight.toFixed(0), val.toFixed(0), up.toFixed(2)]);
            }
        });
        csvRows.push([]);

        // Final Result
        const weightedAvg = result?.valuations?.weighted_average || 0;
        const finalUpside = getUpside(weightedAvg);
        csvRows.push(['SUMMARY RESULTS']);
        csvRows.push(['Intrinsic Value (VND)', weightedAvg.toFixed(0)]);
        csvRows.push(['Upside (%)', finalUpside.toFixed(2)]);
        csvRows.push(['Recommendation', finalUpside >= 15 ? 'STRONG BUY' : finalUpside >= 5 ? 'BUY' : finalUpside <= -10 ? 'SELL' : 'HOLD']);

        // 2. Convert to CSV String
        const csvString = csvRows.map(row => row.join(',')).join('\n');

        // 3. Trigger Download
        const blob = new Blob(["\uFEFF" + csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Valuation_${symbol}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        URL.revokeObjectURL(url);
    };

    const getModelWeights = useCallback(() => ({
        fcfe: models.fcfe.enabled ? models.fcfe.weight : 0,
        fcff: models.fcff.enabled ? models.fcff.weight : 0,
        justified_pe: models.justified_pe.enabled ? models.justified_pe.weight : 0,
        justified_pb: models.justified_pb.enabled ? models.justified_pb.weight : 0,
        graham: models.graham.enabled ? models.graham.weight : 0,
        justified_ps: models.justified_ps.enabled ? models.justified_ps.weight : 0,
    }), [models]);

    const buildValuationPayload = useCallback(() => ({
        ...assumptions,
        modelWeights: getModelWeights(),
        currentPrice: manualPrice,
        includeComparableLists: true,
    }), [assumptions, getModelWeights, manualPrice]);

    const handleFullExport = async () => {
        setExportLoading(true);
        try {
            const fresh = await calculateValuation(symbol, buildValuationPayload());
            const exportResult = fresh?.success ? fresh : result;

            if (fresh?.success) {
                setResult(fresh);
            }

            if (!exportResult) {
                alert('Chưa có dữ liệu định giá để xuất. Vui lòng Analyze trước.');
                return;
            }

            const generator = new ReportGenerator();
            await generator.exportReport(stockData || exportResult.metrics || exportResult, exportResult, assumptions, getModelWeights(), symbol);
        } catch (error) {
            console.error('Export error:', error);
            alert('Lỗi xuất báo cáo: ' + (error as any).message);
        } finally {
            setExportLoading(false);
        }
    };

    const handleCalculate = async () => {
        setLoading(true);
        try {
            const data = await calculateValuation(symbol, buildValuationPayload());
            if (data && data.success) {
                setResult(data);
            }
        } catch (error) {
            console.error('Valuation error:', error);
        } finally {
            setLoading(false);
        }
    };

    // Auto-calculate on mount if data available
    useEffect(() => {
        if (symbol && manualPrice > 0 && !result && !loading) {
            handleCalculate();
        }
    }, [symbol, manualPrice, result]); // eslint-disable-line

    const handleLoadSensitivity = async () => {
        setSensitivityLoading(true);
        setShowSensitivity(true);
        try {
            const data = await fetchValuationSensitivity(symbol, {
                baseWacc: assumptions.wacc,
                baseGrowth: assumptions.revenueGrowth,
                terminalGrowth: assumptions.terminalGrowth,
                projectionYears: assumptions.projectionYears,
            });
            if (data?.success) setSensitivityData(data);
        } catch (err) {
            console.error('Sensitivity error:', err);
        } finally {
            setSensitivityLoading(false);
        }
    };

    const formatPrice = (val: number) => {
        if (!val) return '-';
        return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(val);
    };

    const getUpside = (target: number) => {
        if (!manualPrice || !target) return 0;
        return ((target - manualPrice) / manualPrice) * 100;
    };

    // Calculate weighted average dynamically on client side to support instant toggling
    const weightedAvg = React.useMemo(() => {
        if (!result?.valuations) return 0;

        let totalVal = 0;
        let totalWeight = 0;

        Object.keys(models).forEach(key => {
            const m = models[key as keyof typeof models];
            if (m.enabled) {
                const val = result.valuations[key] || 0;
                totalVal += val * m.weight;
                totalWeight += m.weight;
            }
        });

        // If totalWeight is close to 100, we divide by 100. If we want re-normalization:
        // totalWeight should mathematically be 100 based on toggle logic, but let's be safe
        return totalWeight > 0 ? totalVal / totalWeight : 0;
    }, [models, result]);

    const finalUpside = getUpside(weightedAvg);

    const handleReset = () => {
        setAssumptions(defaultAssumptions);
        setManualPrice(Math.round(currentPrice * 100) / 100 || 0);
        setUserEditedPrice(false);
    };

    return (
        <div className="space-y-6 pb-8">
            <div className="sm:flex sm:items-center sm:justify-between">
                <div>
                    <Title className="font-bold text-gray-900 dark:text-gray-50">Valuation Models</Title>
                    <Text className="mt-1">Customize assumptions and methods to estimate intrinsic value</Text>
                </div>
                <div className="mt-4 sm:mt-0 flex gap-2 w-full sm:w-auto">
                    <Button variant="secondary" onClick={handleReset} icon={RiRefreshLine} className="flex-1 sm:flex-none">
                        Reset
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={handleFullExport}
                        icon={RiFileZipLine}
                        loading={exportLoading}
                        className="flex-1 sm:flex-none"
                    >
                        Full Report
                    </Button>
                    <Button onClick={handleCalculate} loading={loading} className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 border-none text-white font-semibold">
                        Analyze
                    </Button>
                </div>
            </div>

            <Grid numItems={1} numItemsLg={3} className="gap-6">
                {/* Column 1: Assumptions */}
                <Col numColSpan={1}>
                    <Card className="h-full rounded-tremor-default">
                        <Title>Input Assumptions</Title>
                        <div className="mt-6 flex flex-col gap-4">
                            <div>
                                <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Market Data</Text>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-sm text-gray-600 dark:text-gray-400">Current Price</label>
                                        <div className="mt-1">
                                            <TextInput
                                                type="number"
                                                value={manualPrice.toString()}
                                                onValueChange={(v) => {
                                                    setManualPrice(parseFloat(v) || 0);
                                                    setUserEditedPrice(true);
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-sm text-gray-600 dark:text-gray-400">Discount Rate (WACC) %</label>
                                        <div className="mt-1">
                                            <TextInput
                                                type="number"
                                                value={assumptions.wacc.toString()}
                                                onValueChange={(v) => handleAssumptionChange('wacc', v)}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-sm text-gray-600 dark:text-gray-400">Required Return %</label>
                                        <div className="mt-1">
                                            <TextInput
                                                type="number"
                                                value={assumptions.requiredReturn.toString()}
                                                onValueChange={(v) => handleAssumptionChange('requiredReturn', v)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
                                <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Growth Rates</Text>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-sm text-gray-600 dark:text-gray-400">Revenue Growth %</label>
                                        <div className="mt-1">
                                            <TextInput
                                                type="number"
                                                value={assumptions.revenueGrowth.toString()}
                                                onValueChange={(v) => handleAssumptionChange('revenueGrowth', v)}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-sm text-gray-600 dark:text-gray-400">Terminal Growth %</label>
                                        <div className="mt-1">
                                            <TextInput
                                                type="number"
                                                value={assumptions.terminalGrowth.toString()}
                                                onValueChange={(v) => handleAssumptionChange('terminalGrowth', v)}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-sm text-gray-600 dark:text-gray-400">Tax Rate %</label>
                                        <div className="mt-1">
                                            <TextInput
                                                type="number"
                                                value={assumptions.taxRate.toString()}
                                                onValueChange={(v) => handleAssumptionChange('taxRate', v)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>
                </Col>

                {/* Column 2 & 3: Models & Results */}
                <Col numColSpan={1} numColSpanLg={2}>
                    <div className="flex flex-col gap-6 h-full">
                        {/* Models Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            {(Object.keys(models) as Array<keyof typeof models>).map(key => {
                                const m = models[key];
                                const Icon = m.icon;
                                return (
                                    <div
                                        key={key}
                                        onClick={() => toggleModel(key)}
                                        className={classNames(
                                            "cursor-pointer rounded-tremor-default border p-4 transition-all hover:shadow-sm",
                                            m.enabled
                                                ? "border-blue-500 bg-blue-50/50 ring-1 ring-blue-500 dark:bg-blue-900/20"
                                                : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-950"
                                        )}
                                    >
                                        <div className="flex items-start justify-between">
                                            <Icon className={classNames("h-5 w-5", m.enabled ? "text-blue-600" : "text-gray-400")} />
                                            {m.enabled && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                                        </div>
                                        <div className="mt-3">
                                            <p className={classNames("text-sm font-semibold", m.enabled ? "text-blue-700 dark:text-blue-400" : "text-gray-700 dark:text-gray-300")}>
                                                {m.name}
                                            </p>
                                            <p className="mt-1 text-xs text-gray-500 line-clamp-1">{m.desc}</p>
                                        </div>
                                    </div>
                                );
                            })}
                            <div
                                onClick={selectAllModels}
                                className="cursor-pointer rounded-tremor-default border border-dashed border-gray-300 bg-gray-50 p-4 flex flex-col items-center justify-center text-center transition-all hover:bg-gray-100 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900/50"
                            >
                                <RiStackLine className="h-5 w-5 text-gray-400" />
                                <span className="mt-2 text-xs font-medium text-gray-600 dark:text-gray-400">Select All</span>
                            </div>
                        </div>

                        {/* Result Card */}
                        {result && (
                            <Card className="flex-1 flex flex-col justify-between rounded-tremor-default overflow-hidden relative border-none bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-lg p-0">
                                <div className="p-8 relative z-10">
                                    <Text className="text-slate-400 font-medium tracking-wider uppercase text-xs">Intrinsic Value (Projected)</Text>
                                    <div className="mt-2 flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-4">
                                        <span className="text-4xl sm:text-5xl font-bold tracking-tight">
                                            {formatPrice(weightedAvg)}
                                        </span>
                                        <Badge
                                            size="xl"
                                            color={finalUpside >= 0 ? "emerald" : "rose"}
                                            className="font-bold w-fit"
                                        >
                                            {finalUpside > 0 ? '+' : ''}{finalUpside.toFixed(1)}% UPSIDE
                                        </Badge>
                                    </div>
                                    <div className="mt-8 border-t border-slate-700/50 pt-8">
                                        <div className="grid grid-cols-2 gap-8">
                                            <div>
                                                <Text className="text-slate-400 text-xs uppercase mb-1">Recommendation</Text>
                                                <Title className={classNames(
                                                    "text-2xl sm:text-3xl font-black",
                                                    finalUpside >= 15 ? "text-emerald-400" : finalUpside <= -10 ? "text-rose-400" : "text-amber-400"
                                                )}>
                                                    {finalUpside >= 15 ? 'STRONG BUY' : finalUpside >= 5 ? 'ACCUMULATE' : finalUpside <= -10 ? 'SELL' : 'HOLD'}
                                                </Title>
                                            </div>
                                            <div className="text-right">
                                                <Text className="text-slate-400 text-xs uppercase mb-1">Confidence</Text>
                                                <div className="flex justify-end gap-1">
                                                    {[1, 2, 3, 4, 5].map(i => (
                                                        <div key={i} className={classNames("h-2 w-6 rounded-full", i <= 4 ? "bg-blue-500" : "bg-slate-700")} />
                                                    ))}
                                                </div>
                                                <Text className="text-xs text-slate-500 mt-1">High</Text>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Background Decorations */}
                                <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
                                <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
                            </Card>
                        )}
                    </div>
                </Col>
            </Grid>


            {/* ── Individual model breakdown ── */}
            {result?.valuations && (
                <Card className="rounded-tremor-default overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <Title>Model Breakdown</Title>
                        <Badge size="sm" color="blue">{Object.values(models).filter(m => m.enabled).length} active models</Badge>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200 dark:border-gray-800">
                                    <th className="text-left py-2 pr-4 font-medium text-gray-600 dark:text-gray-400">Model</th>
                                    <th className="text-right py-2 px-4 font-medium text-gray-600 dark:text-gray-400">Est. Value</th>
                                    <th className="text-right py-2 px-4 font-medium text-gray-600 dark:text-gray-400">Upside</th>
                                    <th className="text-right py-2 pl-4 font-medium text-gray-600 dark:text-gray-400">Weight</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(Object.keys(models) as Array<keyof typeof models>).filter(k => models[k].enabled).map(key => {
                                    const m = models[key];
                                    const val = result.valuations[key] || 0;
                                    const up = getUpside(val);
                                    return (
                                        <tr key={key} className="border-b border-gray-100 dark:border-gray-900 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-900/50">
                                            <td className="py-3 pr-4">
                                                <div className="flex items-center gap-2">
                                                    <m.icon className="h-4 w-4 text-gray-400" />
                                                    <span className="font-medium text-gray-800 dark:text-gray-200">{m.name}</span>
                                                </div>
                                                <span className="text-xs text-gray-400">{m.desc}</span>
                                            </td>
                                            <td className="text-right px-4 font-mono font-semibold text-gray-900 dark:text-gray-100">
                                                {formatPrice(val)}
                                            </td>
                                            <td className={classNames(
                                                'text-right px-4 font-semibold tabular-nums',
                                                up >= 0 ? 'text-emerald-600' : 'text-rose-600'
                                            )}>
                                                {up > 0 ? '+' : ''}{up.toFixed(1)}%
                                            </td>
                                            <td className="text-right pl-4 text-gray-500">{m.weight.toFixed(0)}%</td>
                                        </tr>
                                    );
                                })}
                                <tr className="bg-gray-50 dark:bg-gray-900/50 font-bold">
                                    <td className="py-3 pr-4 text-gray-900 dark:text-gray-100">Weighted Average</td>
                                    <td className="text-right px-4 font-mono text-gray-900 dark:text-gray-100">{formatPrice(weightedAvg)}</td>
                                    <td className={classNames(
                                        'text-right px-4 tabular-nums',
                                        finalUpside >= 0 ? 'text-emerald-600' : 'text-rose-600'
                                    )}>
                                        {finalUpside > 0 ? '+' : ''}{finalUpside.toFixed(1)}%
                                    </td>
                                    <td className="text-right pl-4 text-gray-500">100%</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* ── DCF Sensitivity Analysis ── */}
            <Card className="rounded-tremor-default">
                <div className="flex items-center justify-between">
                    <div>
                        <Title>DCF Sensitivity Analysis</Title>
                        <Text className="mt-1 text-xs">Intrinsic value matrix: rows = EPS Growth, columns = WACC</Text>
                    </div>
                    <Button
                        variant="secondary"
                        size="xs"
                        onClick={handleLoadSensitivity}
                        loading={sensitivityLoading}
                        icon={RiBarChartLine}
                    >
                        {sensitivityData ? 'Refresh' : 'Load Matrix'}
                    </Button>
                </div>

                {showSensitivity && sensitivityLoading && (
                    <div className="mt-6 flex items-center justify-center h-32 text-gray-400">
                        <RiRefreshLine className="animate-spin h-6 w-6 mr-2" />
                        <span>Computing sensitivity matrix…</span>
                    </div>
                )}

                {sensitivityData?.success && !sensitivityLoading && (
                    <div className="mt-4 overflow-x-auto">
                        <p className="text-xs text-gray-500 mb-3">
                            EPS used: <strong>{sensitivityData.eps_used?.toLocaleString()}</strong> &nbsp;·&nbsp;
                            Base WACC: <strong>{sensitivityData.base_wacc}%</strong> &nbsp;·&nbsp;
                            Base Growth: <strong>{sensitivityData.base_growth}%</strong>
                        </p>
                        <table className="min-w-full text-xs border-collapse" style={{ minWidth: '640px' }}>
                            <thead>
                                <tr>
                                    <th className="p-2 text-right text-gray-500 border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                                        Growth↓ / WACC→
                                    </th>
                                    {sensitivityData.wacc_axis.map((w: number) => (
                                        <th key={w} className={classNames(
                                            'p-2 font-semibold text-center border border-gray-200 dark:border-gray-800',
                                            w === sensitivityData.base_wacc
                                                ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                                                : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400'
                                        )}>{w}%</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {sensitivityData.growth_axis.map((g: number, gi: number) => (
                                    <tr key={g}>
                                        <td className={classNames(
                                            'p-2 font-semibold text-right whitespace-nowrap border border-gray-200 dark:border-gray-800',
                                            g === sensitivityData.base_growth
                                                ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                                                : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400'
                                        )}>{g}%</td>
                                        {sensitivityData.matrix[gi].map((val: number, wi: number) => {
                                            const up = manualPrice > 0 ? ((val - manualPrice) / manualPrice) * 100 : 0;
                                            const isBase = sensitivityData.wacc_axis[wi] === sensitivityData.base_wacc && g === sensitivityData.base_growth;
                                            return (
                                                <td key={wi} className={classNames(
                                                    'p-2 text-center tabular-nums font-mono border border-gray-200 dark:border-gray-800 transition-colors',
                                                    isBase ? 'ring-2 ring-inset ring-blue-500 font-bold' : '',
                                                    val === 0
                                                        ? 'bg-gray-100 dark:bg-gray-900 text-gray-400'
                                                        : up >= 20 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300'
                                                        : up >= 5 ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                                                        : up >= -5 ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                                                        : up >= -15 ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400'
                                                        : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400'
                                                )}>
                                                    <span>{val > 0 ? val.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}</span>
                                                    {manualPrice > 0 && val > 0 && (
                                                        <span className="block text-[10px] opacity-70">{up > 0 ? '+' : ''}{up.toFixed(0)}%</span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-gray-500">
                            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-100 dark:bg-emerald-900/30 inline-block"></span> ≥+20% upside</span>
                            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-green-50 dark:bg-green-900/20 inline-block"></span> +5–20%</span>
                            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-50 dark:bg-amber-900/20 inline-block"></span> -5 to +5%</span>
                            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-orange-50 dark:bg-orange-900/20 inline-block"></span> -15 to -5%</span>
                            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-rose-50 dark:bg-rose-900/20 inline-block"></span> ≤-15%</span>
                        </div>
                    </div>
                )}
            </Card>

            {isBank && (
                <Callout
                    title="Bank Valuation Notice"
                    icon={RiErrorWarningFill}
                    color="amber"
                    className="mt-6"
                >
                    For the Banking sector, we strongly recommend prioritizing P/E and P/B Comparables. Traditional cash flow models like FCFE, FCFF, or the Graham formula often fail to accurately reflect value due to the unique capital structures and asset characteristics of financial institutions compared to industrial firms.
                </Callout>
            )}
        </div>
    );
};

// Memoize: only re-render when symbol changes or currentPrice changes by >0.5%
export default React.memo(ValuationTab, (prev, next) => {
    if (prev.symbol !== next.symbol) return false; // re-render on symbol change
    if (prev.isBank !== next.isBank) return false;
    // Skip re-render for tiny price fluctuations (< 0.5% change)
    const priceChanged = prev.currentPrice > 0
        ? Math.abs((next.currentPrice - prev.currentPrice) / prev.currentPrice) > 0.005
        : next.currentPrice !== prev.currentPrice;
    return !priceChanged; // true = skip re-render
});
