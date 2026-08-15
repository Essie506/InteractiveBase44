import { base44 } from '@/api/base44Client';
import * as specRepo from '@/data/firebase/firebaseSpecRepository';

// Interactive SpecVault Service
// Owns Project, Specification and SpecVersion data operations, plus the
// SearchSpecs and FetchSpecContent backend-function invocations.
//
// Cutover: Project/Specification/SpecVersion entity operations now read/write
// Firestore via firebaseSpecRepository. The Base44 source entities are
// preserved (copy migration). File upload and backend function invocations
// remain on Base44 — they are integration/function calls, not entity
// operations, so no /api/apps/.../entities/{Project|Specification|SpecVersion}
// requests are made.

// --- Projects ---

export async function listProjects() {
  return specRepo.listProjects();
}

export async function getProject(projectId) {
  return specRepo.getProject(projectId);
}

export async function createProject(data) {
  return specRepo.createProject(data);
}

// --- Specifications ---

export async function listSpecifications(sort = '-updated_date', limit = 100) {
  return specRepo.listSpecifications(sort, limit);
}

export async function getSpecification(specId) {
  return specRepo.getSpecification(specId);
}

export async function createSpecification(data) {
  return specRepo.createSpecification(data);
}

export async function updateSpecification(specId, data) {
  await specRepo.updateSpecification(specId, data);
  // Re-read to return the full updated record (matches Base44 update shape,
  // which returned the complete entity, not just the patched fields).
  return specRepo.getSpecification(specId);
}

export async function deleteSpecification(specId) {
  return specRepo.deleteSpecification(specId);
}

// --- Spec Versions ---

export async function getSpecVersions(specificationId) {
  return specRepo.listSpecVersions(specificationId);
}

export async function createSpecVersion(data) {
  return specRepo.createSpecVersion(data);
}

export async function deleteSpecVersions(specificationId) {
  return specRepo.deleteSpecVersions(specificationId);
}

// --- File upload (SpecVault uses Base44 storage, not the Media system) ---

export async function uploadSpecFile(file) {
  const { file_url } = await base44.integrations.Core.UploadFile({ file });
  return file_url;
}

// --- Backend function invocations ---

export async function searchSpecs(query, projectId) {
  const response = await base44.functions.invoke('SearchSpecs', {
    query,
    project_id: projectId || undefined,
  });
  return response;
}

export async function fetchSpecContent(fileUrl) {
  const response = await base44.functions.invoke('FetchSpecContent', { file_url: fileUrl });
  return response;
}