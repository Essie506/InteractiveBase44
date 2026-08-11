/**
 * Firebase Repository Adapter Barrel Export
 * ───────────────────────────────────────────────────────────
 * All Firebase adapters are exported here as namespaces.
 *
 * Interactive Services should import from this barrel when the
 * Firebase cutover happens (M2+). During M1, services continue
 * to use the Base44 implementation.
 *
 * Architecture:
 *   Page/Component → Interactive Service → Repository → Firebase
 */

export * as identityRepository from './firebaseIdentityRepository';
export * as userRepository from './firebaseUserRepository';
export * as profileRepository from './firebaseProfileRepository';
export * as businessRepository from './firebaseBusinessRepository';
export * as calendarRepository from './firebaseCalendarRepository';
export * as messagingRepository from './firebaseMessagingRepository';
export * as notificationRepository from './firebaseNotificationRepository';
export * as trustRepository from './firebaseTrustRepository';
export * as locationRepository from './firebaseLocationRepository';
export * as mediaRepository from './firebaseMediaRepository';
export * as settingsRepository from './firebaseSettingsRepository';
export * as specRepository from './firebaseSpecRepository';
export * as blockRepository from './firebaseBlockRepository';

export {
  toFirestoreDoc,
  fromFirestoreDoc,
  membershipDocId,
  blockDocId,
} from './mappers';