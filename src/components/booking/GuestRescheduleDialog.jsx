import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

// Generates the next 14 days for slot selection
function generateDates() {
  const dates = [];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d);
  }
  return dates;
}

// Generates 30-minute slots from 8am to 6pm
function generateTimeSlots() {
  const slots = [];
  for (let h = 8; h < 18; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  return slots;
}

/**
 * @param {{
 *   booking: object,
 *   onConfirm: (date: string, time: string) => void,
 *   onClose: () => void,
 *   loading: boolean,
 * }} props
 */
export default function GuestRescheduleDialog({ booking, onConfirm, onClose, loading }) {
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [error, setError] = useState(null);

  const dates = generateDates();
  const timeSlots = generateTimeSlots();
  const durationMinutes = booking.start_time && booking.end_time
    ? Math.round((new Date(booking.end_time).getTime() - new Date(booking.start_time).getTime()) / 60000)
    : 60;

  const handleConfirm = () => {
    setError(null);
    if (!selectedDate || !selectedTime) {
      setError('Please select a new date and time');
      return;
    }

    // Build ISO start time from selected date + time in the booking's timezone
    const [year, month, day] = [
      selectedDate.getFullYear(),
      selectedDate.getMonth() + 1,
      selectedDate.getDate(),
    ];
    const [hours, minutes] = selectedTime.split(':').map(Number);
    const newStart = new Date(year, month - 1, day, hours, minutes);
    const newEnd = new Date(newStart.getTime() + durationMinutes * 60000);

    onConfirm(newStart.toISOString(), newEnd.toISOString(), 'Guest reschedule request');
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !loading) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reschedule booking</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Current time</Label>
            <p className="text-sm text-stone-600 mt-1">
              {new Date(booking.start_time).toLocaleString('en-GB', {
                weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
              })}
            </p>
          </div>

          <div>
            <Label>Select a new date</Label>
            <div className="grid grid-cols-7 gap-1.5 mt-2 max-h-32 overflow-y-auto">
              {dates.map((d) => {
                const selected = selectedDate &&
                  d.getDate() === selectedDate.getDate() &&
                  d.getMonth() === selectedDate.getMonth();
                return (
                  <button
                    key={d.toISOString()}
                    onClick={() => setSelectedDate(d)}
                    className={`flex flex-col items-center py-2 rounded-lg text-xs transition-colors ${
                      selected
                        ? 'bg-indigo-600 text-white'
                        : 'bg-stone-50 text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    <span className="font-medium">{d.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 2)}</span>
                    <span>{d.getDate()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>Select a new time</Label>
            <div className="grid grid-cols-4 gap-1.5 mt-2 max-h-32 overflow-y-auto">
              {timeSlots.map((t) => {
                const selected = selectedTime === t;
                return (
                  <button
                    key={t}
                    onClick={() => setSelectedTime(t)}
                    disabled={!selectedDate}
                    className={`py-2 rounded-lg text-sm transition-colors ${
                      selected
                        ? 'bg-indigo-600 text-white'
                        : 'bg-stone-50 text-stone-600 hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <p className="text-xs text-stone-400">
            Note: The provider must be available at your selected time. If the slot isn't available, you'll be asked to choose another time.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Rescheduling…</> : 'Confirm reschedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}