import { base44 } from '@/api/base44Client';
import { taxonomyRepository } from '@/data/firebase';
import { useFirebase } from '@/lib/backendConfig';

// Taxonomy Service — routes to Firebase when configured.
// Service and Facility definitions are canonical taxonomies used by
// the structured selection UI on Professional and Business profiles.

export async function getServiceDefinitions(domain) {
  if (useFirebase) return taxonomyRepository.getServiceDefinitions(domain);
  const all = await base44.entities.ServiceDefinition.list();
  if (!domain) return all;
  return all.filter((s) => Array.isArray(s.domains) && s.domains.includes(domain));
}

export async function getFacilityDefinitions() {
  if (useFirebase) return taxonomyRepository.getFacilityDefinitions();
  return base44.entities.FacilityDefinition.list();
}