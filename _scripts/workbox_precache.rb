require 'digest'
require 'json'

# Injects a Workbox precache manifest into the root sw.js.
#
# Only the lightweight app shell is precached (HTML pages, stylesheets, scripts,
# manifest and small images). Large media is left to the runtime CacheFirst image
# route in sw.js, so a first visit no longer downloads the entire deploy.
module WorkboxInjector
  EXTENSIONS = '{html,css,js,png,jpg,jpeg,svg,webp,webmanifest}'

  # Any single file above this size is never precached (e.g. multi-MB PNGs).
  MAX_FILE_BYTES = 512 * 1024

  # Paths (relative to the site root) that must never be precached.
  EXCLUDED_PREFIXES = [
    '/api/',                 # Vercel serverless sources, not static assets
    '/js/mermaid.min.js',    # 3.3 MB, only used by the internal test page
    '/images/compendium-desk.webp', # only on /reset, which empties the saved copy anyway
    '/reset.html'            # must always come from the network (it clears the saved copy)
  ].freeze

  def self.run(dest_path)
    puts "Scanning #{File.expand_path(dest_path)} for precache candidates..."

    files = Dir.glob(File.join(dest_path, '**', "*.#{EXTENSIONS}"))
    if files.empty?
      puts "WARNING: No files found to cache! Check your _site path."
      return
    end

    sw_path = File.join(dest_path, 'sw.js')
    skipped_large = []

    precache_list = files.sort.filter_map do |file|
      next if file == sw_path

      url = file.sub(/^#{Regexp.escape(dest_path)}/, '')
      url = "/#{url}" unless url.start_with?('/')
      next if EXCLUDED_PREFIXES.any? { |prefix| url.start_with?(prefix) }

      if File.size(file) > MAX_FILE_BYTES
        skipped_large << url
        next
      end

      { 'url' => url, 'revision' => Digest::MD5.file(file).hexdigest[0, 10] }
    end

    total_bytes = precache_list.sum { |e| File.size(File.join(dest_path, e['url'])) }
    puts "Precaching #{precache_list.length} files (#{(total_bytes / 1024.0 / 1024.0).round(2)} MB)."
    puts "Skipped #{skipped_large.length} files over #{MAX_FILE_BYTES / 1024} KB: #{skipped_large.join(', ')}" unless skipped_large.empty?

    unless File.exist?(sw_path)
      puts "ERROR: Could not find #{sw_path} to inject into."
      return
    end

    sw_content = File.read(sw_path)
    File.write(sw_path, "const precacheList = #{precache_list.to_json};\n\n" + sw_content)
    puts "Successfully injected #{precache_list.length} files into root sw.js!"
  end
end
