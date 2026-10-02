"use client";

import dynamic from "next/dynamic";
import Intro from "./Intro";

const StashApp = dynamic(() => import("./StashApp"), {
  ssr: false,
  loading: () => <Intro loading />,
});

export default function LazyApp() {
  return <StashApp />;
}
