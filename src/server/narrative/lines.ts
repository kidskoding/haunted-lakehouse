import "server-only";
import type { Line, Speaker } from "./types";

type Say = (text: string, fog?: string) => Line;

function voiceOf(speaker: Speaker): Say {
  return (text, fog) => (fog === undefined ? { speaker, text } : { speaker, text, fog });
}

/** Line builders, so content modules read like a script. */
export const mayor = voiceOf("mayor");
export const wren = voiceOf("wren");
export const marisol = voiceOf("marisol");
export const thorne = voiceOf("thorne");
export const moribund = voiceOf("moribund");
export const narrator = voiceOf("narrator");
