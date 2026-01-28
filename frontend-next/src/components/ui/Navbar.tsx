"use client"

import { siteConfig } from "@/app/siteConfig"
import useScroll from "@/lib/use-scroll"
import { cx, focusInput } from "@/lib/utils"
import { RiCloseLine, RiMenuLine, RiSearchLine } from "@remixicon/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useDebounce } from "use-debounce"
import React, { useState, useEffect, useRef } from "react"
import { DatabaseLogo } from "@/components/DatabaseLogo"
import { Button } from "@/components/Button"
import { getTickerData } from "@/lib/tickerCache"

interface Ticker {
    symbol: string;
    name: string;
    sector: string;
    exchange: string;
}

interface TickerData {
    tickers: Ticker[];
}

export function Navbar() {
    const scrolled = useScroll(15)
    const [open, setOpen] = React.useState(false)
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedQuery] = useDebounce(searchQuery, 300);
    const [allTickers, setAllTickers] = useState<Ticker[]>([]);
    const [searchResults, setSearchResults] = useState<Ticker[]>([]);
    const searchRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const router = useRouter();

    React.useEffect(() => {
        const mediaQuery: MediaQueryList = window.matchMedia("(min-width: 768px)")
        const handleMediaQueryChange = () => {
            setOpen(false)
            setSearchOpen(false)
        }

        mediaQuery.addEventListener("change", handleMediaQueryChange)
        handleMediaQueryChange()

        return () => {
            mediaQuery.removeEventListener("change", handleMediaQueryChange)
        }
    }, [])

    // Load tickers data on mount
    useEffect(() => {
        async function loadTickers() {
            const data = await getTickerData();
            if (data) {
                setAllTickers(data.tickers || []);
            }
        }
        loadTickers();
    }, []);

    // Handle click outside search
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setSearchOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Optimized search logic with debouncing
    useEffect(() => {
        if (!debouncedQuery || debouncedQuery.length < 1) {
            setSearchResults([]);
            return;
        }

        const upperQuery = debouncedQuery.toUpperCase();
        const lowerQuery = debouncedQuery.toLowerCase();

        // Limit results computation
        const filtered = allTickers.filter(ticker =>
            ticker.symbol.toUpperCase().includes(upperQuery) ||
            ticker.name.toLowerCase().includes(lowerQuery)
        ).sort((a, b) => {
            const symbolA = a.symbol.toUpperCase();
            const symbolB = b.symbol.toUpperCase();
            if (symbolA === upperQuery && symbolB !== upperQuery) return -1;
            if (symbolB === upperQuery && symbolA !== upperQuery) return 1;
            if (symbolA.startsWith(upperQuery) && !symbolB.startsWith(upperQuery)) return -1;
            if (!symbolA.startsWith(upperQuery) && symbolB.startsWith(upperQuery)) return 1;
            return 0;
        }).slice(0, 10);

        setSearchResults(filtered);
    }, [debouncedQuery, allTickers]);

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
    };

    const handleSelectStock = (symbol: string) => {
        setSearchOpen(false);
        setSearchQuery('');
        router.push(`/stock/${symbol}`);
    };

    const toggleSearch = () => {
        setSearchOpen(!searchOpen);
        if (!searchOpen) {
            setTimeout(() => {
                inputRef.current?.focus();
            }, 100);
        }
    }

    return (
        <header
            className={cx(
                "fixed inset-x-2 top-2 z-50 mx-auto flex max-w-6xl transform-gpu animate-slide-down-fade justify-center overflow-visible rounded-xl border border-transparent px-3 py-2.5 md:top-4 md:px-3 md:py-3 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1.03)] will-change-transform",
                open === true ? "h-52" : "h-14 md:h-16",
                scrolled || open === true
                    ? "backdrop-blur-nav max-w-4xl border-gray-100 bg-white/80 shadow-xl shadow-black/5 dark:border-white/15 dark:bg-black/70"
                    : "bg-white/0 dark:bg-gray-950/0",
            )}
        >
            <div className="w-full md:my-auto">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex-shrink-0">
                        <Link href={siteConfig.baseLinks.home} aria-label="Home">
                            <span className="sr-only">Company logo</span>
                            <DatabaseLogo className="w-24 md:w-32" />
                        </Link>
                    </div>

                    <nav className="hidden md:flex flex-1 justify-center">
                        <div className="flex items-center gap-6 lg:gap-8 font-medium">
                            <Link
                                className="px-2 py-1 text-gray-900 dark:text-gray-50 hover:text-blue-600 transition-colors"
                                href={siteConfig.baseLinks.market}
                            >
                                Market
                            </Link>
                            <Link
                                className="px-2 py-1 text-gray-900 dark:text-gray-50 hover:text-blue-600 transition-colors"
                                href="/stock/VCB"
                            >
                                Company
                            </Link>
                            <Link
                                className="px-2 py-1 text-gray-900 dark:text-gray-50 hover:text-blue-600 transition-colors"
                                href={siteConfig.baseLinks.about}
                            >
                                About
                            </Link>
                        </div>
                    </nav>

                    {/* Desktop Actions - Permanent Search Bar */}
                    <div className="hidden items-center md:flex">
                        <div className="relative" ref={searchRef}>
                            <div className="relative group">
                                <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    className={cx(
                                        "w-32 lg:w-48 rounded-full border border-gray-200 bg-gray-50/50 py-1.5 pl-9 pr-4 text-sm outline-none transition-all placeholder:text-gray-400 focus:w-64 lg:focus:w-72 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:focus:border-blue-500",
                                        focusInput
                                    )}
                                    placeholder="Search..."
                                    value={searchQuery}
                                    onChange={handleSearch}
                                    onFocus={() => setSearchOpen(true)}
                                />
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center group-focus-within:opacity-100 opacity-0 transition-opacity pointer-events-none">
                                    <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-gray-200 bg-gray-100 px-1.5 font-mono text-[10px] font-medium text-gray-500 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-400">
                                        ⌘K
                                    </kbd>
                                </div>
                            </div>

                            {searchOpen && searchQuery && (
                                <div className="absolute right-0 top-full mt-2 w-[320px] lg:w-[400px] rounded-xl border border-gray-200 bg-white p-2 shadow-2xl shadow-blue-500/10 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/95 overflow-hidden">
                                    <div className="px-2 py-1 mb-1">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Search Results</span>
                                    </div>
                                    <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                                        {searchResults.length > 0 ? (
                                            searchResults.map((result) => (
                                                <Link
                                                    key={result.symbol}
                                                    href={`/stock/${result.symbol}`}
                                                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/20 group"
                                                    onClick={() => {
                                                        setSearchOpen(false);
                                                        setSearchQuery('');
                                                    }}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-gray-900 dark:text-gray-50 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                                {result.symbol}
                                                            </span>
                                                            <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate max-w-[180px]">
                                                                {result.name}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                                                        {result.exchange}
                                                    </span>
                                                </Link>
                                            ))
                                        ) : (
                                            <div className="py-8 text-center text-gray-500 dark:text-gray-400">
                                                <p className="text-sm">No results found for "{searchQuery}"</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Mobile Menu Toggle */}
                    <div className="flex gap-x-2 md:hidden">
                        <Button
                            onClick={toggleSearch}
                            variant="ghost"
                            className="aspect-square p-2"
                        >
                            <RiSearchLine className="size-5" />
                        </Button>

                        <Button
                            onClick={() => setOpen(!open)}
                            variant="light"
                            className="aspect-square p-2"
                        >
                            {open ? (
                                <RiCloseLine aria-hidden="true" className="size-5" />
                            ) : (
                                <RiMenuLine aria-hidden="true" className="size-5" />
                            )}
                        </Button>
                    </div>
                </div>

                {/* Mobile Menu */}
                <nav
                    className={cx(
                        "my-6 flex text-lg ease-in-out will-change-transform md:hidden",
                        open ? "" : "hidden",
                    )}
                >
                    <ul className="space-y-4 font-medium">
                        <li onClick={() => setOpen(false)}>
                            <Link href={siteConfig.baseLinks.market}>Market</Link>
                        </li>
                        <li onClick={() => setOpen(false)}>
                            <Link href="/stock/VCB">Company</Link>
                        </li>
                        <li onClick={() => setOpen(false)}>
                            <Link href={siteConfig.baseLinks.about}>About</Link>
                        </li>
                    </ul>
                </nav>

                {/* Mobile Search Overlay - Simple version for now */}
                {searchOpen && (
                    <div className="absolute left-0 top-16 z-50 w-full md:hidden">
                        <div className="mx-auto max-w-sm rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-800 dark:bg-gray-950">
                            <div className="relative">
                                <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    className={cx(
                                        "w-full rounded-md border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-sm outline-none transition-all placeholder:text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-50",
                                        focusInput
                                    )}
                                    placeholder="Search stock symbol..."
                                    value={searchQuery}
                                    onChange={handleSearch}
                                />
                            </div>

                            {searchResults.length > 0 && (
                                <div className="mt-2 max-h-64 overflow-y-auto">
                                    {searchResults.map((result) => (
                                        <Link
                                            key={result.symbol}
                                            href={`/stock/${result.symbol}`}
                                            className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-900"
                                            onClick={() => {
                                                setSearchOpen(false);
                                                setSearchQuery('');
                                                setOpen(false); // Also close mobile menu
                                            }}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-gray-900 dark:text-gray-50">{result.symbol}</span>
                                                <span className="text-xs text-gray-500 dark:text-gray-400">{result.exchange}</span>
                                            </div>
                                            <span className="truncate text-xs text-gray-500 dark:text-gray-400 max-w-[120px]">{result.name}</span>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </header>
    )
}
