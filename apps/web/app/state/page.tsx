import { redirect } from "next/navigation";

export default function StateIndexRedirect() {
  // No /state index page in Phase 5A; homepage is the entry point.
  redirect("/");
}


