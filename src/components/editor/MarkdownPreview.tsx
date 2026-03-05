"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { remarkCallouts } from "@/lib/markdown/callout-plugin";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

export function MarkdownPreview({ content, className }: MarkdownPreviewProps) {
  return (
    <ScrollArea className={`overflow-hidden ${className ?? ""}`}>
      <div className="prose prose-sm dark:prose-invert max-w-none min-w-0 p-4 break-words">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkCallouts]}
          rehypePlugins={[rehypeRaw]}
        >
          {content}
        </ReactMarkdown>
      </div>
    </ScrollArea>
  );
}
