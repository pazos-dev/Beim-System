"use client";

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject
} from "react";

import { Button } from "./Button";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])",
  "[contenteditable=\"true\"]"
].join(",");

export interface ModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
  readonly role?: "dialog" | "alertdialog";
  readonly triggerRef?: RefObject<HTMLElement | null>;
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  readonly closeLabel?: string;
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export function Modal({
  children,
  closeLabel = "Cerrar",
  initialFocusRef,
  onClose,
  open,
  role = "dialog",
  title,
  triggerRef
}: ModalProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeHandlerRef = useRef(onClose);
  const titleId = useId();
  const restoreTargetRef = useRef<HTMLElement | null>(null);

  closeHandlerRef.current = onClose;

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const dialog = dialogRef.current;
    if (!dialog) {
      return undefined;
    }

    const ownerDocument = dialog.ownerDocument;
    restoreTargetRef.current = triggerRef?.current ?? (
      ownerDocument.activeElement instanceof HTMLElement ? ownerDocument.activeElement : null
    );

    const initialFocus =
      initialFocusRef?.current ??
      dialog.querySelector<HTMLElement>("[data-autofocus]") ??
      getFocusableElements(dialog)[0] ??
      dialog;
    initialFocus.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeHandlerRef.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements(dialog);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const activeElement = ownerDocument.activeElement;

      if (!dialog.contains(activeElement)) {
        event.preventDefault();
        focusableElements[0].focus();
        return;
      }

      const activeIndex = focusableElements.indexOf(activeElement as HTMLElement);
      const nextIndex = event.shiftKey
        ? activeIndex <= 0 ? focusableElements.length - 1 : activeIndex - 1
        : activeIndex === focusableElements.length - 1 ? 0 : activeIndex + 1;
      event.preventDefault();
      focusableElements[nextIndex].focus();
    };

    ownerDocument.addEventListener("keydown", handleKeyDown);
    return () => {
      ownerDocument.removeEventListener("keydown", handleKeyDown);
      const restoreTarget = triggerRef?.current ?? restoreTargetRef.current;
      if (restoreTarget && ownerDocument.contains(restoreTarget)) {
        restoreTarget.focus();
      }
    };
  }, [initialFocusRef, open, triggerRef]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4">
      <section
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-modal="true"
        className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-surface p-6 shadow-shell"
        role={role}
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl font-semibold text-ink" id={titleId}>
            {title}
          </h2>
        </div>
        <div className="mt-4">{children}</div>
        <div className="mt-6 flex justify-end">
          <Button onClick={onClose} variant="ghost">
            {closeLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
