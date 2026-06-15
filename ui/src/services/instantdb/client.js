import { id, init } from "@instantdb/react";
import schema from "../../../../instant.schema.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const rawAppId = (import.meta.env.VITE_INSTANTDB_APP_ID || "").trim();
const appId = UUID_RE.test(rawAppId) ? rawAppId : "";

if (rawAppId && !appId) {
  console.error(
    "VITE_INSTANTDB_APP_ID must be an InstantDB app UUID from https://www.instantdb.com/. " +
      "Render service IDs (srv-...) and API URLs belong in backend/Vercel API env vars, not here. " +
      "Running without InstantDB persistence until this is corrected."
  );
}

export const isInstantDbEnabled = Boolean(appId);
export const instantDb = isInstantDbEnabled ? init({ appId, schema }) : null;
export { id as instantId };
