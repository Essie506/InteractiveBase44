import { useState } from 'react';
import { MoreVertical, Ban, Flag } from 'lucide-react';

/**
 * Shared "more options" menu for Profile pages.
 * Renders a MoreVertical button with a dropdown containing
 * Report and Block/Unblock actions, plus confirmation modals.
 *
 * Used by PublicBusinessProfile and PublicPersonalProfile.
 * PublicProfile (Professional) has its own inline implementation
 * which predates this shared component.
 *
 * @param {{ displayName: string, isBlocked: boolean, onBlock: Function, onUnblock: Function, onReport: Function }} props
 */
export default function ProfileMoreMenu({ displayName, isBlocked, onBlock, onUnblock, onReport }) {
  const [showMenu, setShowMenu] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showReportConfirm, setShowReportConfirm] = useState(false);

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="p-2.5 bg-white border border-stone-200 rounded-lg hover:bg-stone-50"
          title="More options"
        >
          <MoreVertical className="w-4 h-4 text-stone-600" />
        </button>
        {showMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-stone-200 rounded-lg shadow-lg py-1 min-w-[160px]">
              <button
                onClick={() => { setShowReportConfirm(true); setShowMenu(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
              >
                <Flag className="w-3.5 h-3.5" /> Report
              </button>
              {isBlocked ? (
                <button
                  onClick={() => { onUnblock(); setShowMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
                >
                  <Ban className="w-3.5 h-3.5" /> Unblock
                </button>
              ) : (
                <button
                  onClick={() => { setShowBlockConfirm(true); setShowMenu(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <Ban className="w-3.5 h-3.5" /> Block
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {showBlockConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowBlockConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <Ban className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-lg font-bold text-stone-800">Block {displayName}?</h2>
            </div>
            <p className="text-sm text-stone-500 mb-5">They will not be able to send you messages or see your profile.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowBlockConfirm(false)} className="flex-1 px-4 py-2.5 text-stone-600 hover:bg-stone-100 rounded-lg font-medium">Cancel</button>
              <button onClick={() => { onBlock(); setShowBlockConfirm(false); }} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700">Block</button>
            </div>
          </div>
        </div>
      )}

      {showReportConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowReportConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <Flag className="w-5 h-5 text-amber-600" />
              </div>
              <h2 className="text-lg font-bold text-stone-800">Report {displayName}?</h2>
            </div>
            <p className="text-sm text-stone-500 mb-5">This will submit a report to Trust & Safety for review.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowReportConfirm(false)} className="flex-1 px-4 py-2.5 text-stone-600 hover:bg-stone-100 rounded-lg font-medium">Cancel</button>
              <button onClick={() => { onReport(); setShowReportConfirm(false); }} className="flex-1 px-4 py-2.5 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700">Report</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}