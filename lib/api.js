const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
).replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status ?? 0;
    this.code = options.code ?? null;
    this.details = options.details ?? null;
    this.errors = options.errors ?? options.details ?? null;
    this.fieldErrors = options.fieldErrors ?? options.errors ?? null;
    this.data = options.data ?? null;

    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

function buildUrl(path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function appendQuery(path, parameters = {}) {
  const query = new URLSearchParams();

  Object.entries(parameters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null && item !== "") {
          query.append(key, String(item));
        }
      });
      return;
    }

    query.set(key, String(value));
  });

  const queryString = query.toString();

  if (!queryString) {
    return path;
  }

  return `${path}${path.includes("?") ? "&" : "?"}${queryString}`;
}

function getErrorInformation(payload, status) {
  const nestedError =
    payload &&
    typeof payload === "object" &&
    payload.error &&
    typeof payload.error === "object"
      ? payload.error
      : null;

  const message =
    nestedError?.message ||
    (typeof payload?.error === "string" ? payload.error : null) ||
    payload?.message ||
    `The request failed with status ${status}.`;

  const errors =
    nestedError?.errors ||
    nestedError?.details ||
    payload?.errors ||
    payload?.details ||
    null;

  return {
    message,
    code: nestedError?.code || payload?.code || null,
    details: errors,
    errors,
  };
}

async function parseResponse(response) {
  if (response.status === 204 || response.status === 205) {
    return null;
  }

  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function shouldSerializeBody(body) {
  if (
    body === null ||
    body === undefined ||
    typeof body === "string" ||
    body instanceof ArrayBuffer
  ) {
    return false;
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return false;
  }

  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return false;
  }

  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return false;
  }

  return true;
}

export async function apiRequest(path, options = {}) {
  const { headers: suppliedHeaders, body, ...requestOptions } = options;
  const headers = new Headers(suppliedHeaders || {});
  let requestBody = body;

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (shouldSerializeBody(body)) {
    requestBody = JSON.stringify(body);

    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  }

  try {
    const response = await fetch(buildUrl(path), {
      cache: "no-store",
      ...requestOptions,
      headers,
      body: requestBody,
      credentials: "include",
    });

    const payload = await parseResponse(response);

    if (!response.ok) {
      const error = getErrorInformation(payload, response.status);

      throw new ApiError(error.message, {
        status: response.status,
        code: error.code,
        details: error.details,
        errors: error.errors,
        data: payload,
      });
    }

    return payload;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error?.name === "AbortError") {
      throw new ApiError("The request was cancelled.", {
        status: 0,
        code: "REQUEST_ABORTED",
        cause: error,
      });
    }

    throw new ApiError(
      "Unable to reach the server. Check your connection and try again.",
      {
        status: 0,
        code: "NETWORK_ERROR",
        cause: error,
      }
    );
  }
}

export const authApi = Object.freeze({
  signup(credentials) {
    return apiRequest("/api/auth/signup", {
      method: "POST",
      body: credentials,
    });
  },

  login(credentials) {
    return apiRequest("/api/auth/login", {
      method: "POST",
      body: credentials,
    });
  },

  logout() {
    return apiRequest("/api/auth/logout", {
      method: "POST",
    });
  },

  me() {
    return apiRequest("/api/auth/me", {
      method: "GET",
    });
  },
});

export const projectApi = Object.freeze({
  list() {
    return apiRequest("/api/projects", {
      method: "GET",
    });
  },

  create(project) {
    return apiRequest("/api/projects", {
      method: "POST",
      body: project,
    });
  },

  get(projectId) {
    return apiRequest(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "GET",
    });
  },

  update(projectId, project) {
    return apiRequest(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "PATCH",
      body: project,
    });
  },

  delete(projectId) {
    return apiRequest(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "DELETE",
    });
  },
});

export const taskApi = Object.freeze({
  list(projectId, filters = {}) {
    const path = appendQuery(
      `/api/projects/${encodeURIComponent(projectId)}/tasks`,
      filters
    );

    return apiRequest(path, {
      method: "GET",
    });
  },

  create(projectId, task) {
    return apiRequest(
      `/api/projects/${encodeURIComponent(projectId)}/tasks`,
      {
        method: "POST",
        body: task,
      }
    );
  },

  update(taskId, task) {
    return apiRequest(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      body: task,
    });
  },

  delete(taskId) {
    return apiRequest(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: "DELETE",
    });
  },
});