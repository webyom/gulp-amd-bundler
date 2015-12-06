define(['require', 'exports', 'module', './mod-a'], function(require, exports, module, modA) {
	var $ = require('jquery');
	var React = require('react');
	var ReactWithAddons = require('react-with-addons');
	var angularResource = require('angular-resource');
	var modB = require('./mod-b');
	var modC = require('./mod-c');
	var modD = require('./mod-d.react');
	var modX = require('./mod-x');
	var modY = require('./mod-y.react');
	var lang = require('lang/{{G.LANG}}/common');
	var tplA = require('./inline-tpl-a.tpl.html');
	var tplB = require('./inline-tpl-b.tpl.html');
	var sprite = require('./sprite.css');
	var css = require('./style.css');
	var less = require('./style.less');
	var scss = require('./style.scss');
	var riot = require('./riot');
	var riotHtml = require('./riot-html');

	return {};
});

__END__

@@ inline-tpl-a.tpl.html
<div>A</div>

@@ inline-tpl-b.tpl.html
<div>B</div>
