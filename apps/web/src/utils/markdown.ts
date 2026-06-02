import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: true
  //   headerIds: true,
  //   mangle: false,
  //   sanitize: false
});

export async function markdownToHtml(markdown: string): Promise<string> {
  const rawHtml = await marked.parse(markdown);

  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'blockquote',
      'p',
      'a',
      'ul',
      'ol',
      'li',
      'b',
      'i',
      'strong',
      'em',
      'strike',
      'code',
      'hr',
      'br',
      'div',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'pre',
      'img'
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id']
  });

  return cleanHtml;
}
