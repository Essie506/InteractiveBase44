import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getSpecification, updateSpecification, deleteSpecification,
  getProject, getSpecVersions, createSpecVersion, deleteSpecVersions,
  uploadSpecFile, fetchSpecContent,
} from '@/services/specService';
import ReactMarkdown from 'react-markdown';
import {
  ArrowLeft, Download, FileText, Tag, History, ChevronDown,
  Upload, Trash2, Loader2, GitBranch
} from 'lucide-react';
import StatusBadge from '@/components/specs/StatusBadge';

const STATUSES = ['Draft', 'In Review', 'Approved', 'Archived'];

export default function SpecificationDetail() {
  const { id } = useParams();
  const [spec, setSpec] = useState(null);
  const [project, setProject] = useState(null);
  const [versions, setVersions] = useState([]);
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [contentError, setContentError] = useState(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [showVersionForm, setShowVersionForm] = useState(false);
  const [newVersionFile, setNewVersionFile] = useState(null);
  const [newVersionNumber, setNewVersionNumber] = useState('');
  const [newVersionNote, setNewVersionNote] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    getSpecification(id)
      .then(async specData => {
        setSpec(specData);
        if (specData.project_id) {
          const proj = await getProject(specData.project_id);
          setProject(proj);
        }
        const vers = await getSpecVersions(id);
        setVersions(vers.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (spec?.file_url) {
      setLoadingContent(true);
      setContentError(null);
      fetchSpecContent(spec.file_url)
        .then(res => setContent(res.data.content))
        .catch(err => setContentError(err.message || 'Failed to load content'))
        .finally(() => setLoadingContent(false));
    }
  }, [spec?.file_url]);

  const changeStatus = async (newStatus) => {
    const updated = await updateSpecification(id, { status: newStatus });
    setSpec(updated);
    setStatusOpen(false);
  };

  const handleNewVersionFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setNewVersionFile(file);
    if (!newVersionNumber) {
      const currentVer = parseFloat(spec.version) || 1.0;
      setNewVersionNumber((currentVer + 1).toFixed(1));
    }
  };

  const submitNewVersion = async () => {
    if (!newVersionFile || !newVersionNumber) return;
    setUploading(true);
    try {
      // Save current version to history
      await createSpecVersion({
        specification_id: id,
        version: spec.version,
        status: spec.status,
        file_url: spec.file_url,
        change_note: 'Previous version',
      });

      // Upload new file
      const file_url = await uploadSpecFile(newVersionFile);

      // Update spec
      const updated = await updateSpecification(id, {
        file_url,
        version: newVersionNumber,
        status: 'Draft',
      });
      setSpec(updated);

      // Add new version record
      const newVer = await createSpecVersion({
        specification_id: id,
        version: newVersionNumber,
        status: 'Draft',
        file_url,
        change_note: newVersionNote || 'New version uploaded',
      });
      setVersions([newVer, ...versions]);

      // Refresh content
      setContent(null);
      setLoadingContent(true);
      fetchSpecContent(file_url)
        .then(res => setContent(res.data.content))
        .finally(() => setLoadingContent(false));

      setShowVersionForm(false);
      setNewVersionFile(null);
      setNewVersionNumber('');
      setNewVersionNote('');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this specification and all its versions?')) return;
    await deleteSpecVersions(id);
    await deleteSpecification(id);
    window.location.href = '/specifications';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!spec) {
    return (
      <div className="p-10 text-center">
        <p className="text-stone-500">Specification not found.</p>
        <Link to="/specifications" className="text-indigo-600 hover:underline">Back to specifications</Link>
      </div>
    );
  }

  const isLargeFile = content && content.length > 100000;

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <Link to="/specifications" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to specifications
      </Link>

      {/* Header */}
      <div className="bg-white rounded-xl border border-stone-200 p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            {spec.spec_number && (
              <div className="text-xs text-stone-400 font-mono mb-1.5">Specification {spec.spec_number}</div>
            )}
            <h1 className="text-2xl font-bold text-stone-800 leading-tight">{spec.title}</h1>
          </div>
          <StatusBadge status={spec.status} size="md" />
        </div>

        {/* Metadata */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-stone-500 mb-4">
          {project && (
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: project.color }} />
              {project.name}
            </span>
          )}
          <span>Version {spec.version}</span>
          {spec.system_type && <span>· {spec.system_type}</span>}
        </div>

        {spec.tags && spec.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {spec.tags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-stone-100 text-stone-600 rounded text-xs">
                <Tag className="w-3 h-3" /> {tag}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-stone-100">
          {/* Status dropdown */}
          <div className="relative">
            <button
              onClick={() => setStatusOpen(!statusOpen)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg text-sm font-medium text-stone-700 transition-colors"
            >
              Change Status <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {statusOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setStatusOpen(false)} />
                <div className="absolute top-full mt-1 left-0 z-20 bg-white border border-stone-200 rounded-lg shadow-lg py-1 min-w-40">
                  {STATUSES.map(s => (
                    <button
                      key={s}
                      onClick={() => changeStatus(s)}
                      className="w-full text-left px-3 py-2 hover:bg-stone-50 text-sm flex items-center gap-2"
                    >
                      <span className={`w-2 h-2 rounded-full ${
                        s === 'Draft' ? 'bg-amber-500' :
                        s === 'In Review' ? 'bg-blue-500' :
                        s === 'Approved' ? 'bg-emerald-500' : 'bg-stone-400'
                      }`} />
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => setShowVersionForm(!showVersionForm)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg text-sm font-medium text-stone-700 transition-colors"
          >
            <Upload className="w-4 h-4" /> New Version
          </button>

          {spec.file_url && (
            <a
              href={spec.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-stone-100 hover:bg-stone-200 rounded-lg text-sm font-medium text-stone-700 transition-colors"
            >
              <Download className="w-4 h-4" /> Download
            </a>
          )}

          <button
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors ml-auto"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>

        {/* New version form */}
        {showVersionForm && (
          <div className="mt-4 p-4 bg-stone-50 rounded-lg border border-stone-200">
            <h4 className="font-medium text-stone-700 mb-3">Upload New Version</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">File</label>
                <input type="file" accept=".txt,.md,.markdown" onChange={handleNewVersionFile} className="text-sm" />
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">Version Number</label>
                  <input
                    type="text"
                    value={newVersionNumber}
                    onChange={e => setNewVersionNumber(e.target.value)}
                    placeholder="e.g. 3.0"
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">Change Note</label>
                  <input
                    type="text"
                    value={newVersionNote}
                    onChange={e => setNewVersionNote(e.target.value)}
                    placeholder="What changed?"
                    className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={submitNewVersion}
                  disabled={!newVersionFile || !newVersionNumber || uploading}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {uploading ? 'Uploading...' : 'Upload Version'}
                </button>
                <button
                  onClick={() => setShowVersionForm(false)}
                  className="px-4 py-2 text-stone-600 hover:bg-stone-200 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Content */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-stone-200 p-6 md:p-8">
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-stone-100">
              <FileText className="w-4.5 h-4.5 text-stone-400" />
              <h2 className="font-semibold text-stone-700">Document Content</h2>
            </div>
            {loadingContent ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
              </div>
            ) : contentError ? (
              <div className="text-red-500 text-sm py-8 text-center">{contentError}</div>
            ) : isLargeFile ? (
              <div>
                <div className="mb-3 p-3 bg-amber-50 text-amber-700 rounded-lg text-xs">
                  This is a large document ({(content.length / 1024).toFixed(0)} KB). Showing raw text for performance.
                </div>
                <pre className="whitespace-pre-wrap font-mono text-xs text-stone-700 leading-relaxed max-h-[600px] overflow-auto">
                  {content}
                </pre>
              </div>
            ) : content ? (
              <div className="prose-content">
                <ReactMarkdown
                  components={{
                    h1: ({node, ...props}) => <h1 className="text-2xl font-bold text-stone-800 mt-6 mb-3" {...props} />,
                    h2: ({node, ...props}) => <h2 className="text-xl font-bold text-stone-800 mt-5 mb-2.5 pb-2 border-b border-stone-100" {...props} />,
                    h3: ({node, ...props}) => <h3 className="text-lg font-semibold text-stone-800 mt-4 mb-2" {...props} />,
                    h4: ({node, ...props}) => <h4 className="text-base font-semibold text-stone-700 mt-3 mb-1.5" {...props} />,
                    p: ({node, ...props}) => <p className="mb-3 text-sm text-stone-600 leading-relaxed" {...props} />,
                    ul: ({node, ...props}) => <ul className="mb-3 ml-4 space-y-1" {...props} />,
                    ol: ({node, ...props}) => <ol className="mb-3 ml-4 space-y-1 list-decimal" {...props} />,
                    li: ({node, ...props}) => <li className="text-sm text-stone-600 leading-relaxed list-disc" {...props} />,
                    strong: ({node, ...props}) => <strong className="font-semibold text-stone-800" {...props} />,
                    code: ({node, ...props}) => <code className="bg-stone-100 px-1.5 py-0.5 rounded text-xs font-mono text-stone-700" {...props} />,
                    blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-stone-200 pl-4 italic text-stone-500 my-3" {...props} />,
                    hr: ({node, ...props}) => <hr className="my-6 border-stone-200" {...props} />,
                  }}
                >
                  {content}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="text-stone-400 text-sm py-8 text-center">No content available</p>
            )}
          </div>
        </div>

        {/* Version History */}
        <div>
          <div className="bg-white rounded-xl border border-stone-200 p-5 sticky top-6">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-stone-100">
              <History className="w-4.5 h-4.5 text-stone-400" />
              <h2 className="font-semibold text-stone-700">Version History</h2>
            </div>
            <div className="space-y-3">
              {/* Current version */}
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                    <GitBranch className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                  {versions.length > 0 && <div className="w-px flex-1 bg-stone-200 my-1" />}
                </div>
                <div className="pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-stone-800">v{spec.version}</span>
                    <StatusBadge status={spec.status} />
                  </div>
                  <p className="text-xs text-stone-400 mt-0.5">Current version</p>
                </div>
              </div>
              {/* Past versions */}
              {versions.map(v => (
                <div key={v.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center shrink-0">
                      <History className="w-3.5 h-3.5 text-stone-400" />
                    </div>
                  </div>
                  <div className="pb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-stone-700">v{v.version}</span>
                      <StatusBadge status={v.status} />
                    </div>
                    <p className="text-xs text-stone-400 mt-0.5">{v.change_note || 'Previous version'}</p>
                    <p className="text-xs text-stone-300 mt-0.5">
                      {new Date(v.created_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              ))}
              {versions.length === 0 && (
                <p className="text-xs text-stone-400 italic">No previous versions</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}