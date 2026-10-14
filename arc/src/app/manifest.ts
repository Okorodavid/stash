import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Stasha",
    short_name: "Stash",
    description: "USDC savings on Arc that a stolen key or seed phrase can't drain.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0f0e",
    theme_color: "#0a0f0e",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
