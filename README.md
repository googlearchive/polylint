# Polylint
Catch errors in your polymer project before even running your code.

## Installation

polylint is available via [npm](https://www.npmjs.com/). Just run `npm install -g polylint` from a terminal and you're ready to go.

### Installing the Atom Package

Polylint provides a package for the Atom editor for in-line code linting. To install:

1. Install the [linter](https://atom.io/packages/linter) package with `apm install linter` or through Atom's [package installer interface](https://atom.io/docs/latest/using-atom-atom-packages)
2. Install the [polymer-atom](https://github.com/PolymerLabs/polymer-atom) package through `apm install polymer-atom` or through Atom's package installer.
3. Lint!

### Installing the Sublime Plugin

There is currently a Sublime plugin that leverages Polylint available at [https://github.com/nomego/SublimeLinter-contrib-polylint](https://github.com/nomego/SublimeLinter-contrib-polylint)

## Usage
If you want to lint a project in `my-project-dir` with two endpoints, `index.html` and `cart.html`, you could run:
```
polylint --root my-project-dir/ --input index.html cart.html
```

For complete usage instructions, run:
```
polylint --help
```

## Contributing

Polymer :heart: contributions! Please see the [Contributing Guide](https://github.com/Polymer/project/blob/master/Contributing.md) for general Polymer project contribution guidelines.
