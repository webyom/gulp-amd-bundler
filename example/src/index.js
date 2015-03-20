define(['require', 'exports', 'module', './mod-a'], function(require, exports, module, modA) {
	var modB = require('./mod-b');
	var lang = require('lang/{{G.LANG}}/common');
	var tplA = require('./inline-tpl-a.tpl.html');
	var tplB = require('./inline-tpl-b.tpl.html');

	return {};
});

__END__

@@ inline-tpl-a.tpl.html
<div>A</div>

@@ inline-tpl-b.tpl.html
<div>B</div>
