import React from "react"
import { Badge } from "@/components/Badge"

const stats = [
    {
        name: "Ticker Coverage",
        value: "1600+",
    },
    {
        name: "Data Updates",
        value: "Real-time",
    },
    {
        name: "Valuation Models",
        value: "3+ Types",
    },
]

export default function Features() {
    return (
        <section
            aria-labelledby="features-title"
            className="mx-auto mt-44 w-full max-w-6xl px-3"
        >
            <Badge>Built for Investors</Badge>
            <h2
                id="features-title"
                className="mt-2 inline-block bg-gradient-to-br from-gray-900 to-gray-800 bg-clip-text py-2 text-4xl font-bold tracking-tighter text-transparent sm:text-6xl md:text-6xl dark:from-gray-50 dark:to-gray-300"
            >
                Global-grade market intelligence
            </h2>
            <p className="mt-6 max-w-3xl text-lg leading-7 text-gray-600 dark:text-gray-400">
                Access comprehensive Vietnamese market data with global-grade performance and tools. Surface key valuation and momentum signals to guide decisions faster.
            </p>
            <dl className="mt-12 grid grid-cols-1 gap-y-8 md:grid-cols-3 md:border-y md:border-gray-200 md:py-14 dark:border-gray-800">
                {stats.map((stat, index) => (
                    <React.Fragment key={index}>
                        <div className="border-l-2 border-indigo-100 pl-6 md:border-l md:text-center lg:border-gray-200 lg:first:border-none dark:border-indigo-900 lg:dark:border-gray-800">
                            <dd className="inline-block bg-gradient-to-t from-indigo-900 to-indigo-600 bg-clip-text text-5xl font-bold tracking-tight text-transparent lg:text-6xl dark:from-indigo-700 dark:to-indigo-400">
                                {stat.value}
                            </dd>
                            <dt className="mt-1 text-gray-600 dark:text-gray-400">
                                {stat.name}
                            </dt>
                        </div>
                    </React.Fragment>
                ))}
            </dl>
        </section>
    )
}
