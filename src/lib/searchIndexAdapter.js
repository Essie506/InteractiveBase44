// SearchIndexAdapter — V2 Search & Discovery §15.5.
// Provider-independent contract for the search index.
//
// DEFAULT implementation: Firestore-based inverted-token index.
// A `searchIndex` collection stores one document per indexed content
// record, containing normalised tokens, content_type, content_id,
// and discovery-safe display fields. Cloud functions update the index
// when connected systems publish changes.
//
// An external search service (Algolia/Typesense) can be plugged in
// by replacing this module's adapter — the discovery service and
// Directory UI do not change.

import { db } from '@/firebase/firebaseClient';
import { collection, query, where, orderBy, limit, getDocs, doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { useFirebase } from '@/lib/backendConfig';

const INDEX_COLLECTION = 'searchIndex';

/**
 * Tokenise text for the search index.
 * Lowercases, splits on non-alphanumeric, removes empty tokens.
 * @param {string} text
 * @returns {string[]}
 */
export function tokenise(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

/**
 * Build a search index document from a content record.
 * @param {Object} params
 * @returns {Object} index document
 */
export function buildIndexDocument({ contentId, contentType, system, title, description, tags, location, ownerId, visibility, extra }) {
  const textFields = [title, description, ...(tags || [])].filter(Boolean).join(' ');
  const tokens = [...new Set(tokenise(textFields))];
  return {
    content_id: contentId,
    content_type: contentType,
    system,
    title: title || '',
    description: (description || '').slice(0, 300),
    tags: tags || [],
    tokens,
    location: location || null,
    owner_id: ownerId || null,
    visibility: visibility || 'public',
    _updated_date: new Date().toISOString(),
    ...extra,
  };
}

/**
 * Upsert a document into the search index.
 * @param {Object} indexDoc - document from buildIndexDocument
 */
export async function indexContent(indexDoc) {
  if (!useFirebase) return;
  const ref = doc(db, INDEX_COLLECTION, `${indexDoc.system}_${indexDoc.content_id}`);
  await setDoc(ref, indexDoc, { merge: true });
}

/**
 * Remove a document from the search index.
 * @param {string} system
 * @param {string} contentId
 */
export async function unindexContent(system, contentId) {
  if (!useFirebase) return;
  const ref = doc(db, INDEX_COLLECTION, `${system}_${contentId}`);
  await deleteDoc(ref);
}

/**
 * Query the search index by free-text tokens.
 * Client-side token matching against the Firestore-stored tokens array.
 * @param {string} searchText
 * @param {Object} opts - { types, maxResults }
 * @returns {Promise<Array>} matched index documents
 */
export async function searchIndex(searchText, opts = {}) {
  if (!useFirebase || !searchText?.trim()) return [];
  const { types, maxResults = 50 } = opts;
  const searchTokens = tokenise(searchText);
  if (searchTokens.length === 0) return [];

  // Fetch candidate documents — by content_type if specified, else all
  let q;
  if (types && types.length > 0) {
    q = query(collection(db, INDEX_COLLECTION), where('content_type', 'in', types), limit(200));
  } else {
    q = query(collection(db, INDEX_COLLECTION), limit(200));
  }
  const snap = await getDocs(q);
  const docs = snap.docs.map((d) => d.data());

  // Client-side token matching: score by number of matching tokens
  const scored = docs
    .map((d) => {
      const docTokens = d.tokens || [];
      const matchCount = searchTokens.filter((t) => docTokens.includes(t)).length;
      return { ...d, _score: matchCount };
    })
    .filter((d) => d._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, maxResults);

  return scored;
}

/**
 * Get search suggestions (autocomplete-style) from the index.
 * Returns title prefixes matching the input.
 * @param {string} prefix
 * @param {number} maxResults
 * @returns {Promise<Array>} suggestion strings
 */
export async function getSuggestions(prefix, maxResults = 8) {
  if (!useFirebase || !prefix?.trim() || prefix.trim().length < 2) return [];
  const prefixLower = prefix.toLowerCase().trim();
  const q = query(collection(db, INDEX_COLLECTION), limit(100));
  const snap = await getDocs(q);
  const docs = snap.docs.map((d) => d.data());
  const titles = docs
    .map((d) => d.title)
    .filter(Boolean)
    .filter((t) => t.toLowerCase().includes(prefixLower))
    .slice(0, maxResults);
  return [...new Set(titles)];
}