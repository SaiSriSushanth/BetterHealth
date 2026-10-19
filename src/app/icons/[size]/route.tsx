import { ImageResponse } from "next/og";
import { BrandIcon } from "@/components/BrandIcon";

const SIZES: Record<string, { px: number; maskable: boolean }> = {
  "192": { px: 192, maskable: false },
  "512": { px: 512, maskable: false },
  "maskable-512": { px: 512, maskable: true },
};

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const spec = SIZES[(await params).size];
  if (!spec) return new Response("Not found", { status: 404 });
  return new ImageResponse(<BrandIcon size={spec.px} maskable={spec.maskable} />, {
    width: spec.px,
    height: spec.px,
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
