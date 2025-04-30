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
              const hasTaskList = /- \[([ xX])\]/.test(clipboardText);

              if (hasTaskList) {
                const lines = clipboardText.split("\n");
                let inTaskList = false;
                let taskListItems = [];
                let taskListHtml = "";

                for (let i = 0; i < lines.length; i++) {
                  const line = lines[i];
                  const taskMatch = line.match(/^- \[([ xX])\] (.+)$/);

                  if (taskMatch) {
                    if (!inTaskList) {
                      inTaskList = true;
                      taskListItems = [];
                    }

                    const isChecked = taskMatch[1].toLowerCase() === "x";
                    const taskText = taskMatch[2];
                    taskListItems.push({
                      checked: isChecked,
                      text: taskText,
                    });
                  } else if (
                    inTaskList &&
                    (!line.trim() || !line.startsWith("-"))
                  ) {
                    if (taskListItems.length > 0) {
                      let itemsHtml = "";
                      for (const item of taskListItems) {
                        itemsHtml += `<li data-type="taskItem" data-checked="${
                          item.checked ? "true" : "false"
                        }"><p>${item.text}</p></li>`;
                      }
                      taskListHtml += `<ul data-type="taskList">${itemsHtml}</ul>`;
                      taskListItems = [];
                    }
                    inTaskList = false;
                  }
                }

                if (inTaskList && taskListItems.length > 0) {
                  let itemsHtml = "";
                  for (const item of taskListItems) {
                    itemsHtml += `<li data-type="taskItem" data-checked="${
                      item.checked ? "true" : "false"
                    }"><p>${item.text}</p></li>`;
                  }
                  taskListHtml += `<ul data-type="taskList">${itemsHtml}</ul>`;
                }

                if (taskListHtml) {
                  let modifiedText = clipboardText;
                  const taskListRegex = /^- \[([ xX])\] .+(\n)?/gm;
                  modifiedText = modifiedText.replace(taskListRegex, "");

                  const otherHtml = marked(modifiedText, {
                    async: false,
                    breaks: false,
                    gfm: true,
                  }) as string;

                  const taskListSectionMatch =
                    clipboardText.match(/###\s*Task\s*List/i);
                  if (taskListSectionMatch) {
                    const markedTaskListHeader = otherHtml.match(
                      /<h3[^>]*>Task\s*List<\/h3>/i
                    );
                    if (markedTaskListHeader) {
                      const finalHtml = otherHtml.replace(
                        markedTaskListHeader[0],
                        `${markedTaskListHeader[0]}${taskListHtml}`
                      );
                      this.editor.commands.insertContent(finalHtml);
                      return true;
                    }
                  }

                  this.editor.commands.insertContent(otherHtml + taskListHtml);
                  return true;
                }
              }

              const html = marked(clipboardText, {
                async: false,
                breaks: false,
                gfm: true,
              }) as string;

              const processedHtml = html.replace(
                /<ul>((?:\s*<li>(?:<p>)?<input\s+[^>]*?type=["']checkbox["'][^>]*?>(?:<\/p>)?.*?<\/li>\s*)+)<\/ul>/gi,
                (match, listContent) => {
                  let processedItems = listContent.replace(
                    /<li>(?:<p>)?<input\s+[^>]*?type=["']checkbox["'][^>]*?checked[^>]*?>(?:<\/p>)?(.*?)<\/li>/gi,
                    '<li data-type="taskItem" data-checked="true"><p>$1</p></li>'
                  );

                  processedItems = processedItems.replace(
                    /<li>(?:<p>)?<input\s+[^>]*?type=["']checkbox["'][^>]*?>(?:<\/p>)?(.*?)<\/li>/gi,
                    '<li data-type="taskItem" data-checked="false"><p>$1</p></li>'
                  );

                  return `<ul data-type="taskList">${processedItems}</ul>`;
                }
              );

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
