import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Resolve display information for a set of Interactive identities.
// Uses service role to bypass built-in user list restriction.
// Returns minimal display info only — no sensitive data.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { identity_ids } = body;

    if (!identity_ids || !Array.isArray(identity_ids)) {
      return Response.json({ error: 'identity_ids array required' }, { status: 400 });
    }

    const results = {};
    for (const id of identity_ids) {
      try {
        const users = await base44.asServiceRole.entities.User.filter({ id });
        if (users.length > 0) {
          results[id] = {
            identity_id: id,
            display_name: users[0].display_name || users[0].email,
            avatar_url: users[0].avatar_url || null,
          };
        } else {
          results[id] = { identity_id: id, display_name: 'Unknown User', avatar_url: null };
        }
      } catch {
        results[id] = { identity_id: id, display_name: 'Unknown User', avatar_url: null };
      }
    }

    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}