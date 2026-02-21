import React from "react"
import { cx } from "@/lib/utils"

export const DatabaseLogo = ({ className }: { className?: string }) => {
    return (
        <div className={cx("flex items-center gap-2", className)}>
            <img
                src="/favicon.ico"
                alt=""
                className="size-6 object-contain"
            />
            <span className="text-lg font-bold text-gray-900 whitespace-nowrap dark:text-gray-50">Quang Anh</span>
        </div>
    )
}
