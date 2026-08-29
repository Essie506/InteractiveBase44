import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
// Add page imports here
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/AppLayout';
import Landing from '@/pages/Landing';
import Onboarding from '@/pages/Onboarding';
import Dashboard from '@/pages/Dashboard';
import ProfilePage from '@/pages/ProfilePage';
import SettingsPage from '@/pages/SettingsPage';
import ProfessionalActivation from '@/pages/ProfessionalActivation';
import BusinessCreation from '@/pages/BusinessCreation';
import BusinessWorkspace from '@/pages/BusinessWorkspace';
import BusinessStaff from '@/pages/BusinessStaff';
import BusinessProfilePage from '@/pages/BusinessProfilePage';
import ProfessionalProfilePage from '@/pages/ProfessionalProfilePage';
import InvitationsPage from '@/pages/InvitationsPage';
import VerificationPage from '@/pages/VerificationPage';
import VerificationReview from '@/pages/VerificationReview';
import Notifications from '@/pages/Notifications';
import CalendarPage from '@/pages/CalendarPage';
import AvailabilityPage from '@/pages/AvailabilityPage';
import Messages from '@/pages/Messages';
import ConversationPage from '@/pages/ConversationPage';
import Specifications from '@/pages/Specifications';
import SpecificationDetail from '@/pages/SpecificationDetail';
import UploadPage from '@/pages/Upload';
import SearchPage from '@/pages/Search';
import PublicProfile from '@/pages/PublicProfile';
import PublicPersonalProfile from '@/pages/PublicPersonalProfile';
import PublicBusinessProfile from '@/pages/PublicBusinessProfile';
import BookingPage from '@/pages/BookingPage';
import ProfessionalWorkspace from '@/pages/professional/ProfessionalWorkspace';
import ProfessionalOverview from '@/pages/professional/ProfessionalOverview';
import ProfessionalBookings from '@/pages/professional/ProfessionalBookings';
import ProfessionalServices from '@/pages/professional/ProfessionalServices';
import BusinessWorkspaceShell from '@/pages/business/BusinessWorkspaceShell';
import BusinessOverview from '@/pages/business/BusinessOverview';
import BusinessBookings from '@/pages/business/BusinessBookings';
import BusinessServicesFacilities from '@/pages/business/BusinessServicesFacilities';
import BusinessAvailability from '@/pages/business/BusinessAvailability';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      {/* Add your page Route elements here */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/p/:screenName" element={<PublicProfile />} />
      <Route path="/u/:screenName" element={<PublicPersonalProfile />} />
      <Route path="/b/:businessId" element={<PublicBusinessProfile />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/activate-professional" element={<ProfessionalActivation />} />
        <Route path="/create-business" element={<BusinessCreation />} />
        <Route path="/admin/verify" element={<VerificationReview />} />
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/invitations" element={<InvitationsPage />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/availability" element={<AvailabilityPage />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/messages/:conversationId" element={<ConversationPage />} />
          <Route path="/professional-profile" element={<ProfessionalProfilePage />} />
          <Route path="/verify-professional" element={<VerificationPage />} />
          <Route path="/business/:id" element={<BusinessWorkspace />} />
          <Route path="/business/:id/verify" element={<VerificationPage />} />
          <Route path="/business/:id/staff" element={<BusinessStaff />} />
          <Route path="/business/:id/profile" element={<BusinessProfilePage />} />
          {/* Professional Workspace — sidebar + pages */}
          <Route path="/professional" element={<ProfessionalWorkspace />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<ProfessionalOverview />} />
            <Route path="bookings" element={<ProfessionalBookings />} />
            <Route path="services" element={<ProfessionalServices />} />
            <Route path="availability" element={<AvailabilityPage />} />
            <Route path="verification" element={<VerificationPage />} />
          </Route>
          {/* Business Workspace — sidebar + pages */}
          <Route path="/business/:id/workspace" element={<BusinessWorkspaceShell />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<BusinessOverview />} />
            <Route path="bookings" element={<BusinessBookings />} />
            <Route path="services" element={<BusinessServicesFacilities />} />
            <Route path="availability" element={<BusinessAvailability />} />
            <Route path="verification" element={<VerificationPage />} />
            <Route path="staff" element={<BusinessStaff />} />
          </Route>
          <Route path="/specifications" element={<Specifications />} />
          <Route path="/specifications/:id" element={<SpecificationDetail />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/book/:screenName" element={<BookingPage />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App