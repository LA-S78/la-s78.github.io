# Builds the complete site into _site/ — the same steps GitHub Actions runs.
#
#   bundle exec ruby _scripts/build.rb            full build (all languages) + checks
#   bundle exec ruby _scripts/build.rb --serve    full build, then preview at http://localhost:4000
#   bundle exec ruby _scripts/build.rb --lang=de --serve
#                                                 quick build of one language only (no checks)
#
# Other options:
#   --port=N      preview port (default 4000)
#   --no-check    skip the build output checks (CI runs them as a separate step)
#
# Translation (Gemini) is NOT part of this script; it only runs in CI on push.

require 'optparse'
require 'fileutils'
require 'tmpdir'
require 'open3'
require 'json'
require 'yaml'
require 'base64'
require 'rbconfig'

Encoding.default_external = Encoding::UTF_8
# Child Ruby processes (helper scripts, Jekyll) must read files as UTF-8 too, even on
# machines whose locale isn't UTF-8; otherwise non-English text crashes the build.
ENV['RUBYOPT'] = "#{ENV['RUBYOPT']} -EUTF-8".strip unless ENV['RUBYOPT'].to_s.include?('-EUTF-8')
$stdout.sync = true
Dir.chdir(File.expand_path('..', __dir__))

SITE = '_site'
LANGS = Dir['_configs/_config_*.yml'].map { |f| File.basename(f)[/_config_(.+)\.yml/, 1] }.sort
BUILD_LOG = ENV['BUILD_LOG'] || File.join(Dir.tmpdir, 'la-s78-jekyll-build.log')

options = { serve: false, port: 4000, check: true, lang: nil }
OptionParser.new do |o|
  o.banner = 'Usage: bundle exec ruby _scripts/build.rb [options]'
  o.on('--serve', 'Preview the built site locally') { options[:serve] = true }
  o.on('--port=N', Integer, 'Preview port (default 4000)') { |n| options[:port] = n }
  o.on('--lang=CODE', "Build only one language (#{LANGS.join(', ')})") { |l| options[:lang] = l }
  o.on('--no-check', 'Skip build output checks') { options[:check] = false }
end.parse!

if options[:lang] && !LANGS.include?(options[:lang])
  abort "Unknown language '#{options[:lang]}'. Choose one of: #{LANGS.join(', ')}"
end

def step(title)
  puts "\n==> #{title}"
end

# Runs a command, streaming its output and appending it to the build log.
def run!(*cmd, log: false)
  Open3.popen2e(*cmd) do |_stdin, out, wait|
    File.open(BUILD_LOG, 'a') do |logfile|
      out.each_line do |line|
        print line
        logfile.write(line) if log
      end
    end
    abort "\nBuild failed: #{cmd.join(' ')}" unless wait.value.success?
  end
end

def ruby!(script)
  run!(RbConfig.ruby, script)
end

def jekyll_build!(configs, destination)
  run!('bundle', 'exec', 'jekyll', 'build', '--config', configs.join(','), '--destination', destination, log: true)
end

started = Time.now
FileUtils.rm_f(BUILD_LOG)
FileUtils.rm_rf(SITE)

# ---------------------------------------------------------------------------
step 'Splitting _source/ master files into guides, collections and data'
ruby! '_scripts/split_masters.rb'

step 'Injecting guide titles and nav anchors into _data/<lang>/ui.yml'
ruby! '_scripts/sync_ui_data.rb'

step 'Generating Discord bot translations (api/_generated_translations.js)'
ruby! '_scripts/build_translations.rb'

# ---------------------------------------------------------------------------
# Each language is built separately with only its own guides present, so the
# pristine copies are kept in a temp folder OUTSIDE the Jekyll source tree.
backup = Dir.mktmpdir('la-s78-build')
FileUtils.cp_r('guides', File.join(backup, 'guides'))
FileUtils.cp_r('collections/_guide_panes', File.join(backup, 'guide_panes'))

isolate = lambda do |lang|
  FileUtils.rm_rf(['guides', 'collections/_guide_panes'])
  FileUtils.cp_r(File.join(backup, 'guides'), 'guides')
  FileUtils.cp_r(File.join(backup, 'guide_panes'), 'collections/_guide_panes')
  %w[guides collections/_guide_panes].each do |dir|
    Dir.children(dir).each do |child|
      path = File.join(dir, child)
      FileUtils.rm_rf(path) if File.directory?(path) && child != lang
    end
  end
end

begin
  unless options[:lang]
    # Root build uses the English config so root URLs render real content.
    step 'Building English root site'
    isolate.call('en')
    jekyll_build!(['_config.yml', '_configs/_config_en.yml'], SITE)
  end

  (options[:lang] ? [options[:lang]] : LANGS).each do |lang|
    step "Building /#{lang}/"
    isolate.call(lang)
    jekyll_build!(['_config.yml', "_configs/_config_#{lang}.yml"], File.join(SITE, lang))
    # Pages load shared assets from the site root, so per-language copies are unused.
    %w[images css js].each { |d| FileUtils.rm_rf(File.join(SITE, lang, d)) }
  end
ensure
  FileUtils.rm_rf(['guides', 'collections/_guide_panes'])
  FileUtils.mv(File.join(backup, 'guides'), 'guides')
  FileUtils.mv(File.join(backup, 'guide_panes'), 'collections/_guide_panes')
  FileUtils.rm_rf(backup)
end

# ---------------------------------------------------------------------------
step 'Copying shared assets to the site root'
%w[images css js].each { |d| FileUtils.cp_r(d, SITE) }
FileUtils.cp('site.webmanifest', SITE)
FileUtils.cp('redirect.html', File.join(SITE, 'index.html'))

# Quick single-language builds skip the root build, which normally produces /sw.js.
if options[:lang] && !File.exist?(File.join(SITE, 'sw.js'))
  FileUtils.cp(File.join(SITE, options[:lang], 'sw.js'), SITE)
end

step 'Injecting service-worker precache list'
require_relative 'workbox_precache'
WorkboxInjector.run(SITE)

# ---------------------------------------------------------------------------
# The serverless functions can't read repo files at runtime, so data they need is
# compiled into small JS modules. Must run AFTER the precache step (see DECISIONS.md).
step 'Compiling data modules for the serverless API'
File.write('api/_map_svg.js', "export default #{JSON.generate(File.read('_includes/map.svg'))};\n")
puts 'Generated api/_map_svg.js'

cities = (YAML.load_file('_data/cities.yml') rescue {}) || {}
File.write('api/_cities_data.js', "export default #{JSON.generate(cities)};\n")
puts "Generated api/_cities_data.js (#{cities.size} cities)"

font_candidates = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
]
font = font_candidates.find { |p| File.exist?(p) } || Dir.glob('/usr/share/fonts/**/*.ttf').first
if font
  File.write('api/_font_data.js', "export default \"#{Base64.strict_encode64(File.binread(font))}\";\n")
  puts "Generated api/_font_data.js from #{font}"
else
  File.write('api/_font_data.js', "export default \"\";\n")
  puts 'Warning: no system font found; map images will render without text (fine for local previews).'
end

step 'Staging serverless functions and Vercel config'
FileUtils.cp_r('api', SITE)
Dir['package*.json'].each { |f| FileUtils.cp(f, SITE) }
FileUtils.cp('vercel.json', SITE) if File.exist?('vercel.json')

puts "\nBuild finished in #{(Time.now - started).round(1)}s."

# ---------------------------------------------------------------------------
if options[:check] && !options[:lang]
  step 'Checking build output'
  ruby! '_scripts/check_build.rb'
end

if options[:serve]
  require 'webrick'
  url = "http://localhost:#{options[:port]}/#{options[:lang] ? "#{options[:lang]}/" : ''}"
  puts "\nPreview: #{url}   (Ctrl+C to stop)"
  puts 'Note: /api/ endpoints do not run locally; pages that need live data will show errors.'
  server = WEBrick::HTTPServer.new(Port: options[:port], DocumentRoot: SITE,
                                   AccessLog: [], Logger: WEBrick::Log.new($stderr, WEBrick::Log::WARN))
  trap('INT') { server.shutdown }
  server.start
end
