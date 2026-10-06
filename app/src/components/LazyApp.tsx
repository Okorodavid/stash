"use client";

import dynamic from "next/dynamic";
import type { Address } from "viem";
import Intro from "./Intro";

const StashApp = dynamic(() => import("./StashApp"), {
  ssr: false,
  loading: () => <Intro loading />,
});

export default function LazyApp({ guardianOf, swap }: { guardianOf?: Address; swap?: boolean }) {
  return <StashApp guardianOf={guardianOf} swap={swap} />;
}
