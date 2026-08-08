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

export async function searchMemory(
  query: string,
  groupId: string,
  limit = 20
): Promise<unknown[]> {
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
  return data.edges ?? [];
}
