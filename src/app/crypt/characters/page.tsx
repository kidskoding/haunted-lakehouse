import { redirect } from "next/navigation";

/** Choosing a character is how a run begins, so this room opens onto the character select. */
export default function CharactersPage() {
  redirect("/run/new");
}
