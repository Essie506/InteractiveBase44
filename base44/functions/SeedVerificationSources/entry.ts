import {
  getAccessToken,
  getProjectId,
  toFirestoreFields,
  firestoreBatchWrite,
  docPath,
  resolveIdentityFromToken,
  getCallerRole,
} from '../../shared/firebaseAdmin.ts';

// ───────────────────────────────────────────────────────────
// SeedVerificationSources — one-time seed of the default
// VerificationSource registry (admin only).
// ───────────────────────────────────────────────────────────
// All Stage-1 sources are MANUAL (automated_enabled = false). No
// external regulator is scraped or auto-checked. Each source that
// references an official register carries a lookup_url shown to the
// reviewer for manual register lookup. When a real permitted
// API/dataset/partner integration is configured later, the admin
// sets automated_enabled = true and configures the endpoint — no
// profile or directory UI changes.

const DEFAULT_SOURCES: Array<{ id: string; data: Record<string, any> }> = [
  {
    id: 'gb_identity_evidence',
    data: {
      name: 'Identity Evidence',
      authority_type: 'manual_review',
      country: 'GB',
      professions: ['*'],
      claim_types: ['identity'],
      verification_method: 'manual_review',
      endpoint_url: '',
      dataset_ref: '',
      lookup_url: '',
      required_fields: [],
      is_active: true,
      automated_enabled: false,
      description: 'Manual review of identity/account evidence (e.g. photo ID). Email or phone verification alone does not qualify.',
    },
  },
  {
    id: 'gb_qualification_evidence',
    data: {
      name: 'Qualification Evidence',
      authority_type: 'awarding_organisation',
      country: 'GB',
      professions: ['*'],
      claim_types: ['qualification'],
      verification_method: 'manual_review',
      endpoint_url: '',
      dataset_ref: '',
      lookup_url: '',
      required_fields: [
        { id: 'qualification_title', label: 'Qualification title', type: 'text', required: true },
        { id: 'awarding_organisation', label: 'Awarding organisation', type: 'text', required: true },
        { id: 'certificate_reference', label: 'Certificate / reference number', type: 'text', required: false },
      ],
      is_active: true,
      automated_enabled: false,
      description: 'Manual review of qualification evidence (certificate, awarding body, reference).',
    },
  },
  {
    id: 'gb_professional_registration',
    data: {
      name: 'Professional Registration',
      authority_type: 'professional_body',
      country: 'GB',
      professions: ['*'],
      claim_types: ['professional_registration'],
      verification_method: 'professional_register_lookup',
      endpoint_url: '',
      dataset_ref: '',
      lookup_url: '',
      required_fields: [
        { id: 'registration_number', label: 'Registration number', type: 'text', required: true },
        { id: 'professional_body', label: 'Professional body / register', type: 'text', required: true },
      ],
      is_active: true,
      automated_enabled: false,
      description: 'Professional registration number checked against the relevant register. Manual lookup until an automated register integration is configured.',
    },
  },
  {
    id: 'gb_business_existence',
    data: {
      name: 'Business Existence',
      authority_type: 'official_register',
      country: 'GB',
      professions: ['*'],
      claim_types: ['business_existence'],
      verification_method: 'professional_register_lookup',
      endpoint_url: '',
      dataset_ref: '',
      lookup_url: 'https://find-and-update.company-information.service.gov.uk/',
      required_fields: [
        { id: 'company_number', label: 'Company number', type: 'text', required: true },
      ],
      is_active: true,
      automated_enabled: false,
      description: 'Business existence on an official register (e.g. Companies House). Manual lookup via the official register URL. Automated via the Companies House API only when API credentials are configured.',
    },
  },
  {
    id: 'gb_business_control',
    data: {
      name: 'Business Control',
      authority_type: 'manual_review',
      country: 'GB',
      professions: ['*'],
      claim_types: ['business_control'],
      verification_method: 'manual_review',
      endpoint_url: '',
      dataset_ref: '',
      lookup_url: '',
      required_fields: [],
      is_active: true,
      automated_enabled: false,
      description: 'Evidence that the Interactive user controls or represents the business. Separate from business existence — a business merely existing on a register does not prove the user controls it.',
    },
  },
  {
    id: 'gb_companies_house',
    data: {
      name: 'Companies House',
      authority_type: 'official_register',
      country: 'GB',
      professions: ['*'],
      claim_types: ['business_existence'],
      verification_method: 'professional_register_lookup',
      endpoint_url: '',
      dataset_ref: '',
      lookup_url: 'https://find-and-update.company-information.service.gov.uk/',
      required_fields: [
        { id: 'company_number', label: 'Companies House number', type: 'text', required: true },
      ],
      is_active: true,
      automated_enabled: false,
      description: 'Companies House register. Manual lookup via the official search URL. Automated via the Companies House REST API only when API credentials are configured and permitted.',
    },
  },
  {
    id: 'gb_cimspa',
    data: {
      name: 'CIMSPA',
      authority_type: 'professional_body',
      country: 'GB',
      professions: ['personal_trainer', 'gym_instructor', 'fitness_instructor'],
      claim_types: ['professional_registration'],
      verification_method: 'professional_register_lookup',
      endpoint_url: '',
      dataset_ref: '',
      lookup_url: 'https://www.cimspa.co.uk/',
      required_fields: [
        { id: 'membership_number', label: 'CIMSPA membership number', type: 'text', required: true },
      ],
      is_active: true,
      automated_enabled: false,
      description: 'Chartered Institute for the Management of Sport and Physical Activity. Manual register lookup until an automated integration is configured.',
    },
  },
  {
    id: 'gb_nrpt',
    data: {
      name: 'NRPT',
      authority_type: 'professional_body',
      country: 'GB',
      professions: ['personal_trainer'],
      claim_types: ['professional_registration'],
      verification_method: 'professional_register_lookup',
      endpoint_url: '',
      dataset_ref: '',
      lookup_url: 'https://www.nrpt.co.uk/',
      required_fields: [
        { id: 'membership_number', label: 'NRPT membership number', type: 'text', required: true },
      ],
      is_active: true,
      automated_enabled: false,
      description: 'National Register of Personal Trainers. Manual register lookup until an automated integration is configured.',
    },
  },
];

export default async function (req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { idToken } = body;
    if (!idToken) return Response.json({ error: 'Missing idToken' }, { status: 400 });

    const token = await getAccessToken();
    const projectId = getProjectId();

    let caller;
    try {
      caller = await resolveIdentityFromToken(projectId, idToken, token);
    } catch (e: any) {
      return Response.json({ error: e.message, code: 'AUTH_FAILED' }, { status: 401 });
    }
    const role = await getCallerRole(projectId, caller.identityId, token);
    if (role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const writes = DEFAULT_SOURCES.map((s) => ({
      name: docPath(projectId, 'verificationSources', s.id),
      fields: toFirestoreFields({ ...s.data, _created_date: now, _updated_date: now }),
    }));

    await firestoreBatchWrite(projectId, writes, token);

    return Response.json({
      seeded: DEFAULT_SOURCES.length,
      ids: DEFAULT_SOURCES.map((s) => s.id),
    });
  } catch (error: any) {
    return Response.json({ error: error.message, code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}