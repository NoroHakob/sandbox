import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown"

// react-markdown passes its AST node as a prop, which must not reach the DOM
function domProps<T extends ExtraProps>({ node, ...props }: T) {
  void node
  return props
}

// Theme tokens keep the colors right in light and dark mode
const components: Components = {
  p: (props) => <p className="leading-relaxed" {...domProps(props)} />,
  ul: (props) => (
    <ul
      className="list-disc space-y-1 pl-5 marker:text-muted-foreground"
      {...domProps(props)}
    />
  ),
  ol: (props) => (
    <ol
      className="list-decimal space-y-1 pl-5 marker:text-muted-foreground"
      {...domProps(props)}
    />
  ),
  li: (props) => <li className="pl-1 leading-relaxed" {...domProps(props)} />,
  strong: (props) => (
    <strong className="font-semibold text-foreground" {...domProps(props)} />
  ),
  em: (props) => <em className="italic" {...domProps(props)} />,
  a: (props) => (
    <a
      className="underline underline-offset-4 hover:text-foreground"
      target="_blank"
      rel="noreferrer"
      {...domProps(props)}
    />
  ),
  code: (props) => (
    <code
      className="rounded bg-muted px-1 py-0.5 font-mono text-sm"
      {...domProps(props)}
    />
  ),
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="flex flex-col gap-3">
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  )
}
