"use client";

import { useRouter } from "next/navigation";

import { Button } from "../ui/Button";

export interface CreateOrderButtonProps {
  readonly visible: boolean;
}

export function CreateOrderButton({ visible }: CreateOrderButtonProps) {
  const router = useRouter();
  if (!visible) return null;
  return (
    <Button onClick={() => router.push("/app/ordenes/nueva")} type="button">
      Crear orden
    </Button>
  );
}