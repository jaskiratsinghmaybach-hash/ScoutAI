"use client";

import Image from "next/image";
import type { ReactNode } from "react";

export function AppHeader({
    title,
    actions,
}: {
    title?: string;
    actions?: ReactNode;
}) {
    return (
        <header className="flex items-center justify-between border-b border-border px-6 py-2">
            <div className="flex items-center gap-3 min-w-0">
                <Image
                    src="/logo.avif"
                    alt="ScoutAI"
                    width={80}
                    height={40}
                    className="h-5 w-auto shrink-0 object-contain"
                />
                {title && (
                    <span className="truncate text-sm text-foreground-muted">{title}</span>
                )}
            </div>

            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
    );
}