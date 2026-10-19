import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "BetterHealth",
    short_name: "BetterHealth",
    description: "Train every muscle, log what you eat, and get a coach that reads your day.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3f7f5",
    theme_color: "#f3f7f5",
    categories: ["health", "fitness", "lifestyle"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Log food", url: "/food", icons: [{ src: "/icons/192", sizes: "192x192", type: "image/png" }] },
      { name: "Start a workout", url: "/train", icons: [{ src: "/icons/192", sizes: "192x192", type: "image/png" }] },
      { name: "See progress", url: "/progress", icons: [{ src: "/icons/192", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
