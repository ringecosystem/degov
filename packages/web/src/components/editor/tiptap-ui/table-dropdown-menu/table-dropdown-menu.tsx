"use client";

import * as React from "react";

// --- Hooks ---
import { useTiptapEditor } from "../../hooks/use-tiptap-editor";
// --- UI Primitives ---
import { ChevronDownIcon } from "../../tiptap-icons/chevron-down-icon";
import { Button } from "../../tiptap-ui-primitive/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from "../../tiptap-ui-primitive/dropdown-menu";

import type { ButtonProps } from "../../tiptap-ui-primitive/button";
// --- Icons ---
import type { Editor } from "@tiptap/react";

export interface TableDropdownMenuProps extends Omit<ButtonProps, "type"> {
  /**
   * The TipTap editor instance.
   */
  editor?: Editor;
  /**
   * Whether the dropdown should be hidden when no table operations are available
   * @default false
   */
  hideWhenUnavailable?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

export const TableDropdownMenu = React.forwardRef<
  HTMLButtonElement,
  TableDropdownMenuProps
>(
  ({
    editor: providedEditor,
    onOpenChange,
    className = "",
    children,
    ...props
  }) => {
    const editor = useTiptapEditor(providedEditor);
    const [isOpen, setIsOpen] = React.useState(false);

    // 所有钩子必须在条件判断前定义
    const handleOpenChange = React.useCallback(
      (open: boolean) => {
        setIsOpen(open);
        onOpenChange?.(open);
      },
      [onOpenChange]
    );

    // 所有表格操作函数
    const insertTable = React.useCallback(() => {
      if (!editor) return;
      editor
        .chain()
        .focus()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run();
    }, [editor]);

    const addColumnBefore = React.useCallback(() => {
      if (!editor) return;
      editor.chain().focus().addColumnBefore().run();
    }, [editor]);

    const addColumnAfter = React.useCallback(() => {
      if (!editor) return;
      editor.chain().focus().addColumnAfter().run();
    }, [editor]);

    const deleteColumn = React.useCallback(() => {
      if (!editor) return;
      editor.chain().focus().deleteColumn().run();
    }, [editor]);

    const addRowBefore = React.useCallback(() => {
      if (!editor) return;
      editor.chain().focus().addRowBefore().run();
    }, [editor]);

    const addRowAfter = React.useCallback(() => {
      if (!editor) return;
      editor.chain().focus().addRowAfter().run();
    }, [editor]);

    const deleteRow = React.useCallback(() => {
      if (!editor) return;
      editor.chain().focus().deleteRow().run();
    }, [editor]);

    const deleteTable = React.useCallback(() => {
      if (!editor) return;
      editor.chain().focus().deleteTable().run();
    }, [editor]);

    const mergeOrSplit = React.useCallback(() => {
      if (!editor) return;
      editor.chain().focus().mergeOrSplit().run();
    }, [editor]);

    // 在所有钩子和函数定义之后再进行条件判断
    if (!editor || !editor.isEditable) {
      return null;
    }

    const isTableActive = editor.isActive("table");

    return (
      <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            // ref={ref}
            type="button"
            data-style="ghost"
            data-active-state={isTableActive ? "on" : "off"}
            role="button"
            tabIndex={-1}
            aria-label="Table options"
            tooltip="Table"
            className={className}
            {...props}
          >
            {children || (
              <>
                Table
                <ChevronDownIcon className="tiptap-button-dropdown-small" />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent>
          {!isTableActive ? (
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Button
                  onClick={insertTable}
                  className="w-full text-left px-3 py-2"
                >
                  Insert Table
                </Button>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          ) : (
            <>
              <DropdownMenuGroup>
                <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  Columns
                </div>
                <DropdownMenuItem asChild>
                  <Button
                    onClick={addColumnBefore}
                    className="w-full text-left px-3 py-2"
                  >
                    Add Column Before
                  </Button>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Button
                    onClick={addColumnAfter}
                    className="w-full text-left px-3 py-2"
                  >
                    Add Column After
                  </Button>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Button
                    onClick={deleteColumn}
                    className="w-full text-left px-3 py-2"
                  >
                    Delete Column
                  </Button>
                </DropdownMenuItem>
              </DropdownMenuGroup>

              {/* 其余部分保持不变 */}
              <DropdownMenuGroup>
                <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  Rows
                </div>
                <DropdownMenuItem asChild>
                  <Button
                    onClick={addRowBefore}
                    className="w-full text-left px-3 py-2"
                  >
                    Add Row Before
                  </Button>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Button
                    onClick={addRowAfter}
                    className="w-full text-left px-3 py-2"
                  >
                    Add Row After
                  </Button>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Button
                    onClick={deleteRow}
                    className="w-full text-left px-3 py-2"
                  >
                    Delete Row
                  </Button>
                </DropdownMenuItem>
              </DropdownMenuGroup>

              <DropdownMenuGroup>
                <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                  Cells
                </div>
                <DropdownMenuItem asChild>
                  <Button
                    onClick={mergeOrSplit}
                    className="w-full text-left px-3 py-2"
                  >
                    Merge/Split Cells
                  </Button>
                </DropdownMenuItem>
              </DropdownMenuGroup>

              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Button
                    onClick={deleteTable}
                    className="w-full text-left px-3 py-2 text-red-600 dark:text-red-400"
                  >
                    Delete Table
                  </Button>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
);

TableDropdownMenu.displayName = "TableDropdownMenu";

export default TableDropdownMenu;
