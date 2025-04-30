import TiptapLink from "@tiptap/extension-link";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { marked } from "marked";

export const MarkdownPaste = TiptapLink.extend({
  name: "markdownPaste",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("markdownPaste"),
        props: {
          handlePaste: (view, event) => {
            const isInCodeBlock = this.editor.isActive("codeBlock");

            if (isInCodeBlock) {
              return false;
            }

            const clipboardText = event.clipboardData?.getData("text/plain");
            if (!clipboardText) {
              return false;
            }

            try {
              const html = marked(clipboardText);
              this.editor.commands.insertContent(html);
              return true;
            } catch (error) {
              console.error("markdown paste error:", error);
              this.editor.commands.insertContent(clipboardText);
              return true;
            }
          },
        },
      }),
    ];
  },
});
