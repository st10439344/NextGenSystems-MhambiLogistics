
(() => {
  'use strict';

  const DEFAULT_API = 'http://localhost:3000/api/v1/';
  const BASE_KEY = 'mhambi_api_base';
  const PATH_KEY = 'mhambi_api_routes';

  // Backend API routes
  const PATHS = {
    health: 'health',
    login: 'auth/login',
    register: 'auth/register',
    track: 'track/{reference}',
    quote: 'quotations',
    contact: 'support',
    googleConfig: 'auth/google/config',
    googleLink: 'auth/google/link'
  };

  function base() {
    return (
      localStorage.getItem(BASE_KEY) || DEFAULT_API
    ).trim().replace(/\/+$/, '') + '/';
  }

  function route(key) {
    let settings = {};

    try {
      settings = JSON.parse(
        localStorage.getItem(PATH_KEY) || '{}'
      );
    } catch {}

    return settings[key] || PATHS[key];
  }

  function result(el, msg, good = false) {
    if (!el) return;

    el.textContent = msg;
    el.classList.remove('error', 'success');
    el.classList.add(good ? 'success' : 'error');
  }

  async function request(
    key,
    { method = 'GET', body, reference, token } = {}
  ) {
    const selectedRoute = route(key);

    if (!selectedRoute) {
      throw new Error(`Unknown API route: ${key}`);
    }

    const path = selectedRoute.replace(
      '{reference}',
      encodeURIComponent(reference || '')
    );

    const url = new URL(
      path.replace(/^\/+/, ''),
      base()
    );

    const opts = {
      method,
      headers: {
        Accept: 'application/json'
      }
    };

    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }

    if (token) {
      opts.headers.Authorization = `Bearer ${token}`;
    }

    let res;

    try {
      res = await fetch(url, opts);
    } catch {
      throw new Error(
        'Could not reach the API. Check the server address, backend status and CORS settings.'
      );
    }

    const content = await res.text();
    let data;

    try {
      data = content ? JSON.parse(content) : {};
    } catch {
      data = {
        message: content.slice(0, 170)
      };
    }

    if (!res.ok) {
      throw new Error(
        typeof data?.message === 'string'
          ? data.message
          : typeof data?.error?.message === 'string'
            ? data.error.message
            : typeof data?.error === 'string'
              ? data.error
              : `Request failed (HTTP ${res.status}). Check the API route and server logs.`
      );
    }

    return data;
  }

  function findToken(o) {
    return (
      o?.accessToken ||
      o?.access_token ||
      o?.token ||
      o?.tokens?.accessToken ||
      o?.data?.accessToken ||
      o?.data?.token ||
      o?.data?.tokens?.accessToken
    );
  }

  function findUser(o) {
    return (
      o?.user ||
      o?.data?.user ||
      o?.account ||
      o?.data?.account ||
      o?.profile ||
      o?.data?.profile
    );
  }

  function normalizeRole(role) {
    const r = String(role || '')
      .toLowerCase()
      .replace(/[^a-z]/g, '');

    const map = {
      administrator: 'admin',
      admin: 'admin',
      client: 'client',
      customer: 'client',
      dispatcher: 'dispatcher',
      driver: 'driver',
      warehouse: 'warehouse',
      warehousemanager: 'warehouse',
      fleet: 'fleet',
      fleetmanager: 'fleet',
      finance: 'finance',
      financeofficer: 'finance',
      procurement: 'procurement',
      procurementofficer: 'procurement'
    };

    return map[r] || '';
  }

  const safeUser = u => ({
    id: u.id || '',
    name:
      u.fullName ||
      u.name ||
      u.firstName ||
      u.email ||
      'Account',
    email: u.email || '',
    role: normalizeRole(
      u.role || u.userRole || u.accountRole
    )
  });

  // Make existing API functions available to the website.
  window.MhambiAPI = {
    request,
    base,
    route,
    findToken,
    findUser,
    normalizeRole
  };

  // Load Google's official Identity Services library.
  function loadGoogleIdentityServices() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }

      const script = document.createElement('script');

      script.src =
        'https://accounts.google.com/gsi/client';

      script.async = true;
      script.defer = true;

      script.onload = () => {
        if (window.google?.accounts?.id) {
          resolve();
        } else {
          reject(
            new Error(
              'Google Sign-In could not initialize.'
            )
          );
        }
      };

      script.onerror = () => {
        reject(
          new Error(
            'Could not load Google Sign-In. Check your internet connection.'
          )
        );
      };

      document.head.appendChild(script);
    });
  }

  // Connect Google to an already authenticated account.
  async function setupGoogleLink() {
    const buttonContainer =
      document.getElementById('googleLinkButton');

    const status =
      document.getElementById('googleLinkStatus');

    // Only initialize on pages containing this section.
    if (!buttonContainer || !status) return;

    if (
      location.protocol !== 'http:' &&
      location.protocol !== 'https:'
    ) {
      result(
        status,
        'Open this website using Live Server, not as a file.'
      );
      return;
    }

    let session;

    try {
      session = JSON.parse(
        sessionStorage.getItem('mhambi_session') ||
        'null'
      );
    } catch {
      session = null;
    }

    if (!session?.token) {
      result(
        status,
        'Please sign in to your Mhambi Logistics account before connecting Google.'
      );
      return;
    }

    result(
      status,
      'Preparing secure Google account linking...',
      true
    );

    try {
      // Read the public Google Web Client ID from backend.
      const config = await request('googleConfig');

      if (!config.enabled || !config.clientId) {
        throw new Error(
          'Google Sign-In is not configured on the backend.'
        );
      }

      await loadGoogleIdentityServices();

      window.google.accounts.id.initialize({
        client_id: config.clientId,
        auto_select: false,

        callback: async response => {
          if (!response?.credential) {
            result(
              status,
              'Google did not return a sign-in credential.'
            );
            return;
          }

          buttonContainer.style.pointerEvents = 'none';

          result(
            status,
            'Connecting your Google account...',
            true
          );

          try {
            const savedSession = JSON.parse(
              sessionStorage.getItem(
                'mhambi_session'
              ) || 'null'
            );

            if (!savedSession?.token) {
              throw new Error(
                'Your Mhambi Logistics session has expired. Please sign in again.'
              );
            }

            // Authenticated endpoint: links Google to
            // the user's existing Mhambi account.
            await request('googleLink', {
              method: 'POST',
              token: savedSession.token,
              body: {
                idToken: response.credential
              }
            });

            result(
              status,
              'Google account connected successfully! You can now sign out and use Continue with Google in the Android app.',
              true
            );

            buttonContainer.style.display = 'none';

          } catch (err) {
            result(
              status,
              err.message ||
              'Could not connect your Google account.'
            );

            buttonContainer.style.pointerEvents = '';
          }
        }
      });

      window.google.accounts.id.renderButton(
        buttonContainer,
        {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill'
        }
      );

      result(
        status,
        'Select your Google account to connect it to your existing Mhambi Logistics account.',
        true
      );

    } catch (err) {
      result(
        status,
        err.message ||
        'Google account linking is currently unavailable.'
      );
    }
  }

  document.addEventListener('DOMContentLoaded', () => {

    // Existing backend address settings
    const apiField =
      document.getElementById('apiBase');

    if (apiField) {
      apiField.value = base();
    }

    document
      .getElementById('saveApi')
      ?.addEventListener('click', () => {
        try {
          const u = new URL(
            apiField.value.trim()
          );

          if (
            !['http:', 'https:'].includes(u.protocol)
          ) {
            throw Error('Invalid scheme');
          }

          localStorage.setItem(
            BASE_KEY,
            u.href
          );

          result(
            document.getElementById('apiStatus'),
            'Server address saved. This does not yet confirm connectivity.',
            true
          );

        } catch {
          result(
            document.getElementById('apiStatus'),
            'Please enter a valid http:// or https:// API address.'
          );
        }
      });

    // Existing email-and-password login
    const login =
      document.getElementById('loginForm');

    login?.addEventListener('submit', async e => {
      e.preventDefault();

      const email =
        document.getElementById('email')
          .value.trim();

      const password =
        document.getElementById('password')
          .value;

      const out =
        document.getElementById('authMessage');

      const button =
        login.querySelector(
          'button[type=submit]'
        );

      if (!email || !password) {
        result(
          out,
          'Enter your email and password.'
        );
        return;
      }

      button.disabled = true;
      button.textContent = 'Signing in…';

      try {
        const data = await request('login', {
          method: 'POST',
          body: { email, password }
        });

        const token = findToken(data);
        const u = findUser(data);

        if (!token || !u) {
          throw new Error(
            'The API replied, but the token or user profile was not in the expected format. Match this adapter to the backend login response.'
          );
        }

        const user = safeUser(u);

        if (!user.role) {
          throw new Error(
            'Account role not recognised. Check the backend role value.'
          );
        }

        sessionStorage.setItem(
          'mhambi_session',
          JSON.stringify({
            token,
            user,
            refreshToken:
              data.refreshToken || null
          })
        );

        result(
          out,
          'Signed in. Opening your dashboard…',
          true
        );

        window.location.href =
          `../portal/${user.role}/index.html`;

      } catch (err) {
        result(out, err.message);

      } finally {
        button.disabled = false;
        button.textContent =
          'Sign in to portal ↗';
      }
    });

    // Existing registration
    const reg =
      document.getElementById('registerForm');

    reg?.addEventListener('submit', async e => {
      e.preventDefault();

      const f = new FormData(reg);
      const out =
        document.getElementById(
          'registerResult'
        );

      if (
        f.get('password') !==
        f.get('confirmPassword')
      ) {
        result(
          out,
          'Passwords do not match.'
        );
        return;
      }

      const name =
        String(f.get('fullName')).trim();

      const companyName =
        String(f.get('companyName')).trim();

      const email =
        String(f.get('email')).trim();

      const password =
        String(f.get('password'));

      if (
        !name ||
        !companyName ||
        !email ||
        !String(
          f.get('phone') || ''
        ).trim() ||
        password.length < 8
      ) {
        result(
          out,
          'Complete all required fields, including phone, and use a strong password.'
        );
        return;
      }

      try {
        await request('register', {
          method: 'POST',
          body: {
            fullName: name,
            companyName,
            email,
            phone: String(
              f.get('phone') || ''
            ).trim(),
            password,
            confirmPassword:
              String(
                f.get('confirmPassword')
              )
          }
        });

        reg.reset();

        result(
          out,
          'Registration request accepted. You may now sign in, or follow the confirmation instructions from the backend.',
          true
        );

      } catch (err) {
        result(out, err.message);
      }
    });

    // Existing shipment tracking
    const tracking =
      document.getElementById(
        'trackingForm'
      );

    tracking?.addEventListener('submit', async e => {
      e.preventDefault();

      const reference =
        document.getElementById(
          'trackingNumber'
        ).value.trim();

      const out =
        document.getElementById(
          'trackingResult'
        );

      if (!reference) return;

      try {
        const data = await request(
          'track',
          { reference }
        );

        const item =
          data.shipment ||
          data.data?.shipment ||
          data.data ||
          data;

        const status =
          item.status ||
          item.currentStatus ||
          'Available';

        const location =
          item.currentLocation ||
          item.location ||
          '';

        const eta =
          item.eta ||
          item.estimatedDelivery ||
          '';

        result(
          out,
          `Reference: ${reference}\nStatus: ${status}${location ? '\nLocation: ' + location : ''}${eta ? '\nETA: ' + eta : ''}`,
          true
        );

      } catch (err) {
        result(out, err.message);
      }
    });

    // Existing general API forms
    document
      .querySelectorAll('[data-api-form]')
      .forEach(form => {
        form.addEventListener(
          'submit',
          async e => {
            e.preventDefault();

            const out =
              form.querySelector(
                '.form-result'
              );

            const body =
              Object.fromEntries(
                new FormData(form)
              );

            const action =
              form.dataset.apiForm;

            try {
              if (action === 'contact') {
                throw new Error(
                  'The backend does not expose a public contact endpoint yet. Please use the company contact details instead.'
                );
              }

              await request(action, {
                method: 'POST',
                body
              });

              result(
                out,
                'Your request was accepted by the API.',
                true
              );

              form.reset();

            } catch (err) {
              result(
                out,
                err.message
              );
            }
          }
        );
      });

    // NEW: Initialize Google account linking
    // only when the profile page contains the button.
    setupGoogleLink();
  });
})();
