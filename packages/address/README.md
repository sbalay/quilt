# `@shopify/address`

[![Build Status](https://github.com/Shopify/quilt/workflows/Node-CI/badge.svg?branch=main)](https://github.com/Shopify/quilt/actions?query=workflow%3ANode-CI)
[![Build Status](https://github.com/Shopify/quilt/workflows/Ruby-CI/badge.svg?branch=main)](https://github.com/Shopify/quilt/actions?query=workflow%3ARuby-CI)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE.md) [![npm version](https://badge.fury.io/js/%40shopify%2Faddress.svg)](https://badge.fury.io/js/%40shopify%2Faddress)
![npm bundle size (minified + gzip)](https://img.shields.io/bundlephobia/minzip/%40shopify%2Faddress.svg)

Address utilities for formatting addresses.

## Installation

```bash
$ yarn add @shopify/address
```

## API Reference

- `country` field in Address is expected to be of format ISO 3166-1 alpha-2, eg. CA / FR / JP

#### `constructor(private locale: string)`

Instantiate the AddressFormatter by passing it a locale.

#### `updateLocale(locale: string)`

Update the current locale of the formatter. Following requests will be in the given locale.

#### `async .getCountry(countryCode: string): Promise<Country>`

Loads and returns data about a given country in the current locale. Country and province names are localized. Province names are sorted based on the locale.

#### `async .getCountries(): Promise<Country[]>`

Loads and returns data for all countries in the current locale. Countries are sorted based on the locale. Zones are also ordered based on the locale.

#### `async .getOrderedFields(countryCode): FieldName[][]`

Returns how to order address fields.

Eg.:

```typescript
[
  ['firstName', 'lastName'],
  ['company'],
  ['address1'],
  ['address2'],
  ['city'],
  ['country', 'province', 'zip'],
  ['phone'],
];
```

#### `async .format(address: Address): string[]`

Given an address, returns the address ordered for multiline rendering. e.g.:

```typescript
['Shopify', 'Lindenstraße 9-14', '10969 Berlin', 'Germany'];
```

#### Example Usage

Show an address:

```typescript
import AddressFormatter from '@shopify/address';

const address = {
  company: 'Shopify',
  firstName: '恵子',
  lastName: '田中',
  address1: '八重洲1-5-3',
  address2: '',
  city: '目黒区',
  province: 'JP-13',
  zip: '100-8994',
  country: 'JP',
  phone: '',
};

const addressFormatter = new AddressFormatter('ja');
await addressFormatter.format(address);
/* =>
  日本
  〒100-8994東京都目黒区八重洲1-5-3
  Shopify
  田中恵子様
 */

await addressFormatter.getOrderedFields('CA');
/* =>
  [
    ['firstName', 'lastName'],
    ['company'],
    ['address1'],
    ['address2'],
    ['city'],
    ['country', 'province', 'zip'],
    ['phone']
  ]
 */
```

## Testing

If your component uses this package and you want to test it with mock API calls you can use the following:

```
import {fetch} from '@shopify/jest-dom-mocks';
import {mockCountryRequests} from '@shopify/address/tests';

beforeEach(mockCountryRequests);
afterEach(fetch.restore);
```

Note: Only FR / JA and EN are mocked.
