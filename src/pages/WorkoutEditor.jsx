// WorkoutEditor — create or edit a workout (Spec 12 §9/§15).
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, Loader2, Save, ArrowLeft, ImagePlus, Film } from 'lucide-react';
import { getWorkout, saveWorkout, deleteWorkout } from '@/services/workoutService';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import MediaUploadButton from '@/components/MediaUploadButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const WORKOUT_TYPES = ['individual', 'programme', 'training_plan', 'challenge', 'rehab', 'mobility', 'stretching', 'yoga', 'pilates', 'cardio', 'strength', 'sports_specific', 'educational', 'assessment', 'recovery'];
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced', 'all_levels'];

const label = (s) => s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ');

export default function WorkoutEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', workout_type: 'individual', difficulty: 'all_levels',
    duration_minutes: 30, exercises: [], media_url: '', cover_url: '',
    lifecycle_state: 'draft',
  });

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      try {
        const w = await getWorkout(id);
        if (!w) { toast({ title: 'Workout not found', variant: 'destructive' }); navigate('/workouts'); return; }
        setForm({
          title: w.title || '', description: w.description || '', workout_type: w.workout_type || 'individual',
          difficulty: w.difficulty || 'all_levels', duration_minutes: w.duration_minutes || 30,
          exercises: w.exercises || [], media_url: w.media_url || '', cover_url: w.cover_url || '',
          lifecycle_state: w.lifecycle_state || 'draft',
        });
      } finally { setLoading(false); }
    };
    load();
  }, [id]);

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const addExercise = () => setForm((prev) => ({ ...prev, exercises: [...prev.exercises, { name: '', description: '', sets: '', reps: '', duration_seconds: '', rest_seconds: '' }] }));
  const updateExercise = (i, field, value) => setForm((prev) => ({ ...prev, exercises: prev.exercises.map((ex, idx) => idx === i ? { ...ex, [field]: value } : ex) }));
  const removeExercise = (i) => setForm((prev) => ({ ...prev, exercises: prev.exercises.filter((_, idx) => idx !== i) }));

  const handleSave = async (publish = false) => {
    if (!form.title.trim()) { toast({ title: 'Title is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const data = { ...form, workout_id: id || null, lifecycle_state: publish ? 'published' : form.lifecycle_state };
      const result = await saveWorkout(data);
      toast({ title: publish ? 'Workout published' : 'Draft saved' });
      navigate(`/workouts/${result.id}`);
    } catch (err) {
      toast({ title: 'Could not save workout', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !window.confirm('Archive this workout? It will be removed from discovery.')) return;
    try {
      await deleteWorkout(id);
      toast({ title: 'Workout archived' });
      navigate('/workouts');
    } catch (err) {
      toast({ title: 'Could not archive', variant: 'destructive' });
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-stone-300 animate-spin" /></div>;

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-stone-800">{id ? 'Edit Workout' : 'New Workout'}</h1>
        <Button variant="ghost" onClick={() => navigate(id ? `/workouts/${id}` : '/workouts')}><ArrowLeft className="w-4 h-4 mr-1" /> Cancel</Button>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="title">Title *</Label>
          <Input id="title" value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="e.g. Full Body Strength" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Workout Type</Label>
            <select value={form.workout_type} onChange={(e) => update('workout_type', e.target.value)} className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background">
              {WORKOUT_TYPES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
            </select>
          </div>
          <div>
            <Label>Difficulty</Label>
            <select value={form.difficulty} onChange={(e) => update('difficulty', e.target.value)} className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background">
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{label(d)}</option>)}
            </select>
          </div>
        </div>

        <div>
          <Label>Duration (minutes)</Label>
          <Input type="number" min="1" max="480" value={form.duration_minutes} onChange={(e) => update('duration_minutes', parseInt(e.target.value) || 30)} />
        </div>

        <div>
          <Label>Description</Label>
          <Textarea value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="Describe the workout..." rows={3} />
        </div>

        <div>
          <Label>Cover Image</Label>
          {form.cover_url ? (
            <div className="relative w-full h-40 rounded-lg overflow-hidden border border-stone-200">
              <img src={form.cover_url} alt="Cover" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => update('cover_url', '')}
                className="absolute top-2 right-2 w-7 h-7 bg-black/60 text-white rounded-full text-sm flex items-center justify-center hover:bg-black/80"
              >×</button>
            </div>
          ) : (
            <MediaUploadButton
              ownerId={user.id}
              sourceDomain={user.active_context || 'professional'}
              accept="image/*"
              onUploaded={(asset) => update('cover_url', asset.file_url)}
              onError={() => toast({ title: 'Upload failed', variant: 'destructive' })}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-stone-600 border border-stone-200 rounded-lg hover:bg-stone-50"
            >
              <ImagePlus className="w-4 h-4" /> Upload cover image
            </MediaUploadButton>
          )}
        </div>

        <div>
          <Label>Media (video/audio)</Label>
          {form.media_url ? (
            <div className="flex items-center gap-2">
              <Input value={form.media_url} onChange={(e) => update('media_url', e.target.value)} placeholder="https://..." />
              <Button type="button" variant="ghost" size="sm" onClick={() => update('media_url', '')}><Trash2 className="w-4 h-4 text-red-500" /></Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <MediaUploadButton
                ownerId={user.id}
                sourceDomain={user.active_context || 'professional'}
                accept="video/*,audio/*"
                onUploaded={(asset) => update('media_url', asset.file_url)}
                onError={() => toast({ title: 'Upload failed', variant: 'destructive' })}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-stone-600 border border-stone-200 rounded-lg hover:bg-stone-50"
              >
                <Film className="w-4 h-4" /> Upload media
              </MediaUploadButton>
              <Input value={form.media_url} onChange={(e) => update('media_url', e.target.value)} placeholder="or paste URL" className="flex-1" />
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Exercises</Label>
            <Button type="button" variant="outline" size="sm" onClick={addExercise}><Plus className="w-4 h-4 mr-1" /> Add Exercise</Button>
          </div>
          <div className="space-y-2">
            {form.exercises.map((ex, i) => (
              <div key={i} className="border border-stone-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input value={ex.name} onChange={(e) => updateExercise(i, 'name', e.target.value)} placeholder="Exercise name" className="flex-1" />
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeExercise(i)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                </div>
                <Input value={ex.description} onChange={(e) => updateExercise(i, 'description', e.target.value)} placeholder="Description (optional)" className="text-sm" />
                <div className="grid grid-cols-4 gap-2">
                  <Input type="number" value={ex.sets} onChange={(e) => updateExercise(i, 'sets', e.target.value ? parseInt(e.target.value) : '')} placeholder="Sets" className="text-sm" />
                  <Input type="number" value={ex.reps} onChange={(e) => updateExercise(i, 'reps', e.target.value ? parseInt(e.target.value) : '')} placeholder="Reps" className="text-sm" />
                  <Input type="number" value={ex.duration_seconds} onChange={(e) => updateExercise(i, 'duration_seconds', e.target.value ? parseInt(e.target.value) : '')} placeholder="Secs" className="text-sm" />
                  <Input type="number" value={ex.rest_seconds} onChange={(e) => updateExercise(i, 'rest_seconds', e.target.value ? parseInt(e.target.value) : '')} placeholder="Rest" className="text-sm" />
                </div>
              </div>
            ))}
            {form.exercises.length === 0 && <p className="text-sm text-stone-400 text-center py-2">No exercises added yet.</p>}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-4 border-t">
          <Button onClick={() => handleSave(false)} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />} Save Draft
          </Button>
          <Button onClick={() => handleSave(true)} disabled={saving}>Publish</Button>
          {id && <Button variant="ghost" onClick={handleDelete} className="text-red-600 ml-auto">Archive</Button>}
        </div>
      </div>
    </div>
  );
}