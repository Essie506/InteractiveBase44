import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Upload, Loader2, FileText, Plus, Check } from 'lucide-react';

export default function UploadPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [specNumber, setSpecNumber] = useState('');
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState('Draft');
  const [systemType, setSystemType] = useState('');
  const [version, setVersion] = useState('1.0');
  const [tags, setTags] = useState('');
  const [summary, setSummary] = useState('');

  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [newProjectColor, setNewProjectColor] = useState('#4F46E5');

  useEffect(() => {
    base44.entities.Project.list()
      .then(data => {
        setProjects(data);
        if (data.length > 0) setProjectId(data[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setError(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      setSummary(text.substring(0, 1500));

      // Auto-parse title and spec number from content
      const titleMatch = text.match(/^#\s+(.+)$/m);
      if (titleMatch && !title) {
        const parsedTitle = titleMatch[1]
          .replace(/^(\d+)\s*[-—]\s*/, (m, num) => { setSpecNumber(num); return ''; })
          .replace(/\s+Specification\s*$/i, '')
          .replace(/\s+System\s*$/i, '')
          .trim();
        if (parsedTitle) setTitle(parsedTitle);
      }

      // Try to find version
      const versionMatch = text.match(/\*\*Version:\*\*\s*(.+?)$/m) || text.match(/Version:\s*(.+?)$/m);
      if (versionMatch && version === '1.0') {
        setVersion(versionMatch[1].trim());
      }

      // Try to find system type
      const typeMatch = text.match(/Architecture Level:\*\*\s*(.+?)$/m) || text.match(/System Type:\*\*\s*(.+?)$/m);
      if (typeMatch && !systemType) {
        setSystemType(typeMatch[1].trim());
      }
    };
    reader.readAsText(selectedFile);
  };

  const createProject = async () => {
    if (!newProjectName) return;
    const proj = await base44.entities.Project.create({
      name: newProjectName,
      description: newProjectDesc,
      color: newProjectColor,
    });
    setProjects([...projects, proj]);
    setProjectId(proj.id);
    setShowNewProject(false);
    setNewProjectName('');
    setNewProjectDesc('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setError('Please select a file'); return; }
    if (!title) { setError('Please enter a title'); return; }
    if (!projectId) { setError('Please select a project'); return; }

    setUploading(true);
    setError(null);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      const tagArray = tags.split(',').map(t => t.trim()).filter(Boolean);

      const spec = await base44.entities.Specification.create({
        title,
        spec_number: specNumber,
        project_id: projectId,
        status,
        system_type: systemType,
        version,
        file_url,
        summary,
        tags: tagArray,
      });

      await base44.entities.SpecVersion.create({
        specification_id: spec.id,
        version,
        status,
        file_url,
        change_note: 'Initial upload',
      });

      navigate(`/specifications/${spec.id}`);
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-stone-800 mb-1">Upload Specification</h1>
        <p className="text-stone-500">Add a new specification document to your repository</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* File upload */}
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <label className="block text-sm font-medium text-stone-700 mb-2">Document File</label>
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-stone-300 rounded-lg p-8 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors">
            {file ? (
              <div className="text-center">
                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                  <Check className="w-6 h-6 text-indigo-600" />
                </div>
                <p className="text-sm font-medium text-stone-700">{file.name}</p>
                <p className="text-xs text-stone-400 mt-0.5">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
            ) : (
              <div className="text-center">
                <div className="w-12 h-12 bg-stone-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                  <Upload className="w-6 h-6 text-stone-400" />
                </div>
                <p className="text-sm font-medium text-stone-600">Click to select a file</p>
                <p className="text-xs text-stone-400 mt-0.5">.txt, .md, .markdown</p>
              </div>
            )}
            <input type="file" accept=".txt,.md,.markdown" onChange={handleFileSelect} className="hidden" />
          </label>
        </div>

        {/* Metadata */}
        <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Interactive Navigation System"
              className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Spec Number</label>
              <input
                type="text"
                value={specNumber}
                onChange={e => setSpecNumber(e.target.value)}
                placeholder="e.g. 02"
                className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Version</label>
              <input
                type="text"
                value={version}
                onChange={e => setVersion(e.target.value)}
                placeholder="e.g. 2.0"
                className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>
          </div>

          {/* Project selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-stone-700">Project</label>
              <button
                type="button"
                onClick={() => setShowNewProject(!showNewProject)}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> New Project
              </button>
            </div>
            {showNewProject ? (
              <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 space-y-2.5">
                <input
                  type="text"
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  placeholder="Project name"
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
                />
                <input
                  type="text"
                  value={newProjectDesc}
                  onChange={e => setNewProjectDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newProjectColor}
                    onChange={e => setNewProjectColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-stone-200"
                  />
                  <button
                    type="button"
                    onClick={createProject}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700"
                  >
                    Create
                  </button>
                </div>
              </div>
            ) : (
              <select
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">System Type</label>
              <input
                type="text"
                value={systemType}
                onChange={e => setSystemType(e.target.value)}
                placeholder="e.g. Core Platform System"
                className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
              >
                <option value="Draft">Draft</option>
                <option value="In Review">In Review</option>
                <option value="Approved">Approved</option>
                <option value="Archived">Archived</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Tags (comma-separated)</label>
            <input
              type="text"
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="e.g. navigation, auth, core"
              className="w-full px-3 py-2.5 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
            />
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={uploading}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Uploading...' : 'Upload Specification'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/specifications')}
            className="px-5 py-2.5 text-stone-600 hover:bg-stone-200 rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}