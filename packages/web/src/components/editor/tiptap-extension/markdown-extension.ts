import TiptapLink from "@tiptap/extension-link";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { marked } from "marked";

// const renderer = new marked.Renderer();

// renderer.list = function (token) {
//   return `<ul class="task-list">${token}</ul>`;
// };

// renderer.listitem = function (item) {
//   const text = typeof item === "string" ? item : item.text || "";
//   const checked = typeof item === "object" && item.checked;
//   const task = typeof item === "object" && item.task;

//   if (task) {
//     return `<li class="task-list-item"><input type="checkbox" ${
//       checked ? "checked" : ""
//     } disabled class="task-list-item-checkbox"> ${text}</li>`;
//   }

//   return `<li>${text}</li>`;
// };

// const renderer = {
//   list({ tokens, depth }: { tokens: any; depth: number }) {
//     console.log("tokens", tokens, depth);
//     return `<ul class="task-list">${tokens}</ul>`;
//   },
//   listitem({ tokens, depth }: { tokens: any; depth: number }) {
//     console.log("tokens", tokens, depth);

//     const text = typeof tokens === "string" ? tokens : tokens.text || "";
//     const checked = typeof tokens === "object" && tokens.checked;
//     const task = typeof tokens === "object" && tokens.task;
//     if (task) {
//       return `<li class="task-list-item"><input type="checkbox" ${
//         checked ? "checked" : ""
//       } disabled class="task-list-item-checkbox"> ${text}</li>`;
//     }
//     return `<li>${text}</li>`;
//   },
// };

// marked.use({ renderer });

// marked.setOptions({
//   renderer: renderer,
//   gfm: true,
//   breaks: true,
// });
// Customize the list rendering to match TipTap's expected format

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
              let preprocessedText = clipboardText;

              const html = marked(preprocessedText, {
                async: false,
                breaks: false,
                extensions: null,
                gfm: true,
                hooks: null,
                pedantic: false,
                silent: false,
                tokenizer: null,
                walkTokens: null,
              }) as string;
              console.log("html", html);

              const processedHtml = html
                .replace(
                  /<li>\s*<input\s+(?:[^>]*?\s+)?type=(["'])checkbox\1[^>]*?\s+checked[^>]*>(.*?)<\/li>/gi,
                  '<li data-type="taskItem" data-checked="true"><p>$2</p></li>'
                )
                .replace(
                  /<li>\s*<input\s+(?:[^>]*?\s+)?type=(["'])checkbox\1[^>]*?>(.*?)<\/li>/gi,
                  '<li data-type="taskItem" data-checked="false"><p>$2</p></li>'
                )
                .replace(
                  /<ul>(\s*<li data-type="taskItem"[^>]*>.*?<\/li>\s*)+<\/ul>/gi,
                  '<ul data-type="taskList">$1</ul>'
                );

              console.log("processed html", processedHtml);

              this.editor.commands.insertContent(processedHtml);
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
