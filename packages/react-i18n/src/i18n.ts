import {
  getDateDiff,
  isLessThanOneHourAgo,
  isLessThanOneMinuteAgo,
  isLessThanOneWeekAgo,
  isLessThanOneYearAgo,
  isToday,
  isYesterday,
  TimeUnit,
  Weekdays,
} from '@shopify/javascript-utilities/dates';
import {memoize as memoizeFn} from '@shopify/function-enhancers';
import {memoize} from '@shopify/decorators';
import {languageFromLocale, regionFromLocale} from '@shopify/i18n';
import {
  I18nDetails,
  PrimitiveReplacementDictionary,
  ComplexReplacementDictionary,
  TranslationDictionary,
  LanguageDirection,
} from './types';
import {
  dateStyle,
  DateStyle,
  DEFAULT_WEEK_START_DAY,
  WEEK_START_DAYS,
  RTL_LANGUAGES,
  Weekday,
  currencyDecimalPlaces,
  DEFAULT_DECIMAL_PLACES,
  CUSTOM_NAME_FORMATTERS,
} from './constants';
import {
  MissingCurrencyCodeError,
  MissingCountryError,
  I18nError,
} from './errors';
import {
  getCurrencySymbol,
  translate,
  getTranslationTree,
  TranslateOptions as RootTranslateOptions,
} from './utilities';

export interface NumberFormatOptions extends Intl.NumberFormatOptions {
  as?: 'number' | 'currency' | 'percent';
  precision?: number;
}

export interface TranslateOptions {
  scope: RootTranslateOptions<any>['scope'];
}

// Used for currecies that don't use fractional units (eg. JPY)
const DECIMAL_NOT_SUPPORTED = 'N/A';
const PERIOD = '.';
const DECIMAL_VALUE_FOR_CURRENCIES_WITHOUT_DECIMALS = '00';

const memoizedDateTimeFormatter = memoizeFn(
  dateTimeFormatter,
  (locale: string, options: Intl.DateTimeFormatOptions = {}) =>
    `${locale}${JSON.stringify(options)}`,
);

const memoizedNumberFormatter = memoizeFn(
  numberFormatter,
  (locale: string, options: Intl.NumberFormatOptions = {}) =>
    `${locale}${JSON.stringify(options)}`,
);

export class I18n {
  readonly locale: string;
  readonly pseudolocalize: boolean | string;
  readonly defaultCountry?: string;
  readonly defaultCurrency?: string;
  readonly defaultTimezone?: string;
  readonly onError: NonNullable<I18nDetails['onError']>;
  readonly loading: boolean;

  get language() {
    return languageFromLocale(this.locale);
  }

  get region() {
    return regionFromLocale(this.locale);
  }

  /**
   * @deprecated Use I18n#region instead.
   */
  get countryCode() {
    return regionFromLocale(this.locale);
  }

  get languageDirection() {
    return RTL_LANGUAGES.includes(this.language)
      ? LanguageDirection.Rtl
      : LanguageDirection.Ltr;
  }

  get isRtlLanguage() {
    return this.languageDirection === LanguageDirection.Rtl;
  }

  get isLtrLanguage() {
    return this.languageDirection === LanguageDirection.Ltr;
  }

  constructor(
    public readonly translations: TranslationDictionary[],
    {
      locale,
      currency,
      timezone,
      country,
      pseudolocalize = false,
      onError,
      loading,
    }: I18nDetails & {loading?: boolean},
  ) {
    this.locale = locale;
    this.defaultCountry = country;
    this.defaultCurrency = currency;
    this.defaultTimezone = timezone;
    this.pseudolocalize = pseudolocalize;
    this.onError = onError || defaultOnError;
    this.loading = loading || false;
  }

  translate(
    id: string,
    options: TranslateOptions,
    replacements?: PrimitiveReplacementDictionary,
  ): string;

  translate(
    id: string,
    options: TranslateOptions,
    replacements?: ComplexReplacementDictionary,
  ): React.ReactElement<any>;

  translate(id: string, replacements?: PrimitiveReplacementDictionary): string;
  translate(
    id: string,
    replacements?: ComplexReplacementDictionary,
  ): React.ReactElement<any>;

  translate(
    id: string,
    optionsOrReplacements?:
      | TranslateOptions
      | PrimitiveReplacementDictionary
      | ComplexReplacementDictionary,
    replacements?:
      | PrimitiveReplacementDictionary
      | ComplexReplacementDictionary,
  ): any {
    const {pseudolocalize} = this;
    let normalizedOptions: RootTranslateOptions<
      PrimitiveReplacementDictionary | ComplexReplacementDictionary
    >;

    if (optionsOrReplacements == null) {
      normalizedOptions = {pseudotranslate: pseudolocalize};
    } else if (isTranslateOptions(optionsOrReplacements)) {
      normalizedOptions = {
        ...optionsOrReplacements,
        replacements,
        pseudotranslate: pseudolocalize,
      };
    } else {
      normalizedOptions = {
        replacements: optionsOrReplacements,
        pseudotranslate: pseudolocalize,
      };
    }

    try {
      return translate(id, normalizedOptions, this.translations, this.locale);
    } catch (error) {
      this.onError(error);
      return '';
    }
  }

  getTranslationTree(
    id: string,
    replacements?:
      | PrimitiveReplacementDictionary
      | ComplexReplacementDictionary,
  ): string | TranslationDictionary {
    try {
      if (!replacements) return getTranslationTree(id, this.translations);
      return getTranslationTree(id, this.translations, replacements);
    } catch (error) {
      this.onError(error);
      return '';
    }
  }

  translationKeyExists(id: string) {
    try {
      this.translate(id);
      return true;
    } catch (error) {
      return false;
    }
  }

  formatNumber(
    amount: number,
    {as, precision, ...options}: NumberFormatOptions = {},
  ) {
    const {locale, defaultCurrency: currency} = this;

    if (as === 'currency' && currency == null && options.currency == null) {
      this.onError(
        new MissingCurrencyCodeError(
          `formatNumber(amount, {as: 'currency'}) cannot be called without a currency code.`,
        ),
      );

      return '';
    }

    return memoizedNumberFormatter(locale, {
      style: as,
      maximumFractionDigits: precision,
      currency,
      ...options,
    }).format(amount);
  }

  unformatNumber(input: string): string {
    const decimalSymbol = this.numberDecimalSymbol();

    const normalizedValue = normalizedNumber(input, decimalSymbol);

    return normalizedValue === '' ? '' : parseFloat(normalizedValue).toString();
  }

  formatCurrency(amount: number, options: Intl.NumberFormatOptions = {}) {
    return this.formatNumber(amount, {as: 'currency', ...options});
  }

  unformatCurrency(input: string, currencyCode: string): string {
    // This decimal symbol will always be '.' regardless of the locale
    // since it's our internal representation of the string
    const decimalSymbol = this.currencyDecimalSymbol(currencyCode);
    const expectedDecimalSymbol =
      decimalSymbol === DECIMAL_NOT_SUPPORTED ? PERIOD : decimalSymbol;

    const normalizedValue = normalizedNumber(input, expectedDecimalSymbol);

    if (normalizedValue === '') {
      return '';
    }

    if (decimalSymbol === DECIMAL_NOT_SUPPORTED) {
      const roundedAmount = parseFloat(normalizedValue).toFixed(0);
      return `${roundedAmount}.${DECIMAL_VALUE_FOR_CURRENCIES_WITHOUT_DECIMALS}`;
    }

    const decimalPlaces =
      currencyDecimalPlaces.get(currencyCode.toUpperCase()) ||
      DEFAULT_DECIMAL_PLACES;
    return parseFloat(normalizedValue).toFixed(decimalPlaces);
  }

  formatPercentage(amount: number, options: Intl.NumberFormatOptions = {}) {
    return this.formatNumber(amount, {as: 'percent', ...options});
  }

  formatDate(
    date: Date,
    options: Intl.DateTimeFormatOptions & {style?: DateStyle} = {},
  ): string {
    const {locale, defaultTimezone} = this;
    const {timeZone = defaultTimezone} = options;

    // Etc/GMT+12 is not supported in most browsers and there is no equivalent fallback
    if (timeZone === 'Etc/GMT+12') {
      const adjustedDate = new Date(date.valueOf() - 12 * 60 * 60 * 1000);

      return this.formatDate(adjustedDate, {...options, timeZone: 'UTC'});
    }

    const {style = undefined, ...formatOptions} = options || {};

    if (style) {
      return style === DateStyle.Humanize
        ? this.humanizeDate(date, formatOptions)
        : this.formatDate(date, {...formatOptions, ...dateStyle[style]});
    }

    return memoizedDateTimeFormatter(locale, {
      timeZone,
      ...formatOptions,
    }).format(date);
  }

  weekStartDay(argCountry?: I18n['defaultCountry']): Weekday {
    const country = argCountry || this.defaultCountry;

    if (!country) {
      throw new MissingCountryError(
        'weekStartDay() cannot be called without a country code.',
      );
    }

    return WEEK_START_DAYS.get(country) || DEFAULT_WEEK_START_DAY;
  }

  getCurrencySymbol = (currencyCode?: string) => {
    const currency = currencyCode || this.defaultCurrency;
    if (currency == null) {
      throw new MissingCurrencyCodeError(
        'formatCurrency cannot be called without a currency code.',
      );
    }
    return this.getCurrencySymbolLocalized(this.locale, currency);
  };

  @memoize((currency: string, locale: string) => `${locale}${currency}`)
  getCurrencySymbolLocalized(locale: string, currency: string) {
    return getCurrencySymbol(locale, {currency});
  }

  formatName(firstName: string, lastName?: string, options?: {full?: boolean}) {
    if (!firstName) {
      return lastName || '';
    }
    if (!lastName) {
      return firstName;
    }

    const isFullName = Boolean(options && options.full);

    const customNameFormatter =
      CUSTOM_NAME_FORMATTERS.get(this.locale) ||
      CUSTOM_NAME_FORMATTERS.get(this.language);

    if (customNameFormatter) {
      return customNameFormatter(firstName, lastName, isFullName);
    }
    if (isFullName) {
      return `${firstName} ${lastName}`;
    }
    return firstName;
  }

  private humanizeDate(date: Date, options?: Intl.DateTimeFormatOptions) {
    if (isLessThanOneMinuteAgo(date)) {
      return this.translate('humanize.now');
    }

    if (isLessThanOneHourAgo(date)) {
      const minutes = getDateDiff(TimeUnit.Minute, date);
      return this.translate('humanize.minutes', {
        count: minutes,
      });
    }

    const time = this.formatDate(date, {
      ...options,
      style: DateStyle.Time,
    }).toLocaleLowerCase();

    if (isToday(date)) {
      return time;
    }

    if (isYesterday(date)) {
      return this.translate('humanize.yesterday', {time});
    }

    if (isLessThanOneWeekAgo(date)) {
      return this.translate('humanize.weekday', {
        day: Weekdays[date.getDay()],
        time,
      });
    }

    if (isLessThanOneYearAgo(date)) {
      const monthDay = this.formatDate(date, {
        ...options,
        month: 'short',
        day: 'numeric',
      });
      return this.translate('humanize.date', {
        date: monthDay,
        time,
      });
    }

    return this.formatDate(date, {
      ...options,
      style: DateStyle.Short,
    });
  }

  private currencyDecimalSymbol(currencyCode: string) {
    const digitOrSpace = /\s|\d/g;
    const {symbol} = this.getCurrencySymbolLocalized(this.locale, currencyCode);

    const templatedInput = 1;
    const decimal = this.formatCurrency(templatedInput, {
      currency: currencyCode,
    })
      .replace(symbol, '')
      .replace(digitOrSpace, '');

    return decimal.length === 0 ? DECIMAL_NOT_SUPPORTED : decimal;
  }

  private numberDecimalSymbol() {
    return this.formatNumber(1.1, {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    })[1];
  }
}

function normalizedNumber(input: string, expectedDecimal: string) {
  const nonDigits = /\D/g;

  // For locales that use non-period symbols as the decimal symbol, users may still input a period
  // and expect it to be treated as the decimal symbol for their locale.
  const hasExpectedDecimalSymbol = input.lastIndexOf(expectedDecimal) !== -1;
  const hasPeriodAsDecimal = input.lastIndexOf(PERIOD) !== -1;
  const usesPeriodDecimal = !hasExpectedDecimalSymbol && hasPeriodAsDecimal;
  const decimalSymbolToUse = usesPeriodDecimal ? PERIOD : expectedDecimal;
  const lastDecimalIndex = input.lastIndexOf(decimalSymbolToUse);

  const integerValue = input
    .substring(0, lastDecimalIndex)
    .replace(nonDigits, '');
  const decimalValue = input
    .substring(lastDecimalIndex + 1)
    .replace(nonDigits, '');

  const normalizedDecimal = lastDecimalIndex === -1 ? '' : PERIOD;
  const normalizedValue = `${integerValue}${normalizedDecimal}${decimalValue}`;

  return normalizedValue === '' || normalizedValue === PERIOD
    ? ''
    : normalizedValue;
}

function isTranslateOptions(
  object:
    | TranslateOptions
    | PrimitiveReplacementDictionary
    | ComplexReplacementDictionary,
): object is TranslateOptions {
  return 'scope' in object;
}

function defaultOnError(error: I18nError) {
  throw error;
}

function dateTimeFormatter(
  locale: string,
  options: Intl.DateTimeFormatOptions = {},
) {
  return new Intl.DateTimeFormat(locale, options);
}

function numberFormatter(
  locale: string,
  options: Intl.NumberFormatOptions = {},
) {
  return new Intl.NumberFormat(locale, options);
}