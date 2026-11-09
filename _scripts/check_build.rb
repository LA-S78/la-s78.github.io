# Sanity checks on a finished build in _site/. Exits non-zero if anything is wrong.
# Runs automatically at the end of _scripts/build.rb, and as its own step in CI.
#
#   bundle exec ruby _scripts/check_build.rb

require 'json'
require 'tmpdir'

Encoding.default_external = Encoding::UTF_8
Dir.chdir(File.expand_path('..', __dir__))

SITE = '_site'
BUILD_LOG = ENV['BUILD_LOG'] || File.join(Dir.tmpdir, 'la-s78-jekyll-build.log')
LANGS = Dir['_configs/_config_*.yml'].map { |f| File.basename(f)[/_config_(.+)\.yml/, 1] }.sort
CORE_PAGES = %w[index.html rules.html alliance.html guides/index.html].freeze
MAX_PRECACHE_KB = 20 * 1024

@failures = 0
def fail!(message, details = [])
  @failures += 1
  # "::error::" makes GitHub Actions highlight the line; plain text locally.
  puts(ENV['GITHUB_ACTIONS'] ? "::error::#{message}" : "FAILED: #{message}")
  details.first(10).each { |d| puts "    #{d}" }
end

abort "No #{SITE}/ folder. Run _scripts/build.rb first." unless Dir.exist?(SITE)

# 1. Jekyll must not report two sources writing the same output file.
if File.exist?(BUILD_LOG)
  log = File.read(BUILD_LOG, invalid: :replace).gsub(/\e\[[0-9;]*m/, '') # strip colour codes
  conflicts = log.scan(/Conflict: The following destination is shared by multiple files\.\s*\n\s*The written file.*?\n\s*(\S+)/).flatten
  fail!("Jekyll reported #{conflicts.size} destination conflict(s)", conflicts) unless conflicts.empty?
else
  puts "Note: no build log at #{BUILD_LOG}; skipping the conflict check."
end

# 2. The root and every language must have their core pages.
missing = ([SITE] + LANGS.map { |l| File.join(SITE, l) }).flat_map do |dir|
  CORE_PAGES.map { |p| File.join(dir, p) }.reject { |p| File.exist?(p) }
end
fail!('Core pages are missing', missing) unless missing.empty?

# 3. No backup or build-only folders may leak into the published site.
leaked = Dir.glob("#{SITE}/**/{*_backup,node_modules,vendor}").reject { |p| p.start_with?("#{SITE}/api/") }
fail!('Build-only folders were published', leaked) unless leaked.empty?

# 4. No protocol-relative page links like href="//rules.html" (sign of an empty site.active_lang).
bad_links = Dir.glob("#{SITE}/**/*.html").reject { |p| p.start_with?("#{SITE}/api/") }
                .select { |p| File.read(p, invalid: :replace) =~ %r{href="//[a-z_]+\.html} }
fail!('Pages contain protocol-relative links (empty site.active_lang?)', bad_links) unless bad_links.empty?

# 5. Keep the service-worker precache small (a first visit downloads all of it).
sw = File.read(File.join(SITE, 'sw.js')) rescue ''
list_json = sw[/precacheList = (\[.*?\]);/m, 1]
if list_json
  kb = JSON.parse(list_json).sum { |e| File.size?(File.join(SITE, e['url'])).to_i } / 1024
  puts "Service-worker precache: #{kb} KB"
  fail!("Precache is #{kb} KB (limit #{MAX_PRECACHE_KB} KB). Check _scripts/workbox_precache.rb.") if kb > MAX_PRECACHE_KB
else
  fail!('No precache list found in _site/sw.js')
end

if @failures.zero?
  puts 'All build checks passed.'
else
  puts "#{@failures} build check(s) failed."
  exit 1
end
