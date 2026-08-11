import { base44 } from '@/api/base44Client';

// Interactive SpecVault Service
// Owns Project, Specification and SpecVersion data operations, plus the
// SearchSpecs and FetchSpecContent backend-function invocations.
// SpecVault is separable from the core Interactive platform.

// --- Projects ---

export async function listProjects() {
  return base44.entities.Project.list();
}

export async function getProject(projectId) {
  return base44.entities.Project.get(projectId);
}

export async function createProject(data) {
  return base44.entities.Project.create(data);
}

// --- Specifications ---

export async function listSpecifications(sort = '-updated_date', limit = 100) {
  return base44.entities.Specification.list(sort, limit);
}

export async function getSpecification(specId) {
  return base44.entities.Specification.get(specId);
}

export async function createSpecification(data) {
  return base44.entities.Specification.create(data);
}

export async function updateSpecification(specId, data) {
  return base44.entities.Specification.update(specId, data);
}

export async function deleteSpecification(specId) {
  return base44.entities.Specification.delete(specId);
}

// --- Spec Versions ---

export async function getSpecVersions(specificationId) {
  return base44.entities.SpecVersion.filter({ specification_id: specificationId });
}

export async function createSpecVersion(data) {
  return base44.entities.SpecVersion.create(data);
}

export async function deleteSpecVersions(specificationId) {
  return base44.entities.SpecVersion.deleteMany({ specification_id: specificationId });
}

// --- File upload (SpecVault uses direct storage, not the Media system) ---

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