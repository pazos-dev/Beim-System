import { join } from "node:path";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { NewOrderFrame } from "../../../../src/components/features/NewOrderFrame";
import { loadNewOrderView } from "../../../../src/server/pages/new-order-view";
import { SESSION_COOKIE_NAME } from "../../../../src/server/handlers/session";

export default async function NuevaOrdenPage(): Promise<React.JSX.Element> {
  const cookieStore = await cookies();
  const loaded = await loadNewOrderView(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if ("redirect" in loaded) redirect(loaded.redirect);
  return <NewOrderFrame nextNumber={loaded.view.nextNumber} version={loaded.view.version} />;
}