"use client";

import { useState } from "react";
import { Copy, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface AssistantMessageProps {
  content: string;
  className?: string;
}

type ContentBlock =
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

function parseContentBlocks(content: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const rawSections = content.split(/\n\s*\n/);

  for (const section of rawSections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);

    // Case 1: Entire block is a heading line
    if (lines.length === 1 && (/^#{1,4}\s+/.test(lines[0]) || /^\*\*[^*]+\*\*$/.test(lines[0]))) {
      const headingText = lines[0].replace(/^#{1,4}\s+/, "").replace(/^\*\*|\*\*$/g, "");
      blocks.push({ type: "heading", text: headingText });
      continue;
    }

    // Case 2: First line is a heading, followed by other lines in same section
    if (lines.length > 1 && (/^#{1,4}\s+/.test(lines[0]) || /^\*\*[^*]+\*\*$/.test(lines[0]))) {
      const headingText = lines[0].replace(/^#{1,4}\s+/, "").replace(/^\*\*|\*\*$/g, "");
      blocks.push({ type: "heading", text: headingText });

      const remainingLines = lines.slice(1);
      const isList = remainingLines.every((l) => /^[-*•]\s+|^\d+\.\s+/.test(l));
      if (isList) {
        blocks.push({
          type: "list",
          items: remainingLines.map((l) => l.replace(/^[-*•]\s+|^\d+\.\s+/, "")),
        });
      } else {
        blocks.push({ type: "paragraph", text: remainingLines.join(" ") });
      }
      continue;
    }

    // Case 3: Block is entirely a bullet or numbered list
    const isList = lines.every((l) => /^[-*•]\s+|^\d+\.\s+/.test(l));
    if (isList) {
      blocks.push({
        type: "list",
        items: lines.map((l) => l.replace(/^[-*•]\s+|^\d+\.\s+/, "")),
      });
      continue;
    }

    // Case 4: Standard paragraph
    blocks.push({ type: "paragraph", text: lines.join(" ") });
  }

  return blocks;
}

function renderInlineFormatted(text: string) {
  // Split on **bold** boundaries
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

export function AssistantMessage({ content, className }: AssistantMessageProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy assistant message:", err);
    }
  }

  const blocks = parseContentBlocks(content);

  return (
    <div className={cn("group/assistant mr-auto flex w-full max-w-[92%] flex-col items-start", className)}>
      <div className="relative w-full rounded-2xl rounded-tl-sm bg-neutral-900/70 border border-white/8 p-3.5 sm:p-4 text-sm leading-relaxed shadow-sm backdrop-blur-sm transition-colors hover:border-white/12">
        <div className="space-y-3">
          {blocks.map((block, idx) => {
            if (block.type === "heading") {
              return (
                <div key={idx} className="flex items-center gap-2 pt-0.5 pb-1 border-b border-white/5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <h4 className="text-sm font-semibold tracking-tight text-foreground sm:text-base">
                    {renderInlineFormatted(block.text)}
                  </h4>
                </div>
              );
            }

            if (block.type === "list") {
              return (
                <ul key={idx} className="space-y-1.5 pl-0.5 text-sm text-neutral-300">
                  {block.items.map((item, itemIdx) => (
                    <li key={itemIdx} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-foreground-muted/60 shrink-0" />
                      <span className="flex-1 leading-relaxed">
                        {renderInlineFormatted(item)}
                      </span>
                    </li>
                  ))}
                </ul>
              );
            }

            return (
              <p key={idx} className="text-sm text-neutral-300 leading-relaxed">
                {renderInlineFormatted(block.text)}
              </p>
            );
          })}
        </div>

        {/* Copy button on hover */}
        <div className="absolute top-2.5 right-2.5 opacity-0 transition-opacity duration-150 group-hover/assistant:opacity-100">
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy message"
            className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-800/80 text-foreground-muted hover:bg-neutral-700/80 hover:text-foreground shadow-sm transition-colors"
          >
            {copied ? (
              <Check className="h-3 w-3 text-success" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
