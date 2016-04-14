var lasso = require('lasso');
var fs = require('fs');
var nodePath = require('path');
var raptorPromises = require('raptor-promises');
var cwd = process.cwd();
var appModulePath = require('app-module-path');
var mkdirp = require('mkdirp');
var isObjectEmpty = require('raptor-util/isObjectEmpty');
var injector = require('./html-injector');
var jsonminify = require('jsonminify');

function relPath(path) {
    return nodePath.relative(cwd, path);
}

function getNameFromDependency(d) {
    var matches = /^(.+).lasso\.json$/.exec(nodePath.basename(d));

    if (matches) {
        return matches[1];
    }

    if (/lasso\.json$/.test(d)) {

        var parentDirName = nodePath.basename(nodePath.dirname(d));
        if (parentDirName !== '.') {
            return parentDirName;
        }
    } else if (nodePath.extname(d)) {
        // "myapp/jquery.js" --> "jquery"
        return nodePath.basename(d).slice(0, 0-nodePath.extname(d).length);
    }
}

function run(argv) {
    var parser = require('raptor-args').createParser({
            '--name -n': {type: 'string', description: 'The name of the page being lassoed (e.g. "my-page")'},
            '--output-dir --out -o': {type: 'string', description: 'The output directory for static bundles and lassoed page JSON files'},
            '--config -c': {type: 'string', description: 'Path to a JSON lasso configuration file'},
            '--minify -m': {type: 'boolean', description: 'Enable JavaScript and CSS minification (disabled by default)'},
            '--no-conflict': {type: 'string', description: 'Enable no-conflict build by providing unique string (e.g. "myapp")'},
            '--fingerprint': {type: 'boolean', description: 'Include fingerprints in filenames'},
            '--help -h': {type: 'boolean', description: 'Show this help screen'},
            '--url-prefix -u': {type: 'string', description: 'URL prefix for resource bundles (e.g. "http://mycdn/")'},
            '--development --dev -d': {type: 'boolean', description: 'Enable development mode (no minification, bundling or fingerprints)'},
            '--production -prod': {type: 'boolean', description: 'Enable production mode (minification, bundling and fingerprints)'},
            '--base-path -b': {type: 'string', description: 'File system path used to calculate relative paths to generated bundles'},
            '--html -h': {type: 'boolean', description: 'Generate a JSON file that contains the HTML markup required to include the dependencies (organized by slot)'},
            '--html-dir': {type: 'boolean', description: 'Output directory for JSON files (defaults to "build")'},
            '--extensions --extension': {type: 'string[]', description: 'Extensions to enable (legacy, use flags)'},
            '--flags --flag -f': {type: 'string[]', description: 'Flags to enable'},
            '--inject-into --inject -i': {type: 'string[]', description: 'Pages to inject the slot HTML into'},
            '--main --entry -e': {type: 'string[]', description: 'The JavaScript module main entry for your app'},
            '--dependencies --dependency *': {type: 'string[]', description: 'Page dependencies'},
            '--cache-profile': {type: 'string', description: 'Caching profile (either "default" or "production")'},
            '--cache-dir': {type: 'string', description: 'Base cache directory (defaults to "CWD/.cache/lasso")'},
            '--cache-key': {type: 'string', description: 'The cache key to use when reading and persisting the result to/from disk'},
            '--disk-cache': {type: 'boolean', description: 'Read/write lassoed pages from/to a disk cache'},
            '--plugins -plugin -p': {
                type: '[]',
                description: 'Plugins to enable',
                options: {
                    '--module -m *': 'string',
                    '-*': null
                }
            },
            '--paths --path': {
                type: 'string[]',
                description: 'Additional directories to add to the application-level module search path'
            },
            '--watch -w': {
                type: 'boolean',
                description: 'Watch for file changes'
            }
        })
        .example('Lasso a single Node.js module for the browser', '$0 --main run.js --name my-page')
        .example('Lasso a set of dependencies', '$0 style.less foo.js template.marko')
        .example('Enable CSS and JS minification', '$0 style.less foo.js template.marko --name my-page --minify')
        .example('Change the output directory', '$0 style.less foo.js template.marko --name my-page --output-dir build')
        .validate(function(result) {
            if (result.help) {
                this.printUsage();
                process.exit(0);
            }

            if (!result.dependencies && !result.main && !result.config) {
                this.printUsage();
                process.exit(1);
            }
        })
        .onError(function(err) {
            this.printUsage();

            if (err) {
                console.log();
                console.log(err);
            }

            process.exit(1);
        })
        .usage('Usage: $0 [depdendency1, dependency2, ...] [OPTIONS]');

    var args = parser.parse(argv);

    // Add the root directory to the search path for modules to allow paths to be specified
    // relative to the application root.
    if (args.paths) {
        args.paths.forEach(function(path) {
            path.split(/[:,;]/).forEach(function(path) {
                appModulePath.addPath(nodePath.resolve(cwd, path));
            });
        });
    }

    var config = args.config;
    var configDir;


    var htmlDir = nodePath.resolve(cwd, args.htmlDir || 'build');

    if (typeof config === 'string') {
        config = nodePath.resolve(process.cwd(), config);
        configDir = nodePath.dirname(config);

        var json = fs.readFileSync(config, {encoding: 'utf8'});

        console.log('****', jsonminify(json));

        try {
            config = JSON.parse(jsonminify(json));
        } catch(e) {
            console.error('Unable to parse JSON config file at path "' + config + '". Exception: ' + e);
            process.exit(1);
        }

        if (config['lasso']) {
            // This is kind of a hack, but to allow the configuration for the lasso module
            // to be alongside other configuration, we look for a configuration nested under a "lasso"
            // property
            config = config['lasso'];
        }
    } else if (!config) {
        config = {};
    }

    var outputDir = args.outputDir;

    if (outputDir) {
        config.outputDir = outputDir = nodePath.resolve(cwd, outputDir);
    } else {
        config.outputDir = outputDir = nodePath.resolve(cwd, config.outputDir || 'static');
    }

    if (args.urlPrefix != null) {
        config.urlPrefix = args.urlPrefix;
    } else if (config.urlPrefix == null) {
        config.urlPrefix = '%STATIC_PATH%';
    }

    var cacheProfileName = args.cacheProfile;
    if (cacheProfileName) {
        config.cacheProfile = cacheProfileName;
    } else {
        cacheProfileName = config.cacheProfile;
        if (!cacheProfileName) {
            cacheProfileName = '*';
            config.cacheProfile = cacheProfileName;
        }
    }

    var cacheKey = args.cacheKey;

    var cacheProfiles = config.cacheProfiles = {};

    var cacheProfile = cacheProfiles[cacheProfileName] = {};

    if (args.diskCache) {
        // Ensure that the lassoed pages are using a "disk" store if page caching is enabled
        cacheProfile.lassoPageResults = {
            store: 'disk'
        };
    }

    // if (args.watch) {
    //     cacheProfile.lassoPageResults = {
    //         store: 'none'
    //     };
    // }

    if (args.cacheDir) {
        config.cacheDir = args.cacheDir;
    }

    if (args.cacheProfile) {
        config.cacheProfile = args.cacheProfile;
    }

    if (isObjectEmpty(config.cacheProfiles[cacheProfileName])) {
        delete config.cacheProfiles;
        if (cacheProfileName === '*') {
            delete config.cacheProfile;
        }
    }

    var plugins = args.plugins || [];

    if (args.development) {
        config.bundlingEnabled = false;
        config.fingerprintsEnabled = false;
    } else if (args.production) {
        config.bundlingEnabled = true;
        config.cacheProfile = config.cacheProfile || 'production';
        config.minify = true;
        config.fingerprintsEnabled = true;
    } else {
        if (args.fingerprint == null) {
            args.fingerprint = false;
        }
    }

    if (args.minify != null) {
        config.minify = true;
    }

    config.noConflict = args.noConflict;

    if (args.fingerprint != null) {
        config.fingerprintsEnabled = args.fingerprint === true;
    }

    var flagsLookup = {};

    function addFlags(flags) {
        if (flags) {
            flags.forEach(function(flag) {
                flag.split(/\s*,\s*/).forEach(function(flag) {
                    flagsLookup[flag] = true;
                });
            });
        }
    }

    addFlags(args.extensions);
    addFlags(args.flags);

    var flags = Object.keys(flagsLookup);

    var dependencies = args.dependencies;

    if (args.main && args.main.length) {
        dependencies = dependencies || [];
        args.main.forEach(function(main) {
            dependencies.push('require-run:' + nodePath.resolve(cwd, main));
        });
    }



    if (plugins.length) {
        config.plugins = plugins;
    }

    var name = args.name;

    console.log('Config:\n' + JSON.stringify(config, null, 4));

    config.projectRoot = cwd;

    function doRun() {
        var theLasso = lasso.create(config, configDir || cwd);

        var promises = [];
        var failedCount = 0;

        var lassoPageResults = {};

        function lassoPage(options) {
            var pageName = options.name || options.pageName;
            if (args.basePath) {
                options.basePath = args.basePath;
            }

            if (args.watch) {
                options.cache = false;
            }

            console.log('\nOptimizing page "' + pageName + '"...');
            var promise = theLasso.lassoPage(options)
                    .then(function(lassoPageResult) {
                        console.log('Successfully lassoed page "' + pageName + '"!');
                        lassoPageResults[pageName] = lassoPageResult;
                    })
                    .catch(function(e) {
                        console.error('Failed to lasso page "' + pageName + '"! Reason: ' + (e.stack || e));
                        failedCount++;
                    });

            promises.push(promise);
        }

        dependencies = dependencies.map(function(d) {

            if (typeof d === 'string' && d.endsWith('.json')) {
                var resolvedPath = nodePath.resolve(cwd, d);
                if (fs.existsSync(resolvedPath)) {
                    var relPath = nodePath.relative(cwd, d);
                    if (relPath.charAt(0) !== '.') {
                        relPath = './' + relPath;
                    }
                    return relPath;
                }
            }
            return d;
        });

        if (!name && args.injectInto && args.injectInto.length === 1) {
            var targetPage = args.injectInto[0];
            name = targetPage.slice(0, 0 - nodePath.extname(targetPage).length);
        }

        if (dependencies && dependencies.length) {

            if (!name) {
                // Try to derive the best bundle name from the set of dependencies
                if (dependencies.length === 1) {
                    var firstDependency = dependencies[0];
                    if (typeof firstDependency === 'string') {

                        name = getNameFromDependency(firstDependency);
                    }
                }
            }

            lassoPage({
                    cacheKey: cacheKey,
                    name: name || nodePath.basename(process.cwd()),
                    dependencies: dependencies,
                    flags: flags
                });
        }


        return raptorPromises.allSettled(promises)
            .then(function() {
                /* jshint loopfunc:true */
                var pageNames = Object.keys(lassoPageResults);
                if (pageNames.length) {
                    for (var pageName in lassoPageResults) {
                        if (lassoPageResults.hasOwnProperty(pageName)) {
                            var lassoPageResult = lassoPageResults[pageName];
                            var lines = ['------------------------------------'];

                            lines.push('Output for page "' + pageName + '":');
                            lines.push('  Resource bundle files:\n    ' + lassoPageResult.getOutputFiles()
                                .map(function(path) {
                                    return relPath(path);
                                })
                                .join('\n    '));

                            if (args.html !== false) {
                                var htmlFile = nodePath.resolve(htmlDir, pageName + '.html.json');
                                mkdirp.sync(nodePath.dirname(htmlFile));

                                lines.push('  HTML slots file:\n    ' + relPath(htmlFile));
                                fs.writeFile(htmlFile, lassoPageResult.htmlSlotsToJSON(4), {encoding: 'utf8'}, function(err) {
                                    if (err) {
                                        console.error('Failed to save HTML slots to file "' + htmlFile + '". Error: ' + (err.stack || err));
                                    }

                                });
                            }

                            if (args.injectInto && args.injectInto.length) {
                                args.injectInto.forEach(function(target) {
                                    target = nodePath.resolve(cwd, target);
                                    var targetHtml = fs.readFileSync(target, {encoding: 'utf8'});
                                    var injectOptions = {
                                        path: target,
                                        outputDir: config.outputDir
                                    };

                                    targetHtml = injector.inject(targetHtml, lassoPageResult, injectOptions);
                                    fs.writeFileSync(target, targetHtml, {enconding: 'utf8'});
                                    lines.push('  Updated HTML file:\n    ' + relPath(target));
                                });

                            }

                            console.log(lines.join('\n'));
                        }
                    }
                }

                console.log('------------------------------------');
                if (failedCount) {
                    console.error(failedCount + ' page(s) failed to build');
                    process.exit(1);
                } else {
                    console.log('\nAll pages successfully built!');
                }

                if (args.watch) {
                    console.log('\nWatching for file changes...');
                }
            })
        .catch(function(e) {
            console.error('Uncaught exception: ' + (e.stack || e));
            if (!args.watch) {
                process.exit(1);
            }
        });
    }

    var runPromise;

    if (args.watch) {

        var ignoreAlwaysPatterns = [
            '/' + nodePath.relative(cwd, outputDir) + '/',
            '/' + nodePath.relative(cwd, htmlDir) + '/'
        ];

        if (args.injectInto && args.injectInto.length) {
            args.injectInto.forEach(function(target) {
                ignoreAlwaysPatterns.push('/' + target);
            });
        }

        var ignoringWatcher = require('ignoring-watcher').createWatcher({
            // Directory to watch. Defaults to process.cwd()
            dir: process.cwd(),

            // Only the first existing ignore file (if any) will be loaded and merged
            selectIgnoreFile: [
                nodePath.join(cwd, '.lasso-ignore'),
                nodePath.join(cwd, '.gitignore'),
                nodePath.join(cwd, '.npm-ignore')
            ],

            // If no ignore patterns were found via the other properties
            // then these ignore patterns will be used
            defaultIgnorePatterns: [
                '/node_modules/', '.*', '*.marko.js'
            ],

            ignoreAlwaysPatterns: ignoreAlwaysPatterns
        });

        ignoringWatcher
            .on('ready', function(eventArgs) {
                eventArgs.dirs.forEach(function(dir) {
                    console.log('[lasso-cli] Watching: ' + dir);
                });

                eventArgs.ignorePatterns.forEach(function(pattern) {
                    console.log('[lasso-cli] Ignore rule: ' + pattern);
                });
            })
            .on('modified', function(eventArgs) { // Fired for any change event (add, delete, etc.)
                lasso.handleWatchedFileChanged(eventArgs.path);
                runPromise = runPromise.then(doRun);
            });


        ignoringWatcher.startWatching(); // Don't forget to start the file watching service
    }

    runPromise = doRun();

    if (!args.watch) {
        runPromise.done();
    }
}

module.exports = run;

