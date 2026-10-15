import { parseTypeParam } from "@/lib/starter-suggestions";
import { NewTripForm } from "./new-trip-form";

/**
 * Thin server wrapper. It reads only `type` (every other query key, including any `utm_*`, is
 * ignored and never read), validates it against the catalog, and passes the form just the typed
 * result. The raw value and the `searchParams` object never go further, are never echoed, logged
 * or redirected on, and an invalid value simply means a blank form.
 */
export default async function NewTripPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string | string[] }>;
}) {
  const { type } = await searchParams;
  return <NewTripForm initialType={parseTypeParam(type)} />;
}
