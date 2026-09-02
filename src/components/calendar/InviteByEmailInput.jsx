import React from 'react';

// InviteByEmailInput — comma/newline-separated email entry for sharing an
// event with other people. Email is a discovery/invitation mechanism, NOT an
// ownership key. The canonical saveCalendarEvent Cloud Function resolves
// each email to a stable Interactive identity ID (invited_identity_ids) or,
// if no identity exists, preserves it as invited_guest_emails. Recipients
// can view the event but never edit it.
export default function InviteByEmailInput({ value, onChange }) {
  return (
    <div>
      <label className="block text-sm font-medium text-stone-700 mb-1.5">Invite by email</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="name@example.com, another@example.com"
        className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
      />
      <p className="text-xs text-stone-400 mt-1">Comma-separated. Recipients can view the event but not edit it.</p>
    </div>
  );
}