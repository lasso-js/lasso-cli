RaptorJS Optimizer CLI
========================================

This utility provides support for running the [RaptorJS Optimizer](https://github.com/raptorjs/optimizer) from the command-line.

# Installation

```bash
npm install optimizer-cli --global
```

# Usage

A simple usage that writes out a JavaScript bundle and a CSS bundle to the `static/` directory that includes all of the required dependencies is shown below:

```bash
optimizer foo.js style.less --main main.js --name my-page
```

With additional options:
```bash
optimizer jquery.js style.less \
    --main main.js \                         # Entry JavaScript module for the browser
    --name my-page \                         # Give the page bundle files a name
    --out static                             # Output directory
    --url-prefix http://mycdn/static/ \      # URL prefix
    --fingerprint \                             # Include fingerprints
    --html \                                 # Head and body HTML
    --minify \                               # Minify JavaScript and CSS
    --inject-into index.html \               # Inject HTML markup into a static HTML file
    --plugin my-plugin \                     # Enable a custom plugin
    --transform my-transform                 # Enable a custom output transform
```

Alternatively, you can create a JSON configuration file and use that instead:

```bash
optimizer --config optimizer-config.json
```

For additional help from the command line, you can run the following command:

```bash
optimizer --help
```
