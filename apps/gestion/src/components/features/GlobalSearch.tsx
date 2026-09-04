"use client";

import { useEffect, useState } from "react";

import { Input } from "../ui/Input";

export interface GlobalSearchProps {
  readonly onSearch: (query: string) => void;
  readonly debounceMs?: number;
  readonly initialValue?: string;
  readonly placeholder?: string;
}

export function GlobalSearch({
  debounceMs = 300,
  initialValue = "",
  onSearch,
  placeholder = "Buscar en la gestión"
}: GlobalSearchProps) {
  const [query, setQuery] = useState(initialValue.slice(0, 100));

  useEffect(() => {
    const timeout = setTimeout(() => onSearch(query.trim()), debounceMs);
    return () => clearTimeout(timeout);
  }, [debounceMs, onSearch, query]);

  return (
    <Input
      aria-label="Buscar"
      id="global-search"
      label="Buscar"
      maxLength={100}
      onChange={(event) => setQuery(event.target.value.slice(0, 100))}
      placeholder={placeholder}
      role="searchbox"
      type="search"
      value={query}
    />
  );
}
