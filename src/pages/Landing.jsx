import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { ArrowRight, Users, Shield, Layers } from 'lucide-react';

export default function Landing() {
  const { isAuthenticated, isLoadingAuth, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated && !isLoadingAuth) {
      if (user?.onboarding_status !== 'completed') {
        navigate('/onboarding');
      } else {
        navigate('/dashboard');
      }
    }
  }, [isAuthenticated, isLoadingAuth, user]);

  if (isLoadingAuth || isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-stone-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <nav className="flex items-center justify-between px-6 md:px-10 py-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold">I</span>
          </div>
          <span className="text-xl font-semibold tracking-tight text-stone-800">Interactive</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm font-medium text-stone-600 hover:text-stone-900">Log in</Link>
          <Link to="/register" className="text-sm font-medium px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">Get started</Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 md:px-10 pt-16 md:pt-24 pb-20 text-center">
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-stone-900 mb-6">
          One identity.<br />Every experience.
        </h1>
        <p className="text-lg text-stone-500 mb-8 max-w-2xl mx-auto">
          Interactive connects personal, professional and business experiences through a single authenticated identity. No separate accounts. No fragmented data.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/register" className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors">
            Create your identity <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/login" className="inline-flex items-center gap-2 px-6 py-3 text-stone-700 hover:bg-stone-100 rounded-xl font-medium transition-colors">
            Log in
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 md:px-10 pb-24">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: Users, title: 'One Identity', desc: 'A single authenticated identity powers personal, professional and business experiences.' },
            { icon: Shield, title: 'Privacy First', desc: 'Granular privacy controls keep your data protected across every context.' },
            { icon: Layers, title: 'Context Aware', desc: 'Switch between personal, professional and business contexts without re-authentication.' },
          ].map(f => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="bg-stone-50 rounded-2xl p-6">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-indigo-600" />
                </div>
                <h3 className="font-semibold text-stone-800 mb-1.5">{f.title}</h3>
                <p className="text-sm text-stone-500">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}