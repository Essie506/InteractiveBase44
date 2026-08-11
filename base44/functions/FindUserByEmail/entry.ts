import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Find a registered user by email for messaging purposes.
// Respects the recipient's search_visibility privacy setting.
// Returns minimal display info only — no sensitive data.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { email } = body;

    if (!email) return Response.json({ error: 'email required' }, { status: 400 });

    // Look up user by email (service role bypasses built-in user list restriction)
    const users = await base44.asServiceRole.entities.User.filter({ email: email.toLowerCase().trim() });
    if (users.length === 0) {
      return Response.json({ found: false });
    }

    const user = users[0];

    // Check if the recipient has search visibility enabled (privacy gate)
    const settings = await base44.asServiceRole.entities.UserSetting.filter({ identity_id: user.id });
    if (settings.length > 0 && !settings[0].search_visibility) {
      return Response.json({ found: false });
    }

    return Response.json({
      found: true,
      identity_id: user.id,
      display_name: user.display_name || user.email,
      avatar_url: user.avatar_url || null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}