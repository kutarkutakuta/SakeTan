import { linkifyText } from "@/lib/linkify";
import { ExternalLink } from "lucide-react";

export function CommentText({ children }: { children: string }) {
  return (
    <>
      {linkifyText(children).map((part, index) =>
        part.kind === "link" ? (
          <a
            className="comment-link comment-link-icon"
            href={part.value}
            key={`${index}-${part.value}`}
            aria-label={`外部リンクを開く: ${part.value}`}
            target="_blank"
            rel="noopener noreferrer"
            title={part.value}
          >
            <ExternalLink size={17} aria-hidden="true" />
          </a>
        ) : (
          part.value
        ),
      )}
    </>
  );
}
