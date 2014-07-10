define('./src/index', ['require', 'exports', 'module', './mod-a', './mod-b'], function(require, exports, module, modA) {
	var modB = require('./mod-b');

	return {};
});

define('./src/mod-a', ['require', 'exports', 'module', './sub/mod-c'], function(require, exports, module) {
var modC = require('./sub/mod-c');

module.exports = {};
});

define('./src/mod-b', ['require', 'exports', 'module', './sub/mod-c'], function(require) {
	var modC = require('./sub/mod-c');

	return {};
});

define('./src/sub/mod-c', ['require', 'exports', 'module', '../mod-a', './tpl-a.tpl.html'], function(require) {
	var modA = require('../mod-a');
	var tplA = require('./tpl-a.tpl.html');

	return {};
});

define('./src/sub/tpl-a.tpl.html', ['require', 'exports', 'module', '../mod-b'], function(require, exports, module) {
	function $encodeHtml(str) {
		return (str + '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/`/g, '&#96;').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
	}
	exports.render = function($data, $opt) {
		$data = $data || {};
		var _$out_= [];
		var $print = function(str) {_$out_.push(str);};
		
		with($data) {
		
		
var modB = require('../mod-b');

		_$out_.push('<div>Hello</div>');
		}
		
		return _$out_.join('');
	};
});