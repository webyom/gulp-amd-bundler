child_process = require 'child_process'
_ = require 'underscore'
Q = require 'q'
fs = require 'fs'
path = require 'path'
async = require 'async'
PluginError = require 'plugin-error'
through = require 'through2'
coffee = require 'gulp-coffee'
mt2amd = require 'gulp-mt2amd'
amdDependency = require 'gulp-amd-dependency'
coffeeReactTransform = require 'coffee-react-transform'
UglifyJS = require 'uglify-js'
CleanCSS = require 'clean-css'
mkdirp = require 'mkdirp'

EOL = '\n'
EXPORTS_REGEXP = /(^|[^.])\b(module\.exports|exports\.[^.]+)\s*=[^=]/
DEP_ID_SUFFIX_REGEXP = /\.(js|jsx|coffee)$/i

_npmDir = 'node_modules'
_bowerDir = 'bower_components'
_venderFoundMap = {}

logErr = (err, filePath) ->
	console.log 'Error:', err.message
	console.log 'file:', filePath
	if err.line
		console.log 'line:', err.line
	throw err

getUnixStylePath = (p) ->
	p.split(path.sep).join '/'

getBodyDeps = (def, depPath, opt = {}) ->
	deps = []
	got = {}
	depDir = path.dirname depPath
	def = def.replace /(^|[^.])\brequire\s*\(\s*(["'])([^"']+?)\2\s*\)/mg, (full, lead, quote, dep) ->
		pDep = dep.replace /\{\{([^{}]+)\}\}/g, quote + ' + $1 + ' + quote
		if opt.baseDir and pDep.indexOf('.') is 0
			tmp = path.relative opt.baseDir, path.resolve(depDir, pDep)
			pDep = tmp if tmp.indexOf('.') isnt 0
		qDep = quote + pDep + quote
		if not got[dep] and dep.indexOf('*') is -1
			deps.push qDep
		got[dep] = 1
		if pDep is dep
			full
		else
			lead + 'require(' + qDep + ')'
	{
		def: def
		deps: deps
	}

fixDefineParams = (def, depId, depPath, opt = {}) ->
	matchDefine = def.match /(?:^|[^.])\bdefine\s*\(/g
	return def if matchDefine && matchDefine.length > 1
	def = getBodyDeps def, depPath, opt
	bodyDeps = def.deps
	depDir = path.dirname depPath
	fix = (full, b, d, quote, definedId, deps) ->
		if bodyDeps.length
			if (/^\[\s*\]$/).test deps
				deps = "['require', 'exports', 'module', " + bodyDeps.join(', ') + "]"
			else if deps
				deps = deps.replace(/^\[\s*|\s*\]$/g, '').split(/\s*,\s*/)
				if opt.baseDir
					deps = deps.map (dep) ->
						if dep.indexOf('.') is 1
							tmp = dep.slice 1, -1
							tmp = path.relative opt.baseDir, path.resolve(depDir, tmp)
							dep = "'#{tmp}'" if tmp.indexOf('.') isnt 0
						dep
				tmp = deps.join(',').replace(/'/g, '"').replace(/\s+/g, '').replace(/"\+"/g, '+')
				for bodyDep in bodyDeps
					if tmp.indexOf(bodyDep.replace(/'/g, '"').replace(/\s+/g, '').replace(/"\+"/g, '+')) is -1
						deps.push bodyDep
				deps = '[' + deps.join(',').replace(/,(['"])/g, ', $1') + ']'
			else
				deps = "['require', 'exports', 'module', " + bodyDeps.join(', ') + "], "
		if definedId and not (/^\./).test definedId
			id = definedId
		else
			id = depId || ''
			if id and not opt.baseDir and not (/^\./).test(id)
				id = './' + id
		[b, d, id && ("'" + getUnixStylePath(id) + "', "), deps || "['require', 'exports', 'module'], "].join ''
	if matchDefine
		def = def.def.replace /(^|[^.])\b(define\s*\()\s*(?:(["'])([^"'\s]+)\3\s*,\s*)?\s*(\[[^\[\]]*\])?/m, fix
	else if EXPORTS_REGEXP.test(def.def)
		def = [
			fix('define(', '', 'define(') + 'function(require, exports, module) {'
			def.def
			'});'
		].join EOL
	else
		def = def.def
	def

module.exports = (opt = {}) ->
	through.obj (file, enc, next) ->
		return @emit 'error', new PluginError('gulp-amd-bundler', 'File can\'t be null') if file.isNull()
		return @emit 'error', new PluginError('gulp-amd-bundler', 'Streams not supported') if file.isStream()
		module.exports.bundle(file, opt).then(
			(file) =>
				@push file
				next()
			(err) =>
				@emit 'error', new PluginError('gulp-amd-bundler', err)
		).done()

module.exports.bundle = (file, opt = {}) ->
	baseFile = opt.baseFile
	baseDir = opt.baseDir
	Q.Promise (resolve, reject) ->
		return reject new PluginError('gulp-amd-bundler', 'File can\'t be null') if file.isNull()
		return reject new PluginError('gulp-amd-bundler', 'Streams not supported') if file.isStream()
		dependFiles = [file]
		depStream = amdDependency
			excludeDependent: true
			onlyRelative: true
			extnames: opt.dependencyExtnames
			isRelative: opt.isRelativeDependency
		depStream.pipe through.obj(
			(file, enc, next) ->
				dependFiles.push file
				next()
			->
				content = []
				async.eachSeries(
					dependFiles
					(depFile, cb) ->
						if depFile._isRelative or depFile.path is file.path
							depPath = depFile.path.replace DEP_ID_SUFFIX_REGEXP, ''
							if depFile.path is file.path
								if baseFile
									depId = path.relative(baseDir || path.dirname(baseFile.path), depFile.path).replace DEP_ID_SUFFIX_REGEXP, ''
								else
									depId = ''
								# remove inline templates srouce code
								file.contents = Buffer.from file.contents.toString().split(/(?:\r\n|\n|\r)__END__\s*(?:\r\n|\n|\r|$)/)[0]
							else
								depId = path.relative(baseDir || path.dirname(file.path), depFile.path).replace DEP_ID_SUFFIX_REGEXP, ''
							if opt.trace
								trace = '/* trace:' + path.relative(process.cwd(), depFile.path) + ' */' + EOL
							else
								trace = ''
							if (/\.coffee$/i).test depFile.path
								depContent = depFile.contents.toString()
								if (/\.react\.coffee$/i).test(depFile.path) or (/(^|\r\n|\n|\r)##\s*@jsx\s/).test(depContent)
									depContent = coffeeReactTransform depContent
									depFile.contents = Buffer.from depContent
								coffeeStream = coffee opt.coffeeOpt
								coffeeStream.pipe through.obj(
									(depFile, enc, next) ->
										content.push trace + fixDefineParams(depFile.contents.toString(), depId, depPath, opt)
										cb()
										next()
								)
								coffeeStream.on 'error', (e) ->
									console.log 'gulp-amd-bundler Error:', e.message
									console.log 'file:', file.path
									console.log e.stack
								coffeeStream.end depFile
							else if (/\.(json|md|tpl\.html|css|less|scss|png|jpg|jpeg|gif|svg)$/i).test depFile.path
								mt2amd.compile(depFile, {
									postcss: opt.postcss
									generateDataUri: opt.generateDataUri
									cssSprite: opt.cssSprite
									beautify: opt.beautifyTemplate
									strictMode: opt.strictModeTemplate
									dataInjection: opt.dataInjectionTemplate
									conservativeCollapse: opt.conservativeCollapseTemplate
									babel: opt.babel
									trace: opt.trace
									markedOptions: opt.markedOptions
									cssModuleClassNameGenerator: opt.cssModuleClassNameGenerator
									cssModuleClassNamePlaceholder: opt.cssModuleClassNamePlaceholder
									useExternalCssModuleHelper: opt.useExternalCssModuleHelper
								}).then(
									(depFile) ->
										content.push fixDefineParams(depFile.contents.toString(), depId, depPath, opt)
										cb()
									(err) ->
										reject err
								).done()
							else
								depContent = depFile.contents.toString()
								content.push trace + fixDefineParams(depContent, depId, depPath, opt)
								cb()
					(err) ->
						return reject err if err
						if not (/\.js$/i).test file.path
							if (/\.coffee$/i).test file.path
								file.path = file.path.replace /\.coffee$/i, '.js'
							else
								file.path = file.path + '.js'
						file.contents = Buffer.from content.join EOL + EOL
						resolve file
				)
		)
		depStream.end file
