import { id, init } from "@instantdb/react";
import schema from "../../../../instant.schema.ts";

const appId = (import.meta.env.VITE_INSTANTDB_APP_ID || "").trim();

export const isInstantDbEnabled = Boolean(appId);
export const instantDb = isInstantDbEnabled ? init({ appId, schema }) : null;
export { id as instantId };
