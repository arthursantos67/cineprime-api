"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { setApiLocale } from "@/api/client";

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  SUPPORTED_LOCALES,
  type Locale,
  resolveLocale,
} from "./locales";
import { messages } from "./messages";

type TranslationParams = Record<string, string | number>;

type I18nContextValue = {
  formatCurrency: (value: number) => string;
  formatDate: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  supportedLocales: readonly Locale[];
  t: (key: string, params?: TranslationParams) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const DATE_COMPONENT_OPTION_KEYS = [
  "weekday",
  "era",
  "year",
  "month",
  "day",
  "hour",
  "minute",
  "second",
  "fractionalSecondDigits",
  "dayPeriod",
  "timeZoneName",
] as const satisfies readonly (keyof Intl.DateTimeFormatOptions)[];

// Intl.DateTimeFormat throws when dateStyle/timeStyle are combined with
// component options (year, month, day, ...), so drop the style defaults
// whenever the caller provides component options.
function mergeDateTimeOptions(
  defaults: Intl.DateTimeFormatOptions,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormatOptions {
  const hasComponentOptions = DATE_COMPONENT_OPTION_KEYS.some(
    (key) => options[key] !== undefined
  );
  if (!hasComponentOptions) {
    return { ...defaults, ...options };
  }

  const { dateStyle: _dateStyle, timeStyle: _timeStyle, ...rest } = defaults;
  return { ...rest, ...options };
}

export function I18nProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: ReactNode;
  initialLocale?: string;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(() => resolveLocale(initialLocale));

  useEffect(() => {
    setApiLocale(locale);
    document.documentElement.lang = locale;
    window.localStorage.setItem(LOCALE_COOKIE_NAME, locale);
    const securePart = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(locale)}; path=/; max-age=31536000; SameSite=Lax${securePart}`;
  }, [locale]);

  const setLocale = useCallback(
    (nextLocale: Locale) => {
      setLocaleState(nextLocale);
      setApiLocale(nextLocale);
      const securePart = location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(nextLocale)}; path=/; max-age=31536000; SameSite=Lax${securePart}`;
      router.refresh();
    },
    [router]
  );

  const t = useCallback(
    (key: string, params: TranslationParams = {}) => {
      const template = messages[locale][key] ?? messages[DEFAULT_LOCALE][key] ?? key;
      return template.replace(/\{(\w+)\}/g, (_, name: string) =>
        String(params[name] ?? `{${name}}`)
      );
    },
    [locale]
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      formatCurrency(valueToFormat) {
        return new Intl.NumberFormat(locale, {
          currency: "BRL",
          style: "currency",
        }).format(valueToFormat);
      },
      formatDate(valueToFormat, options = {}) {
        return new Intl.DateTimeFormat(
          locale,
          mergeDateTimeOptions(
            { dateStyle: "short", timeZone: "America/Fortaleza" },
            options
          )
        ).format(new Date(valueToFormat));
      },
      formatDateTime(valueToFormat, options = {}) {
        return new Intl.DateTimeFormat(
          locale,
          mergeDateTimeOptions(
            {
              dateStyle: "short",
              timeStyle: "short",
              timeZone: "America/Fortaleza",
            },
            options
          )
        ).format(new Date(valueToFormat));
      },
      formatNumber(valueToFormat, options = {}) {
        return new Intl.NumberFormat(locale, options).format(valueToFormat);
      },
      locale,
      setLocale,
      supportedLocales: SUPPORTED_LOCALES,
      t,
    }),
    [locale, setLocale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    return createFallbackI18nContext();
  }

  return context;
}

function createFallbackI18nContext(): I18nContextValue {
  return {
    formatCurrency(value) {
      return new Intl.NumberFormat(DEFAULT_LOCALE, {
        currency: "BRL",
        style: "currency",
      }).format(value);
    },
    formatDate(value, options = {}) {
      return new Intl.DateTimeFormat(
        DEFAULT_LOCALE,
        mergeDateTimeOptions(
          { dateStyle: "short", timeZone: "America/Fortaleza" },
          options
        )
      ).format(new Date(value));
    },
    formatDateTime(value, options = {}) {
      return new Intl.DateTimeFormat(
        DEFAULT_LOCALE,
        mergeDateTimeOptions(
          {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: "America/Fortaleza",
          },
          options
        )
      ).format(new Date(value));
    },
    formatNumber(value, options = {}) {
      return new Intl.NumberFormat(DEFAULT_LOCALE, options).format(value);
    },
    locale: DEFAULT_LOCALE,
    setLocale() {},
    supportedLocales: SUPPORTED_LOCALES,
    t(key, params = {}) {
      const template = messages[DEFAULT_LOCALE][key] ?? key;
      return template.replace(/\{(\w+)\}/g, (_, name: string) =>
        String(params[name] ?? `{${name}}`)
      );
    },
  };
}
