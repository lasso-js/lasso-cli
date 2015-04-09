require('raptor-polyfill/string/startsWith');

var nodePath = require('path');
var fs = require('fs');
var cwd = process.cwd();


function addIgnore(ignoreRules, path) {
    if (!path) {
        return;
    }
    
    path = nodePath.resolve(cwd, path);
    if (path.startsWith(cwd)) {
        ignoreRules.push(path.substring(cwd.length));
    }
}
exports.getIgnoreRules = function(config) {
    var ignoreRules = [];

    if (config.ignore) {
        if (Array.isArray(config.ignore)) {
            ignoreRules = ignoreRules.concat(config.ignore);
        } else {
            ignoreRules = ignoreRules.concat(config.ignore.split(' '));
        }
    } else {
        var ignoreFile = nodePath.join(cwd, '.lasso-ignore');
        if (!fs.existsSync(ignoreFile)) {
            ignoreFile = nodePath.join(cwd, '.gitignore');
            if (!fs.existsSync(ignoreFile)) {
                ignoreFile = null;
            }
        }
        
        if (ignoreFile) {
            ignoreRules = fs.readFileSync(ignoreFile, {encoding: 'utf8'}).split(/\s*\r?\n\s*/);
        } else {
            ignoreRules = ['/node_modules', '.*', '*.marko.js', '*.dust.js'];
        }

        ignoreRules = ignoreRules.filter(function (s) {
            s = s.trim();
            return s && !s.match(/^#/);
        });
    }

    addIgnore(ignoreRules, config.outputDir);
    addIgnore(ignoreRules, config.htmlDir);

    if (config.injectInto) {
        config.injectInto.forEach(function(path) {
            addIgnore(ignoreRules, path);
        });
    }

    return ignoreRules;
};