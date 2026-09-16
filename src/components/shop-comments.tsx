"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MessageCircle, Pencil, Trash2 } from "lucide-react";
import { mutate } from "@/lib/client";
import type { ShopComment } from "@/lib/types";
import { dateLabel } from "@/lib/utils";
import { useToast } from "@/components/toast-provider";

export function ShopComments({
  shopId,
  comments,
  userId,
  admin,
  ready,
}: {
  shopId: string;
  comments: ShopComment[];
  userId: string | null;
  admin: boolean;
  ready: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [comment, setComment] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busy, setBusy] = useState(false);

  async function addComment() {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await mutate({
        kind: "shop_comment",
        shop_id: shopId,
        comment: comment.trim(),
      });
      setComment("");
      showToast("コメントを投稿しました");
      router.refresh();
    } catch (reason) {
      showToast(
        reason instanceof Error ? reason.message : "コメントできませんでした",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateComment(item: ShopComment, remove = false) {
    if (!remove && !editText.trim()) return;
    setBusy(true);
    try {
      await mutate({
        kind: "shop_comment_edit",
        id: item.id,
        comment: remove ? item.comment : editText.trim(),
        is_deleted: remove,
      });
      setEditing(null);
      showToast(remove ? "コメントを削除しました" : "コメントを変更しました");
      router.refresh();
    } catch (reason) {
      showToast(
        reason instanceof Error ? reason.message : "変更できませんでした",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="comments" className="comments-section">
      <h2>
        コメント <span className="count">{comments.length}</span>
      </h2>
      {userId ? (
        <form
          className="comment-form"
          onSubmit={(event) => {
            event.preventDefault();
            void addComment();
          }}
        >
          <textarea
            id="shop-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={1000}
            placeholder="訪問時の様子や取扱銘柄についてなど"
            required
          />
          <button
            className="button"
            type="submit"
            disabled={busy || !comment.trim()}
          >
            <MessageCircle size={18} />
            コメントする
          </button>
        </form>
      ) : ready ? (
        <Link
          className="button"
          href={"/login?next=" + encodeURIComponent(`/shops/${shopId}`)}
        >
          ログインしてコメント
        </Link>
      ) : null}
      <div className="comments-list">
        {comments.map((item) => {
          const canEdit = item.user_id === userId || admin;
          return (
            <article className="comment-item" key={item.id}>
              <div className="comment-meta">
                <strong>{item.users?.name ?? "ユーザー"}</strong>
                <span>{dateLabel(item.commented_on)}</span>
              </div>
              {editing === item.id ? (
                <form
                  className="comment-edit"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void updateComment(item);
                  }}
                >
                  <textarea
                    value={editText}
                    onChange={(event) => setEditText(event.target.value)}
                    maxLength={1000}
                    required
                  />
                  <div className="actions">
                    <button
                      className="button small"
                      type="submit"
                      disabled={busy}
                    >
                      保存
                    </button>
                    <button type="button" onClick={() => setEditing(null)}>
                      キャンセル
                    </button>
                  </div>
                </form>
              ) : (
                <p>{item.comment}</p>
              )}
              {canEdit && editing !== item.id && (
                <div className="comment-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(item.id);
                      setEditText(item.comment);
                    }}
                  >
                    <Pencil size={15} />
                    編集
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("このコメントを削除しますか？"))
                        void updateComment(item, true);
                    }}
                  >
                    <Trash2 size={15} />
                    削除
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {!comments.length && (
          <p className="muted">まだコメントがありません。</p>
        )}
      </div>
    </section>
  );
}
