/**
 * Community Interaction Service (Spec 20)
 * ───────────────────────────────────────────────────────────
 * Client-side reads + writes for Reactions, Comments, and Saves.
 *
 * Reads (reactions/comments): Firebase client SDK — public collections.
 * Writes: trusted Cloud Functions (auth-verified, the sole write path).
 * Private state (caller's reactions/saves): getInteractionState callable
 * (Firestore rules cannot resolve Firebase UID → identity for saves).
 */

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/firebase/firebaseClient';
import {
  callToggleReaction, callCreateComment, callDeleteComment,
  callToggleSave, callGetInteractionState,
} from '@/services/firebaseFunctions';

// ── Reactions ─────────────────────────────────────────────────
/**
 * @param {string} targetSystem
 * @param {string} targetId
 * @returns {Promise<Record<string, number>>}
 */
export async function listReactions(targetSystem, targetId) {
  const q = query(
    collection(db, 'reactions'),
    where('target_system', '==', targetSystem),
    where('target_id', '==', targetId),
  );
  const snap = await getDocs(q);
  const counts = {};
  snap.forEach((doc) => {
    const data = doc.data();
    if (data.state !== 'active') return;
    counts[data.reaction_type] = (counts[data.reaction_type] || 0) + 1;
  });
  return counts;
}

export async function toggleReaction(targetSystem, targetType, targetId, reactionType) {
  return callToggleReaction({
    target_system: targetSystem, target_type: targetType,
    target_id: targetId, reaction_type: reactionType,
  });
}

// ── Comments ─────────────────────────────────────────────────
/**
 * @param {string} targetSystem
 * @param {string} targetId
 * @returns {Promise<import('@/types/domain').Comment[]>}
 */
export async function listComments(targetSystem, targetId) {
  const q = query(
    collection(db, 'comments'),
    where('target_system', '==', targetSystem),
    where('target_id', '==', targetId),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => c.visibility_state === 'visible' && c.moderation_state === 'approved')
    .sort((a, b) => (a._created_date || '').localeCompare(b._created_date || ''));
}

export async function createComment(targetSystem, targetType, targetId, body, parentCommentId = null) {
  return callCreateComment({
    target_system: targetSystem, target_type: targetType,
    target_id: targetId, body, parent_comment_id: parentCommentId,
  });
}

export async function deleteComment(commentId) {
  return callDeleteComment({ comment_id: commentId });
}

// ── Saves ────────────────────────────────────────────────────
export async function toggleSave(targetSystem, targetType, targetId) {
  return callToggleSave({
    target_system: targetSystem, target_type: targetType, target_id: targetId,
  });
}

// ── Caller's private interaction state ────────────────────────
/**
 * @param {string} targetSystem
 * @param {string} targetId
 * @returns {Promise<{ reacted?: boolean; reaction_type?: string; saved?: boolean }>}
 */
export async function getInteractionState(targetSystem, targetId) {
  return callGetInteractionState({ target_system: targetSystem, target_id: targetId });
}