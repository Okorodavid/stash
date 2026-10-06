import { getAddress, isAddress } from "viem";
import LazyApp from "@/components/LazyApp";
import SiteHeader from "@/components/SiteHeader";

export const metadata = { title: "Stash · Guardian" };

// Owners share /guardian?vault=0x… with the people they trust.
export default async function GuardianPage({ searchParams }: PageProps<"/guardian">) {
  const { vault } = await searchParams;
  const valid = typeof vault === "string" && isAddress(vault);
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">
      <SiteHeader suffix="guardian" />
      {valid ? (
        <LazyApp guardianOf={getAddress(vault)} />
      ) : (
        <p className="text-muted">This guardian link is missing a vault address. Ask the owner to share it again.</p>
      )}
    </main>
  );
}
