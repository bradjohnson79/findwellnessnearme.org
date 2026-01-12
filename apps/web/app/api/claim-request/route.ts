import { NextResponse } from "next/server";
import { prisma } from "../../../src/lib/prisma";

const ALLOWED_FIELDS = new Set(["displayName", "websiteUrl", "modalities", "location"]);

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function cleanText(s: string, max: number) {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length > max) return t.slice(0, max);
  return t;
}

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isSlug(s: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
}

export async function POST(req: Request) {
  const form = await req.formData();

  const listingId = String(form.get("listingId") ?? "").trim();
  const requestTypeRaw = String(form.get("requestType") ?? "").trim();
  const requestType = requestTypeRaw === "CLAIM" ? "CLAIM" : requestTypeRaw === "CORRECTION" ? "CORRECTION" : null;

  const requesterName = cleanText(String(form.get("requesterName") ?? ""), 120);
  const requesterEmail = cleanText(String(form.get("requesterEmail") ?? ""), 200).toLowerCase();
  const relationshipRaw = String(form.get("relationship") ?? "").trim();
  const relationship =
    relationshipRaw === "OWNER" || relationshipRaw === "STAFF" || relationshipRaw === "REPRESENTATIVE" || relationshipRaw === "OTHER"
      ? relationshipRaw
      : "OTHER";

  if (!listingId) return badRequest("Missing listingId");
  if (!requestType) return badRequest("Invalid requestType");
  if (!requesterName) return badRequest("Missing requesterName");
  if (!requesterEmail || !isEmail(requesterEmail)) return badRequest("Invalid requesterEmail");

  const fields = form.getAll("fields").map((x) => String(x));
  const normalizedFields = Array.from(new Set(fields)).filter((f) => ALLOWED_FIELDS.has(f));
  if (!normalizedFields.length) return badRequest("Select at least one field to request");

  // Rate limit: one open request per listing per email.
  const existing = await prisma.listingClaimRequest.findFirst({
    where: { listingId, requesterEmail, status: "PENDING" },
    select: { id: true }
  });
  if (existing) return badRequest("A pending request already exists for this listing and email.");

  // Ensure listing exists (public listing page only shows approved, but we validate anyway).
  const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { id: true } });
  if (!listing) return badRequest("Listing not found");

  // Build allowlisted JSON payload.
  const payload: any = { fields: normalizedFields };

  if (normalizedFields.includes("displayName")) {
    const displayName = cleanText(String(form.get("displayName") ?? ""), 140);
    if (displayName) payload.displayName = displayName;
  }

  if (normalizedFields.includes("websiteUrl")) {
    const websiteUrl = cleanText(String(form.get("websiteUrl") ?? ""), 500);
    if (websiteUrl) payload.websiteUrl = websiteUrl;
  }

  if (normalizedFields.includes("modalities")) {
    const modalitySlugs = form
      .getAll("modalitySlugs")
      .map((x) => cleanText(String(x), 120))
      .filter(Boolean)
      .filter(isSlug);
    payload.modalitySlugs = Array.from(new Set(modalitySlugs)).slice(0, 25);
  }

  if (normalizedFields.includes("location")) {
    const stateSlug = cleanText(String(form.get("stateSlug") ?? ""), 80);
    const citySlug = cleanText(String(form.get("citySlug") ?? ""), 80);
    const street1 = cleanText(String(form.get("street1") ?? ""), 200);
    const street2 = cleanText(String(form.get("street2") ?? ""), 200);
    const postalCode = cleanText(String(form.get("postalCode") ?? ""), 20);

    const loc: any = {};
    if (stateSlug && isSlug(stateSlug)) loc.stateSlug = stateSlug;
    if (citySlug && isSlug(citySlug)) loc.citySlug = citySlug;
    if (street1) loc.street1 = street1;
    if (street2) loc.street2 = street2;
    if (postalCode) loc.postalCode = postalCode;
    payload.location = loc;
  }

  const noteRaw = String(form.get("note") ?? "");
  const note = noteRaw.trim() ? cleanText(noteRaw, 800) : null;

  await prisma.listingClaimRequest.create({
    data: {
      listingId,
      requestType,
      requesterName,
      requesterEmail,
      relationship,
      fieldsRequested: payload,
      note
    }
  });

  return NextResponse.redirect(new URL(`/listing/${encodeURIComponent(listingId)}?notice=request_submitted`, req.url));
}


