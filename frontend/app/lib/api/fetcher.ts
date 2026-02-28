export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) {
    throw new ApiError(res.status, `API error: ${res.status}`, text);
  }
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(res.status, 'Invalid JSON response', text);
  }
}
