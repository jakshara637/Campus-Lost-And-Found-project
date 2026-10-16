const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

export type ApiItem = {
  id: number;
  title: string;
  description: string;
  category: string;
  location: string;
  image_path: string | null;
  item_type: "lost" | "found";
  status: "open" | "claim_requested" | "resolved" | string;
  posted_by: number;
  created_at: string;
};

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function fetchItems(signal?: AbortSignal): Promise<ApiItem[]> {
  const response = await fetch(apiUrl("/items/"), { signal });

  if (!response.ok) {
    throw new Error(`Unable to load campus reports (HTTP ${response.status}).`);
  }

  const data: unknown = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("The API returned an unexpected reports format.");
  }

  return data as ApiItem[];
}
