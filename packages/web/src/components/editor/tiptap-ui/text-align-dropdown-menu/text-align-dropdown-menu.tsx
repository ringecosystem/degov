"use client";

import { type Editor } from "@tiptap/react";
import * as React from "react";

// --- Icons ---
// import { TextAlignLeftIcon } from "../../tiptap-icons/text-align-left-icon";
// import { TextAlignCenterIcon } from "../../tiptap-icons/text-align-center-icon";
// import { TextAlignRightIcon } from "../../tiptap-icons/text-align-right-icon";
// import { TextAlignJustifyIcon } from "../../tiptap-icons/text-align-justify-icon";
import { useTiptapEditor } from "../../hooks/use-tiptap-editor";
import { AlignCenterIcon } from "../../tiptap-icons/align-center-icon";
import { AlignJustifyIcon } from "../../tiptap-icons/align-justify-icon";
// --- Hooks ---
import { AlignLeftIcon } from "../../tiptap-icons/align-left-icon";
import { AlignRightIcon } from "../../tiptap-icons/align-right-icon";
import { ChevronDownIcon } from "../../tiptap-icons/chevron-down-icon";
// --- UI Primitives ---
import { Button } from "../../tiptap-ui-primitive/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
} from "../../tiptap-ui-primitive/dropdown-menu";
// --- Text Align Button ---
import { TextAlignButton } from "../text-align-button";

import type { ButtonProps } from "../../tiptap-ui-primitive/button";

type Align = "left" | "center" | "right" | "justify";

const alignIcons = {
  left: AlignLeftIcon,
  center: AlignCenterIcon,
  right: AlignRightIcon,
  justify: AlignJustifyIcon,
};

export interface TextAlignDropdownMenuProps extends Omit<ButtonProps, "type"> {
  editor?: Editor | null;
  aligns?: Align[];
  hideWhenUnavailable?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

export function TextAlignDropdownMenu({
  editor: providedEditor,
  aligns = ["left", "center", "right", "justify"],
  onOpenChange,
  ...props
}: TextAlignDropdownMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const editor = useTiptapEditor(providedEditor);

  const handleOnOpenChange = React.useCallback(
    (open: boolean) => {
      setIsOpen(open);
      onOpenChange?.(open);
    },
    [onOpenChange]
  );

  const getActiveIcon = React.useCallback(() => {
    if (!editor) return <AlignLeftIcon className="tiptap-button-icon" />;

    const activeAlign = aligns.find((align) =>
      editor.isActive({ textAlign: align })
    ) as Align | undefined;

    const ActiveIcon = alignIcons[activeAlign || "left"];
    return <ActiveIcon className="tiptap-button-icon" />;
  }, [editor, aligns]);

  const isAnyAlignActive =
    editor && aligns.some((align) => editor.isActive({ textAlign: align }));

  if (!editor || !editor.isEditable) {
    return null;
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOnOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          data-style="ghost"
          data-active-state={isAnyAlignActive ? "on" : "off"}
          role="button"
          tabIndex={-1}
          aria-label="Text alignment"
          tooltip="Text alignment"
          {...props}
        >
          {getActiveIcon()}
          <ChevronDownIcon className="tiptap-button-dropdown-small" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent>
        <DropdownMenuGroup>
          {aligns.map((align) => (
            <DropdownMenuItem key={`align-${align}`} asChild>
              <TextAlignButton editor={editor} align={align} tooltip="" />
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default TextAlignDropdownMenu;
