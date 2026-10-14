import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Stash",
    short_name: "Stash",
    description: "Save and gain interest. A stolen key or seed phrase can't drain you.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0f0e",
    theme_color: "#0a0f0e",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
