// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../../src/test/query-client";
import { useUiStore } from "../../../src/lib/ui-store";
import { ToastProvider } from "../../../src/components/ui/Toast";
import AdminPage from "./page";

const navigationState = vi.hoisted(() => ({ replace: vi.fn(), search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigationState.replace }),
  useSearchParams: () => new URLSearchParams(navigationState.search)
}));

const fetchMock = vi.fn();

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status
  });
}

const MENU = { data: { tree: [{ children: [], href: "/app/ventas", id: "m_1", label: "Sales", order: 0, parentId: null }], version: 1 }, ok: true };
const ROLES = { data: { actorRole: "administrador", roles: [{ actions: ["read"], actorHas: [true], role: "vendedor" }] }, ok: true };
const BACKUPS = { data: { backups: [{ actorId: "u_admin", files: 3, id: "b_1", instante: "2026-09-01T10:00:00.000Z" }] }, ok: true };
const PLAN = { data: { ambiguos: [], bloqueos: [], estado: "pendiente", mappings: [{ legacyKey: "sistema-gestion-menu-v1", owner: "menu", registros: 2 }] }, ok: true };

interface StubOptions {
  readonly role?: string;
}

function stubAdmin(options: StubOptions = {}): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.startsWith("/api/gestion/auth/session")) {
      return jsonResponse({ data: { displayName: "Admin", role: options.role ?? "administrador", username: "admin" }, ok: true }, 200);
    }
    if (url === "/api/gestion/admin/menu") return jsonResponse(MENU, 200);
    if (url === "/api/gestion/admin/roles") return jsonResponse(ROLES, 200);
    if (url === "/api/gestion/admin/backups") return jsonResponse(BACKUPS, 200);
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

function renderPage(): void {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <AdminPage />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("AdminPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    navigationState.replace.mockReset();
    navigationState.search = "";
    vi.stubGlobal("fetch", fetchMock);
    useUiStore.setState({ adminRestoreTargetId: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useUiStore.setState({ adminRestoreTargetId: null });
  });

  it("deep-links tabs from ?tab= and syncs tab switches into the URL", async () => {
    const user = userEvent.setup();
    navigationState.search = "tab=roles";
    stubAdmin();
    renderPage();
    expect(await screen.findByRole("columnheader", { name: "Role" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Backups" }));
    expect(navigationState.replace).toHaveBeenCalledWith("/app/admin?tab=backups");
  });

  it("denies non-admin roles with a login link and no admin fetch", async () => {
    stubAdmin({ role: "vendedor" });
    renderPage();
    expect(await screen.findByRole("link", { name: "Go to login" })).toHaveAttribute("href", "/login");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/gestion/admin/menu", expect.anything());
  });

  it("creates a menu node with a fresh idempotency key and refreshes the tree", async () => {
    const user = userEvent.setup();
    const keys: Array<string | null> = [];
    stubAdmin();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url === "/api/gestion/admin/menu" && init?.method === "POST") {
        keys.push((init?.headers as Record<string, string> | undefined)?.["x-idempotency-key"] ?? null);
        return jsonResponse({ data: { node: { children: [], href: "/app/caja", id: "m_2", label: "Cash", order: 1, parentId: null }, version: 2 }, ok: true }, 201);
      }
      if (url === "/api/gestion/admin/menu") return jsonResponse(MENU, 200);
      if (url.startsWith("/api/gestion/auth/session")) {
        return jsonResponse({ data: { displayName: "Admin", role: "administrador", username: "admin" }, ok: true }, 200);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    renderPage();
    expect(await screen.findByText("/app/ventas")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Label"), "Cash");
    await user.type(screen.getByLabelText("Link"), "/app/caja");
    await user.click(screen.getByRole("button", { name: "Create node" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Menu node created.");
    expect(keys).toHaveLength(1);
    expect(typeof keys[0]).toBe("string");
  });

  it("restores a backup only after confirm and never on cancel", async () => {
    const user = userEvent.setup();
    navigationState.search = "tab=backups";
    const recovered: unknown[] = [];
    stubAdmin();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url === "/api/gestion/admin/backups/recovery" && init?.method === "POST") {
        recovered.push(await new Response(init?.body as BodyInit).json().catch(() => null));
        return jsonResponse({ data: { backup: { actorId: "u_admin", files: 3, id: "b_1", instante: "2026-09-01T10:00:00.000Z" } }, ok: true }, 200);
      }
      if (url === "/api/gestion/admin/backups") return jsonResponse(BACKUPS, 200);
      if (url.startsWith("/api/gestion/auth/session")) {
        return jsonResponse({ data: { displayName: "Admin", role: "administrador", username: "admin" }, ok: true }, 200);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    renderPage();
    expect(await screen.findByText("b_1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore b_1" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(recovered).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Restore b_1" }));
    await user.click(screen.getByRole("button", { name: "Confirm restore" }));
    await waitFor(() => expect(recovered).toHaveLength(1));
    expect(recovered[0]).toEqual({ confirm: true, id: "b_1" });
    expect(await screen.findByRole("status")).toHaveTextContent("Backup restored.");
  });

  it("runs a read-only dry-run and keeps cutover blocked", async () => {
    const user = userEvent.setup();
    navigationState.search = "tab=migration";
    stubAdmin();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url === "/api/gestion/admin/migration/dry-run" && init?.method === "POST") {
        return jsonResponse(PLAN, 200);
      }
      if (url.startsWith("/api/gestion/auth/session")) {
        return jsonResponse({ data: { displayName: "Admin", role: "administrador", username: "admin" }, ok: true }, 200);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Run dry-run" }));
    expect(await screen.findByText("sistema-gestion-menu-v1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cutover blocked" })).toBeDisabled();
  });
});
