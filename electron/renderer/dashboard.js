const SUPPORTED_LOCALES = ['en', 'ar'];
const state = {
  current: 'en',
  translations: {}
};

const deepGet = (obj, path) =>
  path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);

const loadTranslations = async (locale) => {
  if (state.translations[locale]) {
    return state.translations[locale];
  }

  const response = await fetch(`./i18n/${locale}.json`, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Unable to load locale ${locale}`);
  }
  const data = await response.json();
  state.translations[locale] = data;
  return data;
};

const applyLocale = (locale) => {
  const dict = state.translations[locale] || {};
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const value = deepGet(dict, key);
    if (typeof value === 'string') {
      el.textContent = value;
    }
  });

  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.lang === locale);
  });

  if (window.api && typeof window.api.changeLanguage === 'function') {
    window.api.changeLanguage(locale).catch(() => {});
  }
};

const setLanguage = async (locale) => {
  const nextLocale = SUPPORTED_LOCALES.includes(locale) ? locale : 'en';
  try {
    await loadTranslations(nextLocale);
    state.current = nextLocale;
    localStorage.setItem('shamal.locale', nextLocale);
    applyLocale(nextLocale);
  } catch (err) {
    console.error('Failed to apply locale', err);
    if (nextLocale !== 'en') {
      setLanguage('en');
    }
  }
};

const bindLangButtons = () => {
  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lang = btn.getAttribute('data-lang');
      if (lang) {
        setLanguage(lang);
      }
    });
  });
};

const bindCardNavigation = () => {
  const openTarget = (target) => {
    if (!target) return;
    const url = new URL(target, window.location.href);
    url.searchParams.set('lang', state.current);
    window.location.href = url.toString();
  };

  document.querySelectorAll('.tool-card').forEach((card) => {
    const target = card.getAttribute('data-target');
    card.addEventListener('click', () => openTarget(target));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openTarget(target);
      }
    });
  });
};

document.addEventListener('DOMContentLoaded', () => {
  bindLangButtons();
  bindCardNavigation();
  const stored = localStorage.getItem('shamal.locale') || 'en';
  setLanguage(stored);
});

