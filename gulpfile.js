var gulp = require('gulp');
var coffee = require('gulp-coffee');

gulp.task('compile', function (){
	return gulp.src('src/**/*.coffee')
		.pipe(coffee())
		.pipe(gulp.dest('lib'));
});

gulp.task('example', function (){
	var bundler = require('./lib/index');
	var through = require('through2');
	return gulp.src('example/src/index.js')
		.pipe(bundler())
		.pipe(gulp.dest('example/dest'));
});

gulp.task('default', ['compile']);