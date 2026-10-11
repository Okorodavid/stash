"use client";

import dynamic from "next/dynamic";
import type { Address } from "viem";
import AppSkeleton from "./AppSkeleton";

const StashApp = dynamic(() => import("./StashApp"), {
  ssr: false,
  loading: () => <AppSkeleton />,
});

export default function LazyApp({ guardianOf, swap }: { guardianOf?: Address; swap?: boolean }) {
  return <StashApp guardianOf={guardianOf} swap={swap} />;
}
