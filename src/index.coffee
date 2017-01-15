child_process = require 'child_process'
_ = require 'underscore'
Q = require 'q'
fs = require 'fs'
path = require 'path'
async = require 'async'
gutil = require 'gulp-util'
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
				deps = '[' + deps.join(', ') + ']'
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

findVendorInDir = (inDir, outDir, depId, opt, callback) ->
	name = depId.split('/')[0]
	outDir = outDir + '/' +  name if opt.mkdir
	moduleDir = path.resolve inDir, name
	mainMapped = opt.mainMap?[depId]
	if mainMapped
		if mainMapped.indexOf('@') >= 0
			mainMapped = mainMapped.split '@'
			moduleDir = path.resolve inDir, mainMapped[1]
			mainMapped = mainMapped[0]
		if mainMapped
			mainPath = path.resolve moduleDir, mainMapped
	mainMapped = opt.mainMap?["#{depId}.css"]
	if mainMapped
		if mainMapped.indexOf('@') >= 0
			mainMapped = mainMapped.split '@'
			moduleDir = path.resolve inDir, mainMapped[1]
			mainMapped = mainMapped[0]
		if mainMapped
			stylePath = path.resolve moduleDir, mainMapped
	if not mainPath
		if depId isnt name
			mainPath = path.resolve inDir, depId
		else
			for confFile in ['bower.json', 'package.json']
				if not mainPath
					packagePath = path.resolve moduleDir, confFile
					if fs.existsSync packagePath
						packageObj = require packagePath
						if packageObj.main
							if Array.isArray packageObj.main
								for item in packageObj.main
									if (/\.css$/i).test item
										stylePath = path.resolve moduleDir, item
									else
										mainPath = path.resolve moduleDir, item
							else
								if (/\.css$/i).test packageObj.main
									stylePath = path.resolve moduleDir, packageObj.main
								else
									mainPath = path.resolve moduleDir, packageObj.main
						if packageObj.style
							stylePath = path.resolve moduleDir, packageObj.style
	mainPath = path.resolve moduleDir, 'index.js' if not mainPath
	mainPath = mainPath + '.js' if path.extname(mainPath) isnt '.js'
	if mainPath and fs.existsSync mainPath
		if depId isnt name and opt.mkdir
			outId = depId.split(name + '/')[1]
		else
			outId = depId
		outPath = path.resolve outDir, outId + (opt.suffix || '')
		outPathExists = fs.existsSync "#{outPath}.js"
		if (not outPathExists or opt.overWrite) and not _venderFoundMap[outPath]
			_venderFoundMap[outPath] = true
			content = fs.readFileSync(mainPath).toString()
			if opt.minifyJS
				if typeof opt.minifyJS is 'object'
					minifyJS = opt.minifyJS
				else
					minifyJS = {}
				minifyJS.fromString = true
				try
					content = UglifyJS.minify(content, minifyJS).code
				catch err
					logErr err, mainPath
			mkdirp path.dirname(outPath), (err) ->
				logErr err, mainPath if err
				fs.writeFileSync "#{outPath}.js", content
				if stylePath
					content = fs.readFileSync(stylePath).toString()
					if opt.minifyCSS
						if typeof opt.minifyCSS is 'object'
							minifyCSS = opt.minifyCSS
						else
							minifyCSS = {}
						try
							content = new CleanCSS(minifyCSS).minify(content).styles
						catch err
							logErr err, stylePath
					fs.writeFileSync "#{outPath}.css", content
				callback true
		else
			callback outPathExists or _venderFoundMap[outPath]
	else
		callback false

fixBowerDir = (inDir) ->
	bowerrcPath = path.resolve inDir, '.bowerrc'
	if fs.existsSync bowerrcPath
		bowerrc = JSON.parse fs.readFileSync(bowerrcPath).toString()
		_bowerDir = bowerrc.directory if bowerrc.directory
	fixBowerDir = ->

findVendor = (inDir, outDir, depId, opt, callback) ->
	fixBowerDir inDir
	findVendorInDir path.resolve(inDir, _npmDir), outDir, depId, opt, (found) ->
		if found
			callback()
		else
			findVendorInDir path.resolve(inDir, _bowerDir), outDir, depId, opt, (found) ->
				callback()

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
	Q.Promise (resolve, reject) ->
		return reject new gutil.PluginError('gulp-amd-bundler', 'File can\'t be null') if file.isNull()
		return reject new gutil.PluginError('gulp-amd-bundler', 'Streams not supported') if file.isStream()
		dependFiles = [file]
		depStream = amdDependency
			excludeDependent: true
			onlyRelative: not opt.findVendor
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
								file.contents = new Buffer file.contents.toString().split(/(?:\r\n|\n|\r)__END__\s*(?:\r\n|\n|\r|$)/)[0]
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
									depFile.contents = new Buffer depContent
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
							else if (/\.(json|tpl\.html|css|less|scss|png|jpg|jpeg|gif|svg)$/i).test depFile.path
								mt2amd.compile(depFile, postcss: opt.postcss, generateDataUri: opt.generateDataUri, cssSprite: opt.cssSprite, beautify: opt.beautifyTemplate, trace: opt.trace).then(
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
						else if opt.findVendor
							typeOfOpt = typeof opt.findVendor
							findVendorOpt = {}
							if typeOfOpt is 'object'
								findVendorOpt = opt.findVendor
								requireBaseDir = findVendorOpt.requireBaseDir
								outDir = findVendorOpt.outDir
								inDir = findVendorOpt.inDir || './'
							else if typeOfOpt is 'string'
								outDir = opt.findVendor
								inDir = './'
							else
								outDir = 'js/vendor'
								inDir = './'
							cwd = process.cwd()
							inDir = path.resolve cwd, inDir
							outDir = path.resolve cwd, outDir
							fileName = depFile.path
							if fileName.indexOf('/') is -1
								findVendor inDir, outDir, fileName, findVendorOpt, cb
							else if requireBaseDir
								requireBaseDir = path.resolve cwd, requireBaseDir
								prefix = path.relative requireBaseDir, outDir
								if prefix
									tmp = fileName.split prefix + '/'
									fileName = tmp[1] if not tmp[0]
								if fileName
									findVendor inDir, outDir, fileName, findVendorOpt, cb
								else
									cb()
							else
								cb()
					(err) ->
						return reject err if err
						if not (/\.js$/i).test file.path
							if (/\.coffee$/i).test file.path
								file.path = file.path.replace /\.coffee$/i, '.js'
							else
								file.path = file.path + '.js'
						file.contents = new Buffer content.join EOL + EOL
						resolve file
				)
		)
		depStream.end file
