'use client';

import React, { useState, useEffect } from 'react';
import { calculateValuation } from '@/lib/stockApi';
import { Card, Title, Text, Metric, Button, Badge, Grid, Col, TextInput, Callout } from '@tremor/react';
import { RiRefreshLine, RiStackLine, RiMoneyDollarCircleLine, RiBuildingLine, RiBarChartLine, RiBookOpenLine, RiScales3Line, RiErrorWarningFill } from '@remixicon/react';

function classNames(...classes: Array<string | false | undefined | null>) {
    return classes.filter(Boolean).join(' ');
}

interface ValuationTabProps {
    symbol: string;
    currentPrice: number;
    initialData?: any;
    isBank?: boolean;
}

const ValuationTab: React.FC<ValuationTabProps> = ({ symbol, currentPrice, initialData, isBank }) => {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(initialData || null);
    const [manualPrice, setManualPrice] = useState<number>(currentPrice || 0);

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
        fcfe: { id: 'fcfe', name: 'FCFE', desc: 'Free Cash Flow to Equity', enabled: !isBank, weight: isBank ? 0 : 20, icon: RiMoneyDollarCircleLine },
        fcff: { id: 'fcff', name: 'FCFF', desc: 'Free Cash Flow to Firm', enabled: !isBank, weight: isBank ? 0 : 20, icon: RiBuildingLine },
        justified_pe: { id: 'justified_pe', name: 'P/E Comparables', desc: 'Relative P/E Valuation', enabled: true, weight: isBank ? 50 : 20, icon: RiBarChartLine },
        justified_pb: { id: 'justified_pb', name: 'P/B Comparables', desc: 'Relative P/B Valuation', enabled: true, weight: isBank ? 50 : 20, icon: RiBookOpenLine },
        graham: { id: 'graham', name: 'Graham', desc: 'Benjamin Graham Formula', enabled: !isBank, weight: isBank ? 0 : 20, icon: RiScales3Line }
    });

    // Update manual price only if it hasn't been set by user interaction or initial load
    useEffect(() => {
        if (currentPrice > 0 && manualPrice === 0) setManualPrice(currentPrice);
    }, [currentPrice]);

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
            const weight = 100 / 5;
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
    };

    const handleCalculate = async () => {
        setLoading(true);
        try {
            const modelWeights = {
                fcfe: models.fcfe.enabled ? models.fcfe.weight : 0,
                fcff: models.fcff.enabled ? models.fcff.weight : 0,
                justified_pe: models.justified_pe.enabled ? models.justified_pe.weight : 0,
                justified_pb: models.justified_pb.enabled ? models.justified_pb.weight : 0,
                graham: models.graham.enabled ? models.graham.weight : 0,
            };

            const payload = {
                ...assumptions,
                modelWeights,
                currentPrice: manualPrice
            };

            const data = await calculateValuation(symbol, payload);
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
        setManualPrice(currentPrice || 0);
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
                    <Button variant="secondary" onClick={handleExport} icon={RiBookOpenLine} className="flex-1 sm:flex-none">
                        Export CSV
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
                                                onValueChange={(v) => setManualPrice(parseFloat(v) || 0)}
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

export default ValuationTab;
