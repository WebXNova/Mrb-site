import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';

let oauthClient = null;

function getOAuthClient() {
  if (!env.google.clientId) {
    throw new ApiError(503, 'Google Sign-In is not configured');
  }
  if (!oauthClient) {
    oauthClient = new OAuth2Client(env.google.clientId);
  }
  return oauthClient;
}

/**
 * Verify a Google Identity Services ID token (credential JWT).
 * @param {string} idToken
 * @returns {Promise<{ email: string, name: string, picture: string | null, sub: string }>}
 */
export async function verifyGoogleIdToken(idToken) {
  const token = String(idToken || '').trim();
  if (!token) {
    throw new ApiError(422, 'Google credential is required');
  }

  let ticket;
  try {
    ticket = await getOAuthClient().verifyIdToken({
      idToken: token,
      audience: env.google.clientId,
    });
  } catch {
    throw new ApiError(401, 'Invalid Google credential');
  }

  const payload = ticket.getPayload();
  if (!payload?.sub || !payload?.email) {
    throw new ApiError(401, 'Invalid Google credential');
  }

  if (payload.email_verified !== true) {
    throw new ApiError(401, 'Google email address is not verified');
  }

  const email = String(payload.email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(401, 'Invalid Google email');
  }

  const name = String(payload.name || email.split('@')[0] || 'Student')
    .trim()
    .slice(0, 120);
  const picture = payload.picture ? String(payload.picture).trim().slice(0, 512) : null;
  const sub = String(payload.sub).trim();

  return { email, name, picture, sub };
}
