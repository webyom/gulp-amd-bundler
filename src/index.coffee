Q = require 'q'
path = require 'path'
async = require 'async'
gutil = require 'gulp-util'
through = require 'through2'
coffee = require 'gulp-coffee'
mt2amd = require 'gulp-mt2amd'
amdDependency = require 'gulp-amd-dependency'

EOL = '\n'

getUnixStylePath = (p) ->
	p.split(path.sep).join '/'

getBodyDeps = (def) ->
	deps = []
	got = {}
	def = def.replace /(^|[^.]+?)\brequire\s*\(\s*(["'])([^"']+?)\2\s*\)/mg, (full, lead, quote, dep) ->
		pDep = dep.replace /\{\{([^{}]+)\}\}/g, quote + ' + $1 + ' + quote
		qDep = quote + pDep + quote
		got[dep] || deps.push qDep
		got[dep] = 1
		if pDep is dep
			full
		else
			lead + 'require(' + qDep + ')'
	{
		def: def
		deps: deps
	}

fixDefineParams = (file, depId, userDefinedBaseDir) ->
	def = getBodyDeps file.contents.toString()
	bodyDeps = def.deps
	fix = (full, b, d, quote, definedId, deps) ->
		if bodyDeps.length
			bodyDeps = bodyDeps.join(', ')
			if deps
				deps = deps.replace /]$/, ', ' + bodyDeps + ']'
			else
				deps = "['require', 'exports', 'module', " + bodyDeps + "], "
		if definedId and not (/^\./).test definedId
			id = definedId
		else
			id = depId || ''
			if id and not userDefinedBaseDir and not (/^\./).test(id)
				id = './' + id
		[b, d, id && ("'" + getUnixStylePath(id) + "', "), deps || "['require', 'exports', 'module'], "].join ''
	if not (/(^|[^.]+?)\bdefine\s*\(/).test(def.def) and (/(^|[^.]+?)\bmodule\.exports\s*=[^=]/).test(def.def)
		def = [
			fix('define(', '', 'define(') + 'function(require, exports, module) {'
			def.def
			'});'
		].join EOL
	else
		def = def.def.replace /(^|[^.]+?)\b(define\s*\()\s*(?:(["'])([^"'\s]+)\3\s*,\s*)?\s*(\[[^\[\]]*\])?/m, fix
	def

module.exports = (opt = {}) ->
	through.obj (file, enc, next) ->
		return @emit 'error', new gutil.PluginError('gulp-amd-bundler', 'File can\'t be null') if file.isNull()
		return @emit 'error', new gutil.PluginError('gulp-amd-bundler', 'Streams not supported') if file.isStream()
		module.exports.bundle(file, opt).then(
			(file) =>
				@push file
				next()
			(err) =>
				@emit 'error', new gutil.PluginError('gulp-amd-bundler', err)
		).done()

module.exports.bundle = (file, opt = {}) ->
	baseFile = opt.baseFile
	baseDir = opt.baseDir
	if baseFile and not baseDir
		baseDir = path.dirname(baseFile.path)
	Q.Promise (resolve, reject) ->
		return reject new gutil.PluginError('gulp-amd-bundler', 'File can\'t be null') if file.isNull()
		return reject new gutil.PluginError('gulp-amd-bundler', 'Streams not supported') if file.isStream()
		dependFiles = [file]
		depStream = amdDependency excludeDependent: true
		depStream.pipe through.obj(
			(file, enc, next) ->
				dependFiles.push file
				next()
			->
				content = []
				async.eachSeries(
					dependFiles
					(depFile, cb) ->
						if depFile.path is file.path
							if baseDir
								depId = path.relative(baseDir, depFile.path).replace /\.(js|coffee)$/, ''
							else
								depId = ''
							# remove inline templates srouce code
							file.contents = new Buffer file.contents.toString().split(/(?:\r\n|\n|\r)__END__\s*(?:\r\n|\n|\r|$)/)[0]
						else
							depId = path.relative(baseDir || path.dirname(file.path), depFile.path).replace /\.(js|coffee)$/, ''
						if opt.trace
							trace = '/* trace:' + path.relative(process.cwd(), depFile.path) + ' */' + EOL
						else
							trace = ''
						if (/\.tpl\.html$/).test depFile.path
							mt2amd.compile(depFile, postcss: opt.postcss, base64img: opt.base64img, beautify: opt.beautifyTemplate, trace: opt.trace).then(
								(depFile) ->
									content.push trace + fixDefineParams(depFile, depId, !!opt.baseDir)
									cb()
								(err) ->
									reject err
							)
						else if (/\.coffee$/).test depFile.path
							coffeeStream = coffee opt.coffeeOpt
							coffeeStream.pipe through.obj(
								(depFile, enc, next) ->
									content.push trace + fixDefineParams(depFile, depId, !!opt.baseDir)
									cb()
									next()
							)
							coffeeStream.on 'error', (e) ->
								console.log 'gulp-amd-bundler Error:', e.message
								console.log 'file:', file.path
								console.log e.stack
							coffeeStream.end depFile
						else
							content.push trace + fixDefineParams(depFile, depId, !!opt.baseDir)
							cb()
					(err) ->
						return reject err if err
						if (/\.tpl\.html$/).test file.path
							file.path = file.path + '.js'
						else
							file.path = file.path.replace /\.coffee$/, '.js'
						file.contents = new Buffer content.join EOL + EOL
						resolve file
				)
		)
		depStream.end file
