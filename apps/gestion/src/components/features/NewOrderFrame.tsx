"use client";

import { useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

export interface NewOrderFrameProps {
  readonly nextNumber: number;
  readonly version: string;
}

const COPY = {
  available: "Formulario de creación no disponible",
  title: "Formulario de nueva orden de trabajo"
} as const;

function isCreatedMessage(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === "ORDEN_CREADA"
  );
}

export function NewOrderFrame({ nextNumber, version }: NewOrderFrameProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loadFailed, setLoadFailed] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const handledCreation = useRef(false);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (iframe === null) return;
    function markLoadFailed(): void {
      setLoadFailed(true);
    }
    iframe.addEventListener("error", markLoadFailed);
    return () => iframe.removeEventListener("error", markLoadFailed);
  }, []);

  useEffect(() => {
    function handleMessage(event: MessageEvent): void {
      if (event.origin !== window.location.origin) return;
      if (!isCreatedMessage(event.data)) return;
      if (!handledCreation.current) {
        handledCreation.current = true;
        void queryClient.invalidateQueries({ queryKey: ["ordenes"] });
        router.push("/app/ordenes?estado=todas");
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [queryClient, router]);

  return (
    <div className="relative flex w-full flex-col gap-2">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand">Nueva orden de trabajo</p>
      {loadFailed ? (
        <p className="rounded-xl border border-line bg-surface p-5 text-ink-muted" role="alert">
          {COPY.available}
        </p>
      ) : (
        <iframe
          aria-label={COPY.title}
          className="h-[80vh] w-full rounded-xl border border-line bg-surface"
          ref={iframeRef}
          sandbox="allow-scripts allow-same-origin allow-forms"
          src={`/boleta/index.html?v=${encodeURIComponent(version)}&nextNumber=${nextNumber}`}
          title={COPY.title}
        />
      )}
    </div>
  );
}