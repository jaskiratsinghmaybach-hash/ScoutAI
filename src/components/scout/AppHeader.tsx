"use client";

import Image from "next/image";
import type { ReactNode } from "react";

export function AppHeader({
    title,
    actions,
    onLogoClick,
}: {
    title?: string;
    actions?: ReactNode;
    onLogoClick?: () => void;
}) {
    return (
        <header className="flex items-center justify-between border-b border-border px-6 py-2">
            <div className="flex items-center gap-3 min-w-0">
                {onLogoClick ? (
                    <button
                        type="button"
                        onClick={onLogoClick}
                        aria-label="Go to home"
                        className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong opacity-90 hover:opacity-100 transition-opacity"
                    >
                        <Image
                            src="/logo.avif"
                            alt="ScoutAI"
                            width={80}
                            height={40}
                            className="h-5 w-auto object-contain"
                        />
                    </button>
                ) : (
                    <Image
                        src="/logo.avif"
                        alt="ScoutAI"
                        width={80}
                        height={40}
                        className="h-5 w-auto shrink-0 object-contain"
                    />
                )}
                {title && (
                    <span className="truncate text-sm text-foreground-muted">{title}</span>
                )}
            </div>

            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
    );
}