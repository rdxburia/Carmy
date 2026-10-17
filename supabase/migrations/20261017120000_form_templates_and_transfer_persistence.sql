-- Form 29/30 & Ownership Transfer: Template storage and transfer persistence
-- Idempotent, non-destructive migration. Preserves all existing customer and vehicle data.

create table if not exists public.form_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  form_type text not null,
  version text not null default 'v1',
  title text not null,
  description text,
  schema_fields jsonb not null default '[]'::jsonb,
  raw_template text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.form_templates enable row level security;

drop policy if exists form_templates_read on public.form_templates;
create policy form_templates_read on public.form_templates
  for select to authenticated, anon
  using (is_active = true);

-- Additive columns on public.sale_history for rich transfer records
alter table public.sale_history add column if not exists transfer_type text default 'same_state';
alter table public.sale_history add column if not exists seller_name text;
alter table public.sale_history add column if not exists seller_relation text;
alter table public.sale_history add column if not exists seller_relation_name text;
alter table public.sale_history add column if not exists seller_age int;
alter table public.sale_history add column if not exists seller_address text;
alter table public.sale_history add column if not exists seller_city text;
alter table public.sale_history add column if not exists seller_state text;
alter table public.sale_history add column if not exists seller_pincode text;
alter table public.sale_history add column if not exists buyer_district text;
alter table public.sale_history add column if not exists buyer_state text;
alter table public.sale_history add column if not exists source_state text;
alter table public.sale_history add column if not exists source_rto text;
alter table public.sale_history add column if not exists destination_state text;
alter table public.sale_history add column if not exists destination_rto text;
alter table public.sale_history add column if not exists noc_status text;
alter table public.sale_history add column if not exists noc_number text;
alter table public.sale_history add column if not exists noc_date date;
alter table public.sale_history add column if not exists noc_rto text;
alter table public.sale_history add column if not exists hypothecation_type text default 'none';
alter table public.sale_history add column if not exists financier_name text;
alter table public.sale_history add column if not exists financier_address text;
alter table public.sale_history add column if not exists template_version text default 'v1';
alter table public.sale_history add column if not exists raw_form_data jsonb default '{}'::jsonb;

-- Idempotent template seeding
insert into public.form_templates (
  template_key,
  form_type,
  version,
  title,
  description,
  schema_fields,
  raw_template,
  is_active
) values
(
  'form_29_v1',
  'form_29',
  'v1',
  'Form 29 — Notice of Transfer of Ownership of a Motor Vehicle',
  'Statutory Form 29 under Rule 55(1) of the Central Motor Vehicles Rules, 1989.',
  '["destination_rto","transferor_name","transferor_address","sale_day","sale_year","registration_no","vehicle_make_model","chassis_no","engine_no","transferee_name","transferee_relation","transferee_relation_name","transferee_address","hypothecation_phrase","financier_signature_block","declaration_date","source_rto"]'::jsonb,
  '<div class="official-form-page" data-form-type="form_29" data-page="1">
  <div class="form-header-box">
    <div class="form-title-main">FORM 29</div>
    <div class="form-rule-ref">[See Rule 55 (1)]</div>
    <div class="form-subject">NOTICE OF TRANSFER OF OWNERSHIP OF A MOTOR VEHICLE</div>
    <div class="form-sub-instructions">(To be made in duplicate and the duplicate copy with the endorsement of the Registering Authority to be returned to the transferor or immediately on making entries of transfer of ownership in certificate of Registration and Form 24)</div>
  </div>

  <div class="form-to-block">
    <div class="to-label">To</div>
    <div class="to-authority">The Registering Authority, <b>{{destination_rto}}</b></div>
    <div class="to-jurisdiction">(in whose jurisdiction the Transferee resides)</div>
  </div>

  <div class="form-body-paragraphs">
    <p class="form-p">
      I/We <b>{{transferor_name}}</b> resident of <b>{{transferor_address}}</b> have on the <b>{{sale_day}}</b> day of the year <b>{{sale_year}}</b> sold and delivered my/our Vehicle No. <b>{{registration_no}}</b> make <b>{{vehicle_make_model}}</b> Chassis No. <b>{{chassis_no}}</b> [Engine number or motor number in the case of Battery Operated Vehicles] <b>{{engine_no}}</b> to Shri/Smt. <b>{{transferee_name}}</b> (Name) {{transferee_relation}} <b>{{transferee_relation_name}}</b> residing at <b>{{transferee_address}}</b> (House No./Street Village /Town Distt. and State) {{hypothecation_phrase}}.
    </p>
    <p class="form-p">
      The Registration Certificate and Insurance Certificate have been handed over to him/her/them.
    </p>
    <p class="form-p">
      To the best of my/our knowledge and belief the vehicle is not superdari and free from all encumbrances and information furnished is true. I/we undertake to hold my/our self-responsible for any inaccuracy or suppression of information.
    </p>
  </div>

  <div class="form-signatures-row">
    <div class="sig-col financier-sig">
      {{financier_signature_block}}
    </div>
    <div class="sig-col transferor-sig">
      <div class="sig-line">________________________________________________</div>
      <div class="sig-caption">Signature or thumb impression of the Registered Owner (Transferor)</div>
      <div class="sig-date">Date: <b>{{declaration_date}}</b></div>
    </div>
  </div>

  <div class="transferee-ack-row">
    I/We <b>{{transferee_name}}</b> (Transferee)
  </div>

  <div class="copy-to-block">
    <p>Copy to the Registering Authority <b>{{source_rto}}</b> in whose jurisdiction the transferor resides.</p>
    <div class="copy-note">Note - To be sent to the Registering Authority by Registered Post Acknowledgment Due.</div>
  </div>

  <div class="office-endorsement-box">
    <div class="endorsement-title">OFFICE ENDORSEMENT</div>
    <div class="endorsement-ref-row">
      <span>Ref. No. ________________________</span>
      <span>Office of the __________________________________</span>
    </div>
    <p class="endorsement-p">
      The ownership of the vehicle has been transferred to the name of ________________________________ with the note of the abovesaid agreement with effect from ________________________ (date).
    </p>
    <div class="endorsement-sign-row">
      <div class="endorsement-date">Date: ____________________</div>
      <div class="endorsement-seal">
        <div>__________________________________________________</div>
        <div>Signature of the Registering Authority with Office seal</div>
      </div>
    </div>
    <div class="endorsement-to">
      <div>* Strike out whichever is inapplicable.</div>
      <div>To: The Transferor __________________________________________________</div>
      <div>(To be sent by Registered Post Acknowledgement Due)</div>
    </div>
  </div>
</div>',
  true
),
(
  'form_30_v1',
  'form_30',
  'v1',
  'Form 30 — Application for Intimation and Transfer of Ownership of a Motor Vehicle',
  'Statutory Form 30 Part I & Part II under Rule 55(2) and (3) of the Central Motor Vehicles Rules, 1989.',
  '["destination_rto","transferor_name","transferor_relation","transferor_relation_name","transferor_age","transferor_address","sale_day","sale_year","registration_no","transferee_name","transferee_relation","transferee_relation_name","transferee_address","transferee_age","transferor_noc_clause","financier_part_block","declaration_date"]'::jsonb,
  '<div class="official-form-page" data-form-type="form_30" data-page="1">
  <div class="form-header-box">
    <div class="form-title-main">FORM 30</div>
    <div class="form-rule-ref">[See Rule 55 (2) and (3)]</div>
    <div class="form-subject">APPLICATION FOR INTIMATION AND TRANSFER OF OWNERSHIP OF A MOTOR VEHICLE</div>
    <div class="form-sub-instructions">(To be made in duplicate if the vehicle is held under an agreement of hire-purchase/lease/hypothecation. The duplicate copy with the endorsement of the Registering Authority to be returned to the Financier simultaneously on making the entry of the transfer of Ownership in the Certificate of Registration and Registration Record in Form 24)</div>
  </div>

  <div class="form-to-block">
    <div class="to-label">To</div>
    <div class="to-authority">The Registering Authority, <b>{{destination_rto}}</b></div>
  </div>

  <div class="form-section-head">PART I — FOR THE USE OF THE TRANSFEROR</div>
  <div class="particulars-list">
    <div class="particular-row"><span class="lbl">Name of the transferor:</span> <span class="val"><b>{{transferor_name}}</b></span></div>
    <div class="particular-row"><span class="lbl">Son/wife/daughter of:</span> <span class="val"><b>{{transferor_relation}} {{transferor_relation_name}}</b></span></div>
    <div class="particular-row"><span class="lbl">Age:</span> <span class="val"><b>{{transferor_age}} years</b></span> &nbsp;&nbsp;&nbsp; <span class="lbl">Full address:</span> <span class="val"><b>{{transferor_address}}</b></span></div>
  </div>

  <p class="form-p">
    I/We, hereby declare that I/We have on this <b>{{sale_day}}</b> day of the year <b>{{sale_year}}</b> sold my/our motor vehicle bearing Registration mark <b>{{registration_no}}</b> to Shri/Smt. <b>{{transferee_name}}</b>, Son/wife/daughter of <b>{{transferee_relation}} {{transferee_relation_name}}</b>, residing at <b>{{transferee_address}}</b> (full address) and handed over the Certificate of Registration and the Certificate of Insurance to him/her/them.
  </p>

  <p class="form-p">
    I/We hereby declare that to the best of my/our knowledge the certificate of registration of the vehicle has not been suspended* or cancelled.
  </p>

  <p class="form-p">
    {{transferor_noc_clause}}
  </p>

  <div class="form-signatures-row single-right">
    <div class="sig-col transferor-sig">
      <div class="sig-line">________________________________________________</div>
      <div class="sig-caption">Signature or thumb impression of the Transferor</div>
      <div class="sig-date">Date: <b>{{declaration_date}}</b></div>
    </div>
  </div>
  <div class="footnote-notes">* Details of suspension or cancellation. &nbsp;&nbsp;&nbsp; ** Strike out whichever is inapplicable.</div>

  <div class="form-section-head" style="margin-top:5mm">PART II — FOR THE USE OF THE TRANSFEREE</div>
  <div class="particulars-list">
    <div class="particular-row"><span class="lbl">Name of the Transferee:</span> <span class="val"><b>{{transferee_name}}</b></span></div>
    <div class="particular-row"><span class="lbl">Son/wife/daughter of:</span> <span class="val"><b>{{transferee_relation}} {{transferee_relation_name}}</b></span> &nbsp;&nbsp;&nbsp; <span class="lbl">Age:</span> <span class="val"><b>{{transferee_age}} years</b></span></div>
    <div class="particular-row"><span class="lbl">Full address:</span> <span class="val"><b>{{transferee_address}}</b></span> <small>(Proof of address to be enclosed)</small></div>
  </div>

  <p class="form-p">
    I/We, hereby declare that I/We have on this <b>{{sale_day}}</b> day of the year <b>{{sale_year}}</b> purchased the motor vehicle bearing registration number <b>{{registration_no}}</b> from <b>{{transferor_name}}</b>, residing at <b>{{transferor_address}}</b> (name and full address) and request that necessary entries regarding the transfer of ownership of the vehicle in my/our name may be recorded in the certificate of registration and certificate of fitness of the vehicle, which is enclosed.
  </p>

  <p class="form-p">
    The certificate of Insurance is also enclosed. To the best of my knowledge and belief I/We have not suppressed any facts and information furnished is true. The vehicle is not superdari and free from all encumbrances. I/We undertake to hold myself responsible for any inaccuracy of the information.
  </p>

  <div class="form-signatures-row single-right">
    <div class="sig-col transferee-sig">
      <div class="sig-line">________________________________________________</div>
      <div class="sig-caption">Signature or thumb impression of the Transferee</div>
      <div class="sig-date">Date: <b>{{declaration_date}}</b></div>
    </div>
  </div>
</div>

<div class="official-form-page" data-form-type="form_30" data-page="2">
  <div class="form-section-head">CONSENT OF THE FINANCIER IN THE CASE OF MOTOR VEHICLE SUBJECT TO AN AGREEMENT OF HIRE-PURCHASE/LEASE/HYPOTHECATION</div>
  {{financier_part_block}}

  <div class="office-endorsement-box">
    <div class="endorsement-title">OFFICE ENDORSEMENT</div>
    <div class="endorsement-ref-row">
      <span>Ref. No. ________________________</span>
      <span>Office of the __________________________________</span>
    </div>
    <p class="endorsement-p">
      The transfer of ownership of vehicle under continuation of an endorsement of hire-purchase/lease/hypothecation agreement has been recorded with effect from ________________________ in the Registration Certificate of the vehicle <b>{{registration_no}}</b> and in the Registration record of this office in Form 24.
    </p>
    <div class="endorsement-sign-row">
      <div class="endorsement-date">Date: ____________________</div>
      <div class="endorsement-seal">
        <div>__________________________________________________</div>
        <div>Signature of the Registering Authority</div>
      </div>
    </div>
    <div class="endorsement-to">
      <div>To: The Financier __________________________________________________</div>
      <div>(To be sent by Registered Post Acknowledgement Due)</div>
    </div>
  </div>

  <div class="specimen-signatures-box">
    <div class="specimen-instructions">
      Specimen signature or thumb impression of the registered owner and the Financier are to be obtained in the original application for affixing and attestation by the Registering Authority with the office seal in Forms 23 and 24, in such manner that the parts of impression of seal or stamp and attestation shall fall upon each signature.
    </div>
    <div class="specimen-grid">
      <div class="specimen-col">
        <div class="specimen-head">Specimen signature of the Financier</div>
        <div class="specimen-item">1. ______________________________________</div>
        <div class="specimen-item">2. ______________________________________</div>
      </div>
      <div class="specimen-col">
        <div class="specimen-head">Specimen signature of the Registered Owner</div>
        <div class="specimen-item">1. ______________________________________</div>
        <div class="specimen-item">2. ______________________________________</div>
      </div>
    </div>
  </div>
</div>',
  true
),
(
  'clearance_certificate_v1',
  'clearance_certificate',
  'v1',
  'Clearance Certificate Request Letter',
  'Official request letter to the original registering authority for clearance certificate / NOC to destination RTO.',
  '["transferor_name","transferor_address","transferor_city","declaration_date","source_rto","registration_no","vehicle_make_model","chassis_no","engine_no","transferee_name","transferee_relation","transferee_relation_name","transferee_address","destination_rto"]'::jsonb,
  '<div class="official-form-page letter-page" data-form-type="clearance_certificate" data-page="1">
  <div class="letter-meta-row">
    <div class="letter-from">
      <div><b>From:</b></div>
      <div>{{transferor_name}}</div>
      <div>{{transferor_address}}</div>
    </div>
    <div class="letter-date-place">
      <div>Place: <b>{{transferor_city}}</b></div>
      <div>Date: <b>{{declaration_date}}</b></div>
    </div>
  </div>

  <div class="letter-to">
    <div><b>To:</b></div>
    <div>The Regional Transport Authority / Registering Authority,</div>
    <div><b>{{source_rto}}</b></div>
  </div>

  <div class="letter-sub">
    <b>Sub: Issue of Clearance Certificate for Vehicle {{registration_no}}</b>
  </div>

  <div class="letter-body">
    <p>Sir,</p>
    <p>I have sold my vehicle <b>{{vehicle_make_model}}</b> bearing Registration No. <b>{{registration_no}}</b> (Chassis No: <b>{{chassis_no}}</b>, Engine No: <b>{{engine_no}}</b>) to Shri/Smt. <b>{{transferee_name}}</b>, {{transferee_relation}} <b>{{transferee_relation_name}}</b>, residing at <b>{{transferee_address}}</b>.</p>
    <p>Please issue a <b>Clearance Certificate / No Objection Certificate</b> in favor of the Registering Authority, <b>{{destination_rto}}</b> to enable re-registration, transfer of ownership, and payment of road tax.</p>
    <p>Thanking you,</p>
  </div>

  <div class="letter-sign-block">
    <div>Yours faithfully,</div>
    <div class="sig-space"></div>
    <div>________________________________________________</div>
    <div><b>{{transferor_name}}</b></div>
    <div>(Registered Owner / Transferor)</div>
  </div>
</div>',
  true
),
(
  'insurance_transfer_v1',
  'insurance_transfer',
  'v1',
  'Transfer of Insurance Notice Letter',
  'Official notice to the insurance company requesting transfer of policy interest to purchaser.',
  '["transferor_name","transferor_address","transferor_city","declaration_date","insurance_company","registration_no","insurance_number","vehicle_make_model","transferee_name","transferee_address"]'::jsonb,
  '<div class="official-form-page letter-page" data-form-type="insurance_transfer" data-page="1">
  <div class="letter-meta-row">
    <div class="letter-from">
      <div><b>From:</b></div>
      <div>{{transferor_name}}</div>
      <div>{{transferor_address}}</div>
    </div>
    <div class="letter-date-place">
      <div>Place: <b>{{transferor_city}}</b></div>
      <div>Date: <b>{{declaration_date}}</b></div>
    </div>
  </div>

  <div class="letter-to">
    <div><b>To:</b></div>
    <div>The Branch Manager,</div>
    <div><b>{{insurance_company}}</b></div>
  </div>

  <div class="letter-sub">
    <b>Sub: Transfer of Motor Insurance Policy for Vehicle {{registration_no}}</b>
  </div>

  <div class="letter-body">
    <p>Dear Sir,</p>
    <p><b>Policy / Certificate No.:</b> <b>{{insurance_number}}</b></p>
    <p><b>Covering Vehicle:</b> <b>{{vehicle_make_model}}</b> (Reg. No.: <b>{{registration_no}}</b>)</p>
    <p>I/We wish to inform you that I/We have sold my/our vehicle bearing the above registration number to Shri/Smt. <b>{{transferee_name}}</b>, residing at <b>{{transferee_address}}</b> together with the valid insurance cover.</p>
    <p>Please have the interest of the Policy transferred in his / her / their favor.</p>
    <p>Thanking you,</p>
  </div>

  <div class="letter-sign-block">
    <div>Yours faithfully,</div>
    <div class="sig-space"></div>
    <div>________________________________________________</div>
    <div><b>{{transferor_name}}</b></div>
    <div>(Insured / Transferor)</div>
  </div>
</div>',
  true
)
on conflict (template_key) do update set
  title = excluded.title,
  description = excluded.description,
  schema_fields = excluded.schema_fields,
  raw_template = excluded.raw_template,
  is_active = excluded.is_active,
  updated_at = now();
