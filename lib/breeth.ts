const BREETH_BASE = "https://api.thebreeth.com";

function getApiKey(): string {
  const apiKey = process.env.BREETH_API_KEY;
  if (!apiKey) {
    throw new Error("BREETH_API_KEY is not set");
  }
  return apiKey;
}

export async function addEpisode(
  content: string,
  groupId: string,
  extractIntent = false
): Promise<unknown> {
  const res = await fetch(`${BREETH_BASE}/v1/episodes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content,
      group_id: groupId,
      extract_intent: extractIntent,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Breeth addEpisode error ${res.status}: ${text}`);
  }

  return res.json();
}

export type MemoryEdge = {
  fact?: string;
  content?: string;
  created_at?: string;
  valid_at?: string;
  edge_uuid?: string;
  [key: string]: unknown;
};

export type SessionEpisode = {
  uuid?: string;
  content_excerpt?: string;
  content?: string;
  created_at?: string;
  valid_at?: string;
  group_id?: string;
  [key: string]: unknown;
};

export async function searchMemory(
  query: string,
  groupId: string,
  limit = 20
): Promise<MemoryEdge[]> {
  const res = await fetch(`${BREETH_BASE}/v1/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      group_id: groupId,
      limit,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Breeth searchMemory error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return (data.edges ?? []) as MemoryEdge[];
}

/** List raw episodes for a session group (content + timestamps). */
export async function listSessionEpisodes(
  groupId: string,
  limit = 100
): Promise<SessionEpisode[]> {
  const res = await fetch(
    `${BREETH_BASE}/v1/graph/episodes?limit=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Breeth listSessionEpisodes error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const episodes = (data.episodes ?? []) as SessionEpisode[];
  const suffix = `_g_${groupId}`;
  return episodes.filter(
    (ep) =>
      ep.group_id === groupId ||
      (typeof ep.group_id === "string" && ep.group_id.endsWith(suffix))
  );
}
