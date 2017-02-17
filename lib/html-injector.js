var startRegExp = /<!--\s*<\s*lasso\-\s*(\w+)\s*>\s*-->|<\/\s*(head)\s*>|<\/\s*(body)\s*>/gi;
var endRegExp = /<!--\s*<\/\s*lasso\-\s*(\w+)\s*>\s*-->/g;
var nodePath = require('path');

function HtmlInjector(pageHtml, keepMarkers) {
    this.keepMarkers = keepMarkers === true;
    this.parts = [];
    this.injectIndexes = {};
    this.findSlots(pageHtml);
}

HtmlInjector.prototype = {
    findSlots: function(pageHtml) {
        var injectIndexes = this.injectIndexes,
            parts = this.parts,
            startMatches,
            endMatch,
            begin = 0;


        startRegExp.lastIndex = 0;


        while ((startMatches = startRegExp.exec(pageHtml))) {
            var slotName = startMatches[1];
            var isImplicitSlot = false;
            if (!slotName) {
                slotName = '__' + (startMatches[2] || startMatches[3]);
                isImplicitSlot = true;
            }

            slotName = slotName.toLowerCase();

            parts.push(pageHtml.substring(begin, startMatches.index));

            injectIndexes[slotName] = parts.length;
            parts.push('');

            if (isImplicitSlot) {
                begin = startMatches.index;
            } else {
                endRegExp.lastIndex = startRegExp.lastIndex;
                endMatch = endRegExp.exec(pageHtml);
                if (endMatch) {
                    begin = endRegExp.lastIndex;
                    startRegExp.lastIndex = endRegExp.lastIndex;
                }
                else {
                    begin = startRegExp.lastIndex;
                }
            }
        }

        if (begin < pageHtml.length) {
            parts.push(pageHtml.substring(begin));
        }
    },

    inject: function(slot, injectHtml) {
        slot = slot.toLowerCase();
        var injectIndex = this.injectIndexes[slot];
        if (injectIndex === undefined && (slot === 'head' || slot === 'body')) {
            // Use the implicit slot found from the ending head or body tag
            injectIndex = this.injectIndexes['__' + slot];
        }

        var finalHtml = this.keepMarkers ?
            ('<!-- <lasso-' + slot + '> -->' + injectHtml + '<!-- </lasso-' + slot + '> -->') :
            injectHtml;

        if (injectIndex === undefined) {
            this.parts.push(finalHtml);
        } else {
            this.parts[injectIndex] = finalHtml;
        }


    },

    getHtml: function() {
        return this.parts.join('');
    }
};

exports.inject = function(html, lassoPageResult, options) {
    options = options || {};
    var keepMarkers = options.keepMarkers !== false;
    var injector = new HtmlInjector(html, keepMarkers);

    var relPath = '';
    if (options.path && options.outputDir) {
        // Generate a relative path from the directory of the HTML file to the output dir
        relPath = nodePath.relative(nodePath.dirname(options.path), options.outputDir);
        if (relPath.charAt(0) !== '.') {
            relPath = './' + relPath;
        }
    }

    var slots = lassoPageResult._htmlBySlot;
    for (var slotName in slots) {
        if (slots.hasOwnProperty(slotName)) {
            var slotHtml = slots[slotName];
            slotHtml = slotHtml.replace(/%STATIC_PATH%/g, relPath);
            injector.inject(slotName, slotHtml);
        }
    }
    return injector.getHtml();
};
