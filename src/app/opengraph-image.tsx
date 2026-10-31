import { ImageResponse } from "next/og";
import { DESIGN_HEIGHT, DESIGN_WIDTH, FRAME_TOP } from "@/components/scene/scenes/hollow-creek-art";
import { HollowCreekDrawing } from "@/components/scene/scenes/hollow-creek-drawing";
import { colors } from "@/lib/design/tokens";
import { site } from "@/lib/site";
import { ogFonts } from "./_og/fonts";

export const alt = `${site.name}: Hollow Creek at dusk, lit houses reflected in the lake.`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The share card: the landing's title over the same dusk drawing. */
export default async function OpengraphImage() {
  const drawingHeight = (size.width * (DESIGN_HEIGHT - FRAME_TOP)) / DESIGN_WIDTH;

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        position: "relative",
        width: "100%",
        height: "100%",
        backgroundColor: colors.night,
      }}
    >
      <HollowCreekDrawing
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          width: size.width,
          height: drawingHeight,
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "absolute",
          top: 64,
          left: 72,
          width: 760,
        }}
      >
        <div
          style={{
            fontFamily: "Fraunces",
            fontSize: 92,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            color: colors.parchment,
          }}
        >
          {site.name}
        </div>
        <div
          style={{
            marginTop: 20,
            fontFamily: "Atkinson",
            fontSize: 32,
            lineHeight: 1.35,
            color: colors.ash,
          }}
        >
          {site.tagline}
        </div>
      </div>
    </div>,
    { ...size, fonts: [...(await ogFonts())] },
  );
}
