"use client";

import { Highlight } from "@tiptap/extension-highlight";
import { Image } from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import { TextAlign } from "@tiptap/extension-text-align";
import { Typography } from "@tiptap/extension-typography";
import { Underline } from "@tiptap/extension-underline";
import { EditorContent, EditorContext, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import * as React from "react";
// --- Tiptap Core Extensions ---
import { Markdown } from "tiptap-markdown";

import { cn } from "@/lib/utils";

// --- Hooks ---
import { useMobile } from "./hooks/use-mobile";
import { useWindowSize } from "./hooks/use-window-size";
// --- Custom Extensions ---
import { Link } from "./tiptap-extension/link-extension";
import { MarkdownPaste } from "./tiptap-extension/markdown-extension";
import { Selection } from "./tiptap-extension/selection-extension";
import { TrailingNode } from "./tiptap-extension/trailing-node-extension";
// --- UI Primitives ---
import { ArrowLeftIcon } from "./tiptap-icons/arrow-left-icon";
import { HighlighterIcon } from "./tiptap-icons/highlighter-icon";
import { LinkIcon } from "./tiptap-icons/link-icon";
import { HeadingDropdownMenu } from "./tiptap-ui/heading-dropdown-menu";
import { LinkPopover, LinkContent, LinkButton } from "./tiptap-ui/link-popover";
import { ListDropdownMenu } from "./tiptap-ui/list-dropdown-menu";
import { MarkButton } from "./tiptap-ui/mark-button";
import { NodeButton } from "./tiptap-ui/node-button";
import { TableDropdownMenu } from "./tiptap-ui/table-dropdown-menu";
import { TextAlignDropdownMenu } from "./tiptap-ui/text-align-dropdown-menu";
import { UndoRedoButton } from "./tiptap-ui/undo-redo-button";
import { Button } from "./tiptap-ui-primitive/button";
import { Spacer } from "./tiptap-ui-primitive/spacer";
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from "./tiptap-ui-primitive/toolbar";
// --- Tiptap Node ---
import "./_keyframe-animations.scss";
import "./_variables.scss";
import "./tiptap-node/code-block-node/code-block-node.scss";
import "./tiptap-node/list-node/list-node.scss";
import "./tiptap-node/image-node/image-node.scss";
import "./tiptap-node/paragraph-node/paragraph-node.scss";
import "./tiptap-node/table-node/table-node.scss";
// --- Styles ---
import "./editor.scss";

// --- Table Dropdown Menu Component ---
const MainToolbarContent = ({
  onLinkClick,
  isMobile,
}: {
  onLinkClick: () => void;
  isMobile: boolean;
}) => {
  return (
    <>
      <ToolbarGroup>
        <UndoRedoButton action="undo" />
        <UndoRedoButton action="redo" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <HeadingDropdownMenu levels={[1, 2, 3, 4, 5, 6]} />
        <ListDropdownMenu types={["bulletList", "orderedList", "taskList"]} />
        <TextAlignDropdownMenu />
        <NodeButton type="codeBlock" />
        <NodeButton type="blockquote" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <TableDropdownMenu />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="bold" />
        <MarkButton type="italic" />
        <MarkButton type="strike" />
        <MarkButton type="code" />
        <MarkButton type="underline" />

        {!isMobile ? <LinkPopover /> : <LinkButton onClick={onLinkClick} />}
      </ToolbarGroup>

      {/* <ToolbarSeparator /> */}

      {/* <ToolbarGroup>
        <TextAlignButton align="left" />
        <TextAlignButton align="center" />
        <TextAlignButton align="right" />
        <TextAlignButton align="justify" />
      </ToolbarGroup> */}

      <ToolbarSeparator />

      <Spacer />

      {isMobile && <ToolbarSeparator />}
    </>
  );
};

const MobileToolbarContent = ({
  type,
  onBack,
}: {
  type: "highlighter" | "link";
  onBack: () => void;
}) => (
  <>
    <ToolbarGroup>
      <Button data-style="ghost" onClick={onBack}>
        <ArrowLeftIcon className="tiptap-button-icon" />
        {type === "highlighter" ? (
          <HighlighterIcon className="tiptap-button-icon" />
        ) : (
          <LinkIcon className="tiptap-button-icon" />
        )}
      </Button>
    </ToolbarGroup>

    <ToolbarSeparator />

    {<LinkContent />}
  </>
);

interface EditorProps {
  value?: string;
  onChange?: (html: string) => void;
  className?: string;
  placeholder?: string;
}

export function Editor({
  value,
  onChange,
  className,
  placeholder,
}: EditorProps) {
  const isMobile = useMobile();
  const windowSize = useWindowSize();
  const [mobileView, setMobileView] = React.useState<
    "main" | "highlighter" | "link"
  >("main");
  const [rect, setRect] = React.useState<
    Pick<DOMRect, "x" | "y" | "width" | "height">
  >({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const toolbarRef = React.useRef<HTMLDivElement>(null);

  // 用于存储初始内容的引用值
  const initialContent = React.useRef(value);

  const editor = useEditor({
    autofocus: true,
    immediatelyRender: false,
    content: value,
    editorProps: {
      attributes: {
        autocomplete: "off",
        autocorrect: "off",
        autocapitalize: "off",
        "aria-label": "Main content area, start typing to enter text.",
      },
    },
    extensions: [
      StarterKit,
      Markdown.configure({
        transformPastedText: true,
      }),
      Placeholder.configure({
        placeholder: placeholder,
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Image,
      Typography,
      Superscript,
      Subscript,

      // Table extensions
      Table.configure({
        resizable: true,
        lastColumnResizable: true,
        allowTableNodeSelection: true,
      }),
      TableRow,
      TableHeader,
      TableCell,

      Selection,

      TrailingNode,
      MarkdownPaste,
      Link.configure({ openOnClick: false }),
    ],
    onUpdate: ({ editor }) => {
      if (onChange) {
        onChange(editor.getHTML());
      }
    },
  });

  React.useEffect(() => {
    if (editor && value !== undefined && value !== initialContent.current) {
      if (editor.getHTML() !== value) {
        editor.commands.setContent(value);
        initialContent.current = value;
      }
    }
  }, [editor, value]);

  React.useEffect(() => {
    const updateRect = () => {
      setRect(document.body.getBoundingClientRect());
    };

    updateRect();

    const resizeObserver = new ResizeObserver(updateRect);
    resizeObserver.observe(document.body);

    window.addEventListener("scroll", updateRect);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", updateRect);
    };
  }, []);

  React.useEffect(() => {
    const checkCursorVisibility = () => {
      if (!editor || !toolbarRef.current) return;

      const { state, view } = editor;
      if (!view.hasFocus()) return;

      const { from } = state.selection;
      const cursorCoords = view.coordsAtPos(from);

      if (windowSize.height < rect.height) {
        if (cursorCoords && toolbarRef.current) {
          const toolbarHeight =
            toolbarRef.current.getBoundingClientRect().height;
          const isEnoughSpace =
            windowSize.height - cursorCoords.top - toolbarHeight > 0;

          // If not enough space, scroll until the cursor is the middle of the screen
          if (!isEnoughSpace) {
            const scrollY =
              cursorCoords.top - windowSize.height / 2 + toolbarHeight;
            window.scrollTo({
              top: scrollY,
              behavior: "smooth",
            });
          }
        }
      }
    };

    checkCursorVisibility();
  }, [editor, rect.height, windowSize.height]);

  React.useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  React.useEffect(() => {
    if (!isMobile && mobileView !== "main") {
      setMobileView("main");
    }
  }, [isMobile, mobileView]);

  return (
    <EditorContext.Provider value={{ editor }}>
      <div className={cn("tiptap-editor-container", className)}>
        <Toolbar
          ref={toolbarRef}
          style={
            isMobile
              ? {
                  bottom: `calc(100% - ${windowSize.height - rect.y}px)`,
                }
              : {}
          }
        >
          {mobileView === "main" ? (
            <MainToolbarContent
              onLinkClick={() => setMobileView("link")}
              isMobile={isMobile}
            />
          ) : (
            <MobileToolbarContent
              type={mobileView === "highlighter" ? "highlighter" : "link"}
              onBack={() => setMobileView("main")}
            />
          )}
        </Toolbar>

        <div className="content-wrapper">
          <EditorContent
            editor={editor}
            role="presentation"
            className="simple-editor-content"
          />
        </div>
      </div>
    </EditorContext.Provider>
  );
}
