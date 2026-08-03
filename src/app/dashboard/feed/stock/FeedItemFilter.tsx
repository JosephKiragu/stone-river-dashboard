"use client";

import { useRouter } from "next/navigation";

interface FeedItem {
  id: string;
  name: string;
}

export function FeedItemFilter({
  feedItems,
  currentItemId,
}: {
  feedItems: FeedItem[];
  currentItemId?: string;
}) {
  const router = useRouter();

  return (
    <select
      value={currentItemId ?? ""}
      onChange={(e) => {
        const id = e.target.value;
        router.push(id ? `/dashboard/feed/stock?item=${id}` : "/dashboard/feed/stock");
      }}
      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
    >
      <option value="">All items</option>
      {feedItems.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </select>
  );
}
