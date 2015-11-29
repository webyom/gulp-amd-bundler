fs = require('fs');
var traceur = require('traceur');

f = fs.readFileSync('/Users/gary/Projects/webyom/gulp-amd-bundler/example/src/mod-c.es6');
r = traceur.compile(f.toString());
console.log(r);