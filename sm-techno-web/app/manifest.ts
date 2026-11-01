import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "СМ ТЕХНО — локальный прайс и заказы",
    short_name: "СМ ТЕХНО",
    description: "Веб-интерфейс локального прайса, остатков и счетов СМ ТЕХНО",
    start_url: "/",
    display: "standalone",
    background_color: "#F5F7FA",
    theme_color: "#07162E",
    lang: "ru",
    share_target: { action: "/stock-share/receive", method: "POST", enctype: "multipart/form-data", params: { title: "title", text: "text", files: [{ name: "file", accept: ["image/*", ".pdf", ".txt", ".csv", ".tsv", ".xls", ".xlsx", ".doc", ".docx", ".rtf", ".odt"] }] } },
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      {
        src: "/icon.png",
        sizes: "256x256",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
