import {
  getAccessToken,
  getProjectId,
  toFirestoreFields,
  firestoreBatchWrite,
  docPath,
} from '../../shared/firebaseAdmin.ts';

// ───────────────────────────────────────────────────────────
// CreateTrustSignal — Server-only trust signal creation
// ───────────────────────────────────────────────────────────
// Firestore security rules deny all client writes to trustSignals
// (allow write: if false). Trust signals are system-generated only.
// This function creates trust signal records with service-account auth.

export default async function(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const {
      source_system,
      target_type,
      target_id,
      signal_type,
      signal_data,
      signal_weight,
      operation_id,
    } = body;

    if (!source_system || !target_type || !target_id || !signal_type) {
      return Response.json(
        { error: 'Missing required fields: source_system, target_type, target_id, signal_type' },
        { status: 400 }
      );
    }

    const token = await getAccessToken();
    const projectId = getProjectId();
    const signalId = crypto.randomUUID();

    const signalRecord: Record<string, any> = {
      source_system,
      target_type,
      target_id,
      signal_type,
      signal_data: signal_data || null,
      signal_weight: signal_weight ?? 1,
      operation_id: operation_id || null,
      _created_date: new Date().toISOString(),
      _updated_date: new Date().toISOString(),
    };

    await firestoreBatchWrite(projectId, [{
      name: docPath(projectId, 'trustSignals', signalId),
      fields: toFirestoreFields(signalRecord),
    }], token);

    return Response.json({ id: signalId, ...signalRecord });
  } catch (error) {
    return Response.json(
      { error: error.message, code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}