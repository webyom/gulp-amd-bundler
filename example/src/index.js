define(['require', 'exports', 'module', './mod-a'], function(require, exports, module, modA) {
	var img = require('./arrow.png');
	var $ = require('jquery');
	var React = require('react');
    var bootstrap = require('lib/bootstrap');
    var bootstrapAlert = require('lib/bootstrap/js/alert');
	var ReactWithAddons = require('react-with-addons');
	var angularResource = require('angular-resource');
	var modB = require('./mod-b');
	var modB = require('./mod-c.json');
	var lang = require('lang/{{G.LANG}}/common');
	var tplA = require('./inline-tpl-a.tpl.html');
	var tplB = require('./inline-tpl-b.tpl.html');
	var sprite = require('./sprite.css');
	var css = require('./style.css');
	var less = require('./style.less');
	var scss = require('./style.scss');
	var readme = require('./readme.md');

	return {};
});

__END__

@@ inline-tpl-a.tpl.html
<div>A</div>

@@ inline-tpl-b.tpl.html
<div>B</div>
