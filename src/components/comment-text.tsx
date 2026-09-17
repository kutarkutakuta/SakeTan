import { linkifyText } from "@/lib/linkify";

export function CommentText({ children }: { children: string }) {
  return (
    <>
      {linkifyText(children).map((part, index) =>
        part.kind === "link" ? (
          <a
            className="comment-link"
            href={part.value}
            key={`${index}-${part.value}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {part.value}
          </a>
        ) : (
          part.value
        ),
      )}
    </>
  );
}
