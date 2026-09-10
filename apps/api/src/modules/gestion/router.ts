/**
 * Gestion module router — RETIRED by the F8b4 cutover swap.
 *
 * Every route moved to the thin `src/interface/http/*` routers wired to the
 * same legacy services (`src/cutover/mounting.ts`, mounted in the
 * composition root under `/api/v1`). This export stays as an empty router so
 * existing import paths keep resolving; it serves no routes.
 */
import { Router } from "express";

export const gestionRouter: Router = Router();
