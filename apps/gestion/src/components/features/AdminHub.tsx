"use client";

import { useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useUiStore } from "../../lib/ui-store";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Input } from "../ui/Input";
import { useToast } from "../ui/Toast";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asData(payload: unknown, fallback: string): Record<string, unknown> {
  if (!isRecord(payload)) throw new Error(fallback);
  if (payload.ok !== true || !isRecord(payload.data)) {
    const message = isRecord(payload.error) && typeof payload.error.message === "string" ? payload.error.message : fallback;
    throw new Error(message);
  }
  return payload.data;
}

async function requestJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string" ? payload.error.message : `Request failed: ${url}`;
    throw new Error(message);
  }
  return asData(payload, `Request failed: ${url}`);
}

function freshKey(): string {
  return crypto.randomUUID();
}

interface MenuTreeNode {
  readonly children: MenuTreeNode[];
  readonly href: string;
  readonly id: string;
  readonly label: string;
  readonly order: number;
  readonly parentId: string | null;
}

function toMenuNode(value: unknown): MenuTreeNode | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.label !== "string") return null;
  if (typeof value.href !== "string" || typeof value.order !== "number") return null;
  const rawChildren = Array.isArray(value.children) ? value.children : [];
  return {
    children: rawChildren.map(toMenuNode).filter((node): node is MenuTreeNode => node !== null),
    href: value.href,
    id: value.id,
    label: value.label,
    order: value.order,
    parentId: typeof value.parentId === "string" ? value.parentId : null
  };
}

function flatten(nodes: readonly MenuTreeNode[], depth = 0): Array<{ depth: number; node: MenuTreeNode }> {
  return nodes.flatMap((node) => [{ depth, node }, ...flatten(node.children, depth + 1)]);
}

function PanelState({ error, loading, onRetry }: { error: string | null; loading: boolean; onRetry: () => void }) {
  if (loading) return <p>Loading…</p>;
  if (error) {
    return (
      <p role="alert">
        {error} <Button onClick={onRetry} type="button" variant="secondary">Retry</Button>
      </p>
    );
  }
  return null;
}

export function AdminMenuPanel() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [href, setHref] = useState("");
  const [moveId, setMoveId] = useState("");
  const [moveParent, setMoveParent] = useState("");
  const [moveOrder, setMoveOrder] = useState("0");
  const menu = useQuery({
    queryFn: async () => {
      const data = await requestJson("/api/gestion/admin/menu");
      const rawTree = Array.isArray(data.tree) ? data.tree : [];
      return { tree: rawTree.map(toMenuNode).filter((node): node is MenuTreeNode => node !== null), version: typeof data.version === "number" ? data.version : 0 };
    },
    queryKey: ["admin-menu"]
  });
  const rows = menu.data ? flatten(menu.data.tree) : [];

  async function createNode(): Promise<void> {
    try {
      await requestJson("/api/gestion/admin/menu", {
        body: JSON.stringify({ href, label }),
        headers: { "content-type": "application/json", "x-idempotency-key": freshKey() },
        method: "POST"
      });
      setLabel("");
      setHref("");
      toast.success("Menu node created.");
      await queryClient.invalidateQueries({ queryKey: ["admin-menu"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the menu node.");
    }
  }

  async function moveNode(): Promise<void> {
    if (moveId === "" || menu.data === undefined) return;
    try {
      await requestJson(`/api/gestion/admin/menu/${moveId}`, {
        body: JSON.stringify({ expectedVersion: menu.data.version, order: Number.parseInt(moveOrder, 10) || 0, parentId: moveParent === "" ? null : moveParent }),
        headers: { "content-type": "application/json", "x-idempotency-key": freshKey() },
        method: "PATCH"
      });
      toast.success("Menu node moved.");
      await queryClient.invalidateQueries({ queryKey: ["admin-menu"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not move the menu node.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PanelState error={menu.error ? (menu.error as Error).message : null} loading={menu.isPending} onRetry={() => void menu.refetch()} />
      {menu.data && rows.length === 0 ? <p>No menu nodes yet.</p> : null}
      <ul className="flex flex-col gap-1">
        {rows.map(({ depth, node }) => (
          <li key={node.id} style={{ paddingLeft: depth * 16 }}>
            {node.label} <span className="text-sm text-ink-muted">{node.href}</span>
          </li>
        ))}
      </ul>
      <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void createNode(); }}>
        <Input label="Label" onChange={(event) => setLabel(event.target.value)} value={label} />
        <Input label="Link" onChange={(event) => setHref(event.target.value)} value={href} />
        <Button type="submit">Create node</Button>
      </form>
      {rows.length > 0 ? (
        <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void moveNode(); }}>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Node
            <select aria-label="Node" className="min-h-10 rounded-md border border-line bg-surface px-3 py-2" onChange={(event) => setMoveId(event.target.value)} value={moveId}>
              <option value="">Select a node…</option>
              {rows.map(({ node }) => <option key={node.id} value={node.id}>{node.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            New parent
            <select aria-label="New parent" className="min-h-10 rounded-md border border-line bg-surface px-3 py-2" onChange={(event) => setMoveParent(event.target.value)} value={moveParent}>
              <option value="">Root</option>
              {rows.map(({ node }) => <option key={node.id} value={node.id}>{node.label}</option>)}
            </select>
          </label>
          <Input label="Order" onChange={(event) => setMoveOrder(event.target.value)} value={moveOrder} />
          <Button type="submit" variant="secondary">Move node</Button>
        </form>
      ) : null}
    </div>
  );
}

interface RoleRow {
  readonly actions: string[];
  readonly actorHas: boolean[];
  readonly role: string;
}

export function AdminRolesPanel() {
  const roles = useQuery({
    queryFn: async () => {
      const data = await requestJson("/api/gestion/admin/roles");
      const rawRoles = Array.isArray(data.roles) ? data.roles : [];
      return {
        actorRole: typeof data.actorRole === "string" ? data.actorRole : "",
        roles: rawRoles.filter((row): row is RoleRow => isRecord(row) && typeof row.role === "string" && Array.isArray(row.actions) && Array.isArray(row.actorHas))
      };
    },
    queryKey: ["admin-roles"]
  });
  return (
    <div className="flex flex-col gap-4">
      <PanelState error={roles.error ? (roles.error as Error).message : null} loading={roles.isPending} onRetry={() => void roles.refetch()} />
      {roles.data ? (
        <>
          <table>
            <thead>
              <tr>
                <th scope="col">Role</th>
                <th scope="col">Actions</th>
                <th scope="col">Access</th>
              </tr>
            </thead>
            <tbody>
              {roles.data.roles.map((row) => (
                <tr key={row.role}>
                  <td>{row.role}</td>
                  <td>{row.actions.join(", ")}</td>
                  <td>{row.actorHas.every(Boolean) ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm text-ink-muted">Read-only mapping for {roles.data.actorRole}. Role assignment is principal-only and ships separately.</p>
        </>
      ) : null}
    </div>
  );
}
