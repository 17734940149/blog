import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// 只允许安全链接，Markdown 不执行 HTML，避免文章内容成为脚本入口。
export function safeUrl(url: string) {
  return /^(https?:\/\/|mailto:|\/|#)/i.test(url) &&
    !url.startsWith("//") &&
    !/[\\\u0000-\u0020]/.test(url)
    ? url
    : "";
}

// 标题锚点同时用于正文和目录，中文标题也能稳定定位。
export function headingId(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

// 关闭原始 HTML 并为外链补齐隔离属性，后台预览也复用相同安全规则。
export function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={safeUrl}
        components={{
          h2: ({ children }) => (
            <h2 id={headingId(String(children))}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 id={headingId(String(children))}>{children}</h3>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              {...(href?.startsWith("http")
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <img
              src={typeof src === "string" ? src : undefined}
              alt={alt || ""}
              loading="lazy"
            />
          ),
          table: ({ children }) => (
            <div className="table-scroll">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
