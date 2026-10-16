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

type ApiErrorBody = { detail?: string | { msg?: string }[]; message?: string };

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getAccessToken(): string | null {
  return localStorage.getItem("campusloop_access_token");
}

export function saveAccessToken(token: string): void {
  localStorage.setItem("campusloop_access_token", token);
}

export function clearAccessToken(): void {
  localStorage.removeItem("campusloop_access_token");
}

async function ensureSuccess(response: Response): Promise<void> {
  if (response.ok) return;
  let message = `Request failed (HTTP ${response.status}).`;
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (typeof body.detail === "string") message = body.detail;
    else if (Array.isArray(body.detail) && body.detail.length) {
      message = body.detail.map((entry) => entry.msg || "Invalid input").join(" ");
    } else if (body.message) message = body.message;
  } catch {
    // Keep the useful HTTP fallback when the server does not return JSON.
  }
  throw new Error(message);
}

export async function fetchItems(signal?: AbortSignal): Promise<ApiItem[]> {
  const response = await fetch(apiUrl("/items/"), { signal });
  await ensureSuccess(response);
  const data: unknown = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("The API returned an unexpected reports format.");
  }
  return data as ApiItem[];
}

export async function registerUser(input: {
  full_name: string;
  email: string;
  password: string;
}): Promise<{ message: string }> {
  const response = await fetch(apiUrl("/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await ensureSuccess(response);
  return (await response.json()) as { message: string };
}

export async function verifyEmail(input: {
  email: string;
  otp: string;
}): Promise<{ message: string }> {
  const response = await fetch(apiUrl("/auth/verify-otp"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await ensureSuccess(response);
  return (await response.json()) as { message: string };
}

export async function resendVerificationCode(email: string): Promise<{ message: string }> {
  const response = await fetch(apiUrl("/auth/resend-otp"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  await ensureSuccess(response);
  return (await response.json()) as { message: string };
}

export async function loginUser(email: string, password: string): Promise<void> {
  const form = new URLSearchParams();
  form.set("username", email);
  form.set("password", password);
  const response = await fetch(apiUrl("/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  await ensureSuccess(response);
  const data = (await response.json()) as { access_token: string };
  saveAccessToken(data.access_token);
}

export async function createItem(input: {
  title: string;
  description: string;
  category: string;
  location: string;
  item_type: "lost" | "found";
  image?: File | null;
}): Promise<ApiItem> {
  const token = getAccessToken();
  if (!token) throw new Error("Please log in before submitting a report.");

  const form = new FormData();
  form.set("title", input.title);
  form.set("description", input.description);
  form.set("category", input.category);
  form.set("location", input.location);
  form.set("item_type", input.item_type);
  if (input.image) form.set("image", input.image);

  const response = await fetch(apiUrl("/items/"), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  await ensureSuccess(response);
  return (await response.json()) as ApiItem;
}


export type ApiUser = {
  id: number;
  full_name: string;
  email: string;
  role: string;
};

export type ApiClaim = {
  id: number;
  item_id: number;
  claimant_id: number;
  message: string;
  status: "pending" | "approved" | "rejected" | string;
  created_at: string;
};

async function authenticatedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getAccessToken();
  if (!token) throw new Error("Please log in to continue.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(apiUrl(path), { ...init, headers });
  await ensureSuccess(response);
  return response;
}

export async function fetchCurrentUser(): Promise<ApiUser> {
  const response = await authenticatedFetch("/auth/me");
  return (await response.json()) as ApiUser;
}

export async function submitClaim(itemId: number, message: string): Promise<ApiClaim> {
  const response = await authenticatedFetch(`/items/${itemId}/claims`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  return (await response.json()) as ApiClaim;
}

export async function fetchMyClaims(): Promise<ApiClaim[]> {
  const response = await authenticatedFetch("/claims/mine");
  return (await response.json()) as ApiClaim[];
}

export async function fetchItemClaims(itemId: number): Promise<ApiClaim[]> {
  const response = await authenticatedFetch(`/items/${itemId}/claims`);
  return (await response.json()) as ApiClaim[];
}

export async function reviewClaim(
  claimId: number,
  status: "approved" | "rejected",
): Promise<ApiClaim> {
  const response = await authenticatedFetch(`/claims/${claimId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  return (await response.json()) as ApiClaim;
}


export async function fetchMyReports(): Promise<ApiItem[]> {
  const response = await authenticatedFetch("/items/mine");
  return (await response.json()) as ApiItem[];
}

export async function deleteItem(itemId: number): Promise<void> {
  await authenticatedFetch(`/items/${itemId}`, { method: "DELETE" });
}
