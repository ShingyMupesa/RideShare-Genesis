import { Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import GenesisAssistant from './components/GenesisAssistant.jsx';

import Welcome from './pages/Welcome.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Profile from './pages/Profile.jsx';
import FindJourney from './pages/FindJourney.jsx';
import OfferJourney from './pages/OfferJourney.jsx';
import MatchResults from './pages/MatchResults.jsx';
import JourneyDetails from './pages/JourneyDetails.jsx';
import Booking from './pages/Booking.jsx';
import MyJourneys from './pages/MyJourneys.jsx';
import BookingThread from './pages/BookingThread.jsx';
import SafetyCentre from './pages/SafetyCentre.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <div className="app-shell">
      <NavBar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route path="/find" element={<FindJourney />} />
          <Route path="/offer" element={<OfferJourney />} />
          <Route
            path="/matches/:journeyId"
            element={
              <ProtectedRoute>
                <MatchResults />
              </ProtectedRoute>
            }
          />
          <Route path="/journeys/:id" element={<JourneyDetails />} />
          <Route
            path="/bookings/:id"
            element={
              <ProtectedRoute>
                <Booking />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bookings/:id/messages"
            element={
              <ProtectedRoute>
                <BookingThread />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-journeys"
            element={
              <ProtectedRoute>
                <MyJourneys />
              </ProtectedRoute>
            }
          />
          <Route path="/safety" element={<SafetyCentre />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="footer-note">
        RideShare Genesis V1 — built human-centred, explained end-to-end. ·{' '}
        <a href="https://wa.me/447449494405?text=Hi%21%20I%20have%20feedback%20on%20RideShare%20Genesis." target="_blank" rel="noopener">
          💬 Send feedback on WhatsApp
        </a>
      </footer>
      <GenesisAssistant />
    </div>
  );
}
