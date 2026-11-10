import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { setReferral } from '../utils/attribution.js';

// /r/:code — personal invite links and QR posters. Stores the invite
// (first-touch) then sends the visitor to the right landing page.
const TARGETS = { matatu: '/matatu', taxi: '/taxi', ride: '/ride' };

export default function ReferralRedirect() {
  const { code } = useParams();
  const [params] = useSearchParams();
  setReferral(code);
  return <Navigate to={TARGETS[params.get('to')] || '/ride'} replace />;
}
