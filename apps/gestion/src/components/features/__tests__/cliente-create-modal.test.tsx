// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "../../../test/query-client";
import { useUiStore } from "../../../lib/ui-store";
import { ToastProvider } from "../../ui/Toast";
import { ClienteCreateModal } from "../ClienteCreateModal";

const fetchMock = vi.fn();

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status
  });
}

function createdPayload(overrides: Record<string, unknown> = {}): Response {
  return jsonResponse(
    {
      data: {
        cliente: {
          active: true,
          displayName: "María Gómez",
          id: "c_1",
          version: 1
        },
        ...overrides
      },
      ok: true
    },
    201
  );
}

function renderModal(): void {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ToastProvider>
        <ClienteCreateModal />
      </ToastProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  useUiStore.setState({ clienteModalOpen: true, duplicateWarning: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useUiStore.setState({ clienteModalOpen: false, duplicateWarning: null });
});

describe("ClienteCreateModal", () => {
  it("validates displayName with the domain schema before posting", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole("button", { name: "Crear cliente" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a fresh x-idempotency-key per attempt", async () => {
    const user = userEvent.setup();
    const keys: Array<string | null> = [];
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      keys.push((init?.headers as Record<string, string> | undefined)?.["x-idempotency-key"] ?? null);
      if (keys.length === 1) return jsonResponse({ ok: false }, 500);
      return createdPayload();
    });
    const randomSpy = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("key-1" as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce("key-2" as `${string}-${string}-${string}-${string}-${string}`);
    renderModal();

    await user.type(screen.getByLabelText("Nombre del cliente"), "María Gómez");
    await user.click(screen.getByRole("button", { name: "Crear cliente" }));
    expect(await screen.findByText("No se pudo crear el cliente. Reintentá.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Crear cliente" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(keys).toEqual(["key-1", "key-2"]);
    expect(randomSpy).toHaveBeenCalledTimes(2);
  });

  it("stores duplicateWarning and closes the form on 201 with warning", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(createdPayload({ duplicateWarning: "email" }));
    renderModal();

    await user.type(screen.getByLabelText("Nombre del cliente"), "María Gómez");
    await user.type(screen.getByLabelText("Correo electrónico"), "maria@example.com");
    await user.click(screen.getByRole("button", { name: "Crear cliente" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(useUiStore.getState().duplicateWarning).toBe("email");
  });

  it("shows a success toast on plain 201 without warning", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(createdPayload());
    renderModal();

    await user.type(screen.getByLabelText("Nombre del cliente"), "María Gómez");
    await user.click(screen.getByRole("button", { name: "Crear cliente" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Cliente creado correctamente.");
    expect(useUiStore.getState().duplicateWarning).toBeNull();
  });

  it("closes without posting when cancelled", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useUiStore.getState().clienteModalOpen).toBe(false);
  });
});
