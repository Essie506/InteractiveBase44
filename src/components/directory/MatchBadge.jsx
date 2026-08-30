// Subtle match quality indicator shown on Directory result cards
// when structured multi-select filters (Services, Facilities,
// Equipment) are active.
//
// Shows "Matches all N" when every selected item matches, or
// "M of N preferences" for partial matches.
//
// Renders nothing when no structured filters are active
// (matchScore is null or selectedTotal === 0) to avoid clutter.
export default function MatchBadge({ matchScore }) {
  if (!matchScore || !matchScore.selectedTotal || matchScore.selectedTotal === 0) return null;

  const { matchedTotal, selectedTotal } = matchScore;
  const allMatched = matchedTotal === selectedTotal;

  return (
    <span className={`text-xs font-medium ${allMatched ? 'text-emerald-600' : 'text-stone-400'}`}>
      {allMatched
        ? `Matches all ${selectedTotal}`
        : `${matchedTotal} of ${selectedTotal} preferences`}
    </span>
  );
}