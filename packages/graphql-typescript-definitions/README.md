# `graphql-typescript-definitions`

[![Build Status](https://github.com/Shopify/quilt/workflows/Node-CI/badge.svg?branch=main)](https://github.com/Shopify/quilt/actions?query=workflow%3ANode-CI)
[![Build Status](https://github.com/Shopify/quilt/workflows/Ruby-CI/badge.svg?branch=main)](https://github.com/Shopify/quilt/actions?query=workflow%3ARuby-CI)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE.md) [![npm version](https://badge.fury.io/js/graphql-typescript-definitions.svg)](https://badge.fury.io/js/graphql-typescript-definitions.svg) {{#if usedInBrowser}} [![npm bundle size (minified + gzip)](https://img.shields.io/bundlephobia/minzip/graphql-typescript-definitions.svg)](https://img.shields.io/bundlephobia/minzip/graphql-typescript-definitions.svg) {{/if}}

Generate TypeScript definition files from .graphql documents.

## Installation

```bash
$ yarn add graphql-typescript-definitions
```

## Usage

This package will generate matching `.d.ts` files for each `.graphql` file you specify. It will generate types in the following format:

- A default export for the type that will be generated by a GraphQL loader (GraphQL’s `DocumentNode` type, but augmented as `graphql-typed`’s `DocumentNode` which includes additional type details about the operation).

- An interface for each query, mutation, and fragment, named `<OpertionName><Query | Mutation | Fragment>Data`. For example, `query Home {}` becomes `export interface HomeQueryData {}`.

- A namespace for each operation that includes any nested types. Nested types are named in pascal case using their keypath from the root of the operation. For example, if we imagine the following GraphQL schema (using the [GraphQL IDL](https://www.graph.cool/docs/faq/graphql-idl-schema-definition-language-kr84dktnp0/)):

  ```graphql
  type Person {
    name: String!
    relatives: [Person!]!
  }

  type Query {
    person: Person
  }
  ```

  and the following query:

  ```graphql
  query Someone {
    person {
      name
      relatives {
        name
      }
    }
  }
  ```

  The following exports would be generated:

  ```typescript
  export interface SomeoneQueryData {
    person?: SomeoneQueryData.Person | null;
  }

  export namespace SomeoneQueryData {
    export interface Person {
      name: string;
      relatives: SomeoneQueryData.PersonRelatives[];
    }

    export interface PersonRelatives {
      name: string;
    }
  }
  ```

  This allows you to use the full query’s type, as well as any of the subtypes that make up that query type. This is particularly useful for list or nullable types, where you can directly the access the underlying type without any additional help from TypeScript:

  ```typescript
  import someoneQueryDocument, {SomeoneQueryData} from './Someone.graphql';

  let data: SomeoneQueryData;
  let person: SomeoneQueryData.Person;
  ```

### Operation

On startup this tool performs the following actions:

- Loads all schemas
- Extracts all enums, input objects, and custom scalars as schema types
- Writes the schema types to `types.ts` (or `${projectName}-types.ts` for named projects)
  - Written in directory provided by `--schema-types-path` argument
  - Override `--schema-types-path` per project with the `schemaTypesPath` extension

### Configuration

This tool reads schema information from a [`.graphqlconfig`](https://github.com/Shopify/graphql-tools-web/tree/main/packages/graphql-tool-utilities#configuration) file in the project root.

#### Examples

A project configuration with a `schemaTypesPath` override

```json
{
  "schemaPath": "build/schema.json",
  "includes": ["app/**/*.graphql"],
  "extensions": {
    "schemaTypesPath": "app/bar/types/graphql"
  }
}
```

### Type Generation

#### Nullability

As demonstrated in the root `person` field in the example above, nullable fields are represented as optional types, in a union with `null`. Nullable items in list fields (i.e., `[Person]!`) are represented as a union type with `null`.

#### Interfaces and Unions

Interface an union fields are represented as union types in cases where there are spreads that could result in different fields on different concrete types. The type names for these cases are named the same as the default naming (pascal case version of the keypath for the field), but with the type condition appended to the end. All cases not covered by fragments are extracted into a type with a postpended `Other` name.

```graphql
# Schema
interface Named {
  name: String!
}

type Person implements Named {
  name: String!
  occupation: String
}

type Dog implements Named {
  name: String!
  legs: Int!
}

type Cat implements Named {
  name: String!
  livesLeft: Int!
}

type Horse implements Named {
  name: String!
  topSpeed: Float!
}

type Query {
  named: Named
}
```

```graphql
# Query
query SomeNamed {
  named {
    name
    ... on Person {
      occupation
    }
    ... on Dog {
      legs
    }
  }
}
```

```typescript
// generated types
export interface SomeNamedData {
  named?:
    | SomeNamedData.NamedPerson
    | SomeNamedData.NamedDog
    | SomeNamedData.NamedOther
    | null;
}

export namespace SomeNamedData {
  export interface NamedPerson {
    __typename: 'Person';
    name: string;
    occupation?: string | null;
  }
  export interface NamedDog {
    __typename: 'Dog';
    name: string;
    legs: number;
  }
  export interface NamedOther {
    __typename: 'Cat' | 'Horse';
    name: string;
  }
}
```

Note that the above example assumes that you specify the `--add-typename` argument. These types are only useful when a typename is included either explicitly or with this argument, as otherwise there is no simple way for TypeScript to disambiguate the union type.

#### Schema Types

Input types (enums, input objects, and custom scalars) are generated once, in a central location, and imported within each typing file. You can use these definitions to reference the schema types in other application code as well; in particular, GraphQL enums are turned into corresponding TypeScript `enum`s. The schema types directory is specified using the `--schema-types-path` argument (detailed below), and the format for the generated enums can be specified using the `--enum-format` option.

### CLI

```sh
graphql-typescript-definitions --schema-types-path app/types
```

As noted above, the configuration of your schema and GraphQL documents is done via a `.graphqlconfig` file, as this allows configuration to shared between tools. The CLI does support a few additional options, though:

- `--schema-types-path`: specifies a directory to write schema types (**REQUIRED**)
- `--watch`: watches the include globbing patterns for changes and re-processes files (default = `false`)
- `--cwd`: run tool for `.graphqlconfig` located in this directory (default = `process.cwd()`)
- `--add-typename`: adds a `__typename` field to every object type (default = `true`)
- `--export-format`: species the shape of values exported from `.graphql` files (default = `document`)
  - Options: `document` (exports a `graphql-typed` `DocumentNode`), `simple` (exports a `graphql-typed` `SimpleDocument`)
- `--enum-format`: specifies output format for enum types (default = `undefined`)
  - Options: `camel-case`, `pascal-case`, `snake-case`, `screaming-snake-case`
  - `undefined` results in using the unchanged name from the schema (verbatim)
- `--custom-scalars`: specifies custom types to use in place of scalar types in your GraphQL schema. See below for details.

#### Examples

```sh
# run tool for .graphqlconfig in current directory, produces ./app/graphql/types
graphql-typescript-definitions --schema-types-path app/graphql/types

# run watcher for .graphqlconfig in current directory, produces ./app/graphql/types
graphql-typescript-definitions --schema-types-path app/graphql/types --watch

# run tool for .graphqlconfig in a child directory, produces ./src/app/graphql/types
graphql-typescript-definitions --cwd src --schema-types-path app/graphql/types
```

#### `--custom-scalars`

By default, all custom scalars are exported as an alias for `string`. You can export a different type for these scalars by passing in a `--custom-scalars` option. This option is a JSON-serialized object that specifies what custom type to import from a package and re-export as the type for that scalar. For example, assuming the following schema:

```graphql
scalar HtmlString
```

You may want a custom TypeScript type for any field of this GraphQL type (for example, to restrict functions to use only this type, and not any arbitrary string). Assuming you have an installed npm package by the name of `my-custom-type-package`, and this package exports a named `SafeString` type, you could pass the following `--custom-scalars` option:

```sh
yarn run graphql-typescript-definitions --schema-path 'build/schema.json' --schema-types-path 'src/schema' --custom-scalars '{"HtmlString": {"name": "SafeString", package: "my-custom-type-package"}}'
```

With this configuration, your custom scalar would be exported roughly as follows:

```ts
import {SafeString} from 'my-custom-type-package';
export type HtmlString = SafeString;
```

You can also use built-in types by simply leaving off the `package` property:

```sh
yarn run graphql-typescript-definitions --schema-path 'build/schema.json' --schema-types-path 'src/schema' --custom-scalars '{"Seconds": {"name": "number"}}'
```

This will produce a simple type alias:

```ts
export type Seconds = number;
```

### Node

```js
const {Builder} = require('graphql-typescript-definitions');

const builder = new Builder({
  schemaTypesPath: 'app/graphql/types',
});

builder.on('build', build => {
  // See the source file for details on the shape of the object returned here
  console.log(build);
});

builder.on('error', error => {
  console.error(error);
});

// Optionally, you can pass {watch: true} here to re-run on changes
builder.run();
```

As with the CLI, you can pass options to customize the build and behavior:

- `watch`
- `enumFormat` (use the exported `EnumFormat` enum)
- `graphQLFiles`
- `schemaPath`
- `schemaTypesPath`
- `customScalars`
- `config` (custom `GraphQLConfig` instance)