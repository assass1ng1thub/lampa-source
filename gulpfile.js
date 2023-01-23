/** Что-бы все не пропало! **/
process.on('uncaughtException', function (err) {
    console.log(err)
});


const { src, dest, series, parallel } = require('gulp');

var concat         = require('gulp-concat'),
    chokidar       = require('chokidar'),
    uglify         = require('gulp-uglify-es').default,
    uglifycss      = require('gulp-uglifycss'),
    browser        = require('browser-sync').create(),
    newer          = require('gulp-newer'),
    sass           = require('gulp-sass')(require('sass')),
    autoprefixer   = require('gulp-autoprefixer'),
    fileinclude    = require('gulp-file-include'),
    replace        = require('gulp-replace'),
    fs             = require('fs'),
    worker         = require('rollup-plugin-web-worker-loader')

var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var rollup = require('@rollup/stream');

// *Optional* Depends on what JS features you want vs what browsers you need to support
// *Not needed* for basic ES6 module import syntax support
var babel = require('@rollup/plugin-babel').babel;
// Add support for require() syntax
var commonjs = require('@rollup/plugin-commonjs');
// Add support for importing from node_modules folder like import x from 'module-name'
var nodeResolve = require('@rollup/plugin-node-resolve');
var regenerator = require('rollup-plugin-regenerator');


var cache;

var srcFolder = './src/';
var dstFolder = './dest/';
var pubFolder = './public/';
var bulFolder = './build/';
var idxFolder = './index/';
var plgFolder = './plugins/';


function merge(done) {
    let plugins = [babel({
        babelHelpers: 'bundled',
        presets: ['@babel/preset-env']
    }), commonjs, nodeResolve, worker()]

    rollup({
        // Point to the entry file
        input: srcFolder+"app.js",

        // Apply plugins
        plugins: plugins,

        // Use cache for better performance
        //cache: cache,

        // Note: these options are placed at the root level in older versions of Rollup
        output: {
          // Output bundle is intended for use in browsers
          // (iife = "Immediately Invoked Function Expression")
          format: 'iife',
        },

        onwarn: function ( message ) {
            return;
        }
      })
      .on('bundle', function(bundle) {
        // Update cache data after every bundle is created
        //cache = bundle;
      })

      // Name of the output file.
      .pipe(source('app.js'))
      .pipe(buffer())
      //.pipe(uglify())
      .pipe(replace(/return kIsNodeJS/g, "return false"))
      .pipe(replace(/return kIsNodeJS/g, "return false"))
      // Where to send the output file
      .pipe(dest(dstFolder));
      
    done();
}

function bubbleFile(name){
    let plug = [babel({
        babelHelpers: 'bundled',
        presets: ['@babel/preset-env']
    }), commonjs, nodeResolve]

    rollup({
        input: plgFolder+name,
        plugins: plug,
        output: {
          format: 'iife',
        },
        onwarn: function ( message ) {
            return;
        }
      })
      .pipe(source(name))
      .pipe(buffer())
      .pipe(fileinclude({
        prefix: '@@',
        basepath: '@file'
      }))
      .pipe(dest(dstFolder));
}

function plugins(done) {
    fs.readdirSync(plgFolder).filter(function (file) {
        return fs.statSync(plgFolder+'/'+file).isDirectory();
    }).forEach(folder => {
        bubbleFile(folder+'/'+folder+'.js')

        plugin_sass(plgFolder+'/'+folder)
    });
      
    done();
}

function plugin_sass(plugin_src){
    return src(plugin_src+'/css/*.scss')
        .pipe(sass.sync().on('error', sass.logError)) // Преобразуем Sass в CSS посредством gulp-sass
        .pipe(autoprefixer(['last 100 versions', '> 1%', 'ie 8', 'ie 7', 'ios 6', 'android 4'], { cascade: true })) // Создаем префиксы
        .pipe(uglifycss({
            "maxLineLen": 80,
            "uglyComments": true
        }))
        .pipe(replace(/\n/g, ''))
        .pipe(replace(/"/g, "'"))
        .pipe(dest(plugin_src+'/css'))
}

var copy_timer;

/** Обновляем файл для WEB **/
function build_web(done){
    clearTimeout(copy_timer)

    //таймер сила!
    copy_timer = setTimeout(()=>{
        src([dstFolder+'app.js']).pipe(dest(bulFolder+'web/'));

        fs.readdirSync(dstFolder).filter(function (file) {
            return fs.statSync(dstFolder+'/'+file).isDirectory();
        }).forEach(folder => {
            src([dstFolder+folder+'/'+folder+'.js']).pipe(dest(bulFolder+'web/plugins'));
        });
    },500)

    done();
}

/** Публикуем для WEB платформы **/
function public_task(path){
    return src(dstFolder + '/app.min.js').pipe(dest(bulFolder+path));
}

function public_webos(){
    return public_task('webos/');
}
function public_tizen(){
    return public_task('tizen/');
}
function public_github(){
    return public_task('github/lampa/');
}

function index_webos(){
    return src(idxFolder + '/webos/**/*').pipe(dest(bulFolder+'webos/'));
}
function index_tizen(){
    return src(idxFolder + '/tizen/**/*').pipe(dest(bulFolder+'tizen/'));
}
function index_github(){
    return src(idxFolder + '/github/**/*').pipe(dest(bulFolder+'github/lampa/'));
}

/** Сверяем файлы **/
function sync_task(path){
    return src([pubFolder + '**/*'])
        .pipe(newer(bulFolder+path))
        .pipe(dest(bulFolder+path));
}

function sync_web(){
    return sync_task('web/');
}
function sync_webos(){
    return sync_task('webos/');
}
function sync_tizen(){
    return sync_task('tizen/');
}
function sync_github(){
    return sync_task('github/lampa/');
}

/** Следим за изменениями в файлах **/
function watch(done){
    var watcher = chokidar.watch([srcFolder,pubFolder,plgFolder], { persistent: true});

    var timer;
    var change = function(path){
        clearTimeout(timer)

        if(path.indexOf('.css') > -1) return;

        timer = setTimeout(
            series(merge, plugins, sass_task, sync_web, build_web)
        ,5000)
    }

    watcher.on('add', function(path) {
        console.log('File', path, 'has been added');

        change(path)
    })
    .on('change', function(path) {
        console.log('File', path, 'has been changed');

        change(path)
    })
    .on('unlink', function(path) {
        console.log('File', path, 'has been unlink');

        change(path)
    })

    done();
}

function browser_sync(done) {
    browser.init({
        server: {
            baseDir: bulFolder+'web/'
        },
        open: false,
        notify: false,
        ghostMode: false,
    });

    done();
}

function sass_task(){
    return src(srcFolder+'/sass/*.scss')
        .pipe(sass.sync().on('error', sass.logError)) // Преобразуем Sass в CSS посредством gulp-sass
        .pipe(autoprefixer(['last 100 versions', '> 1%', 'ie 8', 'ie 7', 'ios 6', 'android 4'], { cascade: true })) // Создаем префиксы
        .pipe(dest(pubFolder+'/css'))
        .pipe(browser.reload({stream: true}))
}

function uglify_task() {
    return src([dstFolder+'app.js']).pipe(concat('app.min.js')).pipe(dest(dstFolder));
}

function test(done){
    done();
}

exports.pack_webos   = series(sync_webos, uglify_task, public_webos, index_webos);
exports.pack_tizen   = series(sync_tizen, uglify_task, public_tizen, index_tizen);
exports.pack_github  = series(sync_github, uglify_task, public_github, index_github);
exports.pack_plugins = series(plugins);
exports.test         = series(test);

exports.default = parallel(watch, browser_sync);
