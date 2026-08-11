import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

// Lazy initialization — defers createClient() (and the analytics
// module's auto init event / auth.me() call) until the first property
// access. In Firebase mode, the auth path never touches base44, so
// the SDK's /api/apps/{appId}/entities/User/me and
// /api/apps/{appId}/analytics/track/batch calls never fire during
// authentication. Base44 is only activated when a feature that
// genuinely needs it (SpecVault, Media) accesses base44.* at runtime.
let _client = null;

function getClient() {
  if (!_client) {
    _client = createClient({
      appId: appParams.appId,
      token: appParams.token,
      functionsVersion: appParams.functionsVersion,
      serverUrl: '',
      requiresAuth: false,
      appBaseUrl: appParams.appBaseUrl,
    });
  }
  return _client;
}

export const base44 = new Proxy({}, {
  get(_target, prop) {
    return getClient()[prop];
  }
});