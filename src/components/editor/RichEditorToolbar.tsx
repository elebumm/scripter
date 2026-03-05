"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Undo,
  Redo,
} from "lucide-react";
import { LinkDialog } from "./LinkDialog";

interface RichEditorToolbarProps {
  editor: Editor | null;
}

export function RichEditorToolbar({ editor }: RichEditorToolbarProps) {
  if (!editor) return null;

  const btnClass = "h-7 w-7 p-0";

  return (
    <div className="flex items-center gap-0.5 border-b px-2 py-1">
      <Button
        variant={editor.isActive("bold") ? "secondary" : "ghost"}
        size="sm"
        className={btnClass}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
      >
        <Bold className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant={editor.isActive("italic") ? "secondary" : "ghost"}
        size="sm"
        className={btnClass}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
      >
        <Italic className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant={editor.isActive("strike") ? "secondary" : "ghost"}
        size="sm"
        className={btnClass}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="Strikethrough"
      >
        <Strikethrough className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant={editor.isActive("code") ? "secondary" : "ghost"}
        size="sm"
        className={btnClass}
        onClick={() => editor.chain().focus().toggleCode().run()}
        title="Inline Code"
      >
        <Code className="h-3.5 w-3.5" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Button
        variant={editor.isActive("heading", { level: 1 }) ? "secondary" : "ghost"}
        size="sm"
        className={btnClass}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        title="Heading 1"
      >
        <Heading1 className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant={editor.isActive("heading", { level: 2 }) ? "secondary" : "ghost"}
        size="sm"
        className={btnClass}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Heading 2"
      >
        <Heading2 className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant={editor.isActive("heading", { level: 3 }) ? "secondary" : "ghost"}
        size="sm"
        className={btnClass}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="Heading 3"
      >
        <Heading3 className="h-3.5 w-3.5" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Button
        variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
        size="sm"
        className={btnClass}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet List"
      >
        <List className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
        size="sm"
        className={btnClass}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Ordered List"
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant={editor.isActive("blockquote") ? "secondary" : "ghost"}
        size="sm"
        className={btnClass}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="Blockquote"
      >
        <Quote className="h-3.5 w-3.5" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <LinkDialog editor={editor}>
        <Button
          variant={editor.isActive("link") ? "secondary" : "ghost"}
          size="sm"
          className={btnClass}
          title="Link"
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </Button>
      </LinkDialog>

      <div className="flex-1" />

      <Button
        variant="ghost"
        size="sm"
        className={btnClass}
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo"
      >
        <Undo className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={btnClass}
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo"
      >
        <Redo className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
