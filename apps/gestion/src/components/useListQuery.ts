"use client";

// Shared list-query hook (SRP: owns URL filter state mechanics only).
// The seven list pages duplicated the same pattern: URLSearchParams read,
// router.replace writes, debounced text drafts, useQuery key building and
// envelope fetch. This hook owns that machinery; pages own their vocabulary
// (param names, validation, request shape, payload parsing, copy).
//
// URL is the source of truth: filters live in searchParams, so deep links,
// the header GlobalSearch (which writes `q` into the current URL) and the
// browser back button all flow through the same state. Unknown params are
// preserved on write; pages without `q` support simply ignore it.

import { useEffect, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_STALE_TIME = 30_000;

export interface UseListQueryOptions<TData> {
  // Page path used for router.replace writes (e.g. "/app/ventas").
  readonly basePath: string;
  // API endpoint used for fetching (e.g. "/api/gestion/ventas").
  readonly apiPath: string;
  // useQuery key prefix (e.g. "ventas"); invalidated by prefix elsewhere.
  readonly key: string;
  // Filter param names tracked in the URL (e.g. ["q", "estado", "page"]).
  readonly params: readonly string[];
  // Fallback values applied when a param is absent from the URL.
  readonly defaults?: Readonly<Record<string, string>>;
  // Page-provided validation of raw URL values (e.g. unknown estado → "all").
  // Runs after defaults and the shared page-number normalization.
  readonly normalize?: (params: Readonly<Record<string, string>>) => Record<string, string>;
  // Builds the fetch query string (without "?") from committed params.
  // Defaults to all non-empty entries.
  readonly buildRequest?: (params: Readonly<Record<string, string>>) => string;
  // Parses the envelope payload into page data; throws the load error.
  readonly parse: (payload: unknown) => TData;
  readonly loadError: string;
  readonly authError: string;
  readonly debounceMs?: number;
  readonly staleTime?: number;
}

export interface UseListQueryResult<TData> {
  // Committed filter values from the URL (defaults + normalization applied).
  readonly params: Readonly<Record<string, string>>;
  // Local text drafts; committed to the URL after the debounce window.
  readonly drafts: Readonly<Record<string, string>>;
  readonly setDraft: (name: string, value: string) => void;
  // Immediate single/multi URL writes (selects, sort, pagination).
  readonly setParam: (name: string, value: string) => void;
  readonly setParams: (next: Readonly<Record<string, string>>) => void;
  // True after a 401/403; pages render their session gate from this.
  readonly denied: boolean;
  readonly query: UseQueryResult<TData, Error>;
}

function readRaw(
  search: URLSearchParams,
  names: readonly string[],
  defaults: Readonly<Record<string, string>> | undefined
): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const name of names) {
    raw[name] = search.get(name) ?? defaults?.[name] ?? "";
  }
  return raw;
}

function normalizePage(raw: Record<string, string>): Record<string, string> {
  if (!Object.hasOwn(raw, "page")) return { ...raw };
  const page = Math.max(1, Number.parseInt(raw["page"] ?? "1", 10) || 1);
  return { ...raw, page: String(page) };
}

function signature(values: Readonly<Record<string, string>>, names: readonly string[]): string {
  return names.map((name) => `${name}=${values[name] ?? ""}`).join("&");
}

function targetHref(
  basePath: string,
  current: URLSearchParams,
  next: Readonly<Record<string, string>>
): string {
  const params = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(next)) {
    if (value === "") params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  return query === "" ? basePath : `${basePath}?${query}`;
}

function defaultRequest(params: Readonly<Record<string, string>>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== "") search.set(key, value);
  }
  return search.toString();
}

export function useListQuery<TData>(options: UseListQueryOptions<TData>): UseListQueryResult<TData> {
  const { basePath, apiPath, key, params: names } = options;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [denied, setDenied] = useState(false);

  const raw = readRaw(searchParams, names, options.defaults);
  const withPage = normalizePage(raw);
  const params = options.normalize === undefined ? withPage : { ...withPage, ...options.normalize(withPage) };

  const [drafts, setDrafts] = useState<Record<string, string>>(params);
  useEffect(() => {
    setDrafts(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature(params, names)]);

  useEffect(() => {
    if (signature(drafts, names) === signature(params, names)) return undefined;
    const timer = setTimeout(() => {
      const changes: Record<string, string> = {};
      for (const name of names) {
        if ((drafts[name] ?? "") !== (params[name] ?? "")) changes[name] = drafts[name] ?? "";
      }
      // Text edits restart the listing; page itself is never draft-edited.
      if (Object.hasOwn(raw, "page") && !Object.hasOwn(changes, "page")) changes["page"] = "";
      router.replace(targetHref(basePath, searchParams, changes));
    }, options.debounceMs ?? DEFAULT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature(drafts, names), signature(params, names)]);

  function setDraft(name: string, value: string): void {
    setDrafts((current) => ({ ...current, [name]: value }));
  }

  function setParams(next: Readonly<Record<string, string>>): void {
    router.replace(targetHref(basePath, searchParams, next));
  }

  function setParam(name: string, value: string): void {
    setParams({ [name]: value });
  }

  const keyParams: Record<string, string | number> = { ...params };
  if (Object.hasOwn(keyParams, "page")) keyParams["page"] = Number.parseInt(params["page"] ?? "1", 10) || 1;

  const query = useQuery<TData, Error>({
    enabled: !denied,
    queryFn: async () => {
      const request = options.buildRequest === undefined ? defaultRequest(params) : options.buildRequest(params);
      const response = await fetch(request === "" ? apiPath : `${apiPath}?${request}`, {
        cache: "no-store"
      });
      if (response.status === 401 || response.status === 403) {
        setDenied(true);
        throw new Error(options.authError);
      }
      if (!response.ok) throw new Error(options.loadError);
      return options.parse(await response.json());
    },
    queryKey: [key, keyParams],
    staleTime: options.staleTime ?? DEFAULT_STALE_TIME
  });

  return { denied, drafts, params, query, setDraft, setParam, setParams };
}
