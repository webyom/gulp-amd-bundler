/* trace:example/src/index.js */
define(['require', 'exports', 'module', './mod-a', './mod-b', 'lang/' + G.LANG + '/common', './inline-tpl-a.tpl.html', './inline-tpl-b.tpl.html'], function(require, exports, module, modA) {
	var modB = require('./mod-b');
	var lang = require('lang/' + G.LANG + '/common');
	var tplA = require('./inline-tpl-a.tpl.html');
	var tplB = require('./inline-tpl-b.tpl.html');

	return {};
});


/* trace:example/src/mod-a.js */
define('./mod-a', ['require', 'exports', 'module', './sub/mod-c'], function(require, exports, module) {
var modC = require('./sub/mod-c');

module.exports = {};
});

/* trace:example/src/sub/mod-c.js */
define('./sub/mod-c', ['require', 'exports', 'module', '../mod-a', './mod-d', './tpl-a.tpl.html'], function(require) {
	var modA = require('../mod-a');
	var modD = require('./mod-d');
	var tplA = require('./tpl-a.tpl.html');

	return {};
});

/* trace:example/src/sub/mod-d.coffee */
define('./sub/mod-d', ['require', 'exports', 'module', '../mod-b'], function(require, exports, module) {
(function() {
  var modB;

  modB = require('../mod-b');

  module.exports = {};

}).call(this);

});

/* trace:example/src/sub/tpl-a.tpl.html */
define('./sub/tpl-a.tpl.html', ['require', 'exports', 'module', "../mod-b"], function(require, exports, module) {
    function $encodeHtml(str) {
        return (str + "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/`/g, "&#96;").replace(/'/g, "&#39;").replace(/"/g, "&quot;");
    }
    exports.render = function($data, $opt) {
        $data = $data || {};
        var _$out_ = [];
        var $print = function(str) {
            _$out_.push(str);
        };
        with ($data) {
            /* trace:example/src/sub/tpl-a.tpl.html */
            var modB = require("../mod-b");
            _$out_.push("<div>Hello</div>");
        }
        return _$out_.join("");
    };
});

/* trace:example/src/mod-b.js */
define('./mod-b', ['require', 'exports', 'module', './sub/mod-c'], function(require) {
	var modC = require('./sub/mod-c');

	return {};
});

/* trace:example/src/inline-tpl-a.tpl.html */
define('./inline-tpl-a.tpl.html', ['require', 'exports', 'module'], function(require, exports, module) {
    function $encodeHtml(str) {
        return (str + "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/`/g, "&#96;").replace(/'/g, "&#39;").replace(/"/g, "&quot;");
    }
    exports.render = function($data, $opt) {
        $data = $data || {};
        var _$out_ = [];
        var $print = function(str) {
            _$out_.push(str);
        };
        with ($data) {
            /* trace:example/src/inline-tpl-a.tpl.html */
            _$out_.push("<div>A</div>");
        }
        return _$out_.join("");
    };
});

/* trace:example/src/inline-tpl-b.tpl.html */
define('./inline-tpl-b.tpl.html', ['require', 'exports', 'module'], function(require, exports, module) {
    function $encodeHtml(str) {
        return (str + "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/`/g, "&#96;").replace(/'/g, "&#39;").replace(/"/g, "&quot;");
    }
    exports.render = function($data, $opt) {
        $data = $data || {};
        var _$out_ = [];
        var $print = function(str) {
            _$out_.push(str);
        };
        with ($data) {
            /* trace:example/src/inline-tpl-b.tpl.html */
            _$out_.push("<div>B</div>");
        }
        return _$out_.join("");
    };
});