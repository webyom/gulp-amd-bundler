(function() {
  var EOL, Q, amdDependency, async, coffee, fixDefineParams, getBodyDeps, getUnixStylePath, gutil, mt2amd, path, through;

  Q = require('q');

  path = require('path');

  async = require('async');

  gutil = require('gulp-util');

  through = require('through2');

  coffee = require('gulp-coffee');

  mt2amd = require('gulp-mt2amd');

  amdDependency = require('gulp-amd-dependency');

  EOL = '\n';

  getUnixStylePath = function(p) {
    return p.split(path.sep).join('/');
  };

  getBodyDeps = function(def) {
    var deps, got;
    deps = [];
    got = {};
    def = def.replace(/(^|[^.]+?)\brequire\s*\(\s*(["'])([^"']+?)\2\s*\)/mg, function(full, lead, quote, dep) {
      var pDep, qDep;
      pDep = dep.replace(/\{\{([^{}]+)\}\}/g, quote + ' + $1 + ' + quote);
      qDep = quote + pDep + quote;
      got[dep] || deps.push(qDep);
      got[dep] = 1;
      if (pDep === dep) {
        return full;
      } else {
        return lead + 'require(' + qDep + ')';
      }
    });
    return {
      def: def,
      deps: deps
    };
  };

  fixDefineParams = function(def, depId) {
    var bodyDeps, fix;
    def = getBodyDeps(def);
    bodyDeps = def.deps;
    fix = function(full, b, d, quote, definedId, deps) {
      var id;
      if (bodyDeps.length) {
        bodyDeps = bodyDeps.join(', ');
        if (deps) {
          deps = deps.replace(/]$/, ', ' + bodyDeps + ']');
        } else {
          deps = "['require', 'exports', 'module', " + bodyDeps + "], ";
        }
      }
      if (definedId && !/^\./.test(definedId)) {
        id = definedId;
      } else {
        id = depId || '';
        if (id && !/^\./.test(id)) {
          id = './' + id;
        }
      }
      return [b, d, id && ("'" + getUnixStylePath(id) + "', "), deps || "['require', 'exports', 'module'], "].join('');
    };
    if (!/(^|[^.]+?)\bdefine\s*\(/.test(def.def) && /(^|[^.]+?)\bmodule\.exports\b/.test(def.def)) {
      def = [fix('define(', '', 'define(') + 'function(require, exports, module) {', def.def, '});'].join(EOL);
    } else {
      def = def.def.replace(/(^|[^.]+?)\b(define\s*\()\s*(?:(["'])([^"'\s]+)\3\s*,\s*)?\s*(\[[^\[\]]*\])?/m, fix);
    }
    return def;
  };

  module.exports = function(opt) {
    if (opt == null) {
      opt = {};
    }
    return through.obj(function(file, enc, next) {
      if (file.isNull()) {
        return this.emit('error', new gutil.PluginError('gulp-amd-bundler', 'File can\'t be null'));
      }
      if (file.isStream()) {
        return this.emit('error', new gutil.PluginError('gulp-amd-bundler', 'Streams not supported'));
      }
      return module.exports.bundle(file, opt).then((function(_this) {
        return function(file) {
          _this.push(file);
          return next();
        };
      })(this), (function(_this) {
        return function(err) {
          return _this.emit('error', new gutil.PluginError('gulp-amd-bundler', err));
        };
      })(this)).done();
    });
  };

  module.exports.bundle = function(file, opt) {
    var baseFile;
    if (opt == null) {
      opt = {};
    }
    baseFile = opt.baseFile;
    return Q.Promise(function(resolve, reject) {
      var depStream, dependFiles;
      if (file.isNull()) {
        return reject(new gutil.PluginError('gulp-amd-bundler', 'File can\'t be null'));
      }
      if (file.isStream()) {
        return reject(new gutil.PluginError('gulp-amd-bundler', 'Streams not supported'));
      }
      dependFiles = [file];
      depStream = amdDependency({
        excludeDependent: true
      });
      depStream.pipe(through.obj(function(file, enc, next) {
        dependFiles.push(file);
        return next();
      }, function() {
        var content;
        content = [];
        return async.eachSeries(dependFiles, function(depFile, cb) {
          var coffeeStream, depId;
          if (depFile.path === file.path) {
            if (baseFile) {
              depId = path.relative(path.dirname(baseFile.path), depFile.path).replace(/\.(js|coffee)$/, '');
            } else {
              depId = '';
            }
          } else {
            depId = path.relative(path.dirname((baseFile || file).path), depFile.path).replace(/\.(js|coffee)$/, '');
          }
          if (/\.tpl\.html$/.test(depFile.path)) {
            return mt2amd.compile(depFile, {
              beautify: opt.beautifyTemplate
            }).then(function(depFile) {
              content.push(fixDefineParams(depFile.contents.toString('utf8'), depId));
              return cb();
            }, function(err) {
              return reject(err);
            });
          } else if (/\.coffee$/.test(depFile.path)) {
            coffeeStream = coffee(opt.coffeeOpt);
            coffeeStream.pipe(through.obj(function(depFile, enc, next) {
              content.push(fixDefineParams(depFile.contents.toString('utf8'), depId));
              cb();
              return next();
            }));
            return coffeeStream.end(depFile);
          } else {
            content.push(fixDefineParams(depFile.contents.toString('utf8'), depId));
            return cb();
          }
        }, function(err) {
          if (err) {
            return reject(err);
          }
          if (/\.tpl\.html$/.test(file.path)) {
            file.path = file.path + '.js';
          } else {
            file.path = file.path.replace(/\.coffee$/, '.js');
          }
          file.contents = new Buffer(content.join(EOL + EOL));
          return resolve(file);
        });
      }));
      return depStream.end(file);
    });
  };

}).call(this);
