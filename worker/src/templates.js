import { getCache, putCache } from "./cache.js";
import { supabaseRest } from "./supabase.js";

export const BUILTIN_FORM_TEMPLATES = {
  form_29_v1: {
    template_key: "form_29_v1",
    form_type: "form_29",
    version: "v1",
    title: "Form 29 — Notice of Transfer of Ownership of a Motor Vehicle",
    description: "Statutory Form 29 under Rule 55(1) of the Central Motor Vehicles Rules, 1989.",
    schema_fields: [
      "destination_rto",
      "transferor_name",
      "transferor_address",
      "sale_day",
      "sale_year",
      "registration_no",
      "vehicle_make_model",
      "chassis_no",
      "engine_no",
      "transferee_name",
      "transferee_relation",
      "transferee_relation_name",
      "transferee_address",
      "hypothecation_phrase",
      "financier_signature_block",
      "declaration_date",
      "source_rto"
    ],
    is_active: true
  },
  form_30_v1: {
    template_key: "form_30_v1",
    form_type: "form_30",
    version: "v1",
    title: "Form 30 — Application for Intimation and Transfer of Ownership of a Motor Vehicle",
    description: "Statutory Form 30 Part I & Part II under Rule 55(2) and (3) of the Central Motor Vehicles Rules, 1989.",
    schema_fields: [
      "destination_rto",
      "transferor_name",
      "transferor_relation",
      "transferor_relation_name",
      "transferor_age",
      "transferor_address",
      "sale_day",
      "sale_year",
      "registration_no",
      "transferee_name",
      "transferee_relation",
      "transferee_relation_name",
      "transferee_address",
      "transferee_age",
      "transferor_noc_clause",
      "financier_part_block",
      "declaration_date"
    ],
    is_active: true
  },
  clearance_certificate_v1: {
    template_key: "clearance_certificate_v1",
    form_type: "clearance_certificate",
    version: "v1",
    title: "Clearance Certificate Request Letter",
    description: "Official request letter to the original registering authority for clearance certificate / NOC to destination RTO.",
    schema_fields: [
      "transferor_name",
      "transferor_address",
      "transferor_city",
      "declaration_date",
      "source_rto",
      "registration_no",
      "vehicle_make_model",
      "chassis_no",
      "engine_no",
      "transferee_name",
      "transferee_relation",
      "transferee_relation_name",
      "transferee_address",
      "destination_rto"
    ],
    is_active: true
  },
  insurance_transfer_v1: {
    template_key: "insurance_transfer_v1",
    form_type: "insurance_transfer",
    version: "v1",
    title: "Transfer of Insurance Notice Letter",
    description: "Official notice to the insurance company requesting transfer of policy interest to purchaser.",
    schema_fields: [
      "transferor_name",
      "transferor_address",
      "transferor_city",
      "declaration_date",
      "insurance_company",
      "registration_no",
      "insurance_number",
      "vehicle_make_model",
      "transferee_name",
      "transferee_address"
    ],
    is_active: true
  }
};

export async function listFormTemplates(env, bypassCache = false) {
  const cacheKey = "system:form-templates:all";
  if (!bypassCache) {
    const cached = await getCache(env, cacheKey);
    if (cached) return cached;
  }

  let dbTemplates = null;
  try {
    const rows = await supabaseRest(
      env,
      "form_templates?select=*&is_active=eq.true&order=form_type.asc,version.desc",
      { method: "GET" },
      env.SUPABASE_SECRET_KEY
    );
    if (Array.isArray(rows) && rows.length > 0) {
      dbTemplates = rows;
    }
  } catch (err) {
    console.warn("Could not fetch form_templates from Supabase; falling back to builtin templates:", err?.message || err);
  }

  const result = dbTemplates || Object.values(BUILTIN_FORM_TEMPLATES);
  await putCache(env, cacheKey, "system", "form-templates", result);
  return result;
}

export async function getFormTemplate(env, formType, version = null) {
  const all = await listFormTemplates(env);
  if (!version) {
    return all.find((t) => t.form_type === formType && t.is_active) || null;
  }
  return all.find((t) => t.form_type === formType && t.version === version && t.is_active) || null;
}

export function validateTransferPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object") {
    return { valid: false, errors: ["Missing transfer payload."] };
  }

  const req = (k, lbl) => {
    const val = typeof payload[k] === "string" ? payload[k].trim() : payload[k];
    if (val === undefined || val === null || val === "") {
      errors.push(`${lbl} is required.`);
    }
  };

  req("registration_no", "Vehicle Registration Number");
  req("vehicle_make_model", "Vehicle Make / Model");
  req("transferor_name", "Transferor (Seller) Full Name");
  req("transferor_address", "Transferor Address");
  req("transferee_name", "Transferee (Buyer) Full Name");
  req("transferee_relation", "Transferee Relationship");
  req("transferee_relation_name", "Transferee Relative Name");
  req("transferee_address", "Transferee Residential Address");
  req("destination_rto", "Destination Registering Authority (RTO)");
  req("sale_date", "Date of Sale");

  const age = Number(payload.transferee_age);
  if (!Number.isFinite(age) || age < 18 || age > 120) {
    errors.push("Transferee age must be between 18 and 120.");
  }

  if (payload.hypothecation_type && payload.hypothecation_type !== "none") {
    req("financier_name", "Financier Name");
    req("financier_address", "Financier Address");
  }

  if (payload.transfer_type === "other_state") {
    req("source_rto", "Source Registering Authority (RTO)");
    req("destination_state", "Destination State");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
