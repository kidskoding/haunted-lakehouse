import { ImageResponse } from "next/og";
import { colors } from "@/lib/design/tokens";
import { site } from "@/lib/site";
import { deathFromQuery } from "@/server/narrative/tombstone-link";
import { tombstone } from "@/server/narrative/tombstones";
import { ogFonts } from "../../_og/fonts";

const size = { width: 1200, height: 630 };

// The stone's arched head, as `rounded-tomb` draws it on the page, corner by corner.
const ARCH = "50% 28%";

/**
 * A dead run's share card: its stone rising from the bottom edge, and the epitaph beside it.
 * The link carries only the death's facts; the server engraves every word.
 */
export async function GET(request: Request) {
  const death = deathFromQuery(new URL(request.url).searchParams);
  if (!death) return new Response("That is not a stone from Hollow Creek.", { status: 400 });
  const stone = tombstone(death);

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        position: "relative",
        width: "100%",
        height: "100%",
        backgroundColor: colors.void,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          position: "absolute",
          left: 88,
          top: 64,
          width: 488,
          height: 600,
          paddingTop: 112,
          backgroundColor: colors.raised,
          borderTopLeftRadius: ARCH,
          borderTopRightRadius: ARCH,
          fontFamily: "Atkinson",
          fontSize: 24,
          lineHeight: 1.4,
          color: colors.ash,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontFamily: "Fraunces",
            fontSize: 52,
            lineHeight: 1.1,
            letterSpacing: "-0.015em",
            color: colors.parchment,
            maxWidth: 380,
          }}
        >
          {stone.handle}
        </div>
        <div style={{ marginTop: 12 }}>{stone.characterTitle}</div>
        <div style={{ marginTop: 40 }}>{stone.wentOut}</div>
        {stone.hollowYear ? <div style={{ color: colors.hollow }}>1891</div> : null}
        <div style={{ marginTop: 40, color: colors.parchment }}>{stone.hour}</div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          position: "absolute",
          left: 640,
          top: 120,
          bottom: 72,
          width: 480,
        }}
      >
        <div
          style={{
            fontFamily: "Fraunces",
            fontSize: 60,
            lineHeight: 1.1,
            letterSpacing: "-0.015em",
            color: colors.parchment,
          }}
        >
          {stone.epitaph}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontFamily: "Atkinson",
            fontSize: 28,
            lineHeight: 1.35,
          }}
        >
          <div style={{ fontFamily: "Fraunces", fontSize: 40, color: colors.flame }}>
            {site.name}
          </div>
          <div style={{ marginTop: 8, color: colors.ash }}>Replay the night on seed</div>
          <div style={{ color: colors.parchment, whiteSpace: "nowrap" }}>{stone.seed}</div>
        </div>
      </div>
    </div>,
    { ...size, fonts: [...(await ogFonts())] },
  );
}
