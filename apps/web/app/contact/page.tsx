import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FORM_CONFIRMATION_COPY } from "../../src/lib/confirmationCopy";

export const metadata: Metadata = {
  title: "Contact",
  alternates: { canonical: "/contact" }
};

async function submitContact(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  const email = String(formData.get("email") ?? "").trim().slice(0, 200);
  const message = String(formData.get("message") ?? "").trim().slice(0, 2000);

  // Minimal baseline validation (neutral, no marketing UX).
  if (!name || !email || !message) {
    redirect("/contact?sent=0");
  }

  // Phase 9.8: store/notification can be added later. For now, log server-side.
  console.log("contact_submission", { name, email, messageLen: message.length });

  redirect("/contact?sent=1");
}

export default async function ContactPage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const sentRaw = searchParams?.sent;
  const sent = Array.isArray(sentRaw) ? sentRaw[0] : sentRaw;

  return (
    <div className="fnm-stack fnm-gap-md fnm-prose">
      <h1 className="fnm-title fnm-h1">Contact</h1>

      {sent === "1" ? (
        <div className="fnm-muted">
          <div>{FORM_CONFIRMATION_COPY.line1}</div>
          <div>{FORM_CONFIRMATION_COPY.line2}</div>
        </div>
      ) : null}

      <form action={submitContact} className="fnm-stack fnm-gap-sm">
        <label>
          <span className="fnm-text-sm fnm-muted">Name</span>
          <br />
          <input name="name" className="fnm-field" required maxLength={120} />
        </label>

        <label>
          <span className="fnm-text-sm fnm-muted">Email</span>
          <br />
          <input name="email" type="email" className="fnm-field" required maxLength={200} />
        </label>

        <label>
          <span className="fnm-text-sm fnm-muted">Message</span>
          <br />
          <textarea name="message" rows={5} className="fnm-field" required maxLength={2000} />
        </label>

        <div>
          <button type="submit">Submit</button>
        </div>
      </form>
    </div>
  );
}


